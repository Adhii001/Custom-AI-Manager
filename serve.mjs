import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { Readable } from 'node:stream'
import app from './dist/server/server.js'

const port = Number(process.env.PORT || 3000)
createServer(async (req, res) => {
  try {
    const origin = process.env.APP_ORIGIN || 'http://' + req.headers.host
    const url = new URL(req.url, origin)
    if (url.pathname === '/favicon.svg') {
      const icon = await readFile(new URL('./dist/client/favicon.svg', import.meta.url))
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end(icon)
      return
    }
    if (/^\/assets\/[\w.-]+$/.test(url.pathname)) {
      const file = await readFile(new URL('./dist/client' + url.pathname, import.meta.url)).catch(() => null)
      if (!file) { res.writeHead(404).end(); return }
      res.writeHead(200, { 'Content-Type': url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', 'Cache-Control': 'public,max-age=31536000,immutable' }).end(file)
      return
    }
    const body = ['GET','HEAD'].includes(req.method) ? undefined : Readable.toWeb(req)
    const response = await app.fetch(new Request(url, {method:req.method,headers:req.headers,body,duplex:'half'}))
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (response.body) Readable.fromWeb(response.body).pipe(res)
    else res.end()
  } catch { res.writeHead(500).end('Request failed') }
}).listen(port, () => console.log('Custom AI Manager listening on port '+port))

