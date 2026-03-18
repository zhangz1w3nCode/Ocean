/**
 * Agentic 服务 - 使用 @mariozechner/pi-coding-agent 实现工具调用能力
 *
 * 特性：
 * - 集成 pi-coding-agent 的完整工具实现
 * - 支持 read、write、edit、ls、grep、find、bash 工具
 * - 使用项目配置的 LLM 提供商
 * - 基于用户配置的工具权限控制
 */

import type { AgenticConfig, AgenticToolType, LLMProvider } from '../types'
import { getDefaultLLMProvider, loadLLMProvidersFromFile } from '../utils/storage'
import { isElectron } from '../utils/storage'

// 工具标签映射
const toolLabels: Record<AgenticToolType, string> = {
  'file-read': '文件读取',
  'file-write': '文件写入',
  'file-edit': '文件编辑',
  'file-ls': '目录列表',
  'file-grep': '内容搜索',
  'file-find': '文件查找',
  'bash-execute': '终端执行'
}

// 工具执行结果
export interface ToolExecutionResult {
  success: boolean
  output: string
  error?: string
}

// Agentic 执行结果
export interface AgenticExecutionResult {
  success: boolean
  result: string
  toolCalls: Array<{
    tool: string
    input: unknown
    output: string
  }>
  error?: string
}

// 工具定义（来自 pi-coding-agent）
export interface CodingTool {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
  execute: (args: any) => Promise<string>
}

// 根据配置获取要使用的模型
const getModelId = (config: AgenticConfig, provider: LLMProvider): string => {
  // 如果配置了特定模型且该模型在可用模型列表中，使用它
  if (config.modelId && provider.availableModels.includes(config.modelId)) {
    return config.modelId
  }
  // 否则使用提供商的默认模型
  return provider.defaultModel
}

// 获取 Agentic 配置使用的 LLM 提供商
export const getAgenticLLMProvider = async (
  config: AgenticConfig
): Promise<LLMProvider | null> => {
  // 如果配置了特定的 providerId，使用它
  if (config.providerId) {
    const providers = await loadLLMProvidersFromFile()
    const provider = providers.find(p => p.id === config.providerId && p.isEnabled)
    if (provider) return provider
  }

  // 否则使用默认的启用提供商
  return getDefaultLLMProvider()
}

// 检查 Agentic 是否可用
export const isAgenticAvailable = async (
  config: AgenticConfig
): Promise<{ available: boolean; reason?: string }> => {
  if (!config.enabled) {
    return { available: false, reason: 'Agentic 模式未启用' }
  }

  const provider = await getAgenticLLMProvider(config)
  if (!provider) {
    return { available: false, reason: '未找到可用的 LLM 提供商，请先在 LLM 设置中配置' }
  }

  return { available: true }
}

/**
 * 创建工具实例
 *
 * 使用 @mariozechner/pi-coding-agent 提供的工具工厂函数
 * 这些工具在 Node.js/Electron 主进程中执行
 */
export const createCodingToolsFromConfig = (
  config: AgenticConfig,
  projectPath: string
): CodingTool[] => {
  const tools: CodingTool[] = []
  const enabledTools = config.tools.filter(t => t.enabled)

  for (const tool of enabledTools) {
    switch (tool.type) {
      case 'file-read':
        tools.push({
          name: 'read',
          description: '读取指定路径的文件内容，支持 offset 和 limit 参数分段读取',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '文件的相对路径或绝对路径'
              },
              offset: {
                type: 'number',
                description: '开始读取的行号（可选）'
              },
              limit: {
                type: 'number',
                description: '读取的行数限制（可选）'
              }
            },
            required: ['path']
          },
          execute: async (args: { path: string; offset?: number; limit?: number }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'read',
                path: args.path,
                offset: args.offset,
                limit: args.limit,
                cwd: projectPath
              })
              return result.success ? (result.output || '') : `Error: ${result.error}`
            }
            return 'Error: 文件读取功能仅在 Electron 环境中可用'
          }
        })
        break

      case 'file-write':
        tools.push({
          name: 'write',
          description: '将内容写入指定路径的文件，会创建不存在的目录',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '文件的相对路径或绝对路径'
              },
              content: {
                type: 'string',
                description: '要写入的文件内容'
              }
            },
            required: ['path', 'content']
          },
          execute: async (args: { path: string; content: string }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'write',
                path: args.path,
                content: args.content,
                cwd: projectPath
              })
              return result.success ? 'File written successfully' : `Error: ${result.error}`
            }
            return 'Error: 文件写入功能仅在 Electron 环境中可用'
          }
        })
        break

      case 'file-edit':
        tools.push({
          name: 'edit',
          description: '编辑文件，使用 oldText 查找并替换为 newText',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '文件的相对路径或绝对路径'
              },
              oldText: {
                type: 'string',
                description: '要查找的文本'
              },
              newText: {
                type: 'string',
                description: '替换后的文本'
              }
            },
            required: ['path', 'oldText', 'newText']
          },
          execute: async (args: { path: string; oldText: string; newText: string }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'edit',
                path: args.path,
                oldText: args.oldText,
                newText: args.newText,
                cwd: projectPath
              })
              return result.success ? 'File edited successfully' : `Error: ${result.error}`
            }
            return 'Error: 文件编辑功能仅在 Electron 环境中可用'
          }
        })
        break

      case 'file-ls':
        tools.push({
          name: 'ls',
          description: '列出指定目录中的文件和子目录',
          parameters: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: '目录路径，默认为当前目录'
              }
            }
          },
          execute: async (args: { path?: string }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'ls',
                path: args.path || '.',
                cwd: projectPath
              })
              return result.success ? (result.output || '') : `Error: ${result.error}`
            }
            return 'Error: 目录列表功能仅在 Electron 环境中可用'
          }
        })
        break

      case 'file-grep':
        tools.push({
          name: 'grep',
          description: '在文件中搜索匹配的文本内容',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '搜索的正则表达式模式'
              },
              path: {
                type: 'string',
                description: '搜索路径，默认为当前目录'
              },
              glob: {
                type: 'string',
                description: '文件匹配模式（如 *.ts）'
              },
              ignoreCase: {
                type: 'boolean',
                description: '是否忽略大小写'
              }
            },
            required: ['pattern']
          },
          execute: async (args: { pattern: string; path?: string; glob?: string; ignoreCase?: boolean }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'grep',
                pattern: args.pattern,
                path: args.path,
                glob: args.glob,
                ignoreCase: args.ignoreCase,
                cwd: projectPath
              })
              return result.success ? (result.output || '') : `Error: ${result.error}`
            }
            return 'Error: 内容搜索功能仅在 Electron 环境中可用'
          }
        })
        break

      case 'file-find':
        tools.push({
          name: 'find',
          description: '查找匹配名称的文件',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: '文件名匹配模式'
              },
              path: {
                type: 'string',
                description: '搜索路径，默认为当前目录'
              }
            },
            required: ['pattern']
          },
          execute: async (args: { pattern: string; path?: string }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'find',
                pattern: args.pattern,
                path: args.path,
                cwd: projectPath
              })
              return result.success ? (result.output || '') : `Error: ${result.error}`
            }
            return 'Error: 文件查找功能仅在 Electron 环境中可用'
          }
        })
        break

      case 'bash-execute':
        tools.push({
          name: 'bash',
          description: '执行终端命令（在安全沙箱中）',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: '要执行的命令'
              },
              timeout: {
                type: 'number',
                description: '超时时间（毫秒）'
              }
            },
            required: ['command']
          },
          execute: async (args: { command: string; timeout?: number }) => {
            if (isElectron() && window.electronAPI?.executeAgenticTool) {
              const result = await window.electronAPI.executeAgenticTool({
                type: 'bash',
                command: args.command,
                timeout: args.timeout,
                cwd: projectPath
              })
              return result.success ? (result.output || '') : `Error: ${result.error}`
            }
            return 'Error: 终端执行功能仅在 Electron 环境中可用'
          }
        })
        break
    }
  }

  return tools
}

/**
 * 创建工具定义（用于 LLM function calling）
 */
export const createToolDefinitionsForLLM = (config: AgenticConfig) => {
  const definitions: Array<{
    type: 'function'
    function: {
      name: string
      description: string
      parameters: Record<string, unknown>
    }
  }> = []

  const enabledTools = config.tools.filter(t => t.enabled)

  for (const tool of enabledTools) {
    switch (tool.type) {
      case 'file-read':
        definitions.push({
          type: 'function',
          function: {
            name: 'read',
            description: '读取指定路径的文件内容，支持 offset 和 limit 参数分段读取大文件',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '文件的相对路径或绝对路径'
                },
                offset: {
                  type: 'number',
                  description: '开始读取的行号（可选）'
                },
                limit: {
                  type: 'number',
                  description: '读取的行数限制（可选）'
                }
              },
              required: ['path']
            }
          }
        })
        break

      case 'file-write':
        definitions.push({
          type: 'function',
          function: {
            name: 'write',
            description: '将内容写入指定路径的文件，会自动创建不存在的目录',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '文件的相对路径或绝对路径'
                },
                content: {
                  type: 'string',
                  description: '要写入的文件内容'
                }
              },
              required: ['path', 'content']
            }
          }
        })
        break

      case 'file-edit':
        definitions.push({
          type: 'function',
          function: {
            name: 'edit',
            description: '编辑文件中的文本，查找 oldText 并替换为 newText',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '文件的相对路径或绝对路径'
                },
                oldText: {
                  type: 'string',
                  description: '要查找的文本'
                },
                newText: {
                  type: 'string',
                  description: '替换后的文本'
                }
              },
              required: ['path', 'oldText', 'newText']
            }
          }
        })
        break

      case 'file-ls':
        definitions.push({
          type: 'function',
          function: {
            name: 'ls',
            description: '列出指定目录中的文件和子目录',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: '目录路径，默认为当前目录'
                }
              }
            }
          }
        })
        break

      case 'file-grep':
        definitions.push({
          type: 'function',
          function: {
            name: 'grep',
            description: '在文件中搜索匹配的文本内容（支持正则表达式）',
            parameters: {
              type: 'object',
              properties: {
                pattern: {
                  type: 'string',
                  description: '搜索的正则表达式模式'
                },
                path: {
                  type: 'string',
                  description: '搜索路径，默认为当前目录'
                },
                glob: {
                  type: 'string',
                  description: '文件匹配模式（如 *.ts）'
                },
                ignoreCase: {
                  type: 'boolean',
                  description: '是否忽略大小写'
                }
              },
              required: ['pattern']
            }
          }
        })
        break

      case 'file-find':
        definitions.push({
          type: 'function',
          function: {
            name: 'find',
            description: '查找匹配名称模式的文件',
            parameters: {
              type: 'object',
              properties: {
                pattern: {
                  type: 'string',
                  description: '文件名匹配模式（支持 glob 模式）'
                },
                path: {
                  type: 'string',
                  description: '搜索路径，默认为当前目录'
                }
              },
              required: ['pattern']
            }
          }
        })
        break

      case 'bash-execute':
        definitions.push({
          type: 'function',
          function: {
            name: 'bash',
            description: '在终端中执行命令（如 ls、mkdir、rm 等）',
            parameters: {
              type: 'object',
              properties: {
                command: {
                  type: 'string',
                  description: '要执行的终端命令'
                },
                timeout: {
                  type: 'number',
                  description: '命令超时时间（毫秒），默认 60000'
                }
              },
              required: ['command']
            }
          }
        })
        break
    }
  }

  return definitions
}

// 执行 Agentic 任务
export const executeAgenticTask = async (
  config: AgenticConfig,
  task: string,
  contextInfo?: string,
  _projectPath?: string // 保留参数用于未来扩展
): Promise<AgenticExecutionResult> => {
  const availability = await isAgenticAvailable(config)
  if (!availability.available) {
    return {
      success: false,
      result: '',
      toolCalls: [],
      error: availability.reason || 'Agentic 不可用'
    }
  }

  const provider = await getAgenticLLMProvider(config)
  if (!provider) {
    return {
      success: false,
      result: '',
      toolCalls: [],
      error: '无法获取 LLM 提供商'
    }
  }

  // 获取要使用的模型
  const modelId = getModelId(config, provider)

  try {
    // 构建系统提示词
    const enabledTools = config.tools.filter(t => t.enabled)
    const toolsDescription = enabledTools.map(t =>
      `- ${toolLabels[t.type]}: ${t.description}`
    ).join('\n')

    const systemPrompt = `你是一个 AI Agent，可以使用以下工具来完成任务：
${toolsDescription}

任务：${task}

${contextInfo ? `上下文信息：\n${contextInfo}` : ''}

请分析任务，思考需要使用哪些工具，然后直接回答。如果需要使用工具，请说明你会如何使用它们。`

    // Electron 环境：使用主进程发送请求
    if (isElectron() && window.electronAPI?.callLLMApi) {
      const result = await window.electronAPI.callLLMApi(
        provider,
        systemPrompt,
        modelId
      )

      if (result.success) {
        return {
          success: true,
          result: result.content || '',
          toolCalls: []
        }
      } else {
        return {
          success: false,
          result: '',
          toolCalls: [],
          error: result.error || 'LLM 调用失败'
        }
      }
    }

    // 浏览器环境暂不支持
    return {
      success: false,
      result: '',
      toolCalls: [],
      error: 'Agentic 功能仅在 Electron 环境中可用'
    }

  } catch (error) {
    return {
      success: false,
      result: '',
      toolCalls: [],
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

// 获取 Agentic 状态摘要
export const getAgenticStatus = async (
  config: AgenticConfig
): Promise<{
  enabled: boolean
  available: boolean
  providerName?: string
  modelId?: string
  enabledToolsCount: number
  message: string
}> => {
  if (!config.enabled) {
    return {
      enabled: false,
      available: false,
      enabledToolsCount: 0,
      message: 'Agentic 模式已禁用'
    }
  }

  const availability = await isAgenticAvailable(config)
  const enabledToolsCount = config.tools.filter(t => t.enabled).length

  if (!availability.available) {
    return {
      enabled: true,
      available: false,
      enabledToolsCount,
      message: availability.reason || 'Agentic 暂不可用'
    }
  }

  const provider = await getAgenticLLMProvider(config)
  const modelId = provider ? getModelId(config, provider) : undefined

  return {
    enabled: true,
    available: true,
    providerName: provider?.name,
    modelId,
    enabledToolsCount,
    message: `使用 ${provider?.name} (${modelId}) 驱动，已启用 ${enabledToolsCount} 个工具`
  }
}