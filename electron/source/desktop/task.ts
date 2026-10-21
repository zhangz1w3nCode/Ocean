// 桌面端任务 IPC 薄壳：把 IPC 参数转换为 core/task 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 尾段迁移而来（零行为变更）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}

import { ipcMain } from 'electron'
import {
  listTasks,
  readTaskDetail,
  createTask,
  updateTask,
  saveTaskContext,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerTaskHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  ipcMain.handle('list-tasks', () => {
    try {
      return listTasks(root())
    } catch (error) {
      console.error('列出任务失败:', error)
      return { success: false, error: String(error), tasks: [] }
    }
  })

  ipcMain.handle('read-task-detail', (_, taskName: string) => {
    try {
      return readTaskDetail(root(), taskName)
    } catch (error) {
      console.error('读取任务详情失败:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('create-task', (_, payload: any) => {
    try {
      return createTask(root(), payload)
    } catch (error) {
      console.error('创建任务失败:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('update-task', (_, payload: any) => {
    try {
      return updateTask(root(), payload)
    } catch (error) {
      console.error('更新任务失败:', error)
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('save-task-context', (_, payload: any) => {
    try {
      return saveTaskContext(root(), payload)
    } catch (error) {
      console.error('保存任务上下文失败:', error)
      return { success: false, error: String(error) }
    }
  })
}
