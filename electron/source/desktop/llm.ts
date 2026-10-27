// 桌面端 LLM 工具链域 IPC 薄壳：把 IPC 参数转换为 core/llm 的调用，
// core 返回的 { success, ...data } 契约原样透传（前端零改动）。由 launch.cjs 设置模块
// 内联段迁移而来（零行为变更）：连接测试/单轮调用/三个配置文件 CRUD。
// CLI 安装 / 可执行文件检查已拆至 setting 域（desktop/setting.ts）。
//
// catch 兜底与配置读取的失败字段（config:null）逐字段复刻原内联实现。
//
// 本模块由两个环境共同加载（真实 Electron 主进程 / 网页端 stub registry），同 app.ts。

import { ipcMain } from 'electron'
import {
  testLlmConnection,
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
