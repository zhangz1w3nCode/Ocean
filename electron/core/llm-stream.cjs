/**
 * 流式 LLM 调用（单点实现）：
 * - launch.cjs 的 call-llm-stream-api handler 与知识编译编排（knowledge-compile.cjs）共用
 * - 双格式：anthropic（system 提升为顶层字段）+ openai 兼容
 * - SSE 行级解析；onToken 以 delta 粒度回调
 * - AbortSignal 取消；错误文案面向调用方可执行
 * 返回 { success, content, usage, aborted?, error? }（与 call-llm-api 对齐）
 */

// 思考标签过滤（与 call-llm-api 一致；拼接构造避免源码中出现完整标签字面量）
const THINK_RE = new RegExp('<' + 'think>[\\s\\S]*?</' + 'think>', 'g')

async function streamLLM(llm, messages, params, opts) {
  const { onToken, signal, log } = opts || {}
  const provider = llm && llm.provider ? llm.provider : llm
  const modelId = (llm && llm.model) || provider.defaultModel || 'gpt-4o-mini'

  const safeMessages = (Array.isArray(messages) ? messages : [])
    .filter((m) => m && typeof m.content === 'string' && m.content)
    .map((m) => ({
      role: m.role === 'system' || m.role === 'assistant' ? m.role : 'user',
      content: m.content,
    }))
  if (safeMessages.length === 0) {
    return { success: false, error: 'messages 为空或全部无效' }
  }

  try {
    // baseUrl 可能带/不带尾斜杠，统一归一后拼接（照抄原版时同携了它的存量 bug：两分支相同，
    // 不带斜杠时拼出 /v1chat/completions 404——此处修正，原版 call-llm-api 未动）
    const base = provider.baseUrl.endsWith('/') ? provider.baseUrl : `${provider.baseUrl}/`
    const endpoint = `${base}chat/completions`
    const headers = { 'Content-Type': 'application/json' }
    if (provider.type === 'anthropic') {
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${provider.apiKey}`
    }

    const p = params || {}
    let requestBody
    if (provider.type === 'anthropic') {
      const systemText = safeMessages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
      requestBody = {
        model: modelId,
        max_tokens: p.maxTokens || provider.modelParams?.maxTokens || 4096,
        stream: true,
        messages: safeMessages.filter((m) => m.role !== 'system'),
      }
      if (systemText) requestBody.system = systemText
    } else {
      requestBody = {
        model: modelId,
        stream: true,
        messages: safeMessages,
        temperature: p.temperature ?? provider.modelParams?.temperature ?? 0.7,
        max_tokens: p.maxTokens || provider.modelParams?.maxTokens || 4096,
      }
      const topP = p.topP ?? provider.modelParams?.topP
      if (topP !== undefined) requestBody.top_p = topP
    }

    if (log) log(`[llm-stream] ${provider.name || 'llm'} model=${modelId} msgs=${safeMessages.length}`)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`)
    }
    if (!response.body) {
      throw new Error('响应无流式 body')
    }

    let content = ''
    let usage = null
    const isAnthropic = provider.type === 'anthropic'

    const handleChunk = (chunk) => {
      if (isAnthropic) {
        if (chunk.type === 'content_block_delta' && chunk.delta && typeof chunk.delta.text === 'string') {
          content += chunk.delta.text
          if (onToken) onToken(chunk.delta.text)
        } else if (chunk.type === 'message_delta' && chunk.usage) {
          usage = chunk.usage
        }
      } else {
        const delta = chunk.choices && chunk.choices[0] && chunk.choices[0].delta
        if (delta && typeof delta.content === 'string' && delta.content) {
          content += delta.content
          if (onToken) onToken(delta.content)
        }
        if (chunk.usage) usage = chunk.usage
      }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let streamDone = false
    while (!streamDone) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIdx
      while ((newlineIdx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIdx).replace(/\r$/, '')
        buffer = buffer.slice(newlineIdx + 1)
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') {
          streamDone = true
          break
        }
        try {
          handleChunk(JSON.parse(data))
        } catch {
          // 不完整 JSON 行（按行分割理论上不会出现）；忽略保持健壮
        }
      }
    }

    content = content.replace(THINK_RE, '').trim()
    return { success: true, content, usage }
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || /aborted/i.test(String(error.message || '')))
    return {
      success: false,
      aborted: aborted === true,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

module.exports = { streamLLM }
