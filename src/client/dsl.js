// Item text, line by line.
//
// Line 1 keeps upstream's exact positional parse: a bare folder path, or the
// PAGE keyword. Every existing assets item in the federation is one such line,
// and must keep behaving identically.
//
// Lines 2+ are commands, per the house DSL convention: UPPERCASE first word is
// the command, the rest is data, one trailing colon optional. Unknown lines are
// data and are ignored. Because commands are uppercase and folder paths are
// not, an item written here degrades safely on a site running stock assets —
// stock reads line 1 and never sees the rest.

const COMMANDS = new Set(['LICENCE', 'LICENSE', 'PIN'])

export const folderOf = text => (text || '').match(/([\w/-]*)/)[1]

export const parse = text => {
  const lines = (text || '').split('\n')
  const out = { folder: folderOf(lines[0]), licence: '', pin: '' }

  for (const line of lines.slice(1)) {
    const [first, ...rest] = line.trim().split(/\s+/)
    const command = (first || '').replace(/:$/, '').toUpperCase()
    if (!COMMANDS.has(command) || command !== (first || '').replace(/:$/, '')) continue
    const value = rest.join(' ').trim()
    if (command === 'PIN') out.pin = value
    else out.licence = value
  }
  return out
}
