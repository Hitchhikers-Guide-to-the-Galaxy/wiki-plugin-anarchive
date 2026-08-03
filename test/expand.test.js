import { assets } from '../src/client/assets.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// The non-browser export exists so this test can reach expand(). Keep it.
describe('expand', () => {
  it('escapes html markup characters', () => {
    assert.equal(assets.expand('try < & >'), 'try &lt; &amp; &gt;')
  })

  it('escapes the ampersand first, so escapes are not double-escaped', () => {
    assert.equal(assets.expand('&lt;'), '&amp;lt;')
  })
})
