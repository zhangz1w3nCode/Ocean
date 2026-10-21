// 桌面端资源文件 IPC 薄壳：把 IPC 参数转换为 core/resource 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 资源文件内联段迁移而来（零行为变更）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}

import { ipcMain } from 'electron'
import {
  saveResourceFile,
  readResourceFile,
  deleteResourceFile,
  listResourceFiles,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerResourceHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  // 保存资源文件（Markdown格式，以名称命名）
  ipcMain.handle('save-resource-file', (_, name: string, content: string) => {
    try {
      return saveResourceFile(root(), name, content)
    } catch (error) {
      console.error('保存资源文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载单个资源文件内容
  ipcMain.handle('load-resource-file', (_, name: string) => {
    try {
      return readResourceFile(root(), name)
    } catch (error) {
      console.error('加载资源文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 删除单个资源文件
  ipcMain.handle('delete-resource-file', (_, name: string) => {
    try {
      return deleteResourceFile(root(), name)
    } catch (error) {
      console.error('删除资源文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有资源文件列表（返回所有 .md 文件名）
  ipcMain.handle('load-all-resource-files', () => {
    try {
      return listResourceFiles(root())
    } catch (error) {
      console.error('加载资源文件列表失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })
}
