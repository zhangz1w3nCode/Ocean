// Agentic 执行域统一实现 —— 桌面端/网页端共用的唯一事实源（GUI 专属基础设施，无 CLI 对应物）。
// 由 launch.cjs agentic 内联实现迁移而来（零行为变更）：execute-agentic-tool 工具执行、
// run-agent-loop LLM 驱动工具调用循环、abort-agent-loop 中止信号。
//
// 契约：run-agent-loop / execute-agentic-tool 内部完整 catch（与原实现一致，从不向壳层抛异常）。
//
// 依赖注入边界（区别于业务域的纯 fs core）：
//   - 工具工厂 AgentToolFactory：tools/*.cjs 是 CJS 文件不参与 tsc 编译，由 launch.cjs
//     require 后经 DesktopCtx.getAgentTools() 注入（规避 dist 产物对 CJS 的路径漂移）；
//     工具实例缓存 toolInstanceCache 在本模块（模块级 Map，与原实现同 key 语义）。
//   - 事件推送：runAgentLoop 经 hooks.onEvent 发裸事件，由 desktop 壳附加 timestamp 后
//     经 ctx.sendToRenderer('agent-loop-event') 推送（守卫与 payload 形态复刻原 sendAgentLoopEvent）。
//   - 中止信号：AbortController 单例留在 desktop 壳（abort-agent-loop 与 run-agent-loop 共享），
//     经 hooks.signal 注入本模块。
//
// 日志口径：成功路径的迭代/工具调用调试 console.log 非前端可观察契约，迁移中已舍弃（提交 body 声明）；
// 执行失败 console.error 保留。

export interface AgentToolResultContent {
  type: string
  text?: string
}

export interface AgentToolResult {
  content?: AgentToolResultContent[]
  [key: string]: unknown
}

export interface AgentToolLike {
  execute(toolCallId: string, args: any, signal?: AbortSignal): Promise<AgentToolResult>
}

export interface AgentToolFactory {
  createReadTool(cwd: string): AgentToolLike
  createWriteTool(cwd: string): AgentToolLike
  createEditTool(cwd: string): AgentToolLike
  createBashTool(cwd: string): AgentToolLike
}

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 工具执行（execute-agentic-tool 契约）
// ---------------------------------------------------------------------------

// 工具实例缓存（模块级，与原 launch.cjs toolInstanceCache 同 key 语义：`${type}:${cwd}`）
const toolInstanceCache = new Map<string, AgentToolLike>()

function getOrCreateTool(factory: AgentToolFactory, type: string, cwd: string): AgentToolLike | null {
  const cacheKey = `${type}:${cwd}`
  let tool = toolInstanceCache.get(cacheKey)

  if (!tool) {
    switch (type) {
      case 'read':
        tool = factory.createReadTool(cwd)
        break
      case 'write':
        tool = factory.createWriteTool(cwd)
        break
      case 'edit':
        tool = factory.createEditTool(cwd)
        break
      case 'bash':
        tool = factory.createBashTool(cwd)
        break
      default:
        return null
    }
    if (tool) {
      toolInstanceCache.set(cacheKey, tool)
    }
  }
  return tool ?? null
}

// 解析工具结果为文本输出（工具返回 { content: [...], details: ... }）
function toolOutputOf(result: AgentToolResult): string {
  if (result.content && Array.isArray(result.content)) {
    const textParts = result.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
    return textParts.join('\n')
  }
  return JSON.stringify(result, null, 2)
}

export interface AgenticToolParams {
  type: string
  cwd?: string
  path?: string
  offset?: number
  limit?: number
  content?: string
  oldText?: string
  newText?: string
  command?: string
  timeout?: number
}

// execute-agentic-tool：type 白名单外直接失败；参数按类型映射后执行
export async function executeAgenticTool(
  factory: AgentToolFactory,
  params: AgenticToolParams,
  defaultCwd: string,
): Promise<{ success: true; output: string } | Failed> {
  const { type, ...args } = params
  const cwd = args.cwd || defaultCwd

  if (!cwd) {
    return { success: false, error: '项目路径未设置' }
  }

  try {
    const tool = getOrCreateTool(factory, type, cwd)

    if (!tool) {
      if (['read', 'write', 'edit', 'bash'].includes(type)) {
        return { success: false, error: `无法创建工具: ${type}` }
      }
      return { success: false, error: `未知的工具类型: ${type}` }
    }

    let toolArgs: Record<string, unknown> = {}
    switch (type) {
      case 'read':
        toolArgs = {
          path: args.path,
          offset: args.offset,
          limit: args.limit,
        }
        break
      case 'write':
        toolArgs = {
          path: args.path,
          content: args.content,
        }
        break
      case 'edit':
        toolArgs = {
          path: args.path,
          oldText: args.oldText,
          newText: args.newText,
        }
        break
      case 'bash':
        toolArgs = {
          command: args.command,
          timeout: args.timeout,
        }
        break
    }

    const result = await tool.execute(
      `tool-call-${Date.now()}`,
      toolArgs,
      undefined,
    )

    const output = toolOutputOf(result)
    return { success: true, output }
  } catch (error: any) {
    console.error(`❌ [${type}] 工具执行失败:`, error)
    return { success: false, error: error.message || String(error) }
  }
}

// ---------------------------------------------------------------------------
// Agent Loop（run-agent-loop 契约）
// ---------------------------------------------------------------------------

// 工具名称映射
const toolNameMap: Record<string, string> = {
  'file-read': 'read',
  'file-write': 'write',
  'file-edit': 'edit',
  'bash-execute': 'bash',
}

// 构建 LLM 可用的工具定义（openai function-calling schema）
function buildToolsDefinition(enabledTools: AgenticToolConfigInput[]): Array<Record<string, unknown>> {
  const tools: Array<Record<string, unknown>> = []

  for (const tool of enabledTools) {
    const toolName = toolNameMap[tool.type]
    if (!toolName) continue

    const toolDef: Record<string, any> = {
      type: 'function',
      function: {
        name: toolName,
        description: tool.description,
      },
    }

    switch (tool.type) {
      case 'file-read':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的相对路径或绝对路径' },
            offset: { type: 'number', description: '开始读取的行号（可选）' },
            limit: { type: 'number', description: '读取的行数限制（可选）' },
          },
          required: ['path'],
        }
        break
      case 'file-write':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的相对路径或绝对路径' },
            content: { type: 'string', description: '要写入的文件内容' },
          },
          required: ['path', 'content'],
        }
        break
      case 'file-edit':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的相对路径或绝对路径' },
            oldText: { type: 'string', description: '要查找的文本' },
            newText: { type: 'string', description: '替换后的文本' },
          },
          required: ['path', 'oldText', 'newText'],
        }
        break
      case 'bash-execute':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的终端命令' },
            timeout: { type: 'number', description: '命令超时时间（毫秒）' },
          },
          required: ['command'],
        }
        break
    }

    tools.push(toolDef)
  }

  return tools
}

export interface AgenticToolConfigInput {
  type: string
  description?: string
  enabled?: boolean
}

// 执行单个工具调用（agent loop 内部；失败返回 { success:false, output }，不抛异常）
async function executeToolCall(
  factory: AgentToolFactory,
  toolName: string,
  toolArgs: Record<string, unknown>,
  cwd: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const tool = getOrCreateTool(factory, toolName, cwd)

    if (!tool) {
      return { success: false, output: `未知工具: ${toolName}` }
    }

    const result = await tool.execute(
      `tool-call-${Date.now()}`,
      toolArgs,
      undefined,
    )

    const output = toolOutputOf(result)
    return { success: true, output }
  } catch (error: any) {
    console.error('  [Agent Loop] 工具执行失败:', error)
    return { success: false, output: error.message || String(error) }
  }
}

interface LlmLoopMessage {
  role: string
  content: any
  tool_call_id?: string
  tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
}

// 调用 LLM API（支持工具调用；anthropic 与 openai 两种格式）
async function callLLMWithTools(
  provider: { baseUrl: string; apiKey?: string; type?: string; defaultModel?: string },
  messages: LlmLoopMessage[],
  tools: Array<Record<string, unknown>>,
  model?: string,
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; arguments: any }>; stopReason: string | null }> {
  const endpoint = provider.baseUrl.endsWith('/')
    ? `${provider.baseUrl}chat/completions`
    : `${provider.baseUrl}/chat/completions`

  const headers: Record<string, string | undefined> = {
    'Content-Type': 'application/json',
  }

  if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  let requestBody: Record<string, unknown>

  if (provider.type === 'anthropic') {
    const systemMessage = messages.find(m => m.role === 'system')
    const otherMessages = messages.filter(m => m.role !== 'system')

    requestBody = {
      model: model || provider.defaultModel || 'claude-3-haiku-20240307',
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: otherMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      tools: tools.length > 0 ? tools : undefined,
    }
  } else {
    requestBody = {
      model: model || provider.defaultModel || 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 4096,
      tools: tools.length > 0 ? tools : undefined,
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers as Record<string, string>,
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`)
  }

  const data = await response.json()

  if (provider.type === 'anthropic') {
    const content = (data as any).content || []
    const textContent = content.find((c: any) => c.type === 'text')
    const toolUseContent = content.filter((c: any) => c.type === 'tool_use')

    return {
      content: textContent?.text || '',
      toolCalls: toolUseContent.map((tc: any) => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.input,
      })),
      stopReason: (data as any).stop_reason,
    }
  } else {
    const message = (data as any).choices?.[0]?.message || {}
    return {
      content: message.content || '',
      toolCalls: message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: JSON.parse(tc.function?.arguments || '{}'),
      })) || [],
      stopReason: (data as any).choices?.[0]?.finish_reason,
    }
  }
}

export interface AgentLoopEvent {
  type: string
  data: unknown
}

export interface AgentLoopHooks {
  // 事件推送（壳层附加 timestamp 后经 sendToRenderer('agent-loop-event') 推出）
  onEvent(event: AgentLoopEvent): void
  // 中止信号（壳层 AbortController 单例；循环内检查 aborted → 抛「用户中止」）
  signal?: AbortSignal
}

export interface AgentLoopConfig {
  provider: { name?: string; baseUrl: string; apiKey?: string; type?: string; defaultModel?: string }
  model: string
  tools: AgenticToolConfigInput[]
  maxIterations: number
  timeout: number
  projectPath: string
  task: string
}

export interface AgentLoopResult {
  success: boolean
  result?: string
  error?: string
  totalTurns: number
  totalToolCalls: number
  duration: number
}

// 运行 Agent Loop：LLM 思考 -> 工具调用 -> 结果反馈 -> 继续思考或结束
export async function runAgentLoop(
  factory: AgentToolFactory,
  config: AgentLoopConfig,
  hooks: AgentLoopHooks,
): Promise<AgentLoopResult> {
  const { provider, model, tools, maxIterations, timeout, projectPath, task } = config

  const startTime = Date.now()
  const timeoutMs = timeout * 1000

  let totalTurns = 0
  let totalToolCalls = 0

  try {
    hooks.onEvent({
      type: 'agent_start',
      data: { task },
    })

    const enabledTools = tools.filter(t => t.enabled)
    const toolDefinitions = buildToolsDefinition(enabledTools)

    const systemPrompt = `你是一个 AI Agent，可以使用工具与本地文件系统交互来完成任务。

## 可用工具
${enabledTools.map(t => `- ${toolNameMap[t.type]}: ${t.description}`).join('\n')}

## 行为规则
1. 分析用户任务，制定执行计划
2. 使用工具逐步完成任务
3. 每次工具调用后，根据结果决定下一步行动
4. 任务完成后，总结执行结果
5. 如果遇到问题无法解决，明确说明原因

## 输出格式
- 在调用工具前，简要说明你的思考过程
- 不要编造任何信息，只基于工具返回的实际结果回答
- 完成任务后，提供简洁的总结`

    const messages: LlmLoopMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请完成以下任务：\n\n${task}` },
    ]

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // 检查超时
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('执行超时')
      }

      // 检查是否中止
      if (hooks.signal?.aborted) {
        throw new Error('用户中止')
      }

      totalTurns++

      hooks.onEvent({
        type: 'turn_start',
        data: { turnNumber: totalTurns },
      })

      // 调用 LLM
      const llmResponse = await callLLMWithTools(provider, messages, toolDefinitions, model)

      // 发送思考内容事件
      if (llmResponse.content) {
        hooks.onEvent({
          type: 'thinking',
          data: { content: llmResponse.content },
        })

        messages.push({
          role: 'assistant',
          content: llmResponse.content,
        })
      }

      // 检查是否有工具调用
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // 构建工具调用消息
        const toolCallMessage: LlmLoopMessage = {
          role: 'assistant',
          content: llmResponse.content || null,
          tool_calls: llmResponse.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        }

        messages[messages.length - 1] = toolCallMessage

        // 执行每个工具调用
        for (const toolCall of llmResponse.toolCalls) {
          totalToolCalls++

          hooks.onEvent({
            type: 'tool_call',
            data: {
              toolName: toolCall.name,
              toolArgs: toolCall.arguments,
            },
          })

          const toolResult = await executeToolCall(factory, toolCall.name, toolCall.arguments, projectPath)

          hooks.onEvent({
            type: 'tool_result',
            data: {
              toolOutput: toolResult.output,
              toolSuccess: toolResult.success,
            },
          })

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult.output,
          })
        }
      } else {
        // 没有工具调用，检查是否完成任务
        if (llmResponse.stopReason === 'end_turn' ||
            llmResponse.stopReason === 'stop' ||
            llmResponse.content) {
          break
        }
      }

      hooks.onEvent({
        type: 'turn_end',
        data: { turnNumber: totalTurns },
      })
    }

    // 获取最终结果
    const lastMessage = messages[messages.length - 1]
    let finalResult = lastMessage.role === 'assistant'
      ? (typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content?.toString() || '')
      : '任务执行完成'

    // 过滤掉 <think>...< /think> 标签（某些模型如 MiniMax 会输出思考内容）
    finalResult = finalResult.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    const duration = Date.now() - startTime

    hooks.onEvent({
      type: 'agent_end',
      data: {
        success: true,
        result: finalResult,
        totalTurns,
        totalToolCalls,
        duration,
      },
    })

    return {
      success: true,
      result: finalResult,
      totalTurns,
      totalToolCalls,
      duration,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    const errorMessage = error.message || String(error)

    console.error('\n[Agent Loop] 执行失败:', errorMessage)

    hooks.onEvent({
      type: 'error',
      data: { error: errorMessage },
    })

    hooks.onEvent({
      type: 'agent_end',
      data: {
        success: false,
        result: errorMessage,
        totalTurns,
        totalToolCalls,
        duration,
      },
    })

    return {
      success: false,
      error: errorMessage,
      totalTurns,
      totalToolCalls,
      duration,
    }
  }
}
