import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

// 测试中禁止触发 osascript 真实弹框（会阻塞等待用户点击）
process.env.OCEAN_NO_DIALOG = '1'

const req = createRequire(import.meta.url)
const stub = req('./electron-stub.cjs')

describe('electron 桩模块', () => {
  it('ipcMain.handle 把 handler 注册进 Map', () => {
    const before = stub.handlers.size
    stub.ipcMain.handle('probe-channel', () => 42)
    expect(stub.handlers.size).toBe(before + 1)
    expect(stub.handlers.get('probe-channel')!(null)).toBe(42)
    stub.handlers.delete('probe-channel')
  })

  it('whenReady 返回同一个 ready Promise（launch.cjs 的 createWindow 依赖它）', async () => {
    expect(stub.app.whenReady()).toBe(stub.ready)
    await stub.ready
  })

  it('getVersion 返回 package.json 的真实版本号', () => {
    expect(stub.app.getVersion()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('getPath 返回 userDataDir（受 OCEAN_USER_DATA 控制）', () => {
    expect(stub.app.getPath('userData')).toBe(stub.userDataDir)
  })

  it('BrowserWindow.webContents.send 转发为 pushEmitter 的 push 事件', () => {
    const seen: Array<{ channel: string; payload: unknown }> = []
    const fn = (e: { channel: string; payload: unknown }) => seen.push(e)
    stub.pushEmitter.on('push', fn)
    const win = new stub.BrowserWindow()
    win.webContents.send('agent-loop-event', { turn: 1 })
    win.webContents.send('instance-detail-delta', { status: 'running' })
    stub.pushEmitter.off('push', fn)
    expect(seen).toEqual([
      { channel: 'agent-loop-event', payload: { turn: 1 } },
      { channel: 'instance-detail-delta', payload: { status: 'running' } },
    ])
  })

  it('dialog.showOpenDialog 返回 Electron 同形结果对象', async () => {
    const r = await stub.dialog.showOpenDialog(null, { properties: ['openDirectory'] })
    expect(typeof r.canceled).toBe('boolean')
    expect(Array.isArray(r.filePaths)).toBe(true)
  })
})
