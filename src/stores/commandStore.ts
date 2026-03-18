import { create } from 'zustand'
import type { CommandFile } from '../types'
import {
  saveCommandFilesToLocal,
  loadCommandFilesFromLocal,
  deleteCommandFileFromLocal,
} from '../utils/storage'

interface CommandState {
  commandFiles: CommandFile[]
  isLoaded: boolean
  setCommandFiles: (commands: CommandFile[]) => void
  addCommandFile: (command: CommandFile) => void
  updateCommandFile: (id: string, updates: Partial<CommandFile>) => void
  deleteCommandFile: (id: string) => void
  loadCommandFiles: () => Promise<void>
}

export const useCommandStore = create<CommandState>((set) => ({
  commandFiles: [],
  isLoaded: false,

  setCommandFiles: (commandFiles) => {
    set({ commandFiles })
    // 自动保存到本地
    saveCommandFilesToLocal(commandFiles)
  },

  addCommandFile: (command) =>
    set((state) => {
      const newCommands = [command, ...state.commandFiles]
      // 异步保存到本地
      saveCommandFilesToLocal(newCommands)
      return { commandFiles: newCommands }
    }),

  updateCommandFile: (id, updates) =>
    set((state) => {
      const newCommands = state.commandFiles.map((command) =>
        command.id === id ? { ...command, ...updates } : command
      )
      // 异步保存到本地
      saveCommandFilesToLocal(newCommands)
      return { commandFiles: newCommands }
    }),

  deleteCommandFile: (id) =>
    set((state) => {
      const commandToDelete = state.commandFiles.find((command) => command.id === id)
      const newCommands = state.commandFiles.filter((command) => command.id !== id)
      // 异步删除文件并保存列表
      if (commandToDelete) {
        deleteCommandFileFromLocal(commandToDelete.name)
      }
      return { commandFiles: newCommands }
    }),

  loadCommandFiles: async () => {
    // 从本地加载
    const loadedCommands = await loadCommandFilesFromLocal()

    if (loadedCommands && loadedCommands.length > 0) {
      set({ commandFiles: loadedCommands, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ commandFiles: [], isLoaded: true })
    }
  },
}))