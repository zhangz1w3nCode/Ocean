// 工作流导入/导出的桌面端桥接：渲染进程通过 window.require 直连编译产物
// （electron/dist/source/desktop/workflowPackage.js），与 taskStore/codebaseStore 同一套路。
// 网页端没有 Node 能力，返回 null，由调用方提示"仅桌面端支持"。

// 与 electron/core/workflow-package.ts 的 PackageManifest 保持结构一致（跨构建边界，不直接 import）
export interface PackageNodeRef {
  name: string
  type: 'global' | 'local'
  refPath: string
}

export interface PackageManifest {
  format: string
  version: number
  workflowName: string
  exportedAt: string
  appVersion?: string
  nodes: PackageNodeRef[]
  counts: { globalNodes: number; localNodes: number }
}

export interface SavePackageResult {
  success: boolean
  path?: string
  workflowName?: string
  counts?: { globalNodes: number; localNodes: number }
  warnings?: string[]
  error?: string
}

export interface InspectPackageView {
  success: boolean
  path?: string
  manifest?: PackageManifest
  workflowExists?: boolean
  conflictingNodes?: string[]
  error?: string
}

export interface ImportPackageView {
  success: boolean
  workflowName?: string
  writtenFiles?: string[]
  overwrittenWorkflow?: boolean
  overwrittenNodes?: string[]
  error?: string
}

type WorkflowPackageModule = {
  saveWorkflowPackage: (root: string, workflowName: string, targetPath: string, appVersion?: string) => SavePackageResult
  inspectWorkflowPackage: (root: string, packagePath: string) => InspectPackageView
  importWorkflowPackage: (root: string, packagePath: string) => ImportPackageView
}

const MODULE_RELATIVE = ['electron', 'dist', 'source', 'desktop', 'workflowPackage.js'].join('/')

let moduleCache: WorkflowPackageModule | null | undefined

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
    // 非 Node 环境：返回空，由调用方兜底
  }
  return candidates
}

export function loadWorkflowPackageModule(): WorkflowPackageModule | null {
  if (moduleCache !== undefined) return moduleCache
  try {
    const w = window as unknown as { require?: NodeRequire }
    const req = w.require
    if (typeof req !== 'function') {
      moduleCache = null
      return null
    }
    for (const candidate of resolveCandidates()) {
      let exists = false
      try {
        exists = req('fs').existsSync(candidate)
      } catch {
        exists = false
      }
      if (exists) {
        moduleCache = req(candidate) as WorkflowPackageModule
        return moduleCache
      }
    }
  } catch {
    // 忽略，落到不支持分支
  }
  moduleCache = null
  return null
}

export const isWorkflowPackageSupported = (): boolean => loadWorkflowPackageModule() !== null