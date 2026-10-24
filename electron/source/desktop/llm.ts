// 桌面端 LLM 工具链域 IPC 薄壳：把 IPC 参数转换为 core/llm 的调用，
// core 返回的 { success, ...data } 契约原样透传（前端零改动）。由 launch.cjs 设置模块
// 内联段迁移而来（零行为变更）：连接测试/单轮调用/可执行检查/CLI 安装/三个配置文件 CRUD。
//
// Electron API 边界：install-cli 的 oceanJsPath 计算依赖 app.isPackaged /
// process.resourcesPath（打包后 CLI 由 extraResources 复制到 Contents/Resources/cli/），
// 留在本壳层；其余逻辑（fetch / child_process / fs）全部在 core。
//
// catch 兜底与配置读取的失败字段（config:null）逐字段复刻原内联实现。
//
// 本模块由两个环境共同加载（真实 Electron 主进程 / 网页端 stub registry），同 app.ts。

import { ipcMain, app } from 'electron'
import * as path from 'node:path'
import {
  testLlmConnection,
  testExecutablePath,
  checkCliInstalled,
  installCli,
  callLlmApi,
  readLlmConfig,
  writeLlmConfig,
  readAgenticConfig,
  writeAgenticConfig,
  readLlmReviewConfig,
  writeLlmReviewConfig,
} from '../../core/common'
import type { LlmProviderConfig } from '../../core/common'
import type { DesktopCtx } from './common'

export function registerLlmHandlers(ctx: DesktopCtx): void {
  // 每次调用按当前项目根绑定（getProjectRoot 有开发默认兜底，与原 getXxxConfigPath 一致）
  const root = () => ctx.getProjectRoot()

  // 测试 LLM 连接
  ipcMain.handle('test-llm-connection', async (_, provider: LlmProviderConfig) => {
    return testLlmConnection(provider)
  })

  // 测试可执行文件路径
  ipcMain.handle('test-executable-path', async (_, filePath: string) => {
    return testExecutablePath(filePath)
  })

  // 检查 workflow-cli 是否已安装
  ipcMain.handle('check-cli-installed', async () => {
    return checkCliInstalled()
  })

  // 安装 ocean-cli wrapper 脚本（oceanJsPath 按打包态分支计算，资源路径依赖留壳层；
  // 开发态产物在 dist/source/desktop/，上两级即 dist/bin）
  ipcMain.handle('install-cli', async () => {
    const oceanJsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'cli', 'bin', 'ocean.js')
      : path.join(__dirname, '..', '..', 'bin', 'ocean.js')
    return installCli(oceanJsPath, ctx.getRawProjectPath?.() ?? null)
  })

  // 调用 LLM API（单轮，使用原生 fetch）
  ipcMain.handle('call-llm-api', async (_, { provider, prompt, model }: { provider: LlmProviderConfig; prompt: string; model?: string }) => {
    return callLlmApi(provider, prompt, model)
  })

  // ===== 配置文件 CRUD（{root}/.ocean/ 下三个配置） =====

  ipcMain.handle('save-llm-config', async (_, config: unknown) => {
    try {
      return writeLlmConfig(root(), config)
    } catch (error: any) {
      console.error('❌ 保存 LLM 配置失败:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('load-llm-config', async () => {
    try {
      return readLlmConfig(root())
    } catch (error: any) {
      console.error('❌ 加载 LLM 配置失败:', error)
      return { success: false, error: error.message || String(error), config: null }
    }
  })

  ipcMain.handle('save-agentic-config', async (_, config: unknown) => {
    try {
      return writeAgenticConfig(root(), config)
    } catch (error: any) {
      console.error('❌ 保存 Agentic 配置失败:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('load-agentic-config', async () => {
    try {
      return readAgenticConfig(root())
    } catch (error: any) {
      console.error('❌ 加载 Agentic 配置失败:', error)
      return { success: false, error: error.message || String(error), config: null }
    }
  })

  ipcMain.handle('save-llm-review-config', async (_, config: unknown) => {
    try {
      return writeLlmReviewConfig(root(), config)
    } catch (error: any) {
      console.error('❌ 保存 LLM 智能审核配置失败:', error)
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('load-llm-review-config', async () => {
    try {
      return readLlmReviewConfig(root())
    } catch (error: any) {
      console.error('❌ 加载 LLM 智能审核配置失败:', error)
      return { success: false, error: error.message || String(error), config: null }
    }
  })
}
