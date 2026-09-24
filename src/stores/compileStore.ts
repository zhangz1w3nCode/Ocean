import { create } from 'zustand'
import type { KnowledgeCompileTask, KnowledgeCompileSummary, KnowledgeCompileEvent } from '../utils/storage'
import { isElectron, resolveKnowledgeGitProvider } from '../utils/storage'

interface CompileState {
  tasks: KnowledgeCompileTask[]
  summary: KnowledgeCompileSummary | null
  paused: boolean
  // 详情多 tab（参考 workflowInstanceStore 模式）：列表态 activeDetailId=null，点行打开任务 tab
  openDetailIds: string[]
  activeDetailId: string | null
  listening: boolean
  refresh: () => Promise<void>
  startListening: () => () => void
  handleEvent: (event: KnowledgeCompileEvent) => void
  openDetail: (taskId: string) => void
  closeDetail: (taskId: string) => void
  showList: () => void
  enqueue: (names: string[]) => Promise<{ success: boolean; error?: string }>
  retry: (taskId: string) => Promise<void>
  cancel: (taskId: string) => Promise<void>
  pause: () => Promise<void>
  resume: () => Promise<void>
  clearFinished: () => Promise<void>
}

const upsertTask = (list: KnowledgeCompileTask[], task: KnowledgeCompileTask) => {
  const idx = list.findIndex((t) => t.id === task.id)
  if (idx === -1) return [...list, task]
  const next = [...list]
  next[idx] = { ...next[idx], ...task }
  return next
}

export const useCompileStore = create<CompileState>((set, get) => ({
  tasks: [],
  summary: null,
  paused: false,
  openDetailIds: [],
  activeDetailId: null,
  listening: false,

  refresh: async () => {
    if (!isElectron() || !window.electronAPI?.listCompileTasks) return
    const result = await window.electronAPI.listCompileTasks()
    if (result.success) {
      set({
        tasks: (result.tasks || []) as KnowledgeCompileTask[],
        summary: result.summary || null,
        paused: Boolean(result.summary?.paused),
      })
    }
  },

  startListening: () => {
    if (!isElectron() || !window.electronAPI?.onKnowledgeCompileEvent) return () => {}
    const unsubscribe = window.electronAPI.onKnowledgeCompileEvent((event) => get().handleEvent(event))
    set({ listening: true })
    return unsubscribe
  },

  handleEvent: (event) => {
    if (event.type === 'task-updated' && event.task) {
      set((state) => ({ tasks: upsertTask(state.tasks, event.task!) }))
    } else if (event.type === 'progress' && event.taskId) {
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === event.taskId ? { ...t, phase: event.phase, detail: event.detail, status: 'processing' } : t,
        ),
      }))
    } else if (event.type === 'queue-paused') {
      set({ paused: true })
    } else if (event.type === 'queue-resumed') {
      set({ paused: false })
    }
    void get().refresh()
  },

  openDetail: (taskId) => {
    set((state) => ({
      openDetailIds: state.openDetailIds.includes(taskId) ? state.openDetailIds : [...state.openDetailIds, taskId],
      activeDetailId: taskId,
    }))
  },

  closeDetail: (taskId) => {
    set((state) => {
      const openDetailIds = state.openDetailIds.filter((id) => id !== taskId)
      const activeDetailId = state.activeDetailId === taskId ? null : state.activeDetailId
      return { openDetailIds, activeDetailId }
    })
  },

  showList: () => set({ activeDetailId: null }),

  enqueue: async (names) => {
    if (!isElectron() || !window.electronAPI?.enqueueKnowledgeCompile) {
      return { success: false, error: '仅桌面端支持知识编译' }
    }
    if (names.length === 0) return { success: false, error: '未选择知识源' }
    const llm = await resolveKnowledgeGitProvider()
    if (!llm) return { success: false, error: '尚未配置 LLM 提供商（设置 → LLM 配置）' }
    const result = await window.electronAPI.enqueueKnowledgeCompile(names, { provider: llm.provider, model: llm.model })
    await get().refresh()
    return result.success ? { success: true } : { success: false, error: result.error }
  },

  retry: async (taskId) => {
    if (window.electronAPI?.retryCompileTask) await window.electronAPI.retryCompileTask(taskId)
    await get().refresh()
  },

  cancel: async (taskId) => {
    if (window.electronAPI?.cancelCompileTask) await window.electronAPI.cancelCompileTask(taskId)
    await get().refresh()
  },

  pause: async () => {
    if (window.electronAPI?.pauseCompileQueue) await window.electronAPI.pauseCompileQueue()
    set({ paused: true })
  },

  resume: async () => {
    if (window.electronAPI?.resumeCompileQueue) await window.electronAPI.resumeCompileQueue()
    set({ paused: false })
  },

  clearFinished: async () => {
    if (window.electronAPI?.clearCompileTasks) await window.electronAPI.clearCompileTasks()
    await get().refresh()
  },
}))
