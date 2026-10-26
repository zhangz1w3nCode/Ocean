// 桌面端节点域 IPC 薄壳：把 IPC 参数转换为 core/node 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 节点文件/局部节点内联段迁移而来（零行为变更）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}

import { ipcMain } from 'electron'
import {
  saveNodeFile,
  readNodeFile,
  deleteNodeFile,
  listNodeFiles,
  saveLocalNode,
  readLocalNode,
  deleteLocalNode,
  listLocalNodes,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerNodeHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  // ===== 全局节点（{root}/.nodes） =====

  // 保存节点文件（content 为前端组装的完整 Markdown）
  ipcMain.handle('save-node-file', (_, name: string, content: string) => {
    try {
      return saveNodeFile(root(), name, content)
    } catch (error) {
      console.error('保存节点文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载单个节点文件内容
  ipcMain.handle('load-node-file', (_, name: string) => {
    try {
      return readNodeFile(root(), name)
    } catch (error) {
      console.error('加载节点文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 删除单个节点文件
  ipcMain.handle('delete-node-file', (_, name: string) => {
    try {
      return deleteNodeFile(root(), name)
    } catch (error) {
      console.error('删除节点文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有节点文件列表（带 .md 后缀）
  ipcMain.handle('load-all-node-files', () => {
    try {
      return listNodeFiles(root())
    } catch (error) {
      console.error('加载节点文件列表失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })

  // ===== 局部节点（{root}/.workflows/{wf}/nodes） =====

  // 保存局部节点文件（ensureDir 两级）
  ipcMain.handle('save-local-node', (_, workflowName: string, nodeName: string, content: string) => {
    try {
      return saveLocalNode(root(), workflowName, nodeName, content)
    } catch (error) {
      console.error('保存局部节点文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载局部节点文件
  ipcMain.handle('load-local-node', (_, workflowName: string, nodeName: string) => {
    try {
      return readLocalNode(root(), workflowName, nodeName)
    } catch (error) {
      console.error('加载局部节点文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 加载所有局部节点文件列表
  ipcMain.handle('load-all-local-nodes', (_, workflowName: string) => {
    try {
      return listLocalNodes(root(), workflowName)
    } catch (error) {
      console.error('加载局部节点文件列表失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })

  // 删除局部节点文件
  ipcMain.handle('delete-local-node', (_, workflowName: string, nodeName: string) => {
    try {
      return deleteLocalNode(root(), workflowName, nodeName)
    } catch (error) {
      console.error('删除局部节点文件失败:', error)
      return { success: false, error: String(error) }
    }
  })
}
