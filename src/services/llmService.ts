/**
 * LLM 服务 - 调用外部 LLM API
 *
 * 特性：
 * - 支持 20+ LLM 提供商 (OpenAI, Anthropic, Google, Groq, xAI 等)
 * - 统一的 API 接口
 * - Token 和成本跟踪
 * - 内置重试和错误处理
 */

import type { LLMProvider, Usage } from '../types'
import { isElectron } from '../utils/storage'


// LLM 响应结构
export interface LLMResponse {
  success: boolean
  content?: string
  usage?: Usage
  error?: string
}

// LLM 内容生成结果
export interface LlmContentResult {
  content: string
}

// LLM 提供商映射
const PI_MONO_PROVIDER_MAP: Record<string, string> = {
  'openai': 'openai',
  'anthropic': 'anthropic',
  'azure': 'azure-openai',
  'google': 'google',
  'groq': 'groq',
  'xai': 'xai',
  'mistral': 'mistral',
  'openrouter': 'openrouter',
  'custom': 'openai-compatible',
}

/**
 * 获取 API Key（优先使用配置文件，回退到环境变量）
 */
const getApiKey = (provider: LLMProvider): string => {
  // 优先使用配置文件中的 key
  if (provider.apiKey) {
    return provider.apiKey
  }

  // 回退到环境变量
  const envKeyMap: Record<string, string> = {
    'openai': 'OPENAI_API_KEY',
    'anthropic': 'ANTHROPIC_API_KEY',
    'azure': 'AZURE_OPENAI_API_KEY',
    'google': 'GOOGLE_API_KEY',
    'groq': 'GROQ_API_KEY',
    'xai': 'XAI_API_KEY',
    'mistral': 'MISTRAL_API_KEY',
    'openrouter': 'OPENROUTER_API_KEY',
  }

  const envKey = envKeyMap[provider.type]
  if (envKey && typeof process !== 'undefined' && process.env) {
    const envValue = process.env[envKey]
    if (envValue) {
      console.log(`使用环境变量 ${envKey}`)
      return envValue
    }
  }

  throw new Error(`未找到 ${provider.name} 的 API Key`)
}

/**
 * 使用 LLM 生成内容
 */
export const generateWithLLM = async (
  provider: LLMProvider,
  promptTemplate: string,
  userDescription: string
): Promise<LLMResponse> => {
  try {
    // 替换模板中的占位符，如果模板中没有占位符则自动追加
    let prompt = promptTemplate
    if (promptTemplate.includes('{{userDescription}}')) {
      prompt = promptTemplate.replace('{{userDescription}}', userDescription)
    } else {
      // 降级处理：模板中没有占位符，在末尾追加用户描述
      console.warn('提示词模板中未找到 {{userDescription}} 占位符，将自动追加用户描述')
      prompt = `${promptTemplate}\n\n## 用户需求\n${userDescription}`
    }

    // 获取 provider 和 model
    const piProvider = PI_MONO_PROVIDER_MAP[provider.type] || 'openai-compatible'
    const modelId = provider.defaultModel || 'gpt-4o-mini'

    console.log('转换 provider:', {
      provider: provider.name,
      type: provider.type,
      piProvider,
      modelId
    })

    console.log('\n=== 调用 LLM ===')
    console.log('提供商:', provider.name)
    console.log('模型:', provider.defaultModel)

    // Electron 环境：使用主进程发送请求
    if (isElectron() && window.electronAPI?.callLLMApi) {
      console.log('使用 Electron 主进程调用 LLM API...')

      const result = await window.electronAPI.callLLMApi(
        provider,
        prompt,
        provider.defaultModel
      )

      if (result.success) {
        console.log('LLM 调用成功')
        return {
          success: true,
          content: result.content,
          usage: result.usage
        }
      } else {
        console.log('LLM 调用失败:', result.error)
        return {
          success: false,
          error: result.error || 'LLM 调用失败'
        }
      }
    }

    // 桌面端应用，仅在 Electron 环境运行（浏览器回退已移除）
    return {
      success: false,
      error: 'LLM 调用需要在桌面端应用环境运行'
    }

  } catch (error) {
    console.error('LLM 调用失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 优化内容 - 调用 LLM
 * 与LLM创建不同，优化是基于现有内容进行改进
 */
export const optimizeContentWithLLM = async (
  provider: LLMProvider,
  promptTemplate: string,
  currentContent: string,
  optimizeTarget: string
): Promise<LLMResponse> => {
  try {
    // 替换模板中的占位符，支持降级处理
    let prompt = promptTemplate

    // 检查模板中的占位符
    const hasCurrentContent = promptTemplate.includes('{{currentContent}}')
    const hasOptimizeTarget = promptTemplate.includes('{{optimizeTarget}}')

    if (hasCurrentContent && hasOptimizeTarget) {
      // 标准情况：两个占位符都存在
      prompt = promptTemplate
        .replace('{{currentContent}}', currentContent)
        .replace('{{optimizeTarget}}', optimizeTarget)
    } else {
      // 降级处理：缺少占位符时自动追加
      console.warn('提示词模板中缺少必需的占位符，将自动追加内容')
      prompt = `${promptTemplate}\n\n## 现有内容\n${currentContent}\n\n## 优化目标\n${optimizeTarget}`
    }

    // 获取 provider 和 model
    const piProvider = PI_MONO_PROVIDER_MAP[provider.type] || 'openai-compatible'
    const modelId = provider.defaultModel || 'gpt-4o-mini'

    console.log('转换 provider:', {
      provider: provider.name,
      type: provider.type,
      piProvider,
      modelId
    })

    console.log('\n=== 调用 LLM (优化) ===')
    console.log('提供商:', provider.name)
    console.log('模型:', provider.defaultModel)
    console.log('优化目标:', optimizeTarget)

    // Electron 环境：使用主进程发送请求
    if (isElectron() && window.electronAPI?.callLLMApi) {
      console.log('使用 Electron 主进程调用 LLM API...')

      const result = await window.electronAPI.callLLMApi(
        provider,
        prompt,
        provider.defaultModel
      )

      if (result.success) {
        console.log('LLM 调用成功（优化）')
        return {
          success: true,
          content: result.content,
          usage: result.usage
        }
      } else {
        console.log('LLM 调用失败:', result.error)
        return {
          success: false,
          error: result.error || 'LLM 调用失败'
        }
      }
    }

    // 桌面端应用，仅在 Electron 环境运行（浏览器回退已移除）
    return {
      success: false,
      error: 'LLM 调用需要在桌面端应用环境运行'
    }


  } catch (error) {
    console.error('LLM 调用失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 移除思考标签（某些模型如 MiniMax 会输出思考内容）
 */
const removeThinkTags = (content: string): string => {
  return content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
}

/**
 * 解析 LLM 返回的内容
 * 简化版：直接返回内容，不要求 JSON 格式
 */
export const parseLlmContent = (content: string): LlmContentResult | null => {
  try {
    console.log('\n========== LLM 返回的能力内容 ==========')
    console.log(content)
    console.log('========================================\n')

    // 移除思考标签
    let cleanedContent = removeThinkTags(content).trim()

    // 移除可能的 markdown 代码块标记

    // 如果内容被 ``` 包裹，提取其中的内容
    if (cleanedContent.startsWith('```')) {
      const firstNewline = cleanedContent.indexOf('\n')
      const lastBackticks = cleanedContent.lastIndexOf('```')
      if (firstNewline !== -1 && lastBackticks !== -1 && lastBackticks > firstNewline) {
        cleanedContent = cleanedContent.substring(firstNewline + 1, lastBackticks).trim()
      }
    }

    // 验证内容不为空
    if (!cleanedContent) {
      console.error('LLM 返回的内容为空')
      return null
    }

    return {
      content: cleanedContent
    }
  } catch (error) {
    console.error('处理 LLM 返回的内容失败:', error)
    return null
  }
}

/**
 * 获取支持的 LLM 提供商列表
 */
export const getSupportedProviders = (): Array<{ id: string; name: string; envKey: string; models: string[] }> => {
  return [
    {
      id: 'openai',
      name: 'OpenAI',
      envKey: 'OPENAI_API_KEY',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
    },
    {
      id: 'anthropic',
      name: 'Anthropic',
      envKey: 'ANTHROPIC_API_KEY',
      models: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4']
    },
    {
      id: 'google',
      name: 'Google AI',
      envKey: 'GOOGLE_API_KEY',
      models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash']
    },
    {
      id: 'groq',
      name: 'Groq',
      envKey: 'GROQ_API_KEY',
      models: ['llama-3.3-70b', 'mixtral-8x7b', 'gemma-2-9b']
    },
    {
      id: 'xai',
      name: 'xAI',
      envKey: 'XAI_API_KEY',
      models: ['grok-2', 'grok-2-mini']
    },
    {
      id: 'mistral',
      name: 'Mistral',
      envKey: 'MISTRAL_API_KEY',
      models: ['mistral-large', 'mistral-medium', 'mistral-small']
    },
    {
      id: 'openrouter',
      name: 'OpenRouter',
      envKey: 'OPENROUTER_API_KEY',
      models: ['openai/gpt-4o', 'anthropic/claude-3-opus']
    },
    {
      id: 'custom',
      name: '自定义 (OpenAI 兼容)',
      envKey: 'CUSTOM_API_KEY',
      models: ['custom-model']
    },
  ]
}

/**
 * 测试 LLM 连接
 */
export const testLLMConnection = async (provider: LLMProvider): Promise<{ success: boolean; error?: string; usage?: Usage }> => {
  try {
    const result = await window.electronAPI!.callLLMApi(
      provider,
      'Hello, this is a test message. Please reply with "OK".',
      provider.defaultModel
    )

    if (result.success) {
      console.log('LLM 连接测试成功:', result.usage)
      return { success: true, usage: result.usage }
    }

    return { success: false, error: result.error || '连接测试失败' }
  } catch (error) {
    console.error('LLM 连接测试失败:', error)
    return { success: false, error: error instanceof Error ? error.message : '连接测试失败' }
  }
}
