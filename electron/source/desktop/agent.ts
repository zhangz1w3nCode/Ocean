// 桌面端智能体文件 IPC 薄壳：把 IPC 参数转换为 core/agent 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 智能体文件内联段迁移而来（零行为变更）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}

import { ipcMain } from 'electron'
import {
  saveAgentFile,
  readAgentFile,
  deleteAgentFile,
  listAgentFiles,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerAgentHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  // 保存智能体文件（Markdown格式，以名称命名）
  ipcMain.handle('save-agent-file', (_, name: string, content: string) => {
    try {
      return saveAgentFile(root(), name, content)
    } catch (error) {
      console.error('保存智能体文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载单个智能体文件内容
  ipcMain.handle('load-agent-file', (_, name: string) => {
    try {
      return readAgentFile(root(), name)
    } catch (error) {
      console.error('加载智能体文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 删除单个智能体文件
  ipcMain.handle('delete-agent-file', (_, name: string) => {
    try {
      return deleteAgentFile(root(), name)
    } catch (error) {
      console.error('删除智能体文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有智能体文件列表（返回所有 .md 文件名）
  ipcMain.handle('load-all-agent-files', () => {
    try {
      return listAgentFiles(root())
    } catch (error) {
      console.error('加载智能体文件列表失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })
}
