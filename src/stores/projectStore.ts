import { create } from 'zustand'
import type { Project, AppConfig } from '../types'
import {
  loadAppConfig,
  saveAppConfig,
  openFolderDialog,
  initProjectDir,
  setProjectPath,
  isElectron,
} from '../utils/storage'

interface ProjectState {
  // 状态
  isProjectLoaded: boolean
  currentProject: Project | null
  recentProjects: Project[]
  isLoading: boolean
  loadingMessage: string
  appConfig: AppConfig | null // 保存完整的AppConfig

  // 方法
  loadAppConfigOnStart: () => Promise<boolean>
  selectProject: (project: Project) => Promise<void>
  openProjectFromFolder: () => Promise<Project | null>
  removeRecentProject: (projectId: string) => Promise<void>
  setCurrentProject: (project: Project | null) => void
  getAppConfig: () => AppConfig | null
}

// 生成项目 ID（路径 hash）
const generateProjectId = (path: string): string => {
  // 简单的 hash 函数
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    const char = path.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 16)
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  // 初始状态
  isProjectLoaded: false,
  currentProject: null,
  recentProjects: [],
  isLoading: false,
  loadingMessage: '',
  appConfig: null,

  // 获取当前AppConfig
  getAppConfig: () => get().appConfig,

  // 启动时加载应用配置
  loadAppConfigOnStart: async () => {
    set({ isLoading: true, loadingMessage: '加载配置...' })

    try {
      const config = await loadAppConfig()

      set({
        recentProjects: config.recentProjects,
        appConfig: config,
      })

      // 初始化侧边栏导航顺序
      const { initSidebarNavOrder } = await import('./appStore').then(m => m.useAppStore.getState())
      initSidebarNavOrder(config.sidebarNavOrder as any)

      // 如果有上次打开的项目，自动打开
      if (config.lastProjectPath) {
        const lastProject = config.recentProjects.find(
          p => p.path === config.lastProjectPath
        )

        if (lastProject) {
          set({ loadingMessage: '打开项目...' })
          await get().selectProject(lastProject)
          return true
        }
      }

      set({ isLoading: false, loadingMessage: '' })
      return false
    } catch (error) {
      console.error('加载应用配置失败:', error)
      set({ isLoading: false, loadingMessage: '' })
      return false
    }
  },

  // 选择项目
  selectProject: async (project: Project) => {
    set({ isLoading: true, loadingMessage: '打开项目...' })

    try {
      // 设置项目路径
      const result = await setProjectPath(project.path)
      if (!result.success) {
        throw new Error('设置项目路径失败')
      }

      // 更新项目信息
      const updatedProject: Project = {
        ...project,
        id: result.projectId || project.id,
        name: result.projectName || project.name,
        lastOpenedAt: new Date().toISOString(),
      }

      // 更新最近项目列表
      const { recentProjects, appConfig } = get()
      let updatedRecentProjects = recentProjects.filter(p => p.path !== project.path)
      updatedRecentProjects = [updatedProject, ...updatedRecentProjects].slice(0, 10)

      // 保存应用配置，保留sidebarNavOrder
      const config: AppConfig = {
        recentProjects: updatedRecentProjects,
        lastProjectPath: project.path,
        maxRecentProjects: 10,
        sidebarNavOrder: appConfig?.sidebarNavOrder,
      }
      await saveAppConfig(config)

      set({
        isProjectLoaded: true,
        currentProject: updatedProject,
        recentProjects: updatedRecentProjects,
        appConfig: config,
        isLoading: false,
        loadingMessage: '',
      })
    } catch (error) {
      console.error('选择项目失败:', error)
      set({ isLoading: false, loadingMessage: '' })
      throw error
    }
  },

  // 从文件夹打开项目
  openProjectFromFolder: async () => {
    if (!isElectron()) {
      console.warn('浏览器环境不支持打开文件夹')
      return null
    }

    try {
      // 打开文件夹选择对话框（不显示加载状态，让用户正常选择）
      const projectPath = await openFolderDialog()
      if (!projectPath) {
        // 用户取消了选择
        return null
      }

      // 用户选择了文件夹，开始初始化，显示加载状态
      set({ isLoading: true, loadingMessage: '初始化项目...' })

      // 初始化项目目录
      const result = await initProjectDir(projectPath)
      if (!result.success) {
        throw new Error('初始化项目目录失败')
      }

      // 创建项目对象
      const project: Project = {
        id: result.projectId || generateProjectId(projectPath),
        name: result.projectName || '',
        path: projectPath,
        lastOpenedAt: new Date().toISOString(),
      }

      // 选择该项目
      await get().selectProject(project)

      return project
    } catch (error) {
      console.error('打开项目失败:', error)
      set({ isLoading: false, loadingMessage: '' })
      throw error
    }
  },

  // 从最近列表移除项目
  removeRecentProject: async (projectId: string) => {
    const { recentProjects, appConfig } = get()
    const updatedRecentProjects = recentProjects.filter(p => p.id !== projectId)

    // 保存应用配置，保留sidebarNavOrder
    const config: AppConfig = {
      recentProjects: updatedRecentProjects,
      lastProjectPath: get().currentProject?.path || null,
      maxRecentProjects: 10,
      sidebarNavOrder: appConfig?.sidebarNavOrder,
    }
    await saveAppConfig(config)

    set({ recentProjects: updatedRecentProjects, appConfig: config })
  },

  // 设置当前项目（用于切换项目）
  setCurrentProject: (project: Project | null) => {
    set({
      currentProject: project,
      isProjectLoaded: !!project,
    })
  },
}))