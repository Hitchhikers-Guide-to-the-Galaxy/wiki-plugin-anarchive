// assets plugin - server-side component
// these handlers are launched with the wiki server.

import fs from 'node:fs'
import path from 'node:path'
import multer from 'multer'
import { SIDECAR, safeFolder, safeName, allowedInFolder, listable } from './safe.js'

const startServer = params => {
  const { app, argv } = params

  // Temp uploads live beside the assets tree, never inside it: argv.assets is
  // served static and CORS-open, so a temp dir there publishes every partial
  // upload and leaves orphans fetchable.
  const upload = multer({
    dest: path.join(argv.data, 'anarchive-tmp'),
    limits: {
      fileSize: argv.anarchiveMaxBytes ?? 2 * 1024 * 1024 * 1024,
      files: 20,
      fields: 40,
    },
    // Cheap folder-independent checks, so a rejected name never reaches disk.
    fileFilter: (req, file, cb) => {
      const { error } = safeName(file.originalname)
      return error ? cb(new Error(error)) : cb(null, true)
    },
  })

  // multer reports limit and filter failures as errors; turn them into a status
  // the client can render instead of letting them fall through to a hang.
  const receive = (req, res, next) =>
    upload.any()(req, res, err => {
      if (!err) return next()
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400
      return res.status(status).send(err.message || 'upload rejected')
    })

  const authorized = (req, res, next) => {
    if (app['securityhandler'].isAuthorized(req)) {
      next()
    } else {
      res.status(403).send('must be owner')
    }
  }

  const cors = (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*')
    next()
  }

  app.get('/plugin/assets/list', cors, (req, res) => {
    const assetsPath = path.join(argv.assets, (req.query.assets || '').match(/([\w/-]*)/)[1])
    fs.readdir(assetsPath, { withFileTypes: true }, (error, files) => {
      if (error) {
        return res.json({ error })
      }
      const filtered = files
        .filter(file => file.isFile())
        .map(file => file.name)
        .filter(listable)
      return res.json({ error, files: filtered })
    })
  })

  app.get('/plugin/assets/index', cors, (req, res) => {
    const walk = dir => {
      const files = fs.readdirSync(path.join(argv.assets, dir), { withFileTypes: true })
      return files
        .map(file => {
          if (listable(file.name)) {
            if (file.isFile()) {
              return {
                file: path.join(path.sep, dir, file.name),
                size: fs.statSync(path.join(argv.assets, dir, file.name)).size,
              }
            }
            if (file.isDirectory()) {
              return walk(path.join(dir, file.name)).flat()
            }
            return []
          } else {
            return []
          }
        })
        .flat()
    }

    return res.json(walk(''))
  })

  // rename is the fast path; temp and assets can still land on different
  // filesystems, and some mounts refuse it outright.
  const moveInto = (from, to) => {
    try {
      fs.renameSync(from, to)
    } catch (err) {
      if (err.code !== 'EXDEV' && err.code !== 'EPERM') throw err
      fs.copyFileSync(from, to)
      fs.rmSync(from, { force: true })
    }
  }

  app.post('/plugin/assets/upload', authorized, receive, (req, res) => {
    const folder = safeFolder(req.body.assets)
    if (folder === null) return res.status(400).send('bad assets folder')
    const assetsPath = path.join(argv.assets, folder)
    fs.mkdirSync(assetsPath, { recursive: true })

    const errors = []
    for (const element of req.files ?? []) {
      // basename before the join. This is the path traversal fix: originalname
      // is client-supplied and a crafted ../ escapes the assets folder.
      const { name, error } = safeName(element.originalname)
      const denied = error || allowedInFolder(name, folder).error
      if (denied) {
        fs.rmSync(element.path, { force: true })
        errors.push(denied)
        continue
      }
      try {
        moveInto(element.path, path.join(assetsPath, name))
      } catch (err) {
        fs.rmSync(element.path, { force: true })
        errors.push(`could not store ${name}: ${err.code || err.message}`)
      }
    }

    // Upstream collected these in an async rename callback and tested the array
    // before any callback ran, so failures were always reported as success.
    if (errors.length) return res.status(400).send(errors.join('\n'))
    res.end('success')
  })

  app.post('/plugin/assets/delete', authorized, (req, res) => {
    const file = path.basename(req.query.file || '')
    if (file && listable(file)) {
      const folder = safeFolder(req.query.assets)
      if (folder === null) return res.status(400).send('bad assets folder')
      const toRemove = path.join(argv.assets, folder, file)
      fs.unlink(toRemove, err => {
        if (err) {
          res.status(500).send(err.message)
        } else {
          res.status(200).send('ok')
        }
      })
    } else {
      res.status(500).send('No file specified')
    }
  })
}

export { startServer }
