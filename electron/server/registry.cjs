// 拦截 require('electron') 使其拿到桩模块，再加载 launch.cjs。
// launch.cjs 顶层的 ipcMain.handle 会同步执行，把 handler 写进桩的 Map。
const Module = require('module')
const stub = require('./electron-stub.cjs')

const stubExports = {
  app: stub.app,
  BrowserWindow: stub.BrowserWindow,
  ipcMain: stub.ipcMain,
  dialog: stub.dialog,
}

// 用 Module._load 拦截而非预填 require.cache：打包版 asar 内没有 node_modules/electron，
// require.resolve('electron') 会抛 MODULE_NOT_FOUND 导致子进程启动即退出；
// _load 拦截不依赖模块可被解析，开发/打包/asar 三种环境行为一致。
if (!Module.__oceanElectronPatched) {
  const origLoad = Module._load
  Module._load = function (request) {
    if (request === 'electron') return stubExports
    return origLoad.apply(this, arguments)
  }
  Module.__oceanElectronPatched = true
}

require('../launch.cjs')

module.exports = {
  handlers: stub.handlers,
  pushEmitter: stub.pushEmitter,
  ready: stub.ready,
}
