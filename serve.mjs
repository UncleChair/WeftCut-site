#!/usr/bin/env node
// WeftCut site — zero-dependency static preview server.
// Usage: npm start [port]   (default 8080)
import http from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

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
}

const server = http.createServer((req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname)
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
      if (stat.isDirectory()) throw new Error('dir')
    } catch {
      res.writeHead(404).end('Not found: ' + pathname)
      return
    }

    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
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
