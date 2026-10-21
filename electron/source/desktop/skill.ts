// 桌面端技能域 IPC 薄壳：把 IPC 参数转换为 core/skill 的调用（绑定当前项目根），
// core 返回的 { success, ...data } 契约原样透传给渲染进程（前端零改动）；
// 未预期的系统异常按既有兜底格式包装。由 launch.cjs 技能文件/技能模板内联段迁移而来（零行为变更）。
//
// 本模块由两个环境共同加载：
//   - 真实 Electron 主进程：launch.cjs require 编译产物后调用 register
//   - 网页端 stub 环境：registry.cjs 加载 launch.cjs 时，ipcMain 被 stub 拦截，
//     handler 落进同一个 handlers Map，经 http.cjs 暴露为 POST /api/ipc/{channel}
//
// 与 launch.cjs 原内联实现的唯一差异：技能模板 handler 的成功 console.log 调试行不再输出
// （IPC 契约与落盘行为不变；主进程 stdout 日志不属于前端可观察契约）。

import { ipcMain } from 'electron'
import {
  createSkillDirectory,
  saveSkillFile,
  readSkillFile,
  deleteSkillDirectory,
  listSkillDirectories,
  saveSkillResource,
  readSkillResource,
  deleteSkillResource,
  listSkillResourceFiles,
  saveSkillTemplateFile,
  readSkillTemplateFile,
} from '../../core/common'
import type { SkillDirectoryInput } from '../../core/common'
import type { DesktopCtx } from './common'

export function registerSkillHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定
  const root = () => ctx.getProjectRoot()

  // 创建技能目录结构（含 SKILL.md、子目录与资源文件）。
  // input 不做 null 容错：旧行为 null 输入 → TypeError 被 catch 兜底拒绝（与迁移前逐字一致，
  // 对不可信输入拒绝优于容错建空目录）
  ipcMain.handle('create-skill-directory', (_, name: string, input: SkillDirectoryInput) => {
    try {
      return createSkillDirectory(root(), name, input)
    } catch (error) {
      console.error('创建技能目录失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 保存技能 SKILL.md 文件（upsert，content 为前端组装的完整 Markdown）
  ipcMain.handle('save-skill-file', (_, name: string, content: string) => {
    try {
      return saveSkillFile(root(), name, content)
    } catch (error) {
      console.error('保存技能文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载技能 SKILL.md 文件（不存在返回 content:null）
  ipcMain.handle('load-skill-file', (_, name: string) => {
    try {
      return readSkillFile(root(), name)
    } catch (error) {
      console.error('加载技能文件失败:', error)
      return { success: false, error: String(error), content: null, mtime: null }
    }
  })

  // 删除技能目录
  ipcMain.handle('delete-skill-directory', (_, name: string) => {
    try {
      return deleteSkillDirectory(root(), name)
    } catch (error) {
      console.error('删除技能目录失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载所有技能目录列表
  ipcMain.handle('load-all-skill-directories', () => {
    try {
      return listSkillDirectories(root())
    } catch (error) {
      console.error('加载技能目录列表失败:', error)
      return { success: false, error: String(error), directories: [] }
    }
  })

  // 保存技能资源文件（ensureDir 副作用：建 skillDir+subDir 两层）
  ipcMain.handle('save-skill-resource', (_, skillName: string, resourceType: string, fileName: string, content: string) => {
    try {
      return saveSkillResource(root(), skillName, resourceType, fileName, content)
    } catch (error) {
      console.error('保存技能资源文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 加载技能资源文件
  ipcMain.handle('load-skill-resource', (_, skillName: string, resourceType: string, fileName: string) => {
    try {
      return readSkillResource(root(), skillName, resourceType, fileName)
    } catch (error) {
      console.error('加载技能资源文件失败:', error)
      return { success: false, error: String(error), content: null }
    }
  })

  // 删除技能资源文件
  ipcMain.handle('delete-skill-resource', (_, skillName: string, resourceType: string, fileName: string) => {
    try {
      return deleteSkillResource(root(), skillName, resourceType, fileName)
    } catch (error) {
      console.error('删除技能资源文件失败:', error)
      return { success: false, error: String(error) }
    }
  })

  // 列出技能资源文件
  ipcMain.handle('list-skill-resources', (_, skillName: string, resourceType: string) => {
    try {
      return listSkillResourceFiles(root(), skillName, resourceType)
    } catch (error) {
      console.error('列出技能资源文件失败:', error)
      return { success: false, error: String(error), files: [] }
    }
  })

  // 保存技能模板文件（.ocean/template/skill/{type}.json，不随 assetRoot）
  ipcMain.handle('save-skill-template-file', (_, templateType: string, content: string) => {
    try {
      return saveSkillTemplateFile(root(), templateType, content)
    } catch (error) {
      console.error('保存技能模板文件失败:', error)
      return { success: false, error: (error as Error).message }
    }
  })

  // 加载技能模板文件（不存在返回 { success:false, content:null }）
  ipcMain.handle('load-skill-template-file', (_, templateType: string) => {
    try {
      return readSkillTemplateFile(root(), templateType)
    } catch (error) {
      console.error('加载技能模板文件失败:', error)
      return { success: false, error: (error as Error).message, content: null }
    }
  })
}
