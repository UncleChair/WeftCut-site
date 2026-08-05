#!/usr/bin/env node
// WeftCut site — zero-dependency static preview server.
// Usage: npm start [port]   (default 8080)
import http from 'node:http'
import { createReadStream, readFileSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MARKDOWN, estimateTokens, wantsMarkdown } from './worker.js'

const ROOT = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.argv[2] || process.env.PORT || 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
}

// Extension-less paths whose type is fixed by the spec that defines them. On
// the deployed site these come from _headers, which this server doesn't read.
const BY_PATH = {
  '/.well-known/api-catalog': 'application/linkset+json; charset=utf-8',
}

const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)

    // Same content negotiation the edge does, using the same rule (worker.js),
    // so `Accept: text/markdown` can be tested without a deploy.
    const markdownPath = MARKDOWN[pathname]
    if (markdownPath && wantsMarkdown(req.headers.accept)) {
      const file = resolve(ROOT, `.${markdownPath}`)
      try {
        const text = readFileSync(file, 'utf8')
        res.writeHead(200, {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Location': markdownPath,
          'x-markdown-tokens': String(estimateTokens(text)),
          Vary: 'Accept',
          'Cache-Control': 'no-cache',
        })
        res.end(text)
        return
      } catch {
        res.writeHead(404).end('Not found: ' + markdownPath)
        return
      }
    }

    if (pathname.endsWith('/')) pathname += 'index.html'
    const file = resolve(ROOT, `.${pathname}`)
    const relativeFile = relative(ROOT, file)
    if (
      relativeFile === '..' ||
      relativeFile.startsWith(`..${sep}`) ||
      isAbsolute(relativeFile)
    ) {
      res.writeHead(403).end('Forbidden')
      return
    }
    let stat
    try {
      stat = statSync(file)
      if (stat.isDirectory()) {
        // /zh -> /zh/ so the localized pages resolve the way a real static host
        // serves them; without this the directory stat throws straight to 404.
        res.writeHead(301, { Location: pathname + '/' }).end()
        return
      }
    } catch {
      res.writeHead(404).end('Not found: ' + pathname)
      return
    }

    const type =
      BY_PATH[pathname] || MIME[extname(file).toLowerCase()] || 'application/octet-stream'
    const size = stat.size
    const range = req.headers.range
    const m = range && /^bytes=(\d*)-(\d*)$/.exec(range)
    if (m && (m[1] || m[2])) {
      // Single-range support so <video> seeks work in preview.
      let start = m[1] ? parseInt(m[1], 10) : Math.max(0, size - parseInt(m[2], 10))
      let end = m[1] && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end()
        return
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Cache-Control': 'no-cache',
      })
      createReadStream(file, { start, end }).pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      })
      createReadStream(file).pipe(res)
    }
  } catch (e) {
    res.writeHead(500).end(String(e))
  }
})

server.listen(PORT, () => {
  console.log(`WeftCut site preview → http://localhost:${PORT}/`)
})
