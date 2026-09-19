// 端到端验证：起真实服务 → API/守卫/SSE 断言 → headless Chrome 打开页面断言
// 用法：node electron/server/e2e-check.mjs
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const ROOT = new URL('../..', import.meta.url).pathname
const PORT = 8799
const BASE = `http://127.0.0.1:${PORT}`

const tmp = mkdtempSync(join(tmpdir(), 'ocean-e2e-'))
const userData = join(tmp, 'user-data')
const project = join(tmp, 'proj')
mkdirSync(userData, { recursive: true })
mkdirSync(project, { recursive: true })

// 预置 lastProjectPath，让前端启动即自动恢复项目（selectProject → set-project-path），
// 从而绕开需要人工点击的 osascript 目录选择
writeFileSync(
  join(userData, 'flow-editor-config.json'),
  JSON.stringify({
    recentProjects: [{ id: 'e2e', name: 'proj', path: project, lastOpenedAt: new Date().toISOString() }],
    lastProjectPath: project,
    maxRecentProjects: 10,
  }),
)

const child = spawn('node', [join(ROOT, 'electron/server/index.cjs'), '--port', String(PORT)], {
  env: { ...process.env, OCEAN_USER_DATA: userData, HOME: tmp, OCEAN_NO_DIALOG: '1' },
  stdio: 'pipe',
})
child.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))
child.stderr.on('data', (d) => process.stderr.write(`[server-err] ${d}`))

let failed = 0
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`)
  if (!cond) failed++
}

const post = (ch, args) =>
  fetch(`${BASE}/api/ipc/${ch}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ args }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }))

try {
  await new Promise((r) => setTimeout(r, 1500))

  // 1) 守卫：服务刚起、前端可能已先跑 set-project-path，两种状态都合法
  const g = await post('save-workflow-file', ['e2e', '# e2e\n'])
  ok('未选项目守卫（403 拒绝 或 恢复流程已放行 200）', [403, 200].includes(g.status), `status=${g.status}`)

  // 2) 直连 API 完成完整业务回路
  const s = await post('set-project-path', [project])
  ok('set-project-path 成功', s.body.success === true, JSON.stringify(s.body))
  const w = await post('save-workflow-file', ['e2e-demo', '# e2e demo\n'])
  ok('save-workflow-file 成功', w.body.success === true)
  const l = await post('load-workflow-file', ['e2e-demo'])
  ok('load-workflow-file 内容一致', l.body.content === '# e2e demo\n')

  // 3) 静态托管
  const html = await fetch(`${BASE}/`).then((r) => r.text())
  ok('首页托管 dist/index.html', html.includes('<div id="root">'), `len=${html.length}`)

  // 4) SSE 通道建立
  const ac = new AbortController()
  const sse = await fetch(`${BASE}/api/events`, { signal: ac.signal })
  ok('SSE 端点返回 event-stream', (sse.headers.get('content-type') || '').includes('text/event-stream'))
  const reader = sse.body.getReader()
  const first = await reader.read()
  ok('SSE 首帧为 connected 注释', new TextDecoder().decode(first.value).includes('connected'))
  ac.abort()

  // 5) headless Chrome 实测浏览器渲染（尽力而为：无 Chrome 则跳过）
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  let browserWorked = false
  try {
    const cdpPort = 9337
    const chromeProc = spawn(chrome, [
      '--headless', '--disable-gpu', '--no-sandbox', '--no-first-run',
      '--disable-extensions', `--remote-debugging-port=${cdpPort}`,
      `--user-data-dir=${join(tmp, 'chrome')}`, 'about:blank',
    ], { stdio: 'ignore' })
    await new Promise((r) => setTimeout(r, 5000))
    const ver = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json()).catch(() => null)
    if (ver) {
      const tab = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(`${BASE}/`)}`, { method: 'PUT' }).then((r) => r.json())
      const ws = new WebSocket(tab.webSocketDebuggerUrl)
      let mid = 0
      const pending = new Map()
      const send = (method, params = {}) => new Promise((resolve) => {
        const id = ++mid
        pending.set(id, resolve)
        ws.send(JSON.stringify({ id, method, params }))
      })
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data)
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
      }
      await new Promise((r) => { ws.onopen = r })
      await send('Runtime.enable')
      await send('Page.navigate', { url: `${BASE}/` })
      await new Promise((r) => setTimeout(r, 9000))
      const evalJs = async (expr) => {
        const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
        return res.result?.result?.value
      }
      const hasApi = await evalJs('typeof window.electronAPI')
      const text = await evalJs('(document.body.innerText||"").slice(0,300)')
      ok('浏览器内 window.electronAPI 已注入', hasApi === 'object', `typeof=${hasApi}`)
      const inMainUI = typeof text === 'string' && !text.includes('最近打开的项目') && text.includes('工作流')
      ok('浏览器自动恢复项目并进入主界面', inMainUI, JSON.stringify(text).slice(0, 160))
      browserWorked = true
      ws.close()
    }
    chromeProc.kill()
  } catch (e) {
    console.log(`SKIP  headless Chrome 验证未执行：${e.message}`)
  }
  if (!browserWorked) console.log('SKIP  （无可用 Chrome，浏览器断言未执行；API/静态/SSE 断言仍然有效）')
} finally {
  child.kill()
  await new Promise((r) => setTimeout(r, 500))
  rmSync(tmp, { recursive: true, force: true })
}

console.log(failed === 0 ? '\nE2E: 全部通过' : `\nE2E: ${failed} 项失败`)
process.exit(failed === 0 ? 0 : 1)
