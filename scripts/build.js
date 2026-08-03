import * as esbuild from 'esbuild'
import fs from 'node:fs/promises'
import packJSON from '../package.json' with { type: 'json' }

const version = packJSON.version
const now = new Date()
const banner = { js: `/* ${packJSON.name} - ${version} - ${now.toUTCString()} - serves item type "assets" */` }

// Client. Bundled the same way upstream builds it, so the artifact the browser
// loads keeps its proven shape. Output name is fixed by the seat, not by us:
// wiki-client fetches /plugins/<type>/<type>.js, and the type is assets.
const client = await esbuild.build({
  entryPoints: ['src/client/assets.js'],
  bundle: true,
  banner,
  minify: true,
  sourcemap: true,
  logLevel: 'info',
  metafile: true,
  outfile: 'client/assets.js',
})
await fs.writeFile('meta-client.json', JSON.stringify(client.metafile))

// Server. Source stays ESM so node --test can import the pure helpers directly;
// output is CJS because wiki-server hosts we do not control still load plugin
// servers with require(), which cannot load ESM. multer stays external.
const server = await esbuild.build({
  entryPoints: ['src/server/server.js'],
  bundle: false,
  platform: 'node',
  format: 'cjs',
  banner,
  minify: true,
  sourcemap: true,
  logLevel: 'info',
  metafile: true,
  outfile: 'server/server.js',
})
await fs.writeFile('meta-server.json', JSON.stringify(server.metafile))

console.log('\n  built client/assets.js and server/server.js')
