import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SIDECAR } from '../src/server/safe.js'
import { readSidecar, writeSidecar, upsert, remove, sidecarPath } from '../src/server/sidecar.js'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anarchive-'))
after(() => fs.rmSync(tmp, { recursive: true, force: true }))

describe('readSidecar never throws', () => {
  beforeEach(() => fs.rmSync(sidecarPath(tmp), { force: true }))

  it('reads a missing sidecar as empty', () => {
    assert.deepEqual(readSidecar(tmp), {})
  })

  it('reads malformed JSON as empty rather than throwing', () => {
    fs.writeFileSync(sidecarPath(tmp), '{ this is not json')
    assert.deepEqual(readSidecar(tmp), {})
  })

  it('reads a half-synced empty file as empty', () => {
    fs.writeFileSync(sidecarPath(tmp), '')
    assert.deepEqual(readSidecar(tmp), {})
  })

  it('refuses a JSON array, which is not an entry map', () => {
    fs.writeFileSync(sidecarPath(tmp), '[1,2,3]')
    assert.deepEqual(readSidecar(tmp), {})
  })

  it('reads a missing directory as empty', () => {
    assert.deepEqual(readSidecar(path.join(tmp, 'nope')), {})
  })
})

describe('writeSidecar', () => {
  it('round-trips and leaves no .tmp behind', () => {
    assert.ok(writeSidecar(tmp, { 'a.png': { caption: 'hi' } }))
    assert.deepEqual(readSidecar(tmp), { 'a.png': { caption: 'hi' } })
    assert.ok(!fs.existsSync(`${sidecarPath(tmp)}.tmp`))
  })

  it('reports failure instead of throwing when the directory is gone', () => {
    assert.equal(writeSidecar(path.join(tmp, 'nope'), {}), false)
  })

  it('writes under the reserved sidecar name', () => {
    writeSidecar(tmp, {})
    assert.ok(fs.readdirSync(tmp).includes(SIDECAR))
  })
})

describe('upsert / remove', () => {
  it('merges into an existing entry rather than replacing it', () => {
    const one = upsert({}, 'a.png', { sha256: 'abc', caption: '' })
    const two = upsert(one, 'a.png', { caption: 'a boat' })
    assert.deepEqual(two['a.png'], { sha256: 'abc', caption: 'a boat' })
  })

  it('does not mutate its input', () => {
    const before = { 'a.png': { caption: 'x' } }
    upsert(before, 'a.png', { caption: 'y' })
    remove(before, 'a.png')
    assert.deepEqual(before, { 'a.png': { caption: 'x' } })
  })

  it('removes a named entry and leaves the rest', () => {
    const data = { 'a.png': {}, 'b.png': {} }
    assert.deepEqual(Object.keys(remove(data, 'a.png')), ['b.png'])
  })
})
