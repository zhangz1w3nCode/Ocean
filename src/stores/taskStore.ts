import { create } from 'zustand'
import type { TaskSummary, TaskDetail, CreateTaskPayload, UpdateTaskPayload } from '../types'
import { isElectron } from '../utils/storage'

interface TaskState {
  tasks: TaskSummary[]
  isLoaded: boolean
  isLoadingDetail: boolean
  openTabs: TaskSummary[]
  activeTabId: string | null
  selectedTask: TaskSummary | null
  detail: TaskDetail | null
  // 列表筛选状态（入 store 持久化，AnimatePresence wait 会销毁组件局部 state）
  listSearchQuery: string
  listFilterStatus: string
  listSortOrder: 'desc' | 'asc'

  loadTasks: () => Promise<void>
  selectTask: (task: TaskSummary | null) => void
  loadTaskDetail: (task: TaskSummary) => Promise<void>
  refreshDetail: () => Promise<void>
  closeTab: (name: string) => void
  switchTab: (name: string) => void
  reorderTabs: (newOrder: TaskSummary[]) => void
  showList: () => void
  createTask: (payload: CreateTaskPayload) => Promise<boolean>
  updateTask: (payload: UpdateTaskPayload) => Promise<boolean>
  saveTaskContext: (taskName: string, contextName: string, content: string) => Promise<boolean>
  reset: () => void
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoaded: false,
  isLoadingDetail: false,
  openTabs: [],
  activeTabId: null,
  selectedTask: null,
  detail: null,
  listSearchQuery: '',
  listFilterStatus: '',
  listSortOrder: 'desc',

  loadTasks: async () => {
    if (!isElectron()) {
      set({ isLoaded: true })
      return
    }
    try {
      const result = await window.electronAPI!.listTasks()
      if (result.success) {
        set({ tasks: result.tasks || [], isLoaded: true })
      } else {
        console.error('加载任务列表失败:', result.error)
        set({ isLoaded: true })
      }
    } catch (error) {
      console.error('加载任务列表失败:', error)
      set({ isLoaded: true })
    }
  },

  selectTask: (task) => {
    if (!task) {
      get().showList()
      return
    }
    const { openTabs } = get()
    const exists = openTabs.find(t => t.name === task.name)
    const newTabs = exists ? openTabs : [...openTabs, task]
    set({ openTabs: newTabs, activeTabId: task.name, selectedTask: task, detail: null })
    get().loadTaskDetail(task)
  },

  loadTaskDetail: async (task) => {
    if (!isElectron()) return
    if (!get().detail) set({ isLoadingDetail: true })
    try {
      const result = await window.electronAPI!.readTaskDetail(task.name)
      if (result.success && result.detail) {
        set({ detail: result.detail, isLoadingDetail: false })
      } else {
        console.error('加载任务详情失败:', result.error)
        set({ isLoadingDetail: false })
      }
    } catch (error) {
      console.error('加载任务详情失败:', error)
      set({ isLoadingDetail: false })
    }
  },

  refreshDetail: async () => {
    const task = get().selectedTask
    if (!task) return
    await get().loadTaskDetail(task)
  },

  closeTab: (name) => {
    const { openTabs, activeTabId } = get()
    const newTabs = openTabs.filter(t => t.name !== name)
    if (activeTabId === name) {
      const closedIndex = openTabs.findIndex(t => t.name === name)
      const neighbor = newTabs[closedIndex] || newTabs[closedIndex - 1] || null
      if (neighbor) {
        set({ openTabs: newTabs, activeTabId: neighbor.name, selectedTask: neighbor, detail: null })
        get().loadTaskDetail(neighbor)
      } else {
        set({ openTabs: [], activeTabId: null, selectedTask: null, detail: null })
      }
    } else {
      set({ openTabs: newTabs })
    }
  },

  switchTab: (name) => {
    const { openTabs } = get()
    const tab = openTabs.find(t => t.name === name)
    if (!tab) return
    set({ activeTabId: name, selectedTask: tab, detail: null })
    get().loadTaskDetail(tab)
  },

  reorderTabs: (newOrder) => {
    set({ openTabs: newOrder })
  },

  showList: () => {
    set({ activeTabId: null, selectedTask: null, detail: null })
  },

  createTask: async (payload) => {
    if (!isElectron()) return false
    try {
      const result = await window.electronAPI!.createTask(payload)
      if (!result.success || !result.task) {
        console.error('创建任务失败:', result.error)
        return false
      }
      await get().loadTasks()
      // 创建成功后直接打开该任务详情 tab
      const created = get().tasks.find(t => t.name === result.task!.name)
      get().selectTask(created || result.task)
      return true
    } catch (error) {
      console.error('创建任务失败:', error)
      return false
    }
  },

  updateTask: async (payload) => {
    if (!isElectron()) return false
    try {
      const result = await window.electronAPI!.updateTask(payload)
      if (!result.success) {
        console.error('更新任务失败:', result.error)
        return false
      }
      await get().loadTasks()
      // 同步 tab 缓存中的摘要并刷新详情
      const { openTabs, activeTabId } = get()
      const updated = get().tasks.find(t => t.name === payload.name)
      if (updated) {
        set({
          openTabs: openTabs.map(t => (t.name === payload.name ? updated : t)),
          selectedTask: activeTabId === payload.name ? updated : get().selectedTask,
        })
        if (activeTabId === payload.name) {
          set({ detail: null })
          await get().loadTaskDetail(updated)
        }
      }
      return true
    } catch (error) {
      console.error('更新任务失败:', error)
      return false
    }
  },

  saveTaskContext: async (taskName, contextName, content) => {
    if (!isElectron()) return false
    try {
      const result = await window.electronAPI!.saveTaskContext({ taskName, contextName, content })
      if (!result.success) {
        console.error('保存任务上下文失败:', result.error)
        return false
      }
      await get().loadTasks()
      await get().refreshDetail()
      return true
    } catch (error) {
      console.error('保存任务上下文失败:', error)
      return false
    }
  },

  reset: () => {
    set({ tasks: [], isLoaded: false, openTabs: [], activeTabId: null, selectedTask: null, detail: null })
  },
}))
