import { create } from 'zustand'
import { saveAppConfig } from '../utils/storage'
import type { AppConfig } from '../types'

export type PageType = 'project' | 'agents' | 'workflows' | 'nodes' | 'resources' | 'commands' | 'abilities' | 'knowledges' | 'settings'

// 默认导航顺序
const DEFAULT_NAV_ORDER: PageType[] = ['agents', 'commands', 'abilities', 'knowledges', 'workflows', 'nodes', 'resources', 'settings']

interface AppState {
  currentPage: PageType
  setCurrentPage: (page: PageType) => void
  // 编辑器路由状态
  isEditing: boolean
  editingWorkflowId: string | null
  startEditing: (workflowId?: string) => void
  stopEditing: () => void
  // 项目切换状态
  isSwitchingProject: boolean
  startSwitchingProject: () => void
  finishSwitchingProject: () => void
  // 侧边栏导航顺序
  sidebarNavOrder: PageType[]
  setSidebarNavOrder: (order: PageType[]) => void
  initSidebarNavOrder: (order: PageType[] | undefined) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  // 默认选中导航顺序的第一个页面
  currentPage: DEFAULT_NAV_ORDER[0],
  setCurrentPage: (page) => set({ currentPage: page }),
  isEditing: false,
  editingWorkflowId: null,
  startEditing: (workflowId) => set({ isEditing: true, editingWorkflowId: workflowId || null }),
  stopEditing: () => set({ isEditing: false, editingWorkflowId: null }),
  isSwitchingProject: false,
  startSwitchingProject: () => set({ isSwitchingProject: true }),
  // 切换项目后，选中导航顺序的第一个页面（而非固定的智能体页面）
  finishSwitchingProject: () => {
    const { sidebarNavOrder } = get()
    const firstPage = sidebarNavOrder[0] || DEFAULT_NAV_ORDER[0]
    set({ isSwitchingProject: false, currentPage: firstPage })
  },
  sidebarNavOrder: DEFAULT_NAV_ORDER,
  setSidebarNavOrder: async (order) => {
    set({ sidebarNavOrder: order })
    // 获取当前AppConfig并更新sidebarNavOrder
    const { useProjectStore } = await import('./projectStore')
    const currentConfig = useProjectStore.getState().getAppConfig()
    if (currentConfig) {
      const newConfig: AppConfig = {
        ...currentConfig,
        sidebarNavOrder: order,
      }
      const success = await saveAppConfig(newConfig)
      if (!success) {
        console.error('保存侧边栏导航顺序失败')
      }
      // 更新projectStore中的appConfig
      useProjectStore.setState({ appConfig: newConfig })
    }
  },
  initSidebarNavOrder: (order) => {
    if (order && order.length > 0) {
      // 检查是否有新的导航项需要添加
      const missingItems = DEFAULT_NAV_ORDER.filter(item => !order.includes(item))

      // 如果有缺失项,合并到用户保存的顺序中
      if (missingItems.length > 0) {
        const mergedOrder = [...order, ...missingItems]
        set({ sidebarNavOrder: mergedOrder, currentPage: order[0] })
      } else {
        // 初始化导航顺序时，同步更新当前页面为第一个导航项
        set({ sidebarNavOrder: order, currentPage: order[0] })
      }
    } else {
      set({ sidebarNavOrder: DEFAULT_NAV_ORDER, currentPage: DEFAULT_NAV_ORDER[0] })
    }
  },
}))