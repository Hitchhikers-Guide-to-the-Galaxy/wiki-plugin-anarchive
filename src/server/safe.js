// Filename and folder policy for uploaded assets.
// Pure functions, no fs, no express — so the security rules can be tested directly.

import path from 'node:path'
import { SIDECAR } from '../constants.js'

export { SIDECAR }

// These execute in the wiki's own origin, because /assets is served static and
// same-origin. 'home' is exempt: wiki-server reserves it for a customised home
// page, where an index.html is the entire point. See About Reserved Asset Paths.
const EXECUTABLE = new Set(['.html', '.htm', '.xhtml', '.js', '.mjs', '.cjs', '.wasm'])

const MAX_NAME = 200

// The folder arrives as a bare word path. '.' is outside the character class, so
// '..' can never match — this is upstream's protection and it holds. Kept as an
// explicit assertion rather than a comment, because the whole plugin rests on it.
export const safeFolder = raw => {
  const matched = (raw || '').match(/([\w/-]*)/)[1]
  return matched.split('/').includes('..') ? null : matched
}

export const reserved = folder => (folder || '').replace(/^\/+|\/+$/g, '') === 'home'

// Folder-independent name policy. Rejects rather than rewrites: silently
// renaming would break the URLs authors paste into image and markdown items,
// and would break the copy-from-remote round trip.
export const safeName = originalname => {
  const name = path.basename(String(originalname ?? ''))
  if (!name || name === '.' || name === '..') return { error: 'empty or relative filename' }
  if (name.includes('\0')) return { error: 'filename contains a null byte' }
  if (/[/\\]/.test(name)) return { error: `filename contains a path separator: ${name}` }
  if (name.startsWith('.')) return { error: `dotfiles are not accepted: ${name}` }
  if (name === SIDECAR) return { error: `${SIDECAR} is written by the plugin` }
  if (name.length > MAX_NAME) return { error: `filename longer than ${MAX_NAME} characters` }
  return { name }
}

// Folder-dependent policy, checked once the assets field is known for certain.
export const allowedInFolder = (name, folder) => {
  const ext = path.extname(name).toLowerCase()
  if (EXECUTABLE.has(ext) && !reserved(folder)) {
    return { error: `${ext} files are only accepted in the reserved 'home' folder` }
  }
  return { ok: true }
}

// What the list route and the client both hide from a file listing.
export const listable = name => !name.startsWith('.') && name !== SIDECAR
