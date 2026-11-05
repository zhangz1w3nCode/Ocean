import * as fs from 'node:fs'
import * as path from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

// 工作流导出包（.zip）格式：
//   manifest.json                         包元信息与节点清单
//   workflow/meta-data/flow.json          图定义
//   workflow/WORKFLOW.md                  设计文档（可选）
//   workflow/nodes/<name>.md              局部节点（对应 <wf>/nodes）
//   nodes/<name>.md                       全局节点（对应项目根 .nodes，仅含被引用的）
// 实例运行数据（instance/）不导出。

export const PACKAGE_FORMAT = 'ocean-workflow-package'
export const PACKAGE_VERSION = 1

const MANIFEST_ENTRY = 'manifest.json'
const WORKFLOW_PREFIX = 'workflow/'
const GLOBAL_NODES_PREFIX = 'nodes/'

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

export interface BuildPackageResult {
  buffer: Uint8Array
  manifest: PackageManifest
  warnings: string[]
}

export interface InspectPackageResult {
  manifest: PackageManifest
  /** 目标项目里是否已存在同名工作流（覆盖写入前需提示） */
  workflowExists: boolean
  /** 目标项目里已存在同名的全局节点（会被覆盖，影响引用它的其它工作流） */
  conflictingNodes: string[]
}

export interface ImportPackageResult {
  workflowName: string
  writtenFiles: string[]
  overwrittenWorkflow: boolean
  overwrittenNodes: string[]
}

export class WorkflowPackageError extends Error {}

function workflowDirOf(root: string, workflowName: string): string {
  return path.join(root, '.workflows', workflowName)
}

function assertSafeWorkflowName(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) throw new WorkflowPackageError('工作流名称为空，无法导出/导入')
  if (trimmed === '.' || trimmed === '..') throw new WorkflowPackageError(`非法工作流名称: ${trimmed}`)
  if (/[/\\]/.test(trimmed)) throw new WorkflowPackageError(`工作流名称不能包含路径分隔符: ${trimmed}`)
  if (trimmed.length > 100) throw new WorkflowPackageError('工作流名称过长（上限 100 字符）')
  return trimmed
}

/** 校验压缩包内条目名，防 zip-slip 与写越界 */
function assertSafeEntry(entry: string): string {
  const normalized = entry.replace(/\\/g, '/')
  if (normalized.startsWith('/')) throw new WorkflowPackageError(`压缩包条目为绝对路径: ${entry}`)
  if (/^[a-zA-Z]:/.test(normalized)) throw new WorkflowPackageError(`压缩包条目含盘符: ${entry}`)
  if (normalized.split('/').some((seg) => seg === '..')) {
    throw new WorkflowPackageError(`压缩包条目含上级目录: ${entry}`)
  }
  if (normalized !== MANIFEST_ENTRY && !normalized.startsWith(WORKFLOW_PREFIX) && !normalized.startsWith(GLOBAL_NODES_PREFIX)) {
    throw new WorkflowPackageError(`压缩包含未预期的条目: ${entry}`)
  }
  return normalized
}

function readJsonFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, 'utf-8')
  return JSON.parse(raw)
}

/** 从 flow.json 提取节点引用：全局节点指向 .nodes/，局部节点指向 .workflows/<wf>/nodes/ */
function collectNodeRefs(flow: any, workflowName: string): { refs: PackageNodeRef[]; warnings: string[] } {
  const refs: PackageNodeRef[] = []
  const warnings: string[] = []
  const seen = new Set<string>()
  const nodes = Array.isArray(flow?.nodes) ? flow.nodes : []

  for (const node of nodes) {
    const refPath = node?.data?.nodeRefPath
    if (typeof refPath !== 'string' || refPath.trim() === '') continue
    const normalized = refPath.replace(/\\/g, '/')
    const label = node?.data?.label ?? node?.id ?? '未命名节点'

    let type: 'global' | 'local'
    if (normalized.startsWith('.nodes/')) type = 'global'
    else if (normalized.startsWith(`.workflows/${workflowName}/nodes/`)) type = 'local'
    else {
      warnings.push(`节点引用不在支持的目录内，已跳过：${refPath}（节点「${label}」）`)
      continue
    }

    const name = normalized.slice(normalized.lastIndexOf('/') + 1)
    if (!name) {
      warnings.push(`节点引用缺少文件名：${refPath}（节点「${label}」）`)
      continue
    }
    const key = `${type}:${name}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({ name, type, refPath: normalized })
  }

  return { refs, warnings }
}

function localNodeFiles(workflowDir: string): string[] {
  const dir = path.join(workflowDir, 'nodes')
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name)
}

export function buildPackage(
  root: string,
  workflowName: string,
  opts: { appVersion?: string; now?: Date } = {},
): BuildPackageResult {
  const name = assertSafeWorkflowName(workflowName)
  const wfDir = workflowDirOf(root, name)
  const flowPath = path.join(wfDir, 'meta-data', 'flow.json')
  if (!fs.existsSync(flowPath)) {
    throw new WorkflowPackageError(`工作流不存在或未保存设计文件: ${name}`)
  }

  const flow = readJsonFile(flowPath)
  const { refs, warnings } = collectNodeRefs(flow, name)
  const files: Record<string, Uint8Array> = {}

  files[`${WORKFLOW_PREFIX}meta-data/flow.json`] = strToU8(JSON.stringify(flow, null, 2))

  const mdPath = path.join(wfDir, 'WORKFLOW.md')
  if (fs.existsSync(mdPath)) {
    files[`${WORKFLOW_PREFIX}WORKFLOW.md`] = strToU8(fs.readFileSync(mdPath, 'utf-8'))
  } else {
    warnings.push('工作流缺少 WORKFLOW.md，导入后需要重新生成设计文档')
  }

  const localNames = new Set(localNodeFiles(wfDir))
  for (const localName of localNames) {
    const src = path.join(wfDir, 'nodes', localName)
    files[`${WORKFLOW_PREFIX}nodes/${localName}`] = strToU8(fs.readFileSync(src, 'utf-8'))
  }

  const manifestNodes: PackageNodeRef[] = []
  const packedGlobal = new Set<string>()
  for (const ref of refs) {
    if (ref.type === 'local') {
      if (!localNames.has(ref.name)) {
        warnings.push(`局部节点文件缺失，已跳过：${ref.refPath}`)
        continue
      }
      manifestNodes.push(ref)
      continue
    }

    const src = path.join(root, ref.refPath)
    if (!fs.existsSync(src)) {
      warnings.push(`全局节点文件缺失，已跳过：${ref.refPath}`)
      continue
    }
    if (!packedGlobal.has(ref.name)) {
      files[`${GLOBAL_NODES_PREFIX}${ref.name}`] = strToU8(fs.readFileSync(src, 'utf-8'))
      packedGlobal.add(ref.name)
    }
    manifestNodes.push(ref)
  }

  // 未被 flow.json 引用但存在于 nodes/ 的局部节点也一并导出，避免遗漏
  for (const localName of localNames) {
    if (manifestNodes.some((r) => r.type === 'local' && r.name === localName)) continue
    manifestNodes.push({ name: localName, type: 'local', refPath: `.workflows/${name}/nodes/${localName}` })
  }

  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    workflowName: name,
    exportedAt: (opts.now ?? new Date()).toISOString(),
    ...(opts.appVersion ? { appVersion: opts.appVersion } : {}),
    nodes: manifestNodes,
    counts: {
      globalNodes: manifestNodes.filter((n) => n.type === 'global').length,
      localNodes: manifestNodes.filter((n) => n.type === 'local').length,
    },
  }
  files[MANIFEST_ENTRY] = strToU8(JSON.stringify(manifest, null, 2))

  const buffer = zipSync(files, { level: 6 })
  return { buffer, manifest, warnings }
}

export function inspectPackage(root: string, buffer: Uint8Array): InspectPackageResult {
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(buffer)
  } catch {
    throw new WorkflowPackageError('不是有效的 Ocean 工作流导出包：无法解压（文件不是 zip 或已损坏）')
  }
  const manifestRaw = entries[MANIFEST_ENTRY]
  if (!manifestRaw) {
    throw new WorkflowPackageError('不是有效的 Ocean 工作流导出包：缺少 manifest.json')
  }

  let manifest: PackageManifest
  try {
    manifest = JSON.parse(strFromU8(manifestRaw)) as PackageManifest
  } catch {
    throw new WorkflowPackageError('不是有效的 Ocean 工作流导出包：manifest.json 无法解析')
  }

  if (manifest?.format !== PACKAGE_FORMAT) {
    throw new WorkflowPackageError('不是有效的 Ocean 工作流导出包：格式标识不匹配')
  }
  if (typeof manifest.version !== 'number' || manifest.version > PACKAGE_VERSION) {
    throw new WorkflowPackageError(
      `导出包版本 ${String(manifest.version)} 高于当前支持的版本 ${PACKAGE_VERSION}，请升级 Ocean`,
    )
  }

  const workflowName = assertSafeWorkflowName(manifest.workflowName)
  for (const entry of Object.keys(entries)) assertSafeEntry(entry)

  if (!entries[`${WORKFLOW_PREFIX}meta-data/flow.json`]) {
    throw new WorkflowPackageError('不是有效的 Ocean 工作流导出包：缺少 workflow/meta-data/flow.json')
  }

  const globalNames = new Set<string>()
  for (const entry of Object.keys(entries)) {
    if (!entry.startsWith(GLOBAL_NODES_PREFIX)) continue
    const fileName = entry.slice(GLOBAL_NODES_PREFIX.length)
    if (fileName) globalNames.add(fileName)
  }

  const conflictingNodes = [...globalNames]
    .filter((fileName) => fs.existsSync(path.join(root, '.nodes', fileName)))
    .sort()

  return {
    manifest: { ...manifest, workflowName },
    workflowExists: fs.existsSync(workflowDirOf(root, workflowName)),
    conflictingNodes,
  }
}

export function importPackage(root: string, buffer: Uint8Array): ImportPackageResult {
  const inspection = inspectPackage(root, buffer)
  const workflowName = inspection.manifest.workflowName
  const entries = unzipSync(buffer)
  const wfDir = workflowDirOf(root, workflowName)
  const flowEntry = entries[`${WORKFLOW_PREFIX}meta-data/flow.json`]
  let flow: any
  try {
    flow = JSON.parse(strFromU8(flowEntry))
  } catch {
    throw new WorkflowPackageError('导出包内的 flow.json 无法解析')
  }
  // 包内的 name 可能与目录名不一致（历史重命名），导入时以 manifest 的工作流名为准
  flow.name = workflowName

  const writtenFiles: string[] = []
  const overwrittenNodes: string[] = []
  const overwrittenWorkflow = fs.existsSync(path.join(wfDir, 'meta-data', 'flow.json'))

  const writeFile = (filePath: string, content: string) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, 'utf-8')
    writtenFiles.push(path.relative(root, filePath).replace(/\\/g, '/'))
  }

  writeFile(path.join(wfDir, 'meta-data', 'flow.json'), JSON.stringify(flow, null, 2))

  const mdEntry = entries[`${WORKFLOW_PREFIX}WORKFLOW.md`]
  if (mdEntry) {
    writeFile(path.join(wfDir, 'WORKFLOW.md'), strFromU8(mdEntry))
  }

  for (const [entry, data] of Object.entries(entries)) {
    if (entry.startsWith(`${WORKFLOW_PREFIX}nodes/`)) {
      const fileName = entry.slice(`${WORKFLOW_PREFIX}nodes/`.length)
      if (!fileName) continue
      writeFile(path.join(wfDir, 'nodes', fileName), strFromU8(data))
      continue
    }
    if (entry.startsWith(GLOBAL_NODES_PREFIX)) {
      const fileName = entry.slice(GLOBAL_NODES_PREFIX.length)
      if (!fileName) continue
      if (fs.existsSync(path.join(root, '.nodes', fileName))) overwrittenNodes.push(fileName)
      writeFile(path.join(root, '.nodes', fileName), strFromU8(data))
    }
  }

  return { workflowName, writtenFiles, overwrittenWorkflow, overwrittenNodes: overwrittenNodes.sort() }
}