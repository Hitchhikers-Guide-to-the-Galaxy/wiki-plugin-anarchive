// Filename and folder policy for uploaded assets.
// Pure functions, no fs, no express — so the security rules can be tested directly.

import path from 'node:path'
import { SIDECAR, listable } from '../constants.js'

export { SIDECAR, listable }

// File types are not restricted: html in a page's folder is ordinary (a deck, a
// report), and stock wiki-plugin-assets has always accepted it there.

const MAX_NAME = 200

// The folder arrives as a bare word path. '.' is outside the character class, so
// '..' can never match — this is upstream's protection and it holds. Kept as an
// explicit assertion rather than a comment, because the whole plugin rests on it.
export const safeFolder = raw => {
  const matched = (raw || '').match(/([\w/-]*)/)[1]
  return matched.split('/').includes('..') ? null : matched
}

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

