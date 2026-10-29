// 纯 node 环境下伪造 electron 模块，让 launch.cjs 不经修改即可加载。
// 关键点：whenReady 必须 resolve，否则 createWindow 不执行、mainWindow 恒为 null，
// launch.cjs:749/751/2371 的推送会静默 no-op（这些推送就是网页端的 SSE 数据源）。
const path = require('path')
const os = require('os')
const { EventEmitter } = require('events')
const { execFile } = require('child_process')

const pushEmitter = new EventEmitter()
pushEmitter.setMaxListeners(0)

// 与真实 Electron 的 userData 保持一致（本机已验证为 ~/Library/Application Support/ocean），
// 网页端与桌面端共享 flow-editor-config.json（最近项目、侧边栏顺序等）
const userDataDir = process.env.OCEAN_USER_DATA
  || path.join(os.homedir(), 'Library', 'Application Support', 'ocean')

// launch.cjs 在 require 时注册 whenReady().then(createWindow)，
// 此 Promise 上的回调按注册顺序执行，因此 await ready 可保证 mainWindow 已赋值
const ready = Promise.resolve()

const handlers = new Map()

const app = {
  // 供 webServerHost.cjs 识别：当前处于网页端子进程（stub 环境），宿主逻辑须禁用
  isOceanStub: true,
  getPath: () => userDataDir,
  getVersion: () => require('../../package.json').version,
  isPackaged: false,
  whenReady: () => ready,
  on: () => {},
  quit: () => {},
}

const ipcMain = {
  handle: (channel, fn) => handlers.set(channel, fn),
}

class BrowserWindow {
  constructor() {
    this.webContents = {
      // launch.cjs 的两处主动推送在这里变成事件流，由 HTTP 层转成 SSE
      send: (channel, payload) => pushEmitter.emit('push', { channel, payload }),
      openDevTools: () => {},
    }
  }
  loadURL() {}
  loadFile() {}
  on() {}
  isDestroyed() { return false }
}

// macOS 上用 osascript 弹原生目录选择框，替代 Electron 的 dialog.showOpenDialog。
// OCEAN_NO_DIALOG=1 时直接取消（测试/无 GUI 环境用，避免自动化测试弹出真实对话框）。
// 取消/无 GUI 环境时按 Electron 语义返回 { canceled: true, filePaths: [] }。
function chooseFolder() {
  if (process.env.OCEAN_NO_DIALOG) return Promise.resolve({ canceled: true, filePaths: [] })
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-e', 'POSIX path of (choose folder with prompt "选择 Ocean 项目文件夹")'],
      (err, stdout) => {
        if (err) return resolve({ canceled: true, filePaths: [] })
        const p = String(stdout || '').trim().replace(/\/+$/, '')
        if (!p) return resolve({ canceled: true, filePaths: [] })
        resolve({ canceled: false, filePaths: [p] })
      },
    )
  })
}

const dialog = { showOpenDialog: async () => chooseFolder() }

module.exports = { app, BrowserWindow, ipcMain, dialog, handlers, pushEmitter, ready, userDataDir }
