# Federated Wiki — Anarchive (Assets) Plugin

A fork of [fedwiki/wiki-plugin-assets](https://github.com/fedwiki/wiki-plugin-assets)
that serves the same `assets` item type with fixes offered back upstream:

- asset **provenance** recorded in a per-folder sidecar and carried across a copy
- **captions** shown on assets
- an item **DSL** (UPPERCASE directives) for the assets item
- **hardened uploads** — temp dir moved out of the CORS-open served tree,
  dotfiles/path separators/null bytes rejected (file types are not
  restricted — html in a page's folder is accepted, as upstream does)
- an out-of-process **backfill** script (`scripts/backfill.py`) that writes
  sidecar entries for assets uploaded before this fork

## Install — the seat matters

wiki-server serves a plugin's client from its **directory name**, and the
`assets` factory requests `/plugins/assets/assets.js`. So this package must
sit in the `wiki-plugin-assets` directory seat — install it with an npm
alias:

```bash
npm install wiki-plugin-assets@npm:wiki-plugin-anarchive
```

A plain `npm install wiki-plugin-anarchive` lands in the wrong directory:
the item type 404s, and alongside the stock assets plugin the two server
halves race for the same routes. Don't do that.

Restart the wiki server after installing.

## Build

```bash
npm install
npm run build
npm test
```

## License

MIT — original plugin © the Federated Wiki contributors (see AUTHORS.txt);
fork changes © David Bovill.
