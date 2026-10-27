// LLM 工具链域统一实现 —— 桌面端/网页端共用的唯一事实源（GUI 专属基础设施，无 CLI 对应物）。
// 由 launch.cjs 设置模块内联实现迁移而来（零行为变更）：LLM 连接测试/单轮调用、
// 三个配置文件 CRUD。CLI 安装 / 可执行文件检查已拆至 setting 域（electron/core/setting/operate.ts）。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }；
// 网络失败按原实现返回失败契约（不抛异常）。未预期的系统异常由 desktop 壳包装。
//
// 无 Electron 依赖，本模块自包含。
//
// 日志口径：成功路径的调试 console.log 非前端可观察契约，迁移中已舍弃（提交 body 声明）；
// catch 分支 console.error 保留。

import * as fs from 'node:fs'
import * as path from 'node:path'

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// LLM 连接测试 / 单轮调用（原生 fetch）
// ---------------------------------------------------------------------------

export interface LlmProviderConfig {
  name?: string
  type?: string
  baseUrl: string
  apiKey?: string
  defaultModel?: string
  modelParams?: {
    maxTokens?: number
    temperature?: number
    topP?: number
    frequencyPenalty?: number
    presencePenalty?: number
  }
}

// test-llm-connection：GET {baseUrl}models，按 provider 类型设置认证头
export async function testLlmConnection(provider: LlmProviderConfig): Promise<
  { success: boolean; status: number; statusText: string; body: string; json: unknown } | ({ success: false; error: string })
> {
  const testUrl = provider.baseUrl.endsWith('/')
    ? `${provider.baseUrl}models`
    : `${provider.baseUrl}/models`

  // header 值可为 undefined（原 JS 语义：fetch 序列化时丢弃 undefined header）
  const headers: Record<string, string | undefined> = {
    'Content-Type': 'application/json',
  }

  if (provider.type === 'openai' || provider.type === 'custom') {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  } else if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else if (provider.type === 'azure') {
    headers['api-key'] = provider.apiKey
  }

  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: headers as Record<string, string>,
    })

    const responseText = await response.text()
    let responseJson: unknown = null
    try {
      responseJson = JSON.parse(responseText)
    } catch {
      // 响应不是 JSON 格式
    }

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: responseText,
      json: responseJson,
    }
  } catch (error: any) {
    console.error('❌ 测试失败:', error)
    return {
      success: false,
      error: error.message || String(error),
    }
  }
}

// call-llm-api：POST {baseUrl}chat/completions，按 provider 类型构建请求体并解析响应
export async function callLlmApi(provider: LlmProviderConfig, prompt: string, model?: string): Promise<
  { success: true; content: string; usage: unknown } | Failed
> {
  try {
    const modelId = model || provider.defaultModel || 'gpt-4o-mini'

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
      requestBody = {
        model: modelId,
        max_tokens: provider.modelParams?.maxTokens || 4096,
        messages: [{ role: 'user', content: prompt }],
      }
    } else {
      requestBody = {
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: provider.modelParams?.temperature ?? 0.7,
        max_tokens: provider.modelParams?.maxTokens || 4096,
      }
      if (provider.modelParams?.topP !== undefined) {
        requestBody.top_p = provider.modelParams.topP
      }
      if (provider.modelParams?.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = provider.modelParams.frequencyPenalty
      }
      if (provider.modelParams?.presencePenalty !== undefined) {
        requestBody.presence_penalty = provider.modelParams.presencePenalty
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

    let content = ''
    let usage: unknown = null

    if (provider.type === 'anthropic') {
      const contentArray = (data as any).content || []
      for (const item of contentArray) {
        if (item.type === 'text' && item.text) {
          content += item.text
        }
      }
      usage = (data as any).usage
    } else {
      const message = (data as any).choices?.[0]?.message || {}
      content = message.content || ''
      usage = (data as any).usage
    }

    // 过滤思考标签（某些模型如 MiniMax 会输出思考内容）
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    return {
      success: true,
      content,
      usage,
    }
  } catch (error) {
    console.error('LLM 调用失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// ---------------------------------------------------------------------------
// 三个配置文件 CRUD（{root}/.ocean/ 下；getXxxConfigPath 有 ensureDir .ocean 副作用）
// ---------------------------------------------------------------------------

function oceanConfigPath(root: string, file: string): string {
  const oceanDir = path.join(root, '.ocean')
  if (!fs.existsSync(oceanDir)) {
    fs.mkdirSync(oceanDir, { recursive: true })
  }
  return path.join(oceanDir, file)
}

function readJsonConfig(root: string, file: string): { success: true; config: unknown } | ({ success: false; error: string } & { config: null }) {
  const configPath = oceanConfigPath(root, file)
  if (!fs.existsSync(configPath)) {
    return { success: true, config: null }
  }
  const content = fs.readFileSync(configPath, 'utf-8')
  const config = JSON.parse(content)
  return { success: true, config }
}

function writeJsonConfig(root: string, file: string, config: unknown): { success: true } | Failed {
  const configPath = oceanConfigPath(root, file)
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return { success: true }
}

// LLM 配置（.ocean/llm-config.json）
export function readLlmConfig(root: string) {
  return readJsonConfig(root, 'llm-config.json')
}
export function writeLlmConfig(root: string, config: unknown) {
  return writeJsonConfig(root, 'llm-config.json', config)
}

// Agentic 配置（.ocean/agentic-config.json）
export function readAgenticConfig(root: string) {
  return readJsonConfig(root, 'agentic-config.json')
}
export function writeAgenticConfig(root: string, config: unknown) {
  return writeJsonConfig(root, 'agentic-config.json', config)
}

// LLM 智能审核产物配置（.ocean/cli-workflow-llm-judge-artifacts.json）
export function readLlmReviewConfig(root: string) {
  return readJsonConfig(root, 'cli-workflow-llm-judge-artifacts.json')
}
export function writeLlmReviewConfig(root: string, config: unknown) {
  return writeJsonConfig(root, 'cli-workflow-llm-judge-artifacts.json', config)
}
