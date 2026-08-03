import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parse, folderOf } from '../src/client/dsl.js'

// Line 1 must behave exactly as upstream 0.7.4, for every item text already in
// the federation. This is the compatibility guarantee the fork rests on.
describe('folderOf — unchanged from upstream', () => {
  it('reads the shapes real items use', () => {
    assert.equal(folderOf('pages/about-me'), 'pages/about-me')
    assert.equal(folderOf('/pages/about-me'), '/pages/about-me')
    assert.equal(folderOf('PAGE'), 'PAGE')
    assert.equal(folderOf('home'), 'home')
    assert.equal(folderOf('plugins/image'), 'plugins/image')
  })

  it('guards the empty and missing cases', () => {
    assert.equal(folderOf(''), '')
    assert.equal(folderOf(undefined), '')
    assert.equal(folderOf(null), '')
    assert.equal(folderOf('*'), '')
  })

  it('agrees with the upstream expression on every case', () => {
    const upstream = text => (text || '').match(/([\w/-]*)/)[1]
    for (const text of ['pages/x', '/pages/x', 'PAGE', '*', '', 'home', 'a b', 'a/../b']) {
      assert.equal(folderOf(text), upstream(text), `disagreed on ${JSON.stringify(text)}`)
    }
  })
})

describe('parse — commands on lines 2+', () => {
  it('reads LICENCE and PIN', () => {
    const out = parse('PAGE\nLICENCE CC-BY-SA-4.0\nPIN filebase')
    assert.equal(out.folder, 'PAGE')
    assert.equal(out.licence, 'CC-BY-SA-4.0')
    assert.equal(out.pin, 'filebase')
  })

  it('accepts one optional trailing colon', () => {
    assert.equal(parse('PAGE\nLICENCE: CC0-1.0').licence, 'CC0-1.0')
  })

  it('accepts the American spelling', () => {
    assert.equal(parse('PAGE\nLICENSE MIT').licence, 'MIT')
  })

  it('ignores lowercase lines, which are data not commands', () => {
    assert.equal(parse('PAGE\nlicence CC0-1.0').licence, '')
  })

  it('ignores unknown commands', () => {
    assert.deepEqual(parse('PAGE\nWIBBLE yes'), { folder: 'PAGE', licence: '', pin: '' })
  })

  it('leaves a legacy single-line item completely inert', () => {
    assert.deepEqual(parse('pages/x'), { folder: 'pages/x', licence: '', pin: '' })
  })

  it('gives a legacy multi-line item the same folder as a single-line one', () => {
    assert.equal(parse('pages/x\nsome stray prose\nand more').folder, parse('pages/x').folder)
  })

  it('survives an empty item', () => {
    assert.deepEqual(parse(''), { folder: '', licence: '', pin: '' })
    assert.deepEqual(parse(undefined), { folder: '', licence: '', pin: '' })
  })
})
