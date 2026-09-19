// HTTP API 层：一个通用路由把 82 个 channel 暴露成 HTTP，SSE 承载两条推送通道，
// 并托管 vite 构建产物。不做鉴权（个人本机使用，仅监听 127.0.0.1）。
const http = require('http')
const fs = require('fs')
const path = require('path')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

// 未选项目前放行的 channel：前端完成"选项目/恢复上次项目"必需的最小集合。
// 目的是堵住 getProjectRoot() 未设项目时回退到仓库目录的洞（launch.cjs:65）。
const PRE_PROJECT_CHANNELS = new Set([
  'get-app-version',
  'load-app-config',
  'save-app-config',
  'open-folder-dialog',
  'init-project-dir',
  'set-project-path',
  'load-llm-config',
  'save-llm-config',
  'test-llm-connection',
])

// 桌面宿主专用 channel：禁止经 HTTP 递归拉起子进程（网页端里这些能力无意义且有套娃风险）
const HTTP_DENIED_CHANNELS = new Set(['web-server-start', 'web-server-stop', 'web-server-status'])

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (c) => { data += c })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

function createServer({ handlers, pushEmitter, distDir }) {
  let projectSet = false
  const sseClients = new Set()

  pushEmitter.on('push', ({ channel, payload }) => {
    const frame = `data: ${JSON.stringify({ channel, payload })}\n\n`
    for (const res of sseClients) res.write(frame)
  })

  async function invoke(channel, ...args) {
    if (HTTP_DENIED_CHANNELS.has(channel)) {
      const err = new Error('channel not available over http')
      err.statusCode = 403
      throw err
    }
    const handler = handlers.get(channel)
    if (!handler) {
      const err = new Error(`unknown channel: ${channel}`)
      err.statusCode = 404
      throw err
    }
    if (!projectSet && !PRE_PROJECT_CHANNELS.has(channel)) {
      const err = new Error('no project selected: call set-project-path first')
      err.statusCode = 403
      throw err
    }
    // 0 个 handler 使用 event 参数（已核实），null 占位即可
    const result = await handler(null, ...args)
    if (channel === 'set-project-path' || channel === 'init-project-dir') projectSet = true
    return result === undefined ? { success: true } : result
  }

  function serveStatic(res, pathname) {
    if (!fs.existsSync(distDir)) {
      sendJson(res, 404, { error: `dist 未构建：${distDir}，请先执行 pnpm web:build` })
      return
    }
    let rel
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      res.writeHead(400)
      res.end()
      return
    }
    if (rel === '/') rel = '/index.html'
    const filePath = path.normalize(path.join(distDir, rel))
    if (!filePath.startsWith(path.normalize(distDir) + path.sep) && filePath !== path.normalize(distDir)) {
      res.writeHead(403)
      res.end()
      return
    }
    fs.readFile(filePath, (err, buf) => {
      if (err) {
        // SPA 兜底：未知路径回 index.html
        fs.readFile(path.join(distDir, 'index.html'), (e2, index) => {
          if (e2) { res.writeHead(404); res.end('not found'); return }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(index)
        })
        return
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
      res.end(buf)
    })
  }

  async function handleRequest(req, res) {
    // 个人本机使用；dev 模式下 vite(5273) 跨域访问 API(8787) 依赖这三个头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

    let url
    try { url = new URL(req.url, 'http://127.0.0.1') } catch { res.writeHead(400); res.end(); return }

    // SSE：instance-detail-delta 与 agent-loop-event 两条推送共用一条连接
    if (url.pathname === '/api/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      res.write(': connected\n\n')
      sseClients.add(res)
      const ping = setInterval(() => res.write(': ping\n\n'), 25000)
      req.on('close', () => { clearInterval(ping); sseClients.delete(res) })
      return
    }

    const m = url.pathname.match(/^\/api\/ipc\/([a-z0-9-]+)$/)
    if (m && req.method === 'POST') {
      try {
        const raw = await readBody(req)
        let args = []
        try { args = raw ? (JSON.parse(raw).args || []) : [] } catch {
          const e = new Error('invalid json body')
          e.statusCode = 400
          throw e
        }
        const result = await invoke(m[1], ...args)
        sendJson(res, 200, result)
      } catch (e) {
        sendJson(res, e.statusCode || 500, { success: false, error: String(e.message || e) })
      }
      return
    }

    if (req.method === 'GET') { serveStatic(res, url.pathname); return }

    res.writeHead(405)
    res.end()
  }

  const server = http.createServer((req, res) => {
    // 兜底：任何同步/异步异常都不允许打崩进程（畸形请求曾致 URIError 崩溃）
    handleRequest(req, res).catch((e) => {
      console.error('[http] 请求处理异常:', req.method, req.url, String((e && e.message) || e))
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ success: false, error: 'internal error' }))
      } else {
        try { res.end() } catch { res.destroy() }
      }
    })
  })

  // Node>=18 默认 requestTimeout=300s，run-agent-loop 会被掐断
  server.requestTimeout = 0
  server.headersTimeout = 60000

  return { server, invoke, getSseClientCount: () => sseClients.size }
}

module.exports = { createServer, PRE_PROJECT_CHANNELS }
