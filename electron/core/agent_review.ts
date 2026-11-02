import * as fs from 'node:fs'
import * as path from 'node:path'

import { runAgent, type AgentSpec } from './agent_adapter'
import { LlmReviewResult, LlmReviewUnavailableError } from './llm_review'

// ---------------------------------------------------------------------------
// Agent 智能审核：把产物交给本地 agent（默认 pi）用工具实地核对，而不是把
// 引用文件全文拼进 prompt。LLM 审核把产物里提到的文件全部内联，产物引用越多越慢
// （实测 203 个文件、48 万字符、单节点 119s）；agent 可以自己按需读，成本可控。
// ---------------------------------------------------------------------------

export interface AgentReviewConfig {
  executable?: string
  model?: string
  timeoutMs?: number
}

const DEFAULT_AGENT_REVIEW_TIMEOUT_MS = 5 * 60 * 1000
const REVIEW_SESSION_DIR = path.join('.ocean', 'agent-review-sessions')

const REVIEW_INSTRUCTION = `你是 Ocean 工作流的「产物审核器」。你的唯一职责是判断下面这份产物是否真正完成了节点任务——不要改进它、不要重写它、不要推进工作流。

## 审核要求
1. 逐项核对节点任务声明的输出要求（清单 / 表格 / 数据 / 路径 / 结论等要素）是否在产物中真实出现。
2. 产物里引用的文件、命令输出、数字，必须实地核实：你可以读取文件、用 ls / find / grep / wc 等只读命令检查。
3. 严禁写文件、修改仓库、执行 git 写操作、调用 \`ocean\` 命令——你只是审核者。
4. 只做核对，不要给改进建议。

## 输出格式（必须严格遵守）
最后一行必须是单行 JSON：

VERDICT: {"pass": true, "reason": "一句话理由"}

pass 为 false 时，reason 必须指出具体缺失、编造或敷衍之处。`

function buildReviewPrompt(nodeTask: string, artifact: string): string {
  return [
    REVIEW_INSTRUCTION,
    '',
    '## 节点任务',
    nodeTask,
    '',
    '## 产物',
    artifact,
  ].join('\n')
}

function parseVerdict(text: string): LlmReviewResult | null {
  // 优先取最后一行 VERDICT: {...}
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^VERDICT\s*[:：]\s*(\{[\s\S]*\})\s*$/)
    if (m) {
      try {
        const obj = JSON.parse(m[1])
        if (typeof obj.pass === 'boolean') {
          return { pass: obj.pass, reason: typeof obj.reason === 'string' ? obj.reason : undefined }
        }
      } catch {
        // 继续尝试正则兜底
      }
    }
  }
  // 兜底：整段文本里出现的最后一个 "pass": true/false
  const all = [...text.matchAll(/"pass"\s*:\s*(true|false)/g)]
  if (all.length > 0) {
    const last = all[all.length - 1]
    const reasonMatch = text.match(/"reason"\s*:\s*"([^"]*)"/)
    return { pass: last[1] === 'true', reason: reasonMatch ? reasonMatch[1] : undefined }
  }
  return null
}

export interface AgentReviewContext {
  instanceId: string
  invoke: string
}

/**
 * 用本地 agent 审核产物。
 * 不可用（找不到可执行文件 / 进程失败 / 输出无法解析）时抛 LlmReviewUnavailableError，
 * 与 LLM 审核保持同样的严格语义：不写入产物、不推进状态。
 */
export async function checkArtifactWithAgent(
  root: string,
  config: AgentReviewConfig,
  nodeTask: string,
  artifact: string,
  ctx: AgentReviewContext,
): Promise<LlmReviewResult> {
  const spec: AgentSpec = {
    type: 'pi',
    executable: config.executable || undefined,
    model: config.model || undefined,
  }
  const sessionDir = path.join(root, REVIEW_SESSION_DIR)
  fs.mkdirSync(sessionDir, { recursive: true })

  const result = await runAgent({
    spec,
    prompt: buildReviewPrompt(nodeTask, artifact),
    // 审核用独立会话，不能污染被审核实例的执行会话
    sessionId: `review-${ctx.instanceId}-${ctx.invoke}`,
    sessionDir,
    cwd: root,
    timeoutMs: config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : DEFAULT_AGENT_REVIEW_TIMEOUT_MS,
  })

  if (!result.ok) {
    throw new LlmReviewUnavailableError(`Agent 审核执行失败：${result.error ?? '未知错误'}`)
  }

  const verdict = parseVerdict(result.text)
  if (!verdict) {
    throw new LlmReviewUnavailableError('Agent 审核未按约定输出 VERDICT 行，无法判定产物是否通过')
  }
  return verdict
}