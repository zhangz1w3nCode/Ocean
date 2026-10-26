// 桌面端 agentic 执行域 IPC 薄壳：把 IPC 参数转换为 core/agentic 的调用。
// 由 launch.cjs agentic 内联段迁移而来（零行为变更）。
//
// 依赖注入边界（与六域纯透传壳的差异，均为基础设施特有）：
//   - 工具工厂：ctx.getAgentTools()（launch.cjs 的 tools/*.cjs require 桥）
//   - AbortController 单例留在本壳层（run-agent-loop 与 abort-agent-loop 共享，
//     经 hooks.signal 注入 core；core 循环内检查 aborted → 抛「用户中止」）
//   - 事件推送：core 经 hooks.onEvent 发裸事件，本壳附加 timestamp 后经
//     ctx.sendToRenderer('agent-loop-event') 推出（复刻原 sendAgentLoopEvent 的
//     payload 形态与 isDestroyed 守卫——守卫在 launch.cjs 的 sendToRenderer 实现）
//
// 本模块由两个环境共同加载（真实 Electron 主进程 / 网页端 stub registry）：
// stub 环境下 webContents.send → pushEmitter → http.cjs SSE（与原内联同一推送路径）。

import { ipcMain } from 'electron'
import { executeAgenticTool, runAgentLoop } from '../../core/common'
import type { AgentLoopConfig, AgenticToolParams, AgenticToolConfigInput } from '../../core/common'
import type { DesktopCtx } from './common'

export function registerAgenticHandlers(ctx: DesktopCtx): void {
  // Agent Loop 中止控制器单例（原 launch.cjs agentLoopAbortController）
  let agentLoopAbortController: AbortController | null = null

  // 每次调用按当前项目根绑定（execute-agentic-tool 的默认 cwd）
  const root = () => ctx.getProjectRoot()

  const getTools = async () => {
    const tools = await ctx.getAgentTools?.()
    if (!tools) throw new Error('agentic 工具工厂不可用')
    return tools
  }

  // 发送 Agent Loop 事件到渲染进程（附加 timestamp，与原 sendAgentLoopEvent 一致）
  const sendAgentLoopEvent = (event: { type: string; data: unknown }) => {
    ctx.sendToRenderer?.('agent-loop-event', {
      ...event,
      timestamp: new Date().toISOString(),
    })
  }

  ipcMain.handle('execute-agentic-tool', async (_, params: AgenticToolParams) => {
    try {
      const tools = await getTools()
      return executeAgenticTool(tools, params, root())
    } catch (error: any) {
      // getTools 的桥异常（原实现无此路径：工具 require 在主进程顶层完成），
      // 保持失败契约兜底而非让 IPC 层拿到未捕获异常
      console.error(`❌ [${params?.type}] 工具执行失败:`, error)
      return { success: false, error: error.message || String(error) }
    }
  })

  ipcMain.handle('run-agent-loop', async (_, config: AgentLoopConfig) => {
    agentLoopAbortController = new AbortController()
    const startTime = Date.now()
    try {
      const tools = await getTools()
      return await runAgentLoop(tools, config, {
        onEvent: sendAgentLoopEvent,
        signal: agentLoopAbortController.signal,
      })
    } catch (error: any) {
      // 工具工厂桥异常（正常运行不触发：tools/*.cjs 完好）；返回失败契约，不让 IPC 层收到未捕获异常。
      // 注：原实现工具加载在循环内惰性执行，失败会转为单次工具失败结果反馈给 LLM——
      // 此差异（提前解析）已在提交 body 声明。
      console.error('\n[Agent Loop] 执行失败:', error)
      return { success: false, error: error.message || String(error), totalTurns: 0, totalToolCalls: 0, duration: Date.now() - startTime }
    } finally {
      agentLoopAbortController = null
    }
  })

  ipcMain.handle('abort-agent-loop', async () => {
    if (agentLoopAbortController) {
      agentLoopAbortController.abort()
      return { success: true, message: '已发送中止信号' }
    }
    return { success: false, message: '没有正在执行的 Agent Loop' }
  })
}
