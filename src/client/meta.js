// Client half of the asset sidecar.
//
// Hashing happens here, not on the server: the bytes are already in the browser,
// and hashing them again server-side would cost the shared farm process a full
// read of every upload on every site.

import { SIDECAR } from '../constants.js'

// crypto.subtle needs a secure context. https and *.localhost qualify; a bare
// LAN address over http does not, and there are real farm sites reached that
// way. A null hash is a first-class state — backfill fills it in later.
export const sha256 = async file => {
  if (!globalThis.crypto?.subtle) return null
  try {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    return Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

// Read straight off the static assets route. No plugin route is involved, so
// this works against sites running stock wiki-plugin-assets too — they simply
// have no sidecar and answer 404.
export const fetchMeta = async (assetsURL, folder) => {
  const dir = folder === '' ? '' : `${folder}/`
  try {
    const response = await fetch(`${assetsURL}/${dir}${SIDECAR}`)
    if (!response.ok) return {}
    const parsed = await response.json()
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// The listing decides what exists. An entry naming a file that is gone is
// ignored rather than deleted — a sync may still bring the file back.
export const mergeMeta = (files, meta) => files.map(file => ({ file, meta: meta[file] || null }))
