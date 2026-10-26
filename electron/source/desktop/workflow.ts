// 桌面端工作流域 IPC 薄壳：把 IPC 参数转换为 core/workflow 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 工作流文件/实例内联段迁移而来（零行为变更）。
//
// 实例订阅推送（SSE）：subscribe-instance-detail 的初始快照走正常返回值；
// watcher 增量经 ctx.sendToRenderer('instance-detail-delta', delta) 推送——
// 真实 Electron 下即 mainWindow.webContents.send，stub（网页端）环境经 pushEmitter
// → http.cjs SSE（迁移前基线探针已实证该链路可达）。watcher 为模块级单例：
// 任何 subscribe（含初始快照失败的）先停旧 watcher——与原 launch.cjs stopInstanceWatcher 语义一致。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}

import { ipcMain } from 'electron'
import {
  saveWorkflowFile,
  readWorkflowFile,
  deleteWorkflowFile,
  listWorkflowFiles,
  createWorkflowFolder,
  readWorkflowMdFile,
  saveWorkflowMdFile,
  readWorkflowFlowJson,
  saveWorkflowFlowJson,
  listWorkflowFolders,
  deleteWorkflowFolder,
  renameWorkflowFolder,
  listWorkflowInstances,
  readInstanceFile,
  readInstanceDetail,
  watchInstanceDetail,
} from '../../core/common'
import type { DesktopCtx } from './common'
import type { InstanceWatcherHandle } from '../../core/common'

export function registerWorkflowHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  // ===== 工作流文件（.workflows 根的 {name}.md，旧版扁平格式） =====

  // 保存工作流文件（content 为前端组装的完整 Markdown）
  ipcMain.handle('save-workflow-file', (_, name: string, content: string) => {
    try {
      return saveWorkflowFile(root(), name, content)
    } catch (error) {
      console.error('保存工作流文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载单个工作流文件内容
  ipcMain.handle('load-workflow-file', (_, name: string) => {
    try {
      return readWorkflowFile(root(), name)
    } catch (error) {
      console.error('加载工作流文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 删除单个工作流文件
  ipcMain.handle('delete-workflow-file', (_, name: string) => {
    try {
      return deleteWorkflowFile(root(), name)
    } catch (error) {
      console.error('删除工作流文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有工作流文件列表（返回所有 .md 文件名）
  ipcMain.handle('load-all-workflow-files', () => {
    try {
      return listWorkflowFiles(root())
    } catch (error) {
      console.error('加载工作流文件列表失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })

  // ===== 工作流文件夹（{name}/ + {name}/meta-data/） =====

  // 创建工作流文件夹
  ipcMain.handle('create-workflow-folder', (_, name: string) => {
    try {
      return createWorkflowFolder(root(), name)
    } catch (error) {
      console.error('创建工作流文件夹失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载工作流文件夹的WORKFLOW.md内容
  ipcMain.handle('load-workflow-md', (_, name: string) => {
    try {
      return readWorkflowMdFile(root(), name)
    } catch (error) {
      console.error('加载WORKFLOW.md失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 保存工作流文件夹的WORKFLOW.md内容
  ipcMain.handle('save-workflow-md', (_, name: string, content: string) => {
    try {
      return saveWorkflowMdFile(root(), name, content)
    } catch (error) {
      console.error('保存WORKFLOW.md失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载工作流的flow.json
  ipcMain.handle('load-workflow-flow-json', (_, name: string) => {
    try {
      return readWorkflowFlowJson(root(), name)
    } catch (error) {
      console.error('加载flow.json失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 保存工作流的flow.json
  ipcMain.handle('save-workflow-flow-json', (_, name: string, content: string) => {
    try {
      return saveWorkflowFlowJson(root(), name, content)
    } catch (error) {
      console.error('保存flow.json失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有工作流文件夹列表
  ipcMain.handle('load-all-workflow-folders', () => {
    try {
      return listWorkflowFolders(root())
    } catch (error) {
      console.error('加载工作流文件夹列表失败:', error)
      return { success: false, error: String(error), folders: [] }
    }
  })

  // 删除工作流文件夹
  ipcMain.handle('delete-workflow-folder', (_, name: string) => {
    try {
      return deleteWorkflowFolder(root(), name)
    } catch (error) {
      console.error('删除工作流文件夹失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 重命名工作流文件夹
  ipcMain.handle('rename-workflow-folder', (_, oldName: string, newName: string) => {
    try {
      return renameWorkflowFolder(root(), oldName, newName)
    } catch (error) {
      console.error('重命名工作流文件夹失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // ===== 工作流实例 =====

  // 列出所有工作流实例（扫描 .workflows/*/instance/*/，解析 status.json frontmatter）
  ipcMain.handle('list-workflow-instances', () => {
    try {
      return listWorkflowInstances(root())
    } catch (error) {
      console.error('列出工作流实例失败:', error)
      return { success: false, error: String(error), instances: [] }
    }
  })

  // 读取实例文件内容
  ipcMain.handle('read-instance-file', (_, workflowName: string, instanceId: string, fileName: string) => {
    try {
      return readInstanceFile(root(), workflowName, instanceId, fileName)
    } catch (error) {
      console.error('读取实例文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 读取实例详情（一次性；core 内部 catch 契约与原 buildInstanceDetail 一致）
  ipcMain.handle('read-instance-detail', (_, workflowName: string, instanceId: string) => {
    return readInstanceDetail(root(), workflowName, instanceId)
  })

  // ===== 实例详情实时推送（fs.watch 增量 → sendToRenderer('instance-detail-delta')） =====
  // watcher 单例：任何 subscribe（含初始快照失败的）先停旧 watcher（与原 stopInstanceWatcher 无条件先停一致）；
  // 初始快照失败直接返回失败且不建新 watcher。
  let instanceWatcher: InstanceWatcherHandle | null = null
  const stopInstanceWatcher = () => {
    if (!instanceWatcher) return
    instanceWatcher.stop()
    instanceWatcher = null
  }

  ipcMain.handle('subscribe-instance-detail', (_event, workflowName: string, instanceId: string) => {
    stopInstanceWatcher()
    const initial = readInstanceDetail(root(), workflowName, instanceId)
    if (initial.success !== true) return initial
    instanceWatcher = watchInstanceDetail(root(), workflowName, instanceId, (delta) => {
      ctx.sendToRenderer?.('instance-detail-delta', delta)
    })
    return initial
  })

  ipcMain.handle('unsubscribe-instance-detail', () => {
    stopInstanceWatcher()
    return { success: true }
  })
}
