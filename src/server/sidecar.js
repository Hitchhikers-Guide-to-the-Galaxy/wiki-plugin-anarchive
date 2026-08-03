// The asset metadata sidecar: one _anarchive.json per assets folder.
//
// Deliberately not a dotfile. The assets tree is already served static and
// CORS-open, so a plain JSON file here is readable from any federated site with
// no route of its own — including from sites running stock wiki-plugin-assets.
// Per-folder rather than per-site so it travels with the folder when a page is
// forked, which is what keeps captions and provenance alive across federation.
//
// It is a cache, never an authority. The directory listing decides what exists;
// an entry naming a file that is gone is ignored, not deleted, because sync may
// bring the file back.

import fs from 'node:fs'
import path from 'node:path'
import { SIDECAR } from './safe.js'

export const sidecarPath = dir => path.join(dir, SIDECAR)

// Never throws: a missing, unreadable or half-synced sidecar reads as empty.
export const readSidecar = dir => {
  try {
    const parsed = JSON.parse(fs.readFileSync(sidecarPath(dir), 'utf8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Write to a temp name then rename, so a concurrent upload or a Nextcloud sync
// never sees a half-written file.
export const writeSidecar = (dir, data) => {
  const target = sidecarPath(dir)
  const tmp = `${target}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2))
    fs.renameSync(tmp, target)
    return true
  } catch {
    fs.rmSync(tmp, { force: true })
    return false
  }
}

export const upsert = (data, name, entry) => ({ ...data, [name]: { ...(data[name] || {}), ...entry } })

export const remove = (data, name) => {
  const next = { ...data }
  delete next[name]
  return next
}
