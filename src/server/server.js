// assets plugin - server-side component
// these handlers are launched with the wiki server.

import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { SIDECAR, safeFolder, safeName, allowedInFolder, listable } from './safe.js'
import { readSidecar, writeSidecar, upsert, remove } from './sidecar.js'

const startServer = params => {
  const { app, argv } = params

  // Temp uploads live beside the assets tree, never inside it: argv.assets is
  // served static and CORS-open, so a temp dir there publishes every partial
  // upload and leaves orphans fetchable.
  const upload = multer({
    dest: path.join(argv.data, 'anarchive-tmp'),
    limits: {
      fileSize: argv.anarchiveMaxBytes ?? 2 * 1024 * 1024 * 1024,
      files: 20,
      fields: 40,
    },
    // Cheap folder-independent checks, so a rejected name never reaches disk.
    fileFilter: (req, file, cb) => {
      const { error } = safeName(file.originalname)
      return error ? cb(new Error(error)) : cb(null, true)
    },
  })

  // multer reports limit and filter failures as errors; turn them into a status
  // the client can render instead of letting them fall through to a hang.
  const receive = (req, res, next) =>
    upload.any()(req, res, err => {
      if (!err) return next()
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return res.status(status).send(err.message || 'upload rejected')
    })

  const authorized = (req, res, next) => {
    if (app['securityhandler'].isAuthorized(req)) {
      next()
    } else {
      res.status(403).send('must be owner')
    }
  }

  const cors = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    next()
  }

  // Client-supplied metadata, keyed by original filename. A single JSON field
  // rather than parallel arrays, so nothing depends on field ordering lining up
  // with the file order.
  const parseMeta = raw => {
    try {
      const parsed = JSON.parse(raw)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  const str = (v, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined)

  // What a client is allowed to say about a file it is uploading. sha256 is
  // client-computed by necessity — the bytes are already in the browser and
  // hashing them again here would cost the shared farm process a full read.
  const claimed = m => ({
    sha256: /^[a-f0-9]{64}$/.test(m?.sha256 || '') ? m.sha256 : null,
    caption: str(m?.caption) ?? '',
    licence: str(m?.licence, 100) ?? '',
    from: str(m?.from, 2000),
    pin: str(m?.pin, 100) ? { service: str(m.pin, 100), requested: Date.now() } : null,
  })

  app.get('/plugin/assets/list', cors, (req, res) => {
    const assetsPath = path.join(argv.assets, (req.query.assets || '').match(/([\w/-]*)/)[1])
    fs.readdir(assetsPath, { withFileTypes: true }, (error, files) => {
      if (error) {
        return res.json({ error })
      }
      const filtered = files
        .filter(file => file.isFile())
        .map(file => file.name)
        .filter(listable)
      return res.json({ error, files: filtered })
    })
  })

  app.get('/plugin/assets/index', cors, (req, res) => {
    const walk = dir => {
      const files = fs.readdirSync(path.join(argv.assets, dir), { withFileTypes: true })
      return files
        .map(file => {
          if (listable(file.name)) {
            if (file.isFile()) {
              return {
                file: path.join(path.sep, dir, file.name),
                size: fs.statSync(path.join(argv.assets, dir, file.name)).size,
              }
            }
            if (file.isDirectory()) {
              return walk(path.join(dir, file.name)).flat()
            }
            return []
          } else {
            return []
          }
        })
        .flat()
    }

    return res.json(walk(''))
  })

  // rename is the fast path; temp and assets can still land on different
  // filesystems, and some mounts refuse it outright.
  const moveInto = (from, to) => {
    try {
      fs.renameSync(from, to)
    } catch (err) {
      if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err
      fs.copyFileSync(from, to)
      fs.rmSync(from, { force: true })
    }
  }

  app.post('/plugin/assets/upload', authorized, receive, (req, res) => {
    const folder = safeFolder(req.body.assets)
    if (folder === null) return res.status(400).send('bad assets folder')
    const assetsPath = path.join(argv.assets, folder)
    fs.mkdirSync(assetsPath, { recursive: true })

    const meta = parseMeta(req.body.meta)
    const by = app['securityhandler'].getUser?.(req) ?? null
    let data = readSidecar(assetsPath)
    let touched = false

    const errors = []
    for (const element of req.files ?? []) {
      // basename before the join. This is the path traversal fix: originalname
      // is client-supplied and a crafted ../ escapes the assets folder.
      const { name, error } = safeName(element.originalname)
      const denied = error || allowedInFolder(name, folder).error
      if (denied) {
        fs.rmSync(element.path, { force: true })
        errors.push(denied)
        continue
      }
      try {
        moveInto(element.path, path.join(assetsPath, name))
      } catch (err) {
        fs.rmSync(element.path, { force: true })
        errors.push(`could not store ${name}: ${err.code || err.message}`)
        continue
      }
      data = upsert(data, name, {
        ...claimed(meta[element.originalname] ?? meta[name]),
        size: element.size,
        added: Date.now(),
        by,
      })
      touched = true
    }

    // No files and metadata to apply is a caption edit. It reuses this route so
    // there is one authorised write path, not two: only the fields an editor may
    // restate are taken, so provenance cannot be rewritten from the client.
    if (!req.files?.length) {
      for (const [raw, m] of Object.entries(meta)) {
        const { name, error } = safeName(raw)
        if (error || !data[name]) continue
        const { caption, licence, pin } = claimed(m)
        data = upsert(data, name, { caption, licence, pin })
        touched = true
      }
    }

    if (touched) writeSidecar(assetsPath, data)

    // Upstream collected these in an async rename callback and tested the array
    // before any callback ran, so failures were always reported as success.
    if (errors.length) return res.status(400).send(errors.join('\n'))
    res.end('success')
  })

  app.post('/plugin/assets/delete', authorized, (req, res) => {
    const file = path.basename(req.query.file || '')
    if (file && listable(file)) {
      const folder = safeFolder(req.query.assets)
      if (folder === null) return res.status(400).send('bad assets folder')
      const toRemove = path.join(argv.assets, folder, file)
      fs.unlink(toRemove, err => {
        if (err) {
          res.status(500).send(err.message)
        } else {
          const dir = path.join(argv.assets, folder)
          const data = readSidecar(dir)
          if (data[file]) writeSidecar(dir, remove(data, file))
          res.status(200).send('ok')
        }
      })
    } else {
      res.status(500).send('No file specified')
    }
  })
}

export { startServer }
