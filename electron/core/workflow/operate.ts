// 工作流域统一实现 —— CLI（ocean workflow 图编辑）与桌面端/网页端（工作流文件/文件夹/实例 channel）
// 共用的唯一事实源。由 core/workflow.ts 迁移而来（CLI 图编辑 + 局部节点语义组）+ launch.cjs
// 工作流文件/实例内联实现（GUI 语义组），行为零变更：两组语义并存。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }。
// GUI 组：业务失败不抛异常；未预期的系统异常向上抛出，由 desktop 壳 catch 兜底
// （readInstanceDetail 例外——复刻原 buildInstanceDetail 的内部 catch 契约）。
// CLI 组：同样返回 { success } 契约，由 CLI 壳 unwrap 转异常（exit 1）。
//
// 实例推送（SSE 边界拍板，见迁移前 baseline.md）：watchInstanceDetail 是纯 fs watcher 工厂
// （fs.watch recursive + 150ms debounce + filename 路由增量重读 + 全量兜底），推送经 onDelta 回调；
// 调用方（desktop 壳）绑定 ctx.sendToRenderer('instance-detail-delta', delta)。
// 网页端 stub 环境推送链（webContents.send → pushEmitter → http.cjs SSE）实测可达。
//
// 数据位置（{root}/.workflows 跨资产来源共享，不随 assetRoot；GUI 组每 channel 经
// ensureWorkflowsDir 触发根目录创建，与原 getWorkflowsDir 副作用一致）：
//   {root}/.workflows/{name}.md                    旧版扁平工作流文件（save-workflow-file）
//   {root}/.workflows/{name}/WORKFLOW.md           工作流描述
//   {root}/.workflows/{name}/meta-data/flow.json   图数据
//   {root}/.workflows/{name}/nodes/{node}.md       局部节点
//   {root}/.workflows/{wf}/instance/{id}/          实例运行数据
//     status.json / trace/trace.jsonl / artifacts/{node}/{invoke}/[v*/]detail.md / context.md / instance.md

import * as fs from 'node:fs'
import * as path from 'node:path'
import dagre from '@dagrejs/dagre'
import { generateWorkflowMd } from '../workflow-md-generator'

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

// CLI addNode 的可选元信息（自 core/workflow.ts 原样迁移）
export interface WorkflowNodeAddOpts {
  nodeRefPath?: string
  content?: string
  condition?: string
  description?: string
}

// 实例详情推送 watcher 句柄（stop 关闭 fs.watch 并清 debounce 定时器）
export interface InstanceWatcherHandle {
  stop(): void
}

// 实例增量推送载荷（字段按变化文件路由，未变字段缺失；全量兜底时为完整 detail）
export type InstanceDetailDelta = Record<string, any>

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 内部辅助：路径 / flow.json IO
// ---------------------------------------------------------------------------

function workflowsDir(root: string): string {
  return path.join(root, '.workflows')
}

// GUI 原语义：launch.cjs getWorkflowsDir() 读取目录时同步创建（任何 channel 调用都触发该副作用）
function ensureWorkflowsDir(root: string): string {
  const dir = workflowsDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function workflowDir(root: string, name: string): string {
  return path.join(workflowsDir(root), name)
}

function flowJsonPath(root: string, name: string): string {
  return path.join(workflowDir(root, name), 'meta-data', 'flow.json')
}

function workflowMdPath(root: string, name: string): string {
  return path.join(workflowDir(root, name), 'WORKFLOW.md')
}

function localNodesDir(root: string, name: string): string {
  return path.join(workflowDir(root, name), 'nodes')
}

// CLI 原语义：flow.json 缺失即「工作流不存在」（自 core/workflow.ts 原样迁移）
function readFlowJson(root: string, name: string): any {
  const p = flowJsonPath(root, name)
  if (!fs.existsSync(p)) throw new Error(`工作流不存在: ${name}`)
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

function writeFlowJson(root: string, name: string, flow: any): void {
  const p = flowJsonPath(root, name)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(flow, null, 2), 'utf-8')
}

// ---------------------------------------------------------------------------
// 实例详情解析（read-instance-detail 与 subscribe 初始快照/全量兜底共用；watcher 增量共用）
// ---------------------------------------------------------------------------

function parseProcess(instDir: string): InstanceDetailDelta {
  let completedNodes: string[] = []
  let currentName = ''
  let wfStatus = 'unknown'
  let wfStep = 0, wfLoopCount = 0, wfRetryCount = 0
  const statusPath = path.join(instDir, 'status.json')
  if (fs.existsSync(statusPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(statusPath, 'utf-8'))
      if (s.status) wfStatus = s.status
      if (s.step != null) wfStep = s.step
      if (s.loop_count != null) wfLoopCount = s.loop_count
      if (s.retry_count != null) wfRetryCount = s.retry_count
      if (s.current_name) currentName = s.current_name
      if (Array.isArray(s.completed)) completedNodes = s.completed
    } catch (e: any) { console.error('status.json 解析失败:', e.message) }
  }
  return { completedNodes, currentName, wfStatus, wfStep, wfLoopCount, wfRetryCount }
}

function parseTrace(instDir: string): InstanceDetailDelta {
  let traceLog = ''
  const trace: any[] = []
  const tracePath = path.join(instDir, 'trace', 'trace.jsonl')
  if (fs.existsSync(tracePath)) {
    traceLog = fs.readFileSync(tracePath, 'utf-8')
    for (const line of traceLog.split('\n')) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line)
        if (!entry.node || !entry.invoke || !entry.status) continue
        const existing = trace.find(e => e.node === entry.node && e.invoke === entry.invoke)
        if (existing) {
          existing.status = entry.status
          if (entry.branch) existing.branch = entry.branch
          if (entry.status === 'completed') existing.completedTime = entry.ts
        } else {
          trace.push({ status: entry.status, node: entry.node, invoke: entry.invoke, branch: entry.branch || null, time: entry.ts, completedTime: null })
        }
      } catch (e) {}
    }
  }
  return { traceLog, trace }
}

function parseArtifacts(instDir: string): InstanceDetailDelta {
  const artifacts: any[] = []
  const artDir = path.join(instDir, 'artifacts')
  if (fs.existsSync(artDir)) {
    const nodeDirs = fs.readdirSync(artDir, { withFileTypes: true }).filter(d => d.isDirectory())
    for (const nd of nodeDirs) {
      const invokeDir = path.join(artDir, nd.name)
      const invokeDirs = fs.readdirSync(invokeDir, { withFileTypes: true }).filter(d => d.isDirectory())
      for (const id of invokeDirs) {
        const invokePath = path.join(invokeDir, id.name)
        const versionDirs = fs.readdirSync(invokePath, { withFileTypes: true })
          .filter(d => d.isDirectory() && /^v\d+$/.test(d.name))
          .map(d => d.name)
          .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))

        if (versionDirs.length > 0) {
          for (const ver of versionDirs) {
            const detailPath = path.join(invokePath, ver, 'detail.md')
            if (fs.existsSync(detailPath)) {
              const content = fs.readFileSync(detailPath, 'utf-8')
              const stat = fs.statSync(detailPath)
              artifacts.push({ nodeName: nd.name, invokeId: id.name, version: ver, content, updatedAt: stat.mtime.toISOString() })
            }
          }
          // Backward compat: old-style detail.md at root when v1 not in versionDirs
          if (!versionDirs.includes('v1')) {
            const oldDetailPath = path.join(invokePath, 'detail.md')
            if (fs.existsSync(oldDetailPath)) {
              const content = fs.readFileSync(oldDetailPath, 'utf-8')
              const stat = fs.statSync(oldDetailPath)
              artifacts.push({ nodeName: nd.name, invokeId: id.name, version: 'v1', content, updatedAt: stat.mtime.toISOString() })
            }
          }
        } else {
          const detailPath = path.join(invokePath, 'detail.md')
          if (fs.existsSync(detailPath)) {
            const content = fs.readFileSync(detailPath, 'utf-8')
            const stat = fs.statSync(detailPath)
            artifacts.push({ nodeName: nd.name, invokeId: id.name, version: 'v1', content, updatedAt: stat.mtime.toISOString() })
          }
        }
      }
    }
  }
  artifacts.sort((a, b) => a.invokeId.localeCompare(b.invokeId))
  return { artifacts }
}

function parseContext(instDir: string): InstanceDetailDelta {
  let contextMd = ''
  const contextPath = path.join(instDir, 'context.md')
  if (fs.existsSync(contextPath)) contextMd = fs.readFileSync(contextPath, 'utf-8')
  return { contextMd }
}

function parseInstanceMd(instDir: string): InstanceDetailDelta {
  let instanceMd = ''
  const instMdPath = path.join(instDir, 'instance.md')
  if (fs.existsSync(instMdPath)) instanceMd = fs.readFileSync(instMdPath, 'utf-8')
  return { instanceMd }
}

function readFlowData(root: string, workflowName: string): InstanceDetailDelta {
  let flowData: any = null
  const flowPath = path.join(ensureWorkflowsDir(root), workflowName, 'meta-data', 'flow.json')
  if (fs.existsSync(flowPath)) {
    try { flowData = JSON.parse(fs.readFileSync(flowPath, 'utf-8')) } catch (e: any) { console.error('解析 flow.json 失败:', e) }
  }
  return { flowData }
}

// 实例详情构建：read-instance-detail（一次性读）与 subscribe-instance-detail（初始快照/全量兜底）共用。
// 复刻原 buildInstanceDetail 的内部 catch 契约（handler 层无 try/catch）。
function buildInstanceDetail(root: string, workflowName: string, instanceId: string): { success: true; detail: InstanceDetailDelta } | Failed {
  try {
    if (workflowName.includes('..') || instanceId.includes('..')) return { success: false, error: 'Invalid path' }
    const instDir = path.join(ensureWorkflowsDir(root), workflowName, 'instance', instanceId)
    const resolvedInstDir = path.resolve(instDir)
    if (!resolvedInstDir.startsWith(path.resolve(ensureWorkflowsDir(root)) + path.sep)) return { success: false, error: 'Invalid path' }
    if (!fs.existsSync(instDir)) return { success: false, error: 'Instance not found' }
    return {
      success: true,
      detail: {
        ...parseProcess(instDir),
        ...parseTrace(instDir),
        ...parseArtifacts(instDir),
        ...parseContext(instDir),
        ...parseInstanceMd(instDir),
        ...readFlowData(root, workflowName),
      },
    }
  } catch (error: any) {
    console.error('读取实例详情失败:', error)
    return { success: false, error: String(error) }
  }
}

// filename → 解析器映射；返回 null 表示需要全量兜底（自 launch.cjs 原样迁移；filename 为 null 同样走全量）
function parseByFilename(root: string, instDir: string, workflowName: string, filename: string | null): InstanceDetailDelta | null {
  if (!filename) return null
  const f = filename.replace(/\\\\/g, '/')
  if (f.includes('trace')) return parseTrace(instDir)
  if (f.includes('status.json')) return parseProcess(instDir)
  if (f.includes('artifacts')) return parseArtifacts(instDir)
  if (f.includes('context.md')) return parseContext(instDir)
  if (f.includes('instance.md')) return parseInstanceMd(instDir)
  if (f.includes('flow.json')) return readFlowData(root, workflowName)
  return null
}

// ---------------------------------------------------------------------------
// GUI 语义组（launch.cjs 工作流 IPC 契约复刻；desktop 壳原样透传）
// ---------------------------------------------------------------------------

// save-workflow-file：哑写 .workflows/{name}.md（content 原样，upsert）
export function saveWorkflowFile(root: string, name: string, content: string): { success: true } | Failed {
  const workflowsDirRoot = ensureWorkflowsDir(root)
  const filePath = path.join(workflowsDirRoot, `${name}.md`)
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
}

// load-workflow-file：文件不存在返回 content:null（不是失败）
export function readWorkflowFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = path.join(ensureWorkflowsDir(root), `${name}.md`)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-workflow-file：文件不存在静默成功
export function deleteWorkflowFile(root: string, name: string): { success: true } | Failed {
  const filePath = path.join(ensureWorkflowsDir(root), `${name}.md`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return { success: true }
}

// load-all-workflow-files：.md 过滤、readdirSync 原始顺序（不排序）
export function listWorkflowFiles(root: string): { success: true; files: string[] } | Failed {
  const workflowsDirRoot = ensureWorkflowsDir(root)
  const files = fs.readdirSync(workflowsDirRoot)
    .filter(file => file.endsWith('.md'))
    .map(file => file)
  return { success: true, files }
}

// create-workflow-folder：幂等（已存在不报错）；建 {name}/ + {name}/meta-data/；返回绝对 folderPath
export function createWorkflowFolder(root: string, name: string): { success: true; folderPath: string } | Failed {
  const folderPath = path.join(ensureWorkflowsDir(root), name)
  const metaDataPath = path.join(folderPath, 'meta-data')

  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
  }
  if (!fs.existsSync(metaDataPath)) {
    fs.mkdirSync(metaDataPath, { recursive: true })
  }
  return { success: true, folderPath }
}

// load-workflow-md：读 {name}/WORKFLOW.md；ghost null-成功
export function readWorkflowMdFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = path.join(path.join(ensureWorkflowsDir(root), name), 'WORKFLOW.md')
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// save-workflow-md：ensureDir 文件夹（不建 meta-data）后写 WORKFLOW.md
export function saveWorkflowMdFile(root: string, name: string, content: string): { success: true } | Failed {
  const folderPath = path.join(ensureWorkflowsDir(root), name)
  if (!fs.existsSync(folderPath)) {
    fs.mkdirSync(folderPath, { recursive: true })
  }
  const filePath = path.join(folderPath, 'WORKFLOW.md')
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
}

// load-workflow-flow-json：读 {name}/meta-data/flow.json；ghost null-成功
export function readWorkflowFlowJson(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = path.join(path.join(path.join(ensureWorkflowsDir(root), name), 'meta-data'), 'flow.json')
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// save-workflow-flow-json：ensureDir meta-data 两级后写 flow.json
export function saveWorkflowFlowJson(root: string, name: string, content: string): { success: true } | Failed {
  const metaDataPath = path.join(path.join(ensureWorkflowsDir(root), name), 'meta-data')
  if (!fs.existsSync(metaDataPath)) {
    fs.mkdirSync(metaDataPath, { recursive: true })
  }
  const filePath = path.join(metaDataPath, 'flow.json')
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
}

// load-all-workflow-folders：只列目录、原始顺序
export function listWorkflowFolders(root: string): { success: true; folders: string[] } | Failed {
  const workflowsDirRoot = ensureWorkflowsDir(root)
  const folders = fs.readdirSync(workflowsDirRoot, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name)
  return { success: true, folders }
}

// delete-workflow-folder：ghost 静默；rmSync recursive force
export function deleteWorkflowFolder(root: string, name: string): { success: true } | Failed {
  const folderPath = path.join(ensureWorkflowsDir(root), name)
  if (fs.existsSync(folderPath)) {
    fs.rmSync(folderPath, { recursive: true, force: true })
  }
  return { success: true }
}

// rename-workflow-folder：旧不存在静默跳过；目标已存在 → renameSync 抛系统错误由壳 catch
export function renameWorkflowFolder(root: string, oldName: string, newName: string): { success: true } | Failed {
  const oldPath = path.join(ensureWorkflowsDir(root), oldName)
  const newPath = path.join(ensureWorkflowsDir(root), newName)
  if (fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, newPath)
  }
  return { success: true }
}

// list-workflow-instances：扫 .workflows/*/instance/*/；status.json 九字段 + trace 首行 ts 作 createdAt
// （缺则 birthtime）；artifactCount 数 artifacts/{node}/{invoke} 目录；按 createdAt 降序
export function listWorkflowInstances(root: string): { success: true; instances: any[] } | Failed {
  const workflowsDirRoot = ensureWorkflowsDir(root)
  const instances: any[] = []
  const workflowDirs = fs.readdirSync(workflowsDirRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  for (const wfName of workflowDirs) {
    const instanceDir = path.join(workflowsDirRoot, wfName, 'instance')
    if (!fs.existsSync(instanceDir)) continue
    const instanceDirs = fs.readdirSync(instanceDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    for (const instId of instanceDirs) {
      const instPath = path.join(instanceDir, instId)
      const stat = fs.statSync(instPath)
      // 统计产物数量（artifacts/{node}/{invoke}/detail.md）
      let artifactCount = 0
      const artDir = path.join(instPath, 'artifacts')
      if (fs.existsSync(artDir)) {
        const nodeDirs = fs.readdirSync(artDir, { withFileTypes: true }).filter(d => d.isDirectory())
        for (const nd of nodeDirs) {
          const invokeDir = path.join(artDir, nd.name)
          if (fs.existsSync(invokeDir)) {
            artifactCount += fs.readdirSync(invokeDir, { withFileTypes: true }).filter(d => d.isDirectory()).length
          }
        }
      }
      // 从 status.json 读取状态
      let status = 'unknown'
      let initialInput: any = null
      let currentName = ''
      let step = 0
      let loopCount = 0
      let retryCount = 0
      let lastNode: any = null
      let completedNodes: string[] = []
      const statusJsonPath = path.join(instPath, 'status.json')
      if (fs.existsSync(statusJsonPath)) {
        try {
          const s = JSON.parse(fs.readFileSync(statusJsonPath, 'utf-8'))
          if (s.status) status = s.status
          if (s.initial_input) initialInput = s.initial_input
          if (s.current_name) currentName = s.current_name
          if (s.step != null) step = s.step
          if (s.loop_count != null) loopCount = s.loop_count
          if (s.retry_count != null) retryCount = s.retry_count
          if (s.last_node) lastNode = s.last_node
          if (Array.isArray(s.completed)) completedNodes = s.completed
        } catch (e: any) { console.error('status.json 解析失败:', e.message) }
      }
      // 从 trace.jsonl 读取创建时间（比文件系统 birthtime 更准确）
      let createdAt = stat.birthtime.toISOString()
      const traceJsonlPath = path.join(instPath, 'trace', 'trace.jsonl')
      if (fs.existsSync(traceJsonlPath)) {
        const firstLine = fs.readFileSync(traceJsonlPath, 'utf-8').split('\n')[0]
        try {
          const firstEntry = JSON.parse(firstLine)
          if (firstEntry.ts) createdAt = firstEntry.ts
        } catch (e) {}
      }
      instances.push({
        instanceId: instId,
        workflowName: wfName,
        createdAt,
        updatedAt: stat.mtime.toISOString(),
        status,
        initialInput,
        currentName,
        step,
        loopCount,
        retryCount,
        lastNode,
        completedNodes,
        artifactCount,
      })
    }
  }
  instances.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return { success: true, instances }
}

// read-instance-file：路径穿越守卫 + File not found 业务失败
export function readInstanceFile(root: string, workflowName: string, instanceId: string, fileName: string): { success: true; content: string } | Failed {
  if (workflowName.includes('..') || instanceId.includes('..') || fileName.includes('..')) {
    return { success: false, error: 'Invalid path' }
  }
  const filePath = path.join(ensureWorkflowsDir(root), workflowName, 'instance', instanceId, fileName)
  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'File not found' }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  return { success: true, content }
}

// read-instance-detail：buildInstanceDetail（内部 catch 契约，handler 层无兜底）
export function readInstanceDetail(root: string, workflowName: string, instanceId: string): { success: true; detail: InstanceDetailDelta } | Failed {
  return buildInstanceDetail(root, workflowName, instanceId)
}

// watchInstanceDetail：fs.watch recursive + 150ms debounce + changedFiles 收集 + filename 路由增量，
// 未识别 filename 全量兜底；推送经 onDelta。watcher 生命周期由调用方（desktop 壳单例）管理：
// 新订阅前先 stop 旧句柄（含失败订阅——与原 stopInstanceWatcher 无条件先停语义一致）。
export function watchInstanceDetail(root: string, workflowName: string, instanceId: string, onDelta: (delta: InstanceDetailDelta) => void): InstanceWatcherHandle {
  const instDir = path.join(ensureWorkflowsDir(root), workflowName, 'instance', instanceId)
  const state = {
    watcher: null as fs.FSWatcher | null,
    timer: null as ReturnType<typeof setTimeout> | null,
    changedFiles: new Set<string | null>(),
    stopped: false,
  }
  try {
    // macOS fs.watch recursive 覆盖 trace/process.md/artifacts/context.md/instance.md
    state.watcher = fs.watch(instDir, { recursive: true }, (_eventType: string, filename: string | null) => {
      if (state.stopped) return
      // 收集变化的 filename 到 Set，debounce 后统一处理
      state.changedFiles.add(filename)
      if (state.timer) clearTimeout(state.timer)
      state.timer = setTimeout(() => {
        if (state.stopped) return
        const files = state.changedFiles
        state.changedFiles = new Set()
        state.timer = null
        if (!files.size) return
        // 遍历变化的文件，只读变化的文件并计算其字段
        let needFullRebuild = false
        const delta: InstanceDetailDelta = {}
        for (const fn of files) {
          const partial = parseByFilename(root, instDir, workflowName, fn)
          if (partial) {
            Object.assign(delta, partial)
          } else {
            // filename 为 null 或未识别 → 全量兜底
            needFullRebuild = true
            break
          }
        }
        if (needFullRebuild) {
          const fresh = buildInstanceDetail(root, workflowName, instanceId)
          if (fresh.success === true) onDelta(fresh.detail)
        } else if (Object.keys(delta).length > 0) {
          onDelta(delta)
        }
      }, 150)
    })
  } catch (e) {
    console.error('实例详情 fs.watch 失败:', e)
  }
  return {
    stop() {
      state.stopped = true
      if (state.watcher) state.watcher.close()
      if (state.timer) clearTimeout(state.timer)
    },
  }
}

// ---------------------------------------------------------------------------
// CLI 语义组（core/workflow.ts 原样迁移；CLI 壳 unwrap 转异常 exit 1）
// ---------------------------------------------------------------------------

// create-only（重名报错）；建 {name}/meta-data/；flow.json 含 start-1/end-1；不写 WORKFLOW.md
export function createWorkflow(root: string, name: string): { success: true } | Failed {
  try {
    const dir = workflowDir(root, name)
    if (fs.existsSync(dir)) return { success: false, error: `工作流已存在: ${name}` }
    fs.mkdirSync(path.join(dir, 'meta-data'), { recursive: true })
    const flow = {
      name,
      description: '',
      inputs: [],
      outputs: [],
      customFields: [],
      nodes: [
        { id: 'start-1', type: 'start', position: { x: 200, y: 250 }, data: { label: '开始' } },
        { id: 'end-1', type: 'end', position: { x: 500, y: 250 }, data: { label: '结束' } },
      ],
      edges: [],
    }
    writeFlowJson(root, name, flow)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// delete：ghost 静默
export function deleteWorkflow(root: string, name: string): { success: true } | Failed {
  try {
    const dir = workflowDir(root, name)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// rename：旧缺失/新已存在报错；重命名后更新 flow.json 的 name
export function renameWorkflow(root: string, oldName: string, newName: string): { success: true } | Failed {
  try {
    const oldDir = workflowDir(root, oldName)
    const newDir = workflowDir(root, newName)
    if (!fs.existsSync(oldDir)) return { success: false, error: `工作流不存在: ${oldName}` }
    if (fs.existsSync(newDir)) return { success: false, error: `工作流已存在: ${newName}` }
    fs.renameSync(oldDir, newDir)
    // update name in flow.json
    const flow = readFlowJson(root, newName)
    flow.name = newName
    writeFlowJson(root, newName, flow)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// 读 WORKFLOW.md 原文；缺失报错
export function readWorkflowMd(root: string, name: string): { success: true; content: string } | Failed {
  try {
    const p = workflowMdPath(root, name)
    if (!fs.existsSync(p)) return { success: false, error: `WORKFLOW.md 不存在: ${name}` }
    return { success: true, content: fs.readFileSync(p, 'utf-8') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// 读 flow.json 原文（JSON.stringify 2 空格）
export function readWorkflowFlow(root: string, name: string): { success: true; content: string } | Failed {
  try {
    return { success: true, content: JSON.stringify(readFlowJson(root, name), null, 2) }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// addNode：四类型 + decision condition 校验；id={type}-{Date.now()}；位置 lastX+280
export function addWorkflowNode(root: string, wfName: string, type: string, label: string, opts?: WorkflowNodeAddOpts): { success: true; nodeId: string } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    const id = `${type}-${Date.now()}`

    let data: any
    if (type === 'business') {
      const refPath = opts?.nodeRefPath || ''
      const nodeDefName = path.basename(refPath, '.md')
      data = { label, nodeDefName, description: '', isLocal: false, nodeRefPath: refPath }
    } else if (type === 'decision') {
      const condition = opts?.condition?.trim()
      if (!condition) {
        return { success: false, error: 'decision 节点必须提供判断内容（condition 不能为空）' }
      }
      data = { label, nodeDefId: 'decision', isLocal: false, condition, branches: [] }
    } else if (type === 'process') {
      data = { label, nodeDefId: 'process', content: opts?.content || '', description: opts?.description || '', isLocal: false }
    } else if (type === 'local') {
      data = { label, nodeDefId: 'local', content: opts?.content || '', description: opts?.description || '', isLocal: true, localNodeName: label }
    } else {
      return { success: false, error: `不支持的节点类型: ${type}` }
    }

    // auto position: lastX + 280
    const lastX = flow.nodes.reduce((max: number, n: any) => Math.max(max, n.position?.x || 0), 0)
    const node = { id, type, position: { x: lastX + 280, y: 250 }, data }
    flow.nodes.push(node)
    writeFlowJson(root, wfName, flow)
    return { success: true, nodeId: id }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// connect：边校验；decision 分支按 sourceHandle/branchId
export function connectWorkflowNodes(root: string, wfName: string, fromId: string, toId: string, branchName?: string): { success: true; edgeId: string } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    const fromNode = flow.nodes.find((n: any) => n.id === fromId)
    const toNode = flow.nodes.find((n: any) => n.id === toId)
    if (!fromNode) return { success: false, error: `节点不存在: ${fromId}` }
    if (!toNode) return { success: false, error: `节点不存在: ${toId}` }

    const edgeId = `e-${Date.now()}`
    const edge: any = { id: edgeId, source: fromId, target: toId, type: 'default' }

    if (branchName && fromNode.type === 'decision') {
      const branches = fromNode.data?.branches || []
      const branch = branches.find((b: any) => b.name === branchName)
      if (!branch) return { success: false, error: `分支不存在: ${branchName}` }
      edge.sourceHandle = branch.id
      edge.branchId = branch.id
      edge.branchDescription = branch.name
    }

    flow.edges.push(edge)
    writeFlowJson(root, wfName, flow)
    return { success: true, edgeId }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// addBranch：首个分支自动追加「其他」；后续插在「其他」前
export function addWorkflowBranch(root: string, wfName: string, nodeId: string, name: string, description?: string): { success: true; branchId: string } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    const node = flow.nodes.find((n: any) => n.id === nodeId)
    if (!node) return { success: false, error: `节点不存在: ${nodeId}` }
    if (node.type !== 'decision') return { success: false, error: `节点不是 decision 类型: ${nodeId}` }

    if (!node.data.branches) node.data.branches = []
    const branchId = Date.now().toString()
    const newBranch = { id: branchId, name, description: description || '' }

    if (node.data.branches.length === 0) {
      // first branch: auto-append "其他" sibling (与 GUI PropertiesPanel.tsx:75-84 一致)
      node.data.branches.push(newBranch)
      node.data.branches.push({
        id: `${branchId}-other`,
        name: '其他',
        description: '均不符合上述分类的进入本分支',
      })
    } else {
      // insert before "其他" (与 GUI PropertiesPanel.tsx:103-117 一致)
      const otherIdx = node.data.branches.findIndex((b: any) => b.name === '其他')
      if (otherIdx >= 0) {
        node.data.branches.splice(otherIdx, 0, newBranch)
      } else {
        node.data.branches.push(newBranch)
      }
    }

    writeFlowJson(root, wfName, flow)
    return { success: true, branchId }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// removeNode：删节点 + 关联边
export function removeWorkflowNode(root: string, wfName: string, nodeId: string): { success: true } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    flow.nodes = flow.nodes.filter((n: any) => n.id !== nodeId)
    // delete associated edges (与 GUI flowEditorStore.ts:124-128 一致)
    flow.edges = flow.edges.filter((e: any) => e.source !== nodeId && e.target !== nodeId)
    writeFlowJson(root, wfName, flow)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// disconnect：按分支名匹配删边
export function disconnectWorkflowNodes(root: string, wfName: string, fromId: string, toId: string, branchName?: string): { success: true } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    flow.edges = flow.edges.filter((e: any) => {
      if (e.source !== fromId || e.target !== toId) return true
      if (branchName) {
        // match by branch name via sourceHandle -> branch lookup
        const fromNode = flow.nodes.find((n: any) => n.id === fromId)
        if (fromNode?.type === 'decision' && fromNode.data?.branches) {
          const branch = fromNode.data.branches.find((b: any) => b.name === branchName)
          if (!branch) return true // branch not found, keep edge
          return e.sourceHandle !== branch.id
        }
      }
      return false // delete matching edge
    })
    writeFlowJson(root, wfName, flow)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// listNodes：markdown 表格（ID/type/label/ref-path）
export function listWorkflowNodes(root: string, wfName: string): { success: true; table: string } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    const rows = flow.nodes.map((n: any) => {
      const refPath = n.data?.nodeRefPath || n.data?.content || ''
      return `| ${n.id} | ${n.type} | ${n.data?.label || ''} | ${refPath} |`
    })
    return { success: true, table: ['| ID | type | label | ref-path |', '|------|------|-------|----------|', ...rows].join('\n') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// listEdges：markdown 表格（source/target/branch）
export function listWorkflowEdges(root: string, wfName: string): { success: true; table: string } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    const rows = flow.edges.map((e: any) => {
      const branch = e.branchId || ''
      return `| ${e.source} | ${e.target} | ${branch} |`
    })
    return { success: true, table: ['| source | target | branch |', '|--------|--------|--------|', ...rows].join('\n') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// generate：dagre 自动布局 + business 节点 nodeRefPath 重建 + local 节点落盘 + WORKFLOW.md 生成 + flow.json 回写
export function generateWorkflow(root: string, wfName: string): { success: true } | Failed {
  try {
    const flow = readFlowJson(root, wfName)

    // dagre auto-layout (dagre bundled by esbuild, see build:electron)
    const g = new dagre.graphlib.Graph()
    g.setGraph({ rankdir: 'LR', ranksep: 260, nodesep: 120, ranker: 'tight-tree' })
    g.setDefaultEdgeLabel(() => ({}))
    const NW = 180, NH = 60
    ;(flow.nodes || []).forEach((n: any) => {
      g.setNode(n.id, { width: NW, height: n.type === 'decision' ? 100 : NH })
    })
    ;(flow.edges || []).forEach((e: any) => { g.setEdge(e.source, e.target) })
    dagre.layout(g)
    flow.nodes = (flow.nodes || []).map((node: any) => {
      const d = g.node(node.id)
      return { ...node, position: {
        x: (d?.x || 0) - NW / 2,
        y: (d?.y || 0) - (node.type === 'decision' ? 100 : NH) / 2,
      }}
    })

    // clean flow: regenerate nodeRefPath for business nodes (与 GUI storage.ts:1051-1056 一致)
    for (const node of flow.nodes) {
      if (node.type === 'business' && node.data?.nodeDefName) {
        node.data.nodeRefPath = `.nodes/${node.data.nodeDefName}.md`
      }
    }

    // save local nodes (与 GUI 保存一致)
    const lnd = localNodesDir(root, wfName)
    for (const node of flow.nodes) {
      if (node.type === 'local' && node.data?.localNodeName && node.data?.content) {
        fs.mkdirSync(lnd, { recursive: true })
        fs.writeFileSync(path.join(lnd, `${node.data.localNodeName}.md`), node.data.content, 'utf-8')
      }
    }

    // generate WORKFLOW.md
    if (!flow.name) flow.name = wfName
    const md = generateWorkflowMd(flow, flow.nodes, flow.edges)
    fs.writeFileSync(workflowMdPath(root, wfName), md, 'utf-8')

    // write cleaned flow.json back
    writeFlowJson(root, wfName, flow)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// doctor：11 检查（json=true 返回 JSON 串，否则 markdown 表格）
export function doctorWorkflow(root: string, wfName: string, json: boolean = false): { success: true; report: string } | Failed {
  try {
    const flow = readFlowJson(root, wfName)
    const nodes: any[] = flow.nodes || []
    const edges: any[] = flow.edges || []
    const results: Array<{ check: string; passed: boolean; message: string }> = []

    // 1. 非空检查
    results.push({
      check: '非空检查',
      passed: nodes.length > 0,
      message: nodes.length > 0 ? `通过 — ${nodes.length} 个节点` : '失败 — 工作流为空',
    })

    // 2. 起始节点
    const startNodes = nodes.filter(n => n.type === 'start')
    results.push({
      check: '起始节点',
      passed: startNodes.length > 0,
      message: startNodes.length > 0 ? `通过 — ${startNodes.map(n => n.id).join(', ')}` : '失败 — 缺少起始节点',
    })

    // 3. 结束节点
    const endNodes = nodes.filter(n => n.type === 'end')
    results.push({
      check: '结束节点',
      passed: endNodes.length > 0,
      message: endNodes.length > 0 ? `通过 — ${endNodes.map(n => n.id).join(', ')}` : '失败 — 缺少结束节点',
    })

    // 4. 起始节点出边
    const startHasOut = startNodes.some(s => edges.some(e => e.source === s.id))
    results.push({
      check: '起始节点出边',
      passed: startHasOut,
      message: startHasOut ? `通过 — ${edges.filter(e => startNodes.some(s => s.id === e.source)).length} 条出边` : '失败 — 起始节点没有出边',
    })

    // 5. 结束节点入边
    const endHasIn = endNodes.some(e => edges.some(ed => ed.target === e.id))
    results.push({
      check: '结束节点入边',
      passed: endHasIn,
      message: endHasIn ? `通过 — ${edges.filter(e => endNodes.some(en => en.id === e.target)).length} 条入边` : '失败 — 结束节点没有入边',
    })

    // 6. 孤立节点
    const orphans = nodes.filter(n => {
      if (n.type === 'start' || n.type === 'end') return false
      const hasOut = edges.some(e => e.source === n.id)
      const hasIn = edges.some(e => e.target === n.id)
      return !hasOut && !hasIn
    })
    results.push({
      check: '孤立节点',
      passed: orphans.length === 0,
      message: orphans.length === 0 ? '通过 — 无孤立节点' : `失败 — 孤立节点: ${orphans.map(n => n.id).join(', ')}`,
    })

    // 7. 分支节点连线
    const decisionNodes = nodes.filter(n => n.type === 'decision' && n.data?.branches?.length > 0)
    const branchIssues: string[] = []
    for (const node of decisionNodes) {
      for (const branch of node.data.branches) {
        if (!edges.some(e => e.source === node.id && e.sourceHandle === branch.id)) {
          branchIssues.push(`${node.id}/${branch.name}`)
        }
      }
    }
    results.push({
      check: '分支节点连线',
      passed: branchIssues.length === 0,
      message: branchIssues.length === 0
        ? `通过 — ${decisionNodes.length} 个 decision，分支全部已连接`
        : `失败 — 未连接分支: ${branchIssues.join(', ')}`,
    })

    // 8. 可达性 (BFS from start)
    const adjacency = new Map<string, string[]>()
    for (const node of nodes) adjacency.set(node.id, [])
    for (const edge of edges) {
      if (adjacency.has(edge.source)) adjacency.get(edge.source)!.push(edge.target)
    }
    const visited = new Set<string>()
    const queue = [...startNodes.map(n => n.id)]
    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      for (const neighbor of adjacency.get(current) || []) {
        if (!visited.has(neighbor)) queue.push(neighbor)
      }
    }
    const unreachable = nodes.filter(n => n.type !== 'start' && !visited.has(n.id))
    results.push({
      check: '可达性',
      passed: unreachable.length === 0,
      message: unreachable.length === 0
        ? '通过 — 所有节点可从 start 到达'
        : `失败 — 不可达节点: ${unreachable.map(n => n.id).join(', ')}`,
    })

    // 9. 边引用完整性 (CLI extension)
    const nodeIds = new Set(nodes.map(n => n.id))
    const danglingEdges = edges.filter(e => !nodeIds.has(e.source) || !nodeIds.has(e.target))
    results.push({
      check: '边引用完整性',
      passed: danglingEdges.length === 0,
      message: danglingEdges.length === 0
        ? `通过 — ${edges.length} 条边，引用全部有效`
        : `失败 — ${danglingEdges.length} 条边引用无效节点`,
    })

    // 10. 节点文件引用 (CLI extension)
    const businessNodes = nodes.filter(n => n.type === 'business' && n.data?.nodeRefPath)
    const missingFiles: string[] = []
    for (const node of businessNodes) {
      const refPath = node.data.nodeRefPath
      const fullPath = path.join(root, refPath)
      if (!fs.existsSync(fullPath)) missingFiles.push(`${node.id} -> ${refPath}`)
    }
    results.push({
      check: '节点文件引用',
      passed: missingFiles.length === 0,
      message: missingFiles.length === 0
        ? `通过 — ${businessNodes.length} 个 business，文件全部存在`
        : `失败 — 文件不存在: ${missingFiles.join(', ')}`,
    })

    // 11. decision 判断内容完整性 (CLI extension)
    const decisionNodesForCheck = nodes.filter(n => n.type === 'decision')
    const emptyConditions: string[] = []
    for (const node of decisionNodesForCheck) {
      const cond = node.data?.condition
      if (!cond || !cond.trim() || cond.trim() === 'N/A') {
        emptyConditions.push(node.id)
      }
    }
    results.push({
      check: 'decision 判断内容完整性',
      passed: emptyConditions.length === 0,
      message: emptyConditions.length === 0
        ? `通过 — ${decisionNodesForCheck.length} 个 decision，判断内容完整`
        : `失败 — 判断内容为空: ${emptyConditions.join(', ')}`,
    })

    if (json) {
      return { success: true, report: JSON.stringify(results, null, 2) }
    }

    const rows = results.map(r => `| ${r.check} | ${r.passed ? '通过' : '失败'} | ${r.message} |`)
    return { success: true, report: ['| 检查项 | 结果 | 说明 |', '|------|------|------|', ...rows].join('\n') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// local-node CRUD（{wf}/nodes/{name}.md）
export function listWorkflowLocalNodes(root: string, wfName: string): { success: true; names: string[] } | Failed {
  try {
    const d = localNodesDir(root, wfName)
    if (!fs.existsSync(d)) return { success: true, names: [] }
    const names = fs.readdirSync(d)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''))
      .sort()
    return { success: true, names }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function readWorkflowLocalNode(root: string, wfName: string, nodeName: string): { success: true; content: string } | Failed {
  try {
    const p = path.join(localNodesDir(root, wfName), `${nodeName}.md`)
    return { success: true, content: fs.readFileSync(p, 'utf-8') }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function createWorkflowLocalNode(root: string, wfName: string, nodeName: string, content: string): { success: true } | Failed {
  try {
    const d = localNodesDir(root, wfName)
    const p = path.join(d, `${nodeName}.md`)
    if (fs.existsSync(p)) return { success: false, error: `局部节点已存在: ${nodeName}` }
    fs.mkdirSync(d, { recursive: true })
    fs.writeFileSync(p, content, 'utf-8')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function deleteWorkflowLocalNode(root: string, wfName: string, nodeName: string): { success: true } | Failed {
  try {
    const p = path.join(localNodesDir(root, wfName), `${nodeName}.md`)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
