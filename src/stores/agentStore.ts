import { create } from 'zustand'
import type { AgentFile } from '../types'
import {
  saveAgentFilesToLocal,
  saveSingleAgentFileToLocal,
  loadSingleAgentFileFromLocal,
  loadAgentFilesFromLocal,
  deleteAgentFileFromLocal,
} from '../utils/storage'

interface AgentState {
  agentFiles: AgentFile[]
  isLoaded: boolean
  setAgentFiles: (agents: AgentFile[]) => void
  addAgentFile: (agent: AgentFile) => Promise<boolean>
  updateAgentFile: (id: string, updates: Partial<AgentFile>) => Promise<boolean>
  deleteAgentFile: (id: string) => Promise<boolean>
  loadAgentFiles: () => Promise<void>
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agentFiles: [],
  isLoaded: false,

  setAgentFiles: (agentFiles) => {
    set({ agentFiles })
    // 自动保存到本地
    saveAgentFilesToLocal(agentFiles)
  },

  addAgentFile: async (agent) => {
    const success = await saveSingleAgentFileToLocal(agent)
    if (success) {
      const diskAgent = await loadSingleAgentFileFromLocal(agent.name)
      if (diskAgent) {
        set({ agentFiles: [{ ...diskAgent, id: agent.id }, ...get().agentFiles] })
      } else {
        set({ agentFiles: [agent, ...get().agentFiles] })
      }
    }
    return success
  },

  updateAgentFile: async (id, updates) => {
    const agent = get().agentFiles.find(a => a.id === id)
    if (!agent) return false
    const updatedAgent = { ...agent, ...updates }
    const success = await saveSingleAgentFileToLocal(updatedAgent)
    if (success) {
      const diskAgent = await loadSingleAgentFileFromLocal(agent.name)
      if (diskAgent) {
        set({ agentFiles: get().agentFiles.map(a => a.id === id ? { ...diskAgent, id: a.id, createdAt: a.createdAt } : a) })
      } else {
        set({ agentFiles: get().agentFiles.map(a => a.id === id ? updatedAgent : a) })
      }
    }
    return success
  },

  deleteAgentFile: async (id) => {
    const agentToDelete = get().agentFiles.find((agent) => agent.id === id)
    if (!agentToDelete) return true
    const success = await deleteAgentFileFromLocal(agentToDelete.name)
    if (success) {
      set({ agentFiles: get().agentFiles.filter((agent) => agent.id !== id) })
    }
    return success
  },

  loadAgentFiles: async () => {
    // 从本地加载
    const loadedAgents = await loadAgentFilesFromLocal()

    if (loadedAgents && loadedAgents.length > 0) {
      set({ agentFiles: loadedAgents, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ agentFiles: [], isLoaded: true })
    }
  },
}))