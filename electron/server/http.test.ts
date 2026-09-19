import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import net from 'node:net'

const tmp = mkdtempSync(join(tmpdir(), 'ocean-http-'))
process.env.OCEAN_USER_DATA = join(tmp, 'user-data')
process.env.HOME = tmp
process.env.OCEAN_NO_DIALOG = '1'

const req = createRequire(import.meta.url)
const { handlers, pushEmitter } = req('./registry.cjs')
const { createServer } = req('./http.cjs')

const distDir = join(tmp, 'dist')
mkdirSync(distDir, { recursive: true })
writeFileSync(join(distDir, 'index.html'), '<!DOCTYPE html><html><body>ocean-web-dist</body></html>')

let server: any
let invoke: (ch: string, ...a: unknown[]) => Promise<any>
let base = ''

beforeAll(async () => {
  ;({ server, invoke } = createServer({ handlers, pushEmitter, distDir }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(r))
  rmSync(tmp, { recursive: true, force: true })
})

const post = (ch: string, args: unknown[]) =>
  fetch(`${base}/api/ipc/${ch}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

describe('HTTP API 层', () => {
  it('未知 channel 返回 404', async () => {
    const r = await post('no-such-channel', [])
    expect(r.status).toBe(404)
    expect(r.body.success).toBe(false)
  })

  it('未选项目前，非白名单 channel 返回 403（堵住 getProjectRoot 回退到仓库目录）', async () => {
    const r = await post('save-workflow-file', ['x', '# x'])
    expect(r.status).toBe(403)
    expect(r.body.error).toContain('set-project-path')
  })

  it('set-project-path 后，业务 channel 正常读写', async () => {
    const project = join(tmp, 'proj')
    mkdirSync(project, { recursive: true })
    const r1 = await post('set-project-path', [project])
    expect(r1.body.success).toBe(true)

    const r2 = await post('save-workflow-file', ['http-demo', '# http demo\n'])
    expect(r2.body.success).toBe(true)

    const r3 = await post('load-workflow-file', ['http-demo'])
    expect(r3.body.content).toBe('# http demo\n')
  })

  it('非法 JSON body 返回 400', async () => {
    const r = await fetch(`${base}/api/ipc/save-workflow-file`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not-json',
    })
    expect(r.status).toBe(400)
  })

  it('CORS 预检返回 204', async () => {
    const r = await fetch(`${base}/api/ipc/save-workflow-file`, { method: 'OPTIONS' })
    expect(r.status).toBe(204)
  })

  it('托管 dist/index.html', async () => {
    const r = await fetch(`${base}/`)
    expect(r.status).toBe(200)
    expect(await r.text()).toContain('ocean-web-dist')
  })

  it('pushEmitter 推送经 SSE 原样到达客户端', async () => {
    const ac = new AbortController()
    const res = await fetch(`${base}/api/events`, { signal: ac.signal })
    expect(res.headers.get('content-type')).toContain('text/event-stream')

    const reader = (res.body as any).getReader()
    const first = await reader.read() // ': connected\n\n' 注释帧
    expect(new TextDecoder().decode(first.value)).toContain('connected')

    pushEmitter.emit('push', { channel: 'instance-detail-delta', payload: { status: 'running' } })
    const second = await reader.read()
    const text = new TextDecoder().decode(second.value)
    expect(text).toContain('data: ')
    expect(JSON.parse(text.replace(/^data: /, '').trim())).toEqual({
      channel: 'instance-detail-delta',
      payload: { status: 'running' },
    })
    ac.abort()
  })

  it('P1-1 回归：畸形 percent-encoding 返回 400 且服务存活（裸 socket 原始请求）', async () => {
    const rawGet = (rawPath: string) =>
      new Promise<string | null>((resolve) => {
        const sock = net.connect(server.address().port, '127.0.0.1', () => {
          sock.write(`GET ${rawPath} HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n`)
        })
        let data = ''
        sock.on('data', (d) => { data += d })
        sock.on('end', () => resolve(data.split('\r\n')[0]))
        sock.on('error', () => resolve(null))
      })
    // 连发多个畸形路径 + 一个合法请求，进程必须全部存活
    expect(await rawGet('/%zz')).toContain(' 400 ')
    expect(await rawGet('/%')).toContain(' 400 ')
    expect(await rawGet('/a%2')).toContain(' 400 ')
    const ok = await fetch(`${base}/`)
    expect(ok.status).toBe(200)
  })

  it('server.requestTimeout 被关闭（run-agent-loop 可能远超默认 300s）', () => {
    expect(server.requestTimeout).toBe(0)
  })

  it('web-server-* 宿主专用 channel 经 HTTP 一律拒绝（防递归拉起）', async () => {
    const project3 = join(tmp, 'proj3')
    mkdirSync(project3, { recursive: true })
    await post('set-project-path', [project3])
    for (const ch of ['web-server-start', 'web-server-stop', 'web-server-status']) {
      const r = await post(ch, [])
      expect(r.status).toBe(403)
      expect(r.body.error).toContain('not available over http')
    }
  })

  it('invoke 直连（供 index.cjs 的 --project 使用）同样受守卫约束', async () => {
    const project2 = join(tmp, 'proj2')
    mkdirSync(project2, { recursive: true })
    const r = await invoke('set-project-path', project2)
    expect((r as any).success).toBe(true)
  })
})
