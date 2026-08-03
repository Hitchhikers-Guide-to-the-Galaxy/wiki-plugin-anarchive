import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { SIDECAR, safeFolder, safeName, allowedInFolder, reserved, listable } from '../src/server/safe.js'

// Upstream joined the client-supplied multipart originalname straight onto the
// assets directory. That is not reachable in practice — multer's parser strips
// the path first — so these cases guard the guarantee rather than close a hole:
// they hold whatever the parser does, including if preservePath is ever set.
describe('safeName — path traversal', () => {
  it('strips a traversal prefix down to the bare filename', () => {
    assert.equal(safeName('../../../../etc/passwd').name, 'passwd')
  })

  it('strips a nested path', () => {
    assert.equal(safeName('a/b/c.png').name, 'b/c.png'.split('/').pop())
  })

  it('leaves an ordinary filename alone', () => {
    assert.equal(safeName('photo.jpg').name, 'photo.jpg')
  })

  it('rejects a backslash separator rather than storing it literally', () => {
    assert.match(safeName('..\\..\\pwn.txt').error, /path separator/)
  })

  it('rejects a null byte', () => {
    assert.match(safeName('ok.png\0.js').error, /null byte/)
  })
})

describe('safeName — name policy', () => {
  it('rejects empty and relative names', () => {
    for (const bad of ['', '.', '..', null, undefined]) {
      assert.ok(safeName(bad).error, `expected ${JSON.stringify(bad)} to be rejected`)
    }
  })

  it('rejects dotfiles, which upstream listed as broken links', () => {
    assert.match(safeName('.DS_Store').error, /dotfiles/)
  })

  it('refuses a client-supplied sidecar', () => {
    assert.match(safeName(SIDECAR).error, /written by the plugin/)
  })

  it('rejects an absurdly long name', () => {
    assert.match(safeName('x'.repeat(300) + '.png').error, /longer than/)
  })
})

describe('allowedInFolder — executable extensions', () => {
  it('refuses html in an ordinary page folder', () => {
    assert.match(allowedInFolder('index.html', 'pages/foo').error, /reserved 'home' folder/)
  })

  it('accepts html in the reserved home folder, where it is the whole point', () => {
    assert.deepEqual(allowedInFolder('index.html', 'home'), { ok: true })
    assert.deepEqual(allowedInFolder('index.html', '/home'), { ok: true })
  })

  it('refuses javascript and wasm outside home', () => {
    for (const name of ['x.js', 'x.mjs', 'x.cjs', 'x.wasm', 'x.htm', 'x.xhtml']) {
      assert.ok(allowedInFolder(name, 'pages/foo').error, `expected ${name} to be refused`)
    }
  })

  it('allows svg — the svg and diagram-editor plugins need it', () => {
    assert.deepEqual(allowedInFolder('drawing.svg', 'pages/foo'), { ok: true })
  })

  it('is case insensitive about the extension', () => {
    assert.ok(allowedInFolder('X.HTML', 'pages/foo').error)
  })
})

describe('safeFolder', () => {
  it('keeps the shapes real items use', () => {
    assert.equal(safeFolder('pages/about-me'), 'pages/about-me')
    assert.equal(safeFolder('/pages/about-me'), '/pages/about-me')
    assert.equal(safeFolder('PAGE'), 'PAGE')
    assert.equal(safeFolder('home'), 'home')
  })

  it('truncates at the first character outside the class, so .. can never survive', () => {
    assert.equal(safeFolder('a/../b'), 'a/')
    assert.equal(safeFolder('../etc'), '')
    assert.equal(safeFolder('*'), '')
    assert.equal(safeFolder(''), '')
    assert.equal(safeFolder(undefined), '')
  })
})

describe('reserved / listable', () => {
  it('treats only home as reserved', () => {
    assert.ok(reserved('home'))
    assert.ok(reserved('/home/'))
    assert.ok(!reserved('pages/home'))
  })

  it('hides dotfiles and the sidecar from a listing', () => {
    assert.ok(listable('photo.jpg'))
    assert.ok(!listable('.DS_Store'))
    assert.ok(!listable(SIDECAR))
  })
})
