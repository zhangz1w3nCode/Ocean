import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  buildPackage,
  importPackage,
  inspectPackage,
  WorkflowPackageError,
  type PackageManifest,
} from '../../core/workflow-package'

// 桌面端工作流导入/导出门面：负责读写磁盘上的 .zip，
// 打包/校验/落盘逻辑全部复用 core/workflow-package。
// 渲染进程通过 window.require(dist/source/desktop/workflowPackage.js) 直连本模块。

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

function ensureZipSuffix(filePath: string): string {
  return filePath.toLowerCase().endsWith('.zip') ? filePath : `${filePath}.zip`
}

function errorMessage(error: unknown): string {
  if (error instanceof WorkflowPackageError) return error.message
  if (error instanceof Error) return error.message
  return String(error)
}

/** 打包并写入 targetPath；目标目录不存在时直接报错（由用户通过保存对话框选择） */
export function saveWorkflowPackage(
  root: string,
  workflowName: string,
  targetPath: string,
  appVersion?: string,
): SavePackageResult {
  try {
    if (!root) return { success: false, error: '未选择项目目录' }
    if (!targetPath) return { success: false, error: '未指定导出路径' }

    const finalPath = ensureZipSuffix(targetPath)
    const { buffer, manifest, warnings } = buildPackage(root, workflowName, { appVersion })
    fs.mkdirSync(path.dirname(finalPath), { recursive: true })
    fs.writeFileSync(finalPath, Buffer.from(buffer))

    return {
      success: true,
      path: finalPath,
      workflowName: manifest.workflowName,
      counts: manifest.counts,
      warnings,
    }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

/** 只读解析：返回清单与冲突信息，不写任何文件（供导入前确认） */
export function inspectWorkflowPackage(root: string, packagePath: string): InspectPackageView {
  try {
    if (!root) return { success: false, error: '未选择项目目录' }
    if (!fs.existsSync(packagePath)) return { success: false, error: `文件不存在: ${packagePath}` }

    const buffer = fs.readFileSync(packagePath)
    const result = inspectPackage(root, buffer)
    return {
      success: true,
      path: packagePath,
      manifest: result.manifest,
      workflowExists: result.workflowExists,
      conflictingNodes: result.conflictingNodes,
    }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}

/** 覆盖写入导入 */
export function importWorkflowPackage(root: string, packagePath: string): ImportPackageView {
  try {
    if (!root) return { success: false, error: '未选择项目目录' }
    if (!fs.existsSync(packagePath)) return { success: false, error: `文件不存在: ${packagePath}` }

    const buffer = fs.readFileSync(packagePath)
    const result = importPackage(root, buffer)
    return {
      success: true,
      workflowName: result.workflowName,
      writtenFiles: result.writtenFiles,
      overwrittenWorkflow: result.overwrittenWorkflow,
      overwrittenNodes: result.overwrittenNodes,
    }
  } catch (error) {
    return { success: false, error: errorMessage(error) }
  }
}