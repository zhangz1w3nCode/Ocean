import * as fs from 'node:fs'
import * as path from 'node:path'

// ---------------------------------------------------------------------------
// LLM 智能审核产物客户端
//
// 供 ocean workflow complete 在写入产物前把关：审核上一节点提交的产物是否按照节点内容执行。
// 判定逻辑由用户可自定义的提示词承载：
// 默认提示词要求 LLM 输出 {"pass": true|false, "reason": "..."}，
// CLI 解析 pass 决定放行/阻断，reason 展示在阻断信息中。
// LLM 不可用（网络/超时/解析失败）抛 LlmReviewUnavailableError，由调用方降级。
// ---------------------------------------------------------------------------

export interface LlmReviewParams {
  temperature: number
  maxTokens: number
  timeoutMs: number
}

export interface LlmReviewConfig {
  enabled: boolean
  providerId: string
  model: string
  prompt: string
  params: LlmReviewParams
}

/** LLM 审核服务不可用（网络/超时/鉴权/解析失败），调用方应降级而非阻断。 */
export class LlmReviewUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmReviewUnavailableError'
  }
}

// 与 src/utils/storage.ts 的 DEFAULT_LLM_REVIEW_PROMPT 保持一致。
// 注意：输出格式约束由 OUTPUT_FORMAT_DIRECTIVE 固定拼接（对用户隐藏），
// 用户提示词只承载判断指令，避免用户误改/删除导致 CLI 解析失败。
const DEFAULT_LLM_REVIEW_PROMPT = `你是产物符合性校验判断器。给定「节点任务内容」和「产物内容」，判断产物是否按照节点任务的要求完成——即产物是否兑现了节点任务声明要完成的事项，而非占位、空白、敷衍或无关内容。逐项核对节点任务声明的输出要求（清单/表格/数据/路径/结论等要素）是否在产物中真实出现。

## 节点任务
{{node_task}}

## 产物
{{artifact}}`

// 输出格式约束：代码内部拼接，UI 不可见不可改（CLI 按此格式解析判定结果）
const OUTPUT_FORMAT_DIRECTIVE = `

只输出一个 JSON 对象: {"pass": <true|false>, "reason": "<一句话判定理由>"}。pass 为 true 表示产物按要求完成，false 表示未按要求完成。禁止输出其他任何内容。`

// 思考型模型对长产物的审核可达 30s+（实测 qwen3.8-flash 长清单 7-19s、复杂报告 37-44s），
// 默认 90s；可在工作流设置中按需调整（params.timeoutMs）
const LLM_REVIEW_DEFAULT_TIMEOUT_MS = 90000

export function loadLlmReviewConfig(root: string): LlmReviewConfig | null {
  const configPath = path.join(root, '.ocean', 'cli-workflow-llm-judge-artifacts.json')
  try {
    if (!fs.existsSync(configPath)) return null
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    if (typeof raw !== 'object' || raw === null) return null
    const params = raw.params ?? {}
    return {
      enabled: raw.enabled === true,
      providerId: typeof raw.providerId === 'string' ? raw.providerId : '',
      model: typeof raw.model === 'string' ? raw.model : '',
      prompt: typeof raw.prompt === 'string' && raw.prompt.trim() !== '' ? raw.prompt : DEFAULT_LLM_REVIEW_PROMPT,
      params: {
        temperature: typeof params.temperature === 'number' ? params.temperature : 0,
        maxTokens: typeof params.maxTokens === 'number' && params.maxTokens > 0 ? params.maxTokens : 1024,
        timeoutMs: typeof params.timeoutMs === 'number' && params.timeoutMs > 0 ? params.timeoutMs : LLM_REVIEW_DEFAULT_TIMEOUT_MS,
      },
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Provider 解析：读 .ocean/llm-config.json（与设置页 LLM 配置共享同一份文件）
// ---------------------------------------------------------------------------

interface ResolvedProvider {
  /** openai/custom 走 OpenAI 兼容 chat/completions；anthropic 走原生 Messages API */
  kind: 'openai-compatible' | 'anthropic'
  baseUrl: string
  apiKey: string
  model: string
}

export function resolveLlmProvider(
  root: string,
  providerId: string,
  model: string,
): ResolvedProvider | null {
  const configPath = path.join(root, '.ocean', 'llm-config.json')
  try {
    if (!fs.existsSync(configPath)) return null
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    const providers: any[] = Array.isArray(raw?.providers) ? raw.providers : []
    if (providers.length === 0) return null
    const provider = (
      (providerId.trim() !== '' ? providers.filter((p) => p?.id === providerId) : [])
        .concat(providers)
    )[0]
    if (!provider || typeof provider.baseUrl !== 'string' || typeof provider.apiKey !== 'string') {
      return null
    }
    const kind = provider.type === 'anthropic'
      ? ('anthropic' as const)
      : ('openai-compatible' as const)
    const resolvedModel = model.trim() !== ''
      ? model
      : (typeof provider.defaultModel === 'string' && provider.defaultModel !== '' ? provider.defaultModel : '')
    if (resolvedModel === '') return null
    return { kind, baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: resolvedModel }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// 校验执行
// ---------------------------------------------------------------------------

export interface LlmReviewResult {
  pass: boolean
  reason?: string
}

// ---------------------------------------------------------------------------
// 产物引用路径解析：产物中不可避免会引用文件路径（指针式产物），
// 审核时把路径指向的文件原文读入并追加到 prompt（产物原文不变，追加式说明），
// 让 LLM 能验证实质而非仅看指针。不限制文件数量与大小，原文完整传入；
// 不存在路径标注后传入（重要敷衍信号）。
// ---------------------------------------------------------------------------

// 提取产物文本中的候选文件路径（反引号/引号包裹 + 项目相对路径模式）
function extractFilePaths(text: string): string[] {
  const found = new Set<string>()
  // 1) 反引号或引号内的路径（以 . 或 / 开头，含扩展名）
  const quoted = text.match(/[`"'']([^`"''\n]*\.(?:md|json|ya?ml|txt|csv)[^`"''\n]*)[`"'']/g) || []
  for (const q of quoted) {
    const p = q.slice(1, -1).trim()
    if (p.startsWith('.') || p.startsWith('/')) found.add(p)
  }
  // 2) 直接出现的项目相对路径（.tasks/.ocean/.workflows/.nodes/.knowledges/.timelines/.experiences/.resources/.pi/.claude 等开头）
  const bare = text.match(/\.(?:tasks|ocean|workflows|nodes|knowledges|timelines|experiences|resources|pi|claude)\/[\w\-\.\/\[\]\u4e00-\u9fff]*\.(?:md|json|ya?ml|txt|csv)/g) || []
  for (const b of bare) found.add(b)
  // 3) 裸绝对路径（/tmp/...、/Users/... 等，无引号包裹）
  const absolute = text.match(/(?<![\w.])\/(?:[\w\-\.]+\/)+[\w\-\.\u4e00-\u9fff]*\.(?:md|json|ya?ml|txt|csv)/g) || []
  for (const a of absolute) found.add(a)
  // 4) 含 / 的裸相对路径（约定目录之外，如 outputs/统计报告.md；排除 URL）
  const relative = text.match(/(?<![\w.\/])(?:[\w\-\.]+\/)[\w\-\.\/\u4e00-\u9fff\[\]]*\.(?:md|json|ya?ml|txt|csv)/g) || []
  for (const r of relative) {
    if (!r.startsWith('http') && !r.startsWith('.')) found.add(r)
  }
  // 子串去重：绝对路径的尾部子串会被相对规则重复提取，短的去掉
  const all = [...found]
  return all.filter((p) => !all.some((q) => q !== p && q.includes(p)))
}

// 读取引用文件，返回追加给 LLM 的区块（不存在也标注——指针指向不存在的文件是重要敷衍信号）
function buildReferencedFilesBlock(root: string, artifact: string): string {
  const paths = extractFilePaths(artifact)
  if (paths.length === 0) return ''
  const sections: string[] = ['\n\n## 产物引用的文件内容（审核时已自动解析原文，产物原文保持不变，追加于此供实质验证）']
  for (const rel of paths) {
    const full = path.isAbsolute(rel) ? rel : path.join(root, rel)
    try {
      const stat = fs.statSync(full)
      if (!stat.isFile()) {
        sections.push(`\n### ${rel}\n[路径存在但不是文件]`)
        continue
      }
      const content = fs.readFileSync(full, 'utf-8')
      sections.push(`\n### ${rel}\n\n${content}`)
    } catch {
      sections.push(`\n### ${rel}\n[路径不存在或不可读]`)
    }
  }
  return sections.join('')
}

function buildPrompt(root: string, config: LlmReviewConfig, nodeTask: string, artifact: string): string {
  let prompt = config.prompt
  if (!prompt.includes('{{node_task}}')) {
    prompt += '\n\n## 节点任务\n{{node_task}}'
  }
  if (!prompt.includes('{{artifact}}')) {
    prompt += '\n\n## 产物\n{{artifact}}'
  }
  // 产物引用的文件内容解析后追加在产物之后、格式约束之前
  const refBlock = buildReferencedFilesBlock(root, artifact)
  prompt = prompt.replace(/\{\{artifact\}\}/g, artifact + refBlock)
  prompt = prompt.replace(/\{\{node_task\}\}/g, nodeTask)
  // 输出格式约束固定注入（对用户隐藏），保证 CLI 解析稳定
  if (!prompt.includes('"pass"')) {
    prompt += OUTPUT_FORMAT_DIRECTIVE
  }
  return prompt
}

function parseReviewResult(text: string): LlmReviewResult {
  const trimmed = text.trim()
  // 优先整体 JSON 解析（容忍 markdown code fence 包裹）
  const jsonCandidate = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const d = JSON.parse(jsonCandidate)
    if (typeof d?.pass === 'boolean') {
      return { pass: d.pass, reason: typeof d.reason === 'string' ? d.reason : undefined }
    }
  } catch {
    // fall through
  }
  // 降级：正则提取
  const m = trimmed.match(/"pass"\s*:\s*(true|false)/i)
  if (m) {
    const rm = trimmed.match(/"reason"\s*:\s*"([^"]*)"/)
    return { pass: m[1].toLowerCase() === 'true', reason: rm ? rm[1] : undefined }
  }
  throw new LlmReviewUnavailableError('LLM 响应无法解析为判定结果（期望 {"pass": true|false, "reason": "..."}）')
}

/** 用 LLM 校验产物是否按照节点任务要求完成。失败抛 LlmReviewUnavailableError。 */
export async function checkArtifactWithLLM(
  root: string,
  config: LlmReviewConfig,
  provider: ResolvedProvider,
  nodeTask: string,
  artifact: string,
): Promise<LlmReviewResult> {
  const prompt = buildPrompt(root, config, nodeTask, artifact)
  const controller = new AbortController()
  const timeoutMs = config.params.timeoutMs > 0 ? config.params.timeoutMs : LLM_REVIEW_DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let url: string
    let headers: Record<string, string>
    let body: Record<string, unknown>

    if (provider.kind === 'anthropic') {
      url = `${provider.baseUrl.replace(/\/+$/, '')}/v1/messages`
      headers = {
        'x-api-key': provider.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      }
      body = {
        model: provider.model,
        max_tokens: config.params.maxTokens,
        temperature: config.params.temperature,
        messages: [{ role: 'user', content: prompt }],
      }
    } else {
      url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`
      headers = {
        'Authorization': `Bearer ${provider.apiKey}`,
        'Content-Type': 'application/json',
      }
      body = {
        model: provider.model,
        temperature: config.params.temperature,
        max_tokens: config.params.maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new LlmReviewUnavailableError(`LLM API 返回 ${res.status}`)
    }

    const data = await res.json() as any
    const choice = data?.choices?.[0]
    const content: string | undefined =
      provider.kind === 'anthropic'
        ? (data?.content?.[0]?.text)
        : (choice?.message?.content)
    if (typeof content !== 'string' || content.trim() === '') {
      // 空 content 常见于推理模型思考耗尽 maxTokens 预算（finish_reason=length）：
      // 抛 UnavailableError 由 complete 转为写入失败，诊断信息随异常链展示
      const finish = provider.kind === 'anthropic' ? '' : ` (finish_reason: ${choice?.finish_reason ?? 'unknown'})`
      const hint = choice?.finish_reason === 'length'
        ? '。思考耗尽了最大输出 token 预算，请提高工作流设置中的「最大输出 token」'
        : ''
      throw new LlmReviewUnavailableError(`LLM 响应内容为空${finish}${hint}`)
    }
    return parseReviewResult(content)
  } catch (e: any) {
    if (e instanceof LlmReviewUnavailableError) throw e
    if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
      throw new LlmReviewUnavailableError(`请求超时（${timeoutMs}ms，可在工作流设置「审核超时」中调整）`)
    }
    throw new LlmReviewUnavailableError(e?.message ?? String(e))
  } finally {
    clearTimeout(timer)
  }
}
