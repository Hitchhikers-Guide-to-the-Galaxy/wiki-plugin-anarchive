import { listable } from '../constants.js'
import { parse, folderOf } from './dsl.js'
import { sha256, fetchMeta } from './meta.js'

const expand = text => {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Upstream repeated this in four places. PAGE resolves against the enclosing
// page, so it needs the item's DOM position, not just its text.
const resolveFolder = ($item, item) => {
  const folder = folderOf(item.text)
  if (folder !== 'PAGE') return folder
  return '/pages/' + $item.parents('.page')[0].id.split('_rev')[0]
}

// What we can honestly say about a file as it is uploaded: its hash, and the
// folder-level defaults this item declares.
const describe = async ($item, item, file) => {
  const { licence, pin } = parse(item.text)
  return { sha256: await sha256(file), licence, pin }
}

const ignore = e => {
  e.preventDefault()
  e.stopPropagation()
}

const context = $item => {
  const sites = [location.host]
  const remote = $item.parents('.page').data('site')
  if (remote && remote !== location.host) {
    sites.push(remote)
  }
  const journal = $item.parents('.page').data('data').journal
  for (const action of journal.slice(0).reverse()) {
    if (action.site && !sites.includes(action.site)) {
      sites.push(action.site)
    }
  }
  console.log('context', { sites })
  return sites
}

const post_upload = ($item, item, form) => {
  const $progress = $item.find('.progress-bar')

  const tick = e => {
    if (!e.lengthComputable) return
    let percentComplete = e.loaded / e.total
    percentComplete = parseInt(percentComplete * 100)
    $progress.text(`${percentComplete}%`)
    $progress.width(`${percentComplete}%`)
  }

  $.ajax({
    url: '/plugin/assets/upload',
    type: 'POST',
    data: form,
    processData: false,
    contentType: false,
    success: () => {
      console.log('post success')
      $item.empty()
      $item.off()
      emit($item, item)
      bind($item, item)
    },
    error: e => {
      console.log('error', e)
      $progress.text(`upload error: ${e.statusText} ${e.responseText || ''}`)
      $progress.width('100%')
    },
    xhr: () => {
      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', tick, false)
      xhr.overrideMimeType('text/html')
      return xhr
    },
  })
}

const get_file = ($item, item, url, success, inherited = {}) => {
  const assets = resolveFolder($item, item)
  const filename = url.split('/').reverse()[0]
  fetch(url)
    .then(response => response.blob())
    .then(async blob => {
      const file = new File([blob], filename, { type: blob.type })

      const form = new FormData()
      form.append('assets', assets)
      // Carry what the remote said about the file, so provenance survives the
      // hop instead of being lost at the site boundary. The hash is recomputed
      // from the bytes we actually received rather than taken on trust; the
      // licence is a fact about the work, so the source wins over our default.
      const local = await describe($item, item, file)
      const entry = {
        sha256: local.sha256,
        caption: inherited.caption || '',
        licence: inherited.licence || local.licence,
        pin: local.pin,
        from: url,
      }
      form.append('meta', JSON.stringify({ [file.name]: entry }))
      form.append('uploads[]', file, file.name)
      success(form)
    })
    .catch(e => {
      const $progress = $item.find('.progress-bar')
      $progress.text(`Copy error: ${e.message}`)
      $progress.width('100%')
    })
}

const delete_file = ($item, item, url) => {
  const file = url.split('/').reverse()[0]
  const assets = resolveFolder($item, item)
  $.ajax({
    url: `/plugin/assets/delete?file=${file}&assets=${assets}`,
    type: 'POST',
    success: () => {
      $item.empty()
      $item.off()
      emit($item, item)
      bind($item, item)
    },
    error: e => {
      const $progress = $item.find('.progress-bar')
      $progress.text(`Delete error: ${e.statusText} ${e.responseText || ''}`)
      $progress.width('100%')
    },
  })
}

const fetch_list = ($item, item, $report, assets, remote, assetsData) => {
  const requestSite = remote ?? null
  const assetsURL = wiki.site(requestSite).getDirectURL('assets')
  if (assetsURL === '') {
    $report.text('site not currently reachable.')
    return
  }

  const own = remote === location.host

  const link = (file, entry) => {
    const href = `${assetsURL}/${assets === '' ? '' : assets + '/'}${encodeURIComponent(file)}`
    // todo: no action if not logged on
    const act = !isOwner ? '' : own ? '<button class="delete">✕</button> ' : '<button class="copy">⚑</button> '
    const edit = isOwner && own ? ' <button class="caption" title="caption">✎</button>' : ''
    const caption = entry?.caption ? ` <span style="color:gray">— ${expand(entry.caption)}</span>` : ''

    return `<span data-file="${expand(file)}">${act}<a href="${href}" target=_blank>${expand(file)}</a>${caption}${edit}</span>`
  }

  const render = (data, meta) => {
    assetsData[assets] ??= {}
    if (data.error) {
      if (data.error.code == 'ENOENT') return $report.text('no files')
      return $report.text(`plugin reports: ${data.error.code}`)
    }
    // Hide the sidecar and dotfiles here as well as in our own list route: a
    // remote running stock assets will happily list both.
    const files = data.files.filter(listable)
    // The contract other plugins read is an array of filename strings. Keep it
    // exactly that shape; metadata goes under a key a folder cannot have.
    assetsData[assets][assetsURL] = files
    assetsData['.meta'] ??= {}
    assetsData['.meta'][assetsURL] = meta

    if (files.length === 0) {
      return $report.text('no files')
    }
    $report.html(files.map(file => link(file, meta[file])).join('<br>'))

    $report.find('button.copy').on('click', e => {
      const $span = $(e.target).parent()
      const href = $span.find('a').attr('href')
      get_file($item, item, href, form => post_upload($item, item, form), meta[$span.data('file')] || {})
    })

    $report.find('button.delete').on('click', e => {
      const href = $(e.target).parent().find('a').attr('href')
      delete_file($item, item, href)
    })

    $report.find('button.caption').on('click', e => {
      const $span = $(e.target).parent()
      const file = $span.data('file')
      const current = meta[file]?.caption || ''
      const next = window.prompt(`Caption for ${file}`, current)
      if (next === null || next === current) return
      set_caption($item, item, file, next)
    })
  }

  const trouble = e => {
    $report.text(`plugin error: ${e.statusText} ${e.responseText || ''}`)
  }

  // The sidecar comes off the static assets route, not a plugin route, so this
  // works against sites running stock assets too — they simply answer 404.
  $.ajax({
    url: wiki.site(requestSite).getURL('plugin/assets/list'),
    data: { assets },
    dataType: 'json',
    success: data => fetchMeta(assetsURL, assets).then(meta => render(data, meta)),
    error: trouble,
  })
}

// A caption edit is an upload with no files. Reusing the upload route keeps one
// authorised write path rather than two.
const set_caption = ($item, item, file, caption) => {
  const form = new FormData()
  form.append('assets', resolveFolder($item, item))
  form.append('meta', JSON.stringify({ [file]: { caption } }))
  post_upload($item, item, form)
}

const emit = ($item, item) => {
  const uploader = () => {
    if ($item.parents('.page').hasClass('remote')) return ''
    return `
      <div style="background-color:#ddd;" class="progress-bar" role="progressbar"></div>
      <center><button class="upload">upload</button></center>
      <input style="display: none;" type="file" name="uploads[]" multiple="multiple">
    `
  }

  const assetsData = {}
  $item.addClass('assets-source')
  $item.get(0).assetsData = () => assetsData

  let assets = folderOf(item.text)

  if (assets === 'PAGE') {
    if ($item.parents('.page')[0].id.endsWith('template')) {
      $item.append(`
        <div style="background-color:#eee;padding:15px; margin-block-start:1em; margin-block-end:1em;">
          <p><i>This asset item will use a folder name derived from the title of the created page.</i></p>
        </div>
      `)
      return
    } else {
      assets = '/pages/' + $item.parents('.page')[0].id.split('_rev')[0]
    }
  }

  $item.append(`
    <div style="background-color:#eee;padding:15px; margin-block-start:1em; margin-block-end:1em;">
      <dl style="margin:0;color:gray"></dl>
      ${uploader()}
    </div>
  `)

  for (const site of context($item)) {
    const $report = $item.find('dl').prepend(`
        <dt> <img width=12 src = "${wiki.site(site).flag()}" > ${site}</dt>
          <dd style="margin:8px;"></dd>
          `)
    fetch_list($item, item, $report.find('dd:first'), assets, site, assetsData)
  }
}

const bind = ($item, item) => {
  const assets = resolveFolder($item, item)

  $item.on('dblclick', () => wiki.textEditor($item, item))

  // https://coligo.io/building-ajax-file-uploader-with-node/
  const $button = $item.find('.upload')
  const $input = $item.find('input')

  $button.on('click', () => {
    $input.click()
  })

  $input.on('change', e => {
    upload($(e.target).get(0).files)
  })

  $item.on('dragover', ignore)
  $item.on('dragenter', ignore)
  $item.on('drop', e => {
    ignore(e)
    console.log('dropped', e)
    upload(e.originalEvent.dataTransfer?.files)
  })

  const upload = async files => {
    console.log('upload', files)
    if (!files?.length) return
    const form = new FormData()
    form.append('assets', assets)
    const meta = {}
    for (const file of files) {
      meta[file.name] = await describe($item, item, file)
      form.append('uploads[]', file, file.name)
    }
    form.append('meta', JSON.stringify(meta))
    post_upload($item, item, form)
  }
}

if (typeof window !== 'undefined') {
  window.plugins.assets = { emit, bind }
}

export const assets = typeof window == 'undefined' ? { expand } : undefined
