import { create } from 'zustand'
import { LLMProvider, CLIAgent, SettingsCategory, AgenticConfig, AgenticToolType } from '../types'
import {
  loadLLMProvidersFromFile,
  addLLMProviderToFile,
  updateLLMProviderInFile,
  deleteLLMProviderFromFile,
  saveCLIAgents,
  loadCLIAgents,
  saveAgenticConfig,
  loadAgenticConfig,
  testLLMConnection,
  testExecutablePath,
  isElectron
} from '../utils/storage'

// 默认 Agentic 工具配置 - 使用 @mariozechner/pi-coding-agent 提供的工具
const defaultAgenticTools: { type: AgenticToolType; description: string }[] = [
  { type: 'file-read', description: '读取指定路径的文件内容，支持分段读取' },
  { type: 'file-write', description: '将内容写入指定路径的文件，自动创建目录' },
  { type: 'file-edit', description: '编辑文件中的文本，查找并替换' },
  { type: 'file-ls', description: '列出指定目录中的文件和子目录' },
  { type: 'file-grep', description: '在文件中搜索匹配的文本内容' },
  { type: 'file-find', description: '查找匹配名称的文件' },
  { type: 'bash-execute', description: '执行终端命令（如 ls、mkdir、rm 等）' }
]

interface SettingsState {
  // LLM 提供商
  llmProviders: LLMProvider[]
  addLLMProvider: (provider: LLMProvider) => void
  updateLLMProvider: (id: string, updates: Partial<LLMProvider>) => void
  deleteLLMProvider: (id: string) => void
  testLLMProvider: (id: string) => Promise<boolean>
  loadLLMProviders: () => Promise<void>

  // CLI Agent
  cliAgents: CLIAgent[]
  addCLIAgent: (agent: CLIAgent) => void
  updateCLIAgent: (id: string, updates: Partial<CLIAgent>) => void
  deleteCLIAgent: (id: string) => void
  setDefaultCLIAgent: (id: string) => void
  testCLIAgent: (id: string) => Promise<boolean>
  loadCLIAgents: () => Promise<void>

  // Agentic 配置
  agenticConfig: AgenticConfig
  updateAgenticConfig: (config: Partial<AgenticConfig>) => void
  loadAgenticConfig: () => Promise<void>
  toggleAgenticEnabled: (enabled: boolean) => void
  toggleAgenticTool: (toolType: AgenticToolType, enabled: boolean) => void

  // 当前选中的设置分类
  currentCategory: SettingsCategory
  setCurrentCategory: (category: SettingsCategory) => void

  // 数据加载状态
  isLoaded: boolean
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // LLM 提供商
  llmProviders: [],
  isLoaded: false,

  addLLMProvider: (provider) => {
    set((state) => {
      const newProviders = [provider, ...state.llmProviders]
      // 添加到配置文件
      addLLMProviderToFile(provider)
      return { llmProviders: newProviders }
    })
  },

  updateLLMProvider: async (id, updates) => {
    const state = get()

    // 如果更新的是启用状态且要设置为 true，则需要互斥处理
    if (updates.isEnabled === true) {
      // 更新当前提供商并禁用所有其他提供商
      const newProviders = state.llmProviders.map((p) =>
        p.id === id
          ? { ...p, ...updates, updatedAt: new Date().toISOString() }
          : { ...p, isEnabled: false }
      )

      // 一次性保存所有更改到文件（包括当前和其他提供商）
      if (isElectron() && window.electronAPI?.saveLLMConfig) {
        await window.electronAPI.saveLLMConfig({ providers: newProviders })
      }

      set({ llmProviders: newProviders })
    } else {
      // 正常更新
      const newProviders = state.llmProviders.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      )

      // 保存到文件
      await updateLLMProviderInFile(id, updates)

      set({ llmProviders: newProviders })
    }
  },

  deleteLLMProvider: (id) => {
    set((state) => {
      const newProviders = state.llmProviders.filter((p) => p.id !== id)
      // 从配置文件删除单个提供商
      deleteLLMProviderFromFile(id)
      return { llmProviders: newProviders }
    })
  },

  testLLMProvider: async (id) => {
    const provider = get().llmProviders.find((p) => p.id === id)
    if (!provider) return false

    // 设置测试中状态
    set((state) => ({
      llmProviders: state.llmProviders.map((p) =>
        p.id === id ? { ...p, testStatus: 'testing' } : p
      )
    }))

    try {
      const success = await testLLMConnection(provider)
      const now = new Date().toISOString()
      const testStatus: 'success' | 'failed' = success ? 'success' : 'failed'

      set((state) => {
        const newProviders = state.llmProviders.map((p) =>
          p.id === id
            ? {
                ...p,
                testStatus,
                lastTestedAt: now
              }
            : p
        )
        // 更新配置文件中的单个提供商
        updateLLMProviderInFile(id, {
          testStatus,
          lastTestedAt: now
        })
        return { llmProviders: newProviders }
      })

      return success
    } catch (error) {
      set((state) => {
        const now = new Date().toISOString()
        const newProviders = state.llmProviders.map((p) =>
          p.id === id
            ? {
                ...p,
                testStatus: 'failed' as const,
                lastTestedAt: now
              }
            : p
        )
        updateLLMProviderInFile(id, { testStatus: 'failed' as const, lastTestedAt: now })
        return { llmProviders: newProviders }
      })
      return false
    }
  },

  loadLLMProviders: async () => {
    const providers = await loadLLMProvidersFromFile()
    set({ llmProviders: providers, isLoaded: true })
  },

  // CLI Agent
  cliAgents: [],

  addCLIAgent: (agent) => {
    set((state) => {
      const newAgents = [agent, ...state.cliAgents]
      saveCLIAgents(newAgents)
      return { cliAgents: newAgents }
    })
  },

  updateCLIAgent: (id, updates) => {
    set((state) => {
      const newAgents = state.cliAgents.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a
      )
      saveCLIAgents(newAgents)
      return { cliAgents: newAgents }
    })
  },

  deleteCLIAgent: (id) => {
    set((state) => {
      const newAgents = state.cliAgents.filter((a) => a.id !== id)
      saveCLIAgents(newAgents)
      return { cliAgents: newAgents }
    })
  },

  setDefaultCLIAgent: (id) => {
    set((state) => {
      const newAgents = state.cliAgents.map((a) => ({
        ...a,
        isDefault: a.id === id ? true : false
      }))
      saveCLIAgents(newAgents)
      return { cliAgents: newAgents }
    })
  },

  testCLIAgent: async (id) => {
    const agent = get().cliAgents.find((a) => a.id === id)
    if (!agent) return false

    // 设置测试中状态
    set((state) => ({
      cliAgents: state.cliAgents.map((a) =>
        a.id === id ? { ...a, testStatus: 'testing' } : a
      )
    }))

    try {
      const success = await testExecutablePath(agent.executablePath)
      const now = new Date().toISOString()

      set((state) => {
        const testStatus: 'success' | 'failed' = success ? 'success' : 'failed'
        const newAgents = state.cliAgents.map((a) =>
          a.id === id
            ? {
                ...a,
                testStatus,
                lastTestedAt: now
              }
            : a
        )
        saveCLIAgents(newAgents)
        return { cliAgents: newAgents }
      })

      return success
    } catch (error) {
      set((state) => {
        const newAgents = state.cliAgents.map((a) =>
          a.id === id
            ? {
                ...a,
                testStatus: 'failed' as const,
                lastTestedAt: new Date().toISOString()
              }
            : a
        )
        saveCLIAgents(newAgents)
        return { cliAgents: newAgents }
      })
      return false
    }
  },

  loadCLIAgents: async () => {
    const agents = await loadCLIAgents()
    set({ cliAgents: agents })
  },

  // Agentic 配置
  agenticConfig: {
    enabled: false,
    providerId: undefined,
    modelId: undefined,
    tools: defaultAgenticTools.map(t => ({ type: t.type, enabled: true, description: t.description })),
    maxIterations: 10,
    timeout: 60,
    updatedAt: new Date().toISOString()
  },

  updateAgenticConfig: (config) => {
    set((state) => {
      const newConfig = {
        ...state.agenticConfig,
        ...config,
        updatedAt: new Date().toISOString()
      }
      saveAgenticConfig(newConfig)
      return { agenticConfig: newConfig }
    })
  },

  loadAgenticConfig: async () => {
    const config = await loadAgenticConfig()
    // 确保加载的配置包含所有默认工具
    const loadedTools = config.tools || []
    const mergedTools = defaultAgenticTools.map(defaultTool => {
      const loadedTool = loadedTools.find(t => t.type === defaultTool.type)
      return loadedTool || { type: defaultTool.type, enabled: true, description: defaultTool.description }
    })
    set({
      agenticConfig: {
        ...config,
        tools: mergedTools
      }
    })
  },

  toggleAgenticEnabled: (enabled) => {
    set((state) => {
      const newConfig = {
        ...state.agenticConfig,
        enabled,
        updatedAt: new Date().toISOString()
      }
      saveAgenticConfig(newConfig)
      return { agenticConfig: newConfig }
    })
  },

  toggleAgenticTool: (toolType, enabled) => {
    set((state) => {
      const newTools = state.agenticConfig.tools.map(tool =>
        tool.type === toolType ? { ...tool, enabled } : tool
      )
      const newConfig = {
        ...state.agenticConfig,
        tools: newTools,
        updatedAt: new Date().toISOString()
      }
      saveAgenticConfig(newConfig)
      return { agenticConfig: newConfig }
    })
  },

  // 当前选中的设置分类
  currentCategory: 'llm',
  setCurrentCategory: (category) => {
    set({ currentCategory: category })
  }
}))