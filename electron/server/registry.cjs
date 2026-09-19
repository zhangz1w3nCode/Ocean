// 把 electron 桩预填进 require.cache，再加载 launch.cjs。
// launch.cjs 顶层的 82 个 ipcMain.handle 会同步执行，把 handler 写进桩的 Map。
const Module = require('module')
const stub = require('./electron-stub.cjs')

// launch.cjs（electron/ 目录）与本文件（electron/server/ 目录）向上解析到同一个
// node_modules/electron/index.js，因此覆盖这一个缓存条目即可生效。
const ELECTRON_KEY = require.resolve('electron')

const cached = Module._cache[ELECTRON_KEY]
if (!cached || !cached.__oceanStub) {
  Module._cache[ELECTRON_KEY] = {
    id: ELECTRON_KEY,
    filename: ELECTRON_KEY,
    loaded: true,
    __oceanStub: true,
    exports: {
      app: stub.app,
      BrowserWindow: stub.BrowserWindow,
      ipcMain: stub.ipcMain,
      dialog: stub.dialog,
    },
  }
}

require('../launch.cjs')

module.exports = {
  handlers: stub.handlers,
  pushEmitter: stub.pushEmitter,
  ready: stub.ready,
}
