import { create } from 'zustand'
import type { CodebaseInfo, CreateCodebasePayload } from '../types'
import { useProjectStore } from './projectStore'

// 代码库 store：渲染进程经 Node 直连（nodeIntegration）调用桌面端适配模块
// （electron/source/desktop/codebases.ts 编译产物，core 内联为单文件）。
// 链路：store → (window).require(dist/source/desktop/codebases.js) → core 统一契约。
// 不经过 preload IPC，也不走 HTTP。

type DesktopModule = {
  listCodebases: (root: string) => Promise<CodebaseResultLike<{ codebases: CodebaseInfo[] }>>
  readCodebase: (root: string, name: string) => Promise<CodebaseResultLike<{ name: string; content: string }>>
  createCodebase: (root: string, name: string, opts: CreateCodebasePayload) => Promise<CodebaseResultLike<{ name: string }>>
  updateCodebase: (root: string, name: string, content: string) => Promise<CodebaseResultLike<{ name: string }>>
  deleteCodebase: (root: string, name: string) => Promise<CodebaseResultLike<{ name: string }>>
  searchCodebases: (root: string, keyword: string, opts?: { top?: number; context?: number }) => Promise<CodebaseResultLike<{ results: Array<{ name: string; matches: Array<{ line: number; text: string; before: string[]; after: string[] }> }> }>>
}

type CodebaseResultLike<T> = ({ success: true } & T) | { success: false; error: string }

const MODULE_RELATIVE = ['electron', 'dist', 'source', 'desktop', 'codebases.js'].join('/')

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
    // 非 Node 环境由 unavailable 兜底
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

function unavailable(action: string): { success: false; error: string } {
  return { success: false, error: `代码库模块不可用（${action}）：当前环境无渲染进程 Node 直连能力，请通过 Ocean 桌面端使用` }
}

// 项目根从 projectStore 读取；未选择项目时返回空串交由适配层拦截
function projectRoot(): string {
  return useProjectStore.getState().currentProject?.path || ''
}

interface CodebaseState {
  codebases: CodebaseInfo[]
  isLoaded: boolean
  isBusy: boolean
  loadCodebases: () => Promise<boolean>
  createCodebase: (name: string, payload: CreateCodebasePayload) => Promise<{ success: boolean; error?: string }>
  updateCodebaseReadme: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
  deleteCodebase: (name: string) => Promise<{ success: boolean; error?: string }>
  readCodebase: (name: string) => Promise<{ name: string; content: string } | null>
  searchCodebases: (keyword: string) => Promise<Array<{ name: string; matches: Array<{ line: number; text: string; before: string[]; after: string[] }> }> | null>
}

export const useCodebaseStore = create<CodebaseState>((set, get) => ({
  codebases: [],
  isLoaded: false,
  isBusy: false,

  loadCodebases: async () => {
    const m = loadDesktopModule()
    if (!m) {
      set({ codebases: [], isLoaded: true })
      return false
    }
    const r = await m.listCodebases(projectRoot())
    if (!r.success) {
      set({ codebases: [], isLoaded: true })
      return false
    }
    set({ codebases: r.codebases, isLoaded: true })
    return true
  },

  createCodebase: async (name, payload) => {
    const m = loadDesktopModule()
    if (!m) return unavailable('创建代码库')
    set({ isBusy: true })
    try {
      const r = await m.createCodebase(projectRoot(), name, payload)
      if (!r.success) return { success: false, error: r.error }
      await get().loadCodebases()
      return { success: true }
    } catch (e: any) {
      // 兕底：core 已收敛契约，此处防未知异常冒泡为 unhandled rejection
      console.error('createCodebase 异常:', e)
      return { success: false, error: e?.message || String(e) }
    } finally {
      set({ isBusy: false })
    }
  },

  updateCodebaseReadme: async (name, content) => {
    const m = loadDesktopModule()
    if (!m) return unavailable('更新代码库')
    try {
      const r = await m.updateCodebase(projectRoot(), name, content)
      if (!r.success) return { success: false, error: r.error }
      await get().loadCodebases()
      return { success: true }
    } catch (e: any) {
      console.error('updateCodebaseReadme 异常:', e)
      return { success: false, error: e?.message || String(e) }
    }
  },

  deleteCodebase: async (name) => {
    const m = loadDesktopModule()
    if (!m) return unavailable('删除代码库')
    try {
      const r = await m.deleteCodebase(projectRoot(), name)
      if (!r.success) return { success: false, error: r.error }
      set({ codebases: get().codebases.filter(c => c.name !== name) })
      return { success: true }
    } catch (e: any) {
      console.error('deleteCodebase 异常:', e)
      return { success: false, error: e?.message || String(e) }
    }
  },

  readCodebase: async (name) => {
    const m = loadDesktopModule()
    if (!m) return null
    const r = await m.readCodebase(projectRoot(), name)
    if (!r.success) return null
    return { name: r.name, content: r.content }
  },

  searchCodebases: async (keyword) => {
    const m = loadDesktopModule()
    if (!m) return null
    const r = await m.searchCodebases(projectRoot(), keyword)
    if (!r.success) return null
    return r.results
  },
}))
