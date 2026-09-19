// Ocean 网页端入口
// 用法：node electron/server/index.cjs [--port 8787] [--project <绝对路径>]
// 环境变量：OCEAN_WEB_PORT、OCEAN_PROJECT、OCEAN_USER_DATA
const path = require('path')
const fs = require('fs')
const { handlers, pushEmitter, ready } = require('./registry.cjs')
const { createServer } = require('./http.cjs')

const args = process.argv.slice(2)
function argValue(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const port = Number(argValue('--port', process.env.OCEAN_WEB_PORT || '8787'))
const project = argValue('--project', process.env.OCEAN_PROJECT || '')
const distDir = path.join(__dirname, '..', '..', 'dist')

const { server, invoke } = createServer({ handlers, pushEmitter, distDir })

server.listen(port, '127.0.0.1', async () => {
  await ready
  console.log(`Ocean web:   http://127.0.0.1:${port}`)
  console.log(`handlers:    ${handlers.size}`)
  console.log(`userData:    ${process.env.OCEAN_USER_DATA || '~/Library/Application Support/ocean（与桌面端共享）'}`)
  console.log(`dist:        ${fs.existsSync(distDir) ? distDir : '未构建（仅 API，先跑 pnpm web:build）'}`)
  if (project) {
    const r = await invoke('set-project-path', path.resolve(project))
    console.log(`project:     ${JSON.stringify(r)}`)
  }
})
