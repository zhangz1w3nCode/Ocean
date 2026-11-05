import { create } from 'zustand'
import type { TaskSummary, TaskDetail, CreateTaskPayload, UpdateTaskPayload } from '../types'
import { useProjectStore } from './projectStore'

// 任务域 renderer Node 直连：不经过 preload IPC，也不走 HTTP。
// 链路：store → (window).require(dist/source/desktop/task.js) → core 统一契约。
// （electron/source/desktop/task.ts 编译产物，core 内联为单文件）。

// 桌面模块的扁平结果视图（与旧 electronAPI 声明同构，适配层实际返回判别联合，
// 结构上可赋值给此形态）：store 内沿用可选字段消费方式，不改条件逻辑。
type DesktopModule = {
  listTasks: (root: string) => Promise<{ success: boolean; tasks?: TaskSummary[]; error?: string }>
  readTaskDetail: (root: string, taskName: string) => Promise<{ success: boolean; detail?: TaskDetail; error?: string }>
  createTask: (root: string, payload: CreateTaskPayload) => Promise<{ success: boolean; task?: TaskSummary; error?: string }>
  updateTask: (root: string, payload: UpdateTaskPayload) => Promise<{ success: boolean; task?: TaskSummary; error?: string }>
  saveTaskContext: (root: string, payload: { taskName: string; contextName: string; content: string }) => Promise<{ success: boolean; isUpdate?: boolean; error?: string }>
}

const MODULE_RELATIVE = ['electron', 'dist', 'source', 'desktop', 'task.js'].join('/')

let moduleCache: DesktopModule | null = null

// 产物路径探测：dev 为启动 cwd（项目根），生产为 asar 内 resourcesPath
function resolveCandidates(): string[] {
  const candidates: string[] = []
  try {
    const w = window as unknown as { process?: { cwd?: () => string; resourcesPath?: string } }
    const proc = w.process
    if (proc?.cwd) candidates.push(`${proc.cwd()}/${MODULE_RELATIVE}`)
    if (proc?.resourcesPath) {
      candidates.push(`${proc.resourcesPath}/app.asar/${MODULE_RELATIVE}`)
      candidates.push(`${proc.resourcesPath}/${MODULE_RELATIVE}`)
    }
  } catch {
    // 非 Node 环境由各 action 的空模块分支兑底
  }
  return candidates
}

function loadDesktopModule(): DesktopModule | null {
  if (moduleCache) return moduleCache
  try {
    const w = window as unknown as { require?: NodeRequire }
    const req = w.require
    if (typeof req !== 'function') return null
    for (const candidate of resolveCandidates()) {
      let exists = false
      try {
        exists = req('fs').existsSync(candidate)
      } catch {
        exists = false
      }
      if (exists) {
        moduleCache = req(candidate) as DesktopModule
        return moduleCache
      }
    }
  } catch {
    return null
  }
  return null
}

// 项目根从 projectStore 读取；未选择项目时返回空串交由适配层拦截
function projectRoot(): string {
  return useProjectStore.getState().currentProject?.path || ''
}

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
    const m = loadDesktopModule()
    if (!m) {
      set({ isLoaded: true })
      return
    }
    try {
      const result = await m.listTasks(projectRoot())
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
    const m = loadDesktopModule()
    if (!m) return
    if (!get().detail) set({ isLoadingDetail: true })
    try {
      const result = await m.readTaskDetail(projectRoot(), task.name)
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
    const m = loadDesktopModule()
    if (!m) return false
    try {
      const result = await m.createTask(projectRoot(), payload)
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
    const m = loadDesktopModule()
    if (!m) return false
    try {
      const result = await m.updateTask(projectRoot(), payload)
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
    const m = loadDesktopModule()
    if (!m) return false
    try {
      const result = await m.saveTaskContext(projectRoot(), { taskName, contextName, content })
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
