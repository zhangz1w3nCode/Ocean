// Harness 域 IPC 薄壳（阶段一：main 分支 .cjs 形态）
// 签名与 api-core-unification 迁移分支的 registerXxxHandlers(ctx) 同构；
// 阶段二平移为 electron/source/desktop/harness.ts 时仅换 require 路径与 import 形态。
'use strict'

const electron = require('electron')
const { ipcMain, app } = electron
const harness = require('./sessionManager.cjs')

// 桩（electron-stub.cjs）会标记 app.isOceanStub；网页端子进程内禁用（harness 为桌面端专属，
// 禁止从网页端宿主进程 spawn pi）
const IS_STUB = !!(electron.app && electron.app.isOceanStub)

function registerHarnessHandlers(ctx) {
  if (IS_STUB) return
  const projectRoot = () => (ctx && typeof ctx.getProjectRoot === 'function' ? ctx.getProjectRoot() : null)

  // 事件转发：core EventEmitter -> renderer
  harness.onHarnessEvent((payload) => {
    if (ctx && typeof ctx.sendToRenderer === 'function') {
      ctx.sendToRenderer('harness-session-event', payload)
    }
  })

  // 退出清理：不留 pi 孤儿进程（stdin EOF 自退为崩溃兜底，此为主清理路径）
  app.on('will-quit', () => {
    try {
      harness.stopAllSessions()
    } catch (error) {
      console.error('[harness] 退出清理失败:', error)
    }
  })

  const wrap = (label, fn) => async (...args) => {
    try {
      return await fn(...args)
    } catch (error) {
      console.error(`[harness] ${label} 失败:`, error)
      return { success: false, error: String(error) }
    }
  }

  ipcMain.handle('harness-detect', wrap('检测 pi', () => harness.detectAgent()))

  ipcMain.handle(
    'harness-list-worktrees',
    wrap('列出 worktree', () => harness.listWorktrees(projectRoot()))
  )

  ipcMain.handle(
    'harness-list-branches',
    wrap('列出分支', () => harness.listBranches(projectRoot()))
  )

  ipcMain.handle(
    'harness-worktree-create',
    wrap('新建 worktree', (_e, name, branch, baseBranch) => harness.createWorktree(projectRoot(), name, branch, baseBranch))
  )

  ipcMain.handle(
    'harness-list-sessions',
    wrap('列出会话', (_e, worktreePath) => harness.listSessions(worktreePath))
  )

  ipcMain.handle(
    'harness-session-start',
    wrap('新建会话', (_e, worktreePath) => harness.startSession(worktreePath))
  )

  ipcMain.handle(
    'harness-session-open',
    wrap('打开会话', (_e, sessionFile) => harness.openSession(sessionFile))
  )

  ipcMain.handle(
    'harness-session-send',
    wrap('发送消息', (_e, sessionId, command) => harness.sendCommand(sessionId, command))
  )

  ipcMain.handle(
    'harness-session-command',
    wrap('发送命令', (_e, sessionId, command) => harness.sendCommand(sessionId, command))
  )

  ipcMain.handle(
    'harness-session-abort',
    wrap('中止回合', (_e, sessionId) => harness.sendCommand(sessionId, { type: 'abort' }))
  )

  ipcMain.handle(
    'harness-session-stop',
    wrap('停止会话', (_e, sessionId) => harness.stopSession(sessionId))
  )

  ipcMain.handle(
    'harness-session-delete',
    wrap('删除会话文件', (_e, sessionFile) => harness.deleteSessionFile(sessionFile))
  )

  ipcMain.handle(
    'harness-session-extension-response',
    wrap('回复扩展 UI 请求', (_e, sessionId, response) =>
      harness.sendCommand(sessionId, Object.assign({ type: 'extension_ui_response' }, response)))
  )

  ipcMain.handle(
    'harness-session-info',
    wrap('查询会话状态', (_e, sessionId) => harness.getSessionInfo(sessionId))
  )

  ipcMain.handle(
    'harness-session-list-active',
    wrap('列出活跃会话', () => harness.listActiveSessions())
  )
}

module.exports = { registerHarnessHandlers }
