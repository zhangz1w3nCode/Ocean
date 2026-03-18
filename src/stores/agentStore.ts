import { create } from 'zustand'
import type { AgentFile } from '../types'
import {
  saveAgentFilesToLocal,
  loadAgentFilesFromLocal,
  deleteAgentFileFromLocal,
} from '../utils/storage'

interface AgentState {
  agentFiles: AgentFile[]
  isLoaded: boolean
  setAgentFiles: (agents: AgentFile[]) => void
  addAgentFile: (agent: AgentFile) => void
  updateAgentFile: (id: string, updates: Partial<AgentFile>) => void
  deleteAgentFile: (id: string) => void
  loadAgentFiles: () => Promise<void>
}

export const useAgentStore = create<AgentState>((set) => ({
  agentFiles: [],
  isLoaded: false,

  setAgentFiles: (agentFiles) => {
    set({ agentFiles })
    // 自动保存到本地
    saveAgentFilesToLocal(agentFiles)
  },

  addAgentFile: (agent) =>
    set((state) => {
      const newAgents = [agent, ...state.agentFiles]
      // 异步保存到本地
      saveAgentFilesToLocal(newAgents)
      return { agentFiles: newAgents }
    }),

  updateAgentFile: (id, updates) =>
    set((state) => {
      const newAgents = state.agentFiles.map((agent) =>
        agent.id === id ? { ...agent, ...updates } : agent
      )
      // 异步保存到本地
      saveAgentFilesToLocal(newAgents)
      return { agentFiles: newAgents }
    }),

  deleteAgentFile: (id) =>
    set((state) => {
      const agentToDelete = state.agentFiles.find((agent) => agent.id === id)
      const newAgents = state.agentFiles.filter((agent) => agent.id !== id)
      // 异步删除文件并保存列表
      if (agentToDelete) {
        deleteAgentFileFromLocal(agentToDelete.name)
      }
      return { agentFiles: newAgents }
    }),

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