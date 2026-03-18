/**
 * Agent Loop 服务 - 类型和工具函数
 *
 * 注意：此文件不再包含服务类，Agent Loop 功能已内聚到 useAgentLoop Hook 中
 * 保留此文件是为了向后兼容类型导入
 */

// 类型定义直接从 hook 文件重新导出，保持统一
export type {
  AgentLoopExecuteConfig,
  AgentLoopExecuteResult,
  AgentLoopStep,
  AgentLoopStepType,
  AgentLoopStepStatus
} from '../hooks/useAgentLoop'

// 创建步骤的工具函数（用于非 React 场景）
import type { AgentLoopStep, AgentLoopStepType, AgentLoopStepStatus } from '../hooks/useAgentLoop'

export function createAgentStep(
  type: AgentLoopStepType,
  title: string,
  status: AgentLoopStepStatus = 'pending',
  content?: string,
  details?: AgentLoopStep['details']
): AgentLoopStep {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type,
    title,
    status,
    content,
    details,
    timestamp: new Date()
  }
}

// 根据工具调用步骤创建结果步骤
export function updateToolCallStepWithResult(
  step: AgentLoopStep,
  output: string,
  success: boolean
): AgentLoopStep {
  return {
    ...step,
    status: success ? 'success' : 'error',
    content: output.substring(0, 500) || '',
    details: {
      ...step.details,
      response: output.substring(0, 2000)
    }
  }
}

/**
 * @deprecated 不再使用服务类，请直接使用 useAgentLoop Hook
 * 保留此导出以兼容可能存在的旧代码
 */
export class AgentLoopService {
  constructor() {
    console.warn('[AgentLoopService] 已弃用，请直接使用 useAgentLoop Hook')
    throw new Error('AgentLoopService 已弃用，请直接使用 useAgentLoop Hook')
  }
}

/**
 * @deprecated 不再使用单例模式
 */
export function getAgentLoopService(): never {
  console.warn('[getAgentLoopService] 已弃用，请直接使用 useAgentLoop Hook')
  throw new Error('getAgentLoopService 已弃用，请直接使用 useAgentLoop Hook')
}

/**
 * @deprecated 不再使用
 */
export function resetAgentLoopService(): void {
  // 空实现，为了兼容
}
