// 桌面端知识域 IPC 薄壳：把 IPC 参数转换为 core/knowledge 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 知识库内联段迁移而来（零行为变更）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}
//
// 与 launch.cjs 原内联实现的差异（均已在提交中声明）：
//   - 模板 handler 的成功 console.log 调试行不再输出（与 skill 域一致的既定取舍）
//   - graph-config 的「未设置项目」检查改经 ctx.getRawProjectPath()（契约逐字一致）

import { ipcMain } from 'electron'
import {
  saveKnowledgeFile,
  readKnowledgeFile,
  deleteKnowledgeFile,
  listKnowledgeFiles,
  listKnowledgeFolders,
  getKnowledgeGitStatus,
  initKnowledgeGit,
  getKnowledgeGitLog,
  showKnowledgeGitRevision,
  commitKnowledgeGit,
  rollbackKnowledgeGit,
  readKnowledgeGitConfig,
  writeKnowledgeGitConfig,
  getKnowledgeBaseline,
  readKnowledgeGraphConfig,
  writeKnowledgeGraphConfig,
  saveKnowledgeTemplateFile,
  readKnowledgeTemplateFile,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerKnowledgeHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  // ===== 文件 CRUD =====

  // 保存知识文件（upsert，name 支持子目录，自动建中间目录）
  ipcMain.handle('save-knowledge-file', (_, name: string, content: string) => {
    try {
      return saveKnowledgeFile(root(), name, content)
    } catch (error) {
      console.error('保存知识库文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载单个知识文件内容（支持子目录路径，如 "backend/api"）
  ipcMain.handle('load-knowledge-file', (_, name: string) => {
    try {
      return readKnowledgeFile(root(), name)
    } catch (error) {
      console.error('加载知识库文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 删除单个知识文件（支持子目录路径）
  ipcMain.handle('delete-knowledge-file', (_, name: string) => {
    try {
      return deleteKnowledgeFile(root(), name)
    } catch (error) {
      console.error('删除知识库文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有知识文件列表（递归子目录，相对路径）
  ipcMain.handle('load-all-knowledge-files', () => {
    try {
      return listKnowledgeFiles(root())
    } catch (error) {
      console.error('加载知识库文件列表失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })

  // 获取知识库目录树
  ipcMain.handle('list-knowledge-folders', () => {
    try {
      return listKnowledgeFolders(root())
    } catch (error) {
      console.error('获取知识库文件夹列表失败:', error)
      return { success: false, error: String(error), folders: [] }
    }
  })

  // ===== 独立 git 仓库支持（.knowledges 固定分支 ocean-knowledge） =====

  // 查询知识库 git 托管状态
  ipcMain.handle('knowledge-git-status', () => {
    try {
      return getKnowledgeGitStatus(root())
    } catch (error) {
      console.error('查询知识库 git 托管状态失败:', error)
      return { success: false, error: String(error), managed: false }
    }
  })

  // 开启 git 托管（init + 基线提交）
  ipcMain.handle('knowledge-git-init', () => {
    try {
      return initKnowledgeGit(root())
    } catch (error) {
      console.error('开启知识库 git 托管失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 知识文件提交历史
  ipcMain.handle('knowledge-git-log', (_, name: string) => {
    try {
      return getKnowledgeGitLog(root(), name)
    } catch (error) {
      console.error('读取知识文件 git 历史失败:', error)
      return { success: false, error: String(error), commits: [] }
    }
  })

  // 读取知识文件在指定历史版本中的原文
  ipcMain.handle('knowledge-git-show', (_, name: string, rev: string) => {
    try {
      return showKnowledgeGitRevision(root(), name, rev)
    } catch (error) {
      console.error('读取知识文件 git 版本内容失败:', error)
      return { success: false, error: String(error), content: null }
    }
  })

  // 提交知识文件（审核通过）
  ipcMain.handle('knowledge-git-commit', (_, name: string, message: string) => {
    try {
      return commitKnowledgeGit(root(), name, message)
    } catch (error) {
      console.error('提交知识文件到 git 失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 回滚知识文件到基线（审核不通过）；无基线时删除
  ipcMain.handle('knowledge-git-rollback', (_, name: string) => {
    try {
      return rollbackKnowledgeGit(root(), name)
    } catch (error) {
      console.error('回滚知识文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // ===== 项目级配置 =====

  // 知识库 git 配置（.ocean/knowledge-git.json）
  ipcMain.handle('load-knowledge-git-config', () => {
    try {
      return readKnowledgeGitConfig(root())
    } catch (error) {
      console.error('读取知识库 git 配置失败:', error)
      return { success: false, error: String(error), config: null }
    }
  })

  ipcMain.handle('save-knowledge-git-config', (_, config: unknown) => {
    try {
      return writeKnowledgeGitConfig(root(), config)
    } catch (error) {
      console.error('保存知识库 git 配置失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 知识文件基线内容（审核页 diff 用）
  ipcMain.handle('get-knowledge-baseline', (_, name: string) => {
    try {
      return getKnowledgeBaseline(root(), name)
    } catch (error) {
      console.error('读取知识文件 git 基线失败:', error)
      return { success: false, error: String(error), content: null }
    }
  })

  // 知识图谱配置（.ocean/knowledge-graph-config.json）
  // 未设置项目时复刻旧契约：{success:false, error:'未设置项目路径', config:null}
  ipcMain.handle('load-knowledge-graph-config', () => {
    try {
      if (ctx.getRawProjectPath && ctx.getRawProjectPath() == null) {
        return { success: false, error: '未设置项目路径', config: null }
      }
      return readKnowledgeGraphConfig(root())
    } catch (error) {
      console.error('加载知识图谱配置失败:', error)
      return { success: false, error: String(error), config: null }
    }
  })

  // 保存知识图谱配置（未设置项目同上）
  ipcMain.handle('save-knowledge-graph-config', (_, config: unknown) => {
    try {
      if (ctx.getRawProjectPath && ctx.getRawProjectPath() == null) {
        return { success: false, error: '未设置项目路径' }
      }
      return writeKnowledgeGraphConfig(root(), config)
    } catch (error) {
      console.error('保存知识图谱配置失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // ===== 知识模板文件（.ocean/template/knowledge/{type}.json，不随 assetRoot） =====

  ipcMain.handle('save-knowledge-template-file', (_, templateType: string, content: string) => {
    try {
      return saveKnowledgeTemplateFile(root(), templateType, content)
    } catch (error) {
      console.error('保存知识模板文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 不存在返回 { success:false, content:null }（missing = 失败语义）
  ipcMain.handle('load-knowledge-template-file', (_, templateType: string) => {
    try {
      return readKnowledgeTemplateFile(root(), templateType)
    } catch (error) {
      console.error('加载知识模板文件失败:', error)
      return { success: false, error: (error as Error).message, content: null }
    }
  })
}
