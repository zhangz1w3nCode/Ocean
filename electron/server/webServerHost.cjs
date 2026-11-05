// 桌面端宿主：把网页端作为子进程拉起/停止。
// 运行在 Electron 主进程内（launch.cjs require 本模块），自己注册 IPC handler。
// 在网页端子进程内（stub 环境）自动禁用，防止递归拉起。
const { spawn } = require('child_process')
const net = require('net')
const path = require('path')
const fs = require('fs')

const electron = require('electron')
// 桩（electron-stub.cjs）会标记 isOceanStub；网页端子进程内禁用一切宿主逻辑
const IS_STUB = !!(electron.app && electron.app.isOceanStub)

const DEFAULT_PORT = () => Number(process.env.OCEAN_WEB_PORT || 8787)

let child = null
let childProject = null
let childPort = null

function status() {
  return {
    running: !!child && !child.killed,
    port: childPort,
    pid: child ? child.pid : null,
    project: childProject,
  }
}

function stop() {
  if (!child) return { success: true, wasRunning: false }
  const c = child
  child = null
  childProject = null
  childPort = null
  try { c.kill() } catch {}
  return { success: true, wasRunning: true }
}

function portInUse(port) {
  return new Promise((resolve) => {
    const probe = net.connect(port, '127.0.0.1')
    probe.on('connect', () => { probe.destroy(); resolve(true) })
    probe.on('error', () => resolve(false))
  })
}

function waitForPort(port, timeout) {
  const t0 = Date.now()
  return new Promise((resolve) => {
    const tick = () => {
      const probe = net.connect(port, '127.0.0.1')
      probe.on('connect', () => { probe.destroy(); resolve(true) })
      probe.on('error', () => {
        if (Date.now() - t0 > timeout) return resolve(false)
        setTimeout(tick, 300)
      })
    }
    tick()
  })
}

function spawnChild(port, projectPath) {
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', OCEAN_WEB_PORT: String(port) }
  // 网页端需要 osascript 原生目录选择能力，不能继承阻断开关
  delete env.OCEAN_NO_DIALOG

  const args = [path.join(__dirname, 'index.cjs'), '--port', String(port)]
  if (projectPath) args.push('--project', projectPath)

  const c = spawn(process.execPath, args, { env, stdio: 'pipe', detached: false })
  c.stdout.on('data', (d) => console.log('[web]', String(d).trim()))
  c.stderr.on('data', (d) => console.error('[web-err]', String(d).trim()))
  c.on('exit', () => { if (child === c) { child = null; childProject = null; childPort = null } })
  return c
}

async function start(projectPath, portArg) {
  const port = portArg || DEFAULT_PORT()
  if (child && !child.killed) return { success: true, alreadyRunning: true, port, pid: child.pid }

  // 端口被占：可能是手动起的网页端或其他服务，直接失败而不是静默换端口
  if (await portInUse(port)) {
    return { success: false, error: `端口 ${port} 已被占用（可能是手动启动的网页端），如需桌面托管请先停掉占用进程` }
  }

  child = spawnChild(port, projectPath)
  childProject = projectPath || null
  childPort = port

  const up = await waitForPort(port, 10000)
  if (!up) {
    const pid = child ? child.pid : null
    stop()
    return { success: false, error: `子进程已拉起但端口 ${port} 未在 10s 内就绪`, pid }
  }
  return { success: true, port, pid: child.pid }
}

function stopAndWait(timeout = 5000) {
  const c = child
  stop()
  if (!c) return Promise.resolve()
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeout)
    c.once('exit', () => { clearTimeout(t); resolve() })
  })
}

async function waitForPortFree(port, timeout) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    if (!(await portInUse(port))) return true
    await new Promise((r) => setTimeout(r, 200))
  }
  return !(await portInUse(port))
}

// 项目级开关：<项目>/.ocean/setting/general.json 的 webServerEnabled
function readGeneralEnabled(projectPath) {
  try {
    const f = path.join(projectPath, '.ocean', 'setting', 'general.json')
    if (!fs.existsSync(f)) return false
    return !!JSON.parse(fs.readFileSync(f, 'utf-8')).webServerEnabled
  } catch { return false }
}

// 桌面端切换项目时按目标项目的设置同步：开→跟随/拉起，关→停止。
// 必须等旧子进程退出且端口彻底释放后才能重新拉起，否则 portInUse 误判导致启动失败。
async function syncProject(projectPath) {
  const enabled = readGeneralEnabled(projectPath)
  if (!enabled) {
    if (child && !child.killed) stop()
    return
  }
  if (child && !child.killed && childProject === projectPath) return
  const port = childPort || DEFAULT_PORT()
  if (child && !child.killed) {
    await stopAndWait()
    await waitForPortFree(port, 8000)
  }
  await start(projectPath, port)
}

// IPC 注册 + 生命周期钩子（仅真实 Electron 主进程）
if (!IS_STUB && electron.ipcMain) {
  electron.ipcMain.handle('web-server-status', () => status())
  electron.ipcMain.handle('web-server-start', async (_e, projectPath) => start(projectPath))
  electron.ipcMain.handle('web-server-stop', () => stop())

  // 桌面退出时带走子进程，不留孤儿
  electron.app.on('will-quit', () => stop())

  // 上次打开的项目若开启了网页端（项目级设置），桌面启动自动拉起
  electron.app.whenReady().then(() => {
    try {
      const cfgPath = path.join(electron.app.getPath('userData'), 'flow-editor-config.json')
      if (!fs.existsSync(cfgPath)) return
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'))
      const last = cfg.lastProjectPath
      if (last && readGeneralEnabled(last)) start(last)
    } catch (e) {
      console.error('[web] 自动启动失败:', e)
    }
  })
}

module.exports = { start, stop, status, syncProject, IS_STUB }
