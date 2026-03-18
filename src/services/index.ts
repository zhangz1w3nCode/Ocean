// LLM 服务
export {
  generateWithLLM,
  parseAbilityContent,
  getSupportedProviders,
  testLLMConnection,
  type LLMResponse,
  type AbilityGenerateResult
} from './llmService'

// Agentic 服务
export {
  getAgenticLLMProvider,
  isAgenticAvailable,
  executeAgenticTask,
  getAgenticStatus,
  type ToolExecutionResult,
  type AgenticExecutionResult
} from './agenticService'

// Agent Loop 类型和工具函数（服务类已弃用，请直接使用 useAgentLoop Hook）
export {
  createAgentStep,
  updateToolCallStepWithResult,
  // @deprecated 服务类已弃用
  AgentLoopService,
  // @deprecated 单例模式已弃用
  getAgentLoopService,
  // @deprecated 已弃用
  resetAgentLoopService
} from './agentLoopService'

// 类型从 hook 文件重新导出
export type {
  AgentLoopExecuteConfig,
  AgentLoopExecuteResult,
  AgentLoopStep,
  AgentLoopStepType,
  AgentLoopStepStatus
} from '../hooks/useAgentLoop'
