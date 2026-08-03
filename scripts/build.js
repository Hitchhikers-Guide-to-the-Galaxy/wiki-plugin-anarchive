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
// Bundled, because the server is split across safe.js, sidecar.js and
// constants.js and only this one file is shipped — an unbundled build emits
// require('./safe.js') for a path that exists solely under src/.
const server = await esbuild.build({
  entryPoints: ['src/server/server.js'],
  bundle: true,
  external: ['multer'],
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

// Prove the artifact loads the way wiki-server loads it, rather than assuming.
// A server that fails to import is caught and merely logged by wiki-server, so
// the farm comes up looking healthy with every /plugin/assets/ route missing.
const { pathToFileURL } = await import('node:url')
const loaded = await import(pathToFileURL(new URL('../server/server.js', import.meta.url).pathname).href)
if (typeof loaded.startServer !== 'function') {
  console.error('\n  FAILED: server/server.js does not export startServer')
  process.exit(1)
}

const bundle = await fs.readFile('client/assets.js', 'utf8')
if (!bundle.includes('window.plugins.assets')) {
  console.error('\n  FAILED: client bundle never registers window.plugins.assets')
  process.exit(1)
}

console.log('\n  built client/assets.js and server/server.js — both verified to load')
