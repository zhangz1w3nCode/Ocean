import * as fs from 'node:fs'
import * as path from 'node:path'
// 暂存队列模型：正式位置只存过审版本；图编辑命令操作 reviewQueue 快照（G3/G7）
// eslint-disable-next-line @typescript-eslint/no-var-requires
const review = require('./review.cjs')
import dagre from '@dagrejs/dagre'
import { generateWorkflowMd } from './workflow-md-generator'

// --- path helpers ---

function workflowDir(root: string, name: string): string {
  return path.join(root, '.ocean', 'workflows', name)
}

// 编辑目标目录（G3）：有快照复用最新一份（图编辑命令连续修改不新建），无快照且正式存在则新建快照
function editDir(root: string, name: string): string {
  const t = review.resolveEditTarget(root, 'workflow', name)
  if (t.error) throw new Error(t.error)
  return t.dir
}

// 编辑目标目录，但要求资产存在（正式或快照至少其一），否则抛「工作流不存在」
function editDirOfExisting(root: string, name: string): string {
  const t = review.resolveEditTarget(root, 'workflow', name)
  if (t.error) throw new Error(t.error)
  if (!t.formalExists && t.isNewSnapshot) {
    // resolveEditTarget 刚建了空快照：既无正式也无既有快照 → 不存在，清掉刚建的空目录
    try { fs.rmdirSync(t.dir) } catch { /* 非空则保留 */ }
    throw new Error(`工作流不存在: ${name}`)
  }
  return t.dir
}

// 只有已通过审核的节点才能被工作流引用：正式位置即过审版本；仅有草稿（在审核队列）或不存在的节点都拒绝
function assertNodeReferenceable(root: string, nodeDefName: string): void {
  if (!nodeDefName) return
  if (fs.existsSync(path.join(root, '.ocean', 'nodes', `${nodeDefName}.md`))) return
  if (review.latestDraft(root, 'node', nodeDefName)) {
    throw new Error(`节点 ${nodeDefName} 尚未通过审核，不能被工作流引用（待审队列可用 ocean review list 查看）`)
  }
  throw new Error(`节点不存在或尚未通过审核: ${nodeDefName}`)
}

// 快照内的 flow.json / WORKFLOW.md / nodes/ 路径
function snapFlowJsonPath(dir: string): string { return path.join(dir, 'meta-data', 'flow.json') }
function snapMdPath(dir: string): string { return path.join(dir, 'WORKFLOW.md') }
function snapNodesDir(dir: string): string { return path.join(dir, 'nodes') }

function flowJsonPath(root: string, name: string): string {
  return path.join(workflowDir(root, name), 'meta-data', 'flow.json')
}

function workflowMdPath(root: string, name: string): string {
  return path.join(workflowDir(root, name), 'WORKFLOW.md')
}

function localNodesDir(root: string, name: string): string {
  return path.join(workflowDir(root, name), 'nodes')
}

// --- flow.json read/write ---

function readFlowJson(root: string, name: string): any {
  // 图编辑读取：优先最新快照，否则正式
  const p = flowJsonPath(root, name)
  const t = review.latestDraft(root, 'workflow', name)
  const readFrom = t ? snapFlowJsonPath(t.dir) : p
  if (!fs.existsSync(readFrom)) throw new Error(`工作流不存在: ${name}`)
  return JSON.parse(fs.readFileSync(readFrom, 'utf-8'))
}

// 正式 flow.json 读取（消费侧：doctor / readFlow / rename）
function readFormalFlowJson(root: string, name: string): any {
  const p = flowJsonPath(root, name)
  if (!fs.existsSync(p)) throw new Error(`工作流不存在: ${name}`)
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}

// 图编辑写入快照后：草稿必须进审核队列。以正式为基底的新快照里 WORKFLOW.md 仍是 validated，
// 审核队列靠主文件 reviewStatus 识别待审项，因此成功写入后把主文件规范化为 pending（去 version / 理由 / 冲突标记，记录当前基准）。
// 只在成功路径调用：命令中途失败时不留与正式内容相同的空改动草稿。
function markSnapshotPending(root: string, dir: string): void {
  const p = snapMdPath(dir)
  if (!fs.existsSync(p)) return
  const text = fs.readFileSync(p, 'utf-8')
  if (review.parseReviewStatus(text) !== 'validated') return
  fs.writeFileSync(p, review.normalizeDraftFm(text, root), 'utf-8')
}

function writeFlowJsonTo(root: string, dir: string, flow: any): void {
  const p = snapFlowJsonPath(dir)
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(flow, null, 2), 'utf-8')
  markSnapshotPending(root, dir)
}

// --- workflow folder CRUD ---

export function create(root: string, name: string): void {
  if (fs.existsSync(workflowDir(root, name))) throw new Error(`工作流已存在: ${name}`)
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
  const dir = editDir(root, name)
  writeFlowJsonTo(root, dir, flow)
  // 主文件（WORKFLOW.md）同步生成：快照识别与审核列表都依赖主文件存在
  fs.writeFileSync(snapMdPath(dir), generateWorkflowMd(flow, flow.nodes, flow.edges, { baseCommit: review.baseCommitField(root) || undefined }), 'utf-8')
}

export function del(root: string, name: string): void {
  const dir = workflowDir(root, name)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  const c = review.commitFormalDeletion(root, `workflows/${name}`)
  if (!c.success) throw new Error(c.error || '提交删除失败')
  review.discardSnapshots(root, 'workflow', name)
}

export function rename(root: string, oldName: string, newName: string): void {
  const oldDir = workflowDir(root, oldName)
  const newDir = workflowDir(root, newName)
  if (!fs.existsSync(oldDir)) throw new Error(`工作流不存在: ${oldName}`)
  if (fs.existsSync(newDir)) throw new Error(`工作流已存在: ${newName}`)
  fs.renameSync(oldDir, newDir)
  // update name in flow.json（正式）
  const flow = readFormalFlowJson(root, newName)
  flow.name = newName
  fs.mkdirSync(path.dirname(flowJsonPath(root, newName)), { recursive: true })
  fs.writeFileSync(flowJsonPath(root, newName), JSON.stringify(flow, null, 2), 'utf-8')
  // 队列子树同步改名（草稿不丢）
  const qOld = path.join(review.queueDir(root), 'workflows', oldName)
  const qNew = path.join(review.queueDir(root), 'workflows', newName)
  if (fs.existsSync(qOld) && !fs.existsSync(qNew)) fs.renameSync(qOld, qNew)
}

export function readWorkflowMd(root: string, name: string): string {
  const p = workflowMdPath(root, name)
  if (!fs.existsSync(p)) throw new Error(`WORKFLOW.md 不存在: ${name}`)
  return fs.readFileSync(p, 'utf-8')
}

export function readFlow(root: string, name: string): string {
  return JSON.stringify(readFormalFlowJson(root, name), null, 2)
}

// --- graph editing ---

export function addNode(root: string, wfName: string, type: string, label: string, opts?: {
  nodeRefPath?: string
  content?: string
  condition?: string
  description?: string
}): string {
  const flow = readFlowJson(root, wfName)
  // 只有已通过审核的节点才能被工作流引用（校验放在建快照之前，失败不留空改动草稿）
  if (type === 'business') assertNodeReferenceable(root, path.basename(opts?.nodeRefPath || '', '.md'))
  const dir = editDirOfExisting(root, wfName)
  const id = `${type}-${Date.now()}`

  let data: any
  if (type === 'business') {
    const refPath = opts?.nodeRefPath || ''
    const nodeDefName = path.basename(refPath, '.md')
    data = { label, nodeDefName, description: '', isLocal: false, nodeRefPath: refPath }
  } else if (type === 'decision') {
    const condition = opts?.condition?.trim()
    if (!condition) {
      throw new Error('decision 节点必须提供判断内容（condition 不能为空）')
    }
    data = { label, nodeDefId: 'decision', isLocal: false, condition, branches: [] }
  } else if (type === 'process') {
    data = { label, nodeDefId: 'process', content: opts?.content || '', description: opts?.description || '', isLocal: false }
  } else if (type === 'local') {
    data = { label, nodeDefId: 'local', content: opts?.content || '', description: opts?.description || '', isLocal: true, localNodeName: label }
  } else {
    throw new Error(`不支持的节点类型: ${type}`)
  }

  // auto position: lastX + 280
  const lastX = flow.nodes.reduce((max: number, n: any) => Math.max(max, n.position?.x || 0), 0)
  const node = { id, type, position: { x: lastX + 280, y: 250 }, data }
  flow.nodes.push(node)
  writeFlowJsonTo(root, dir, flow)
  return id
}

export function connect(root: string, wfName: string, fromId: string, toId: string, branchName?: string): string {
  const flow = readFlowJson(root, wfName)
  const dir = editDirOfExisting(root, wfName)
  const fromNode = flow.nodes.find((n: any) => n.id === fromId)
  const toNode = flow.nodes.find((n: any) => n.id === toId)
  if (!fromNode) throw new Error(`节点不存在: ${fromId}`)
  if (!toNode) throw new Error(`节点不存在: ${toId}`)

  const edgeId = `e-${Date.now()}`
  let edge: any = { id: edgeId, source: fromId, target: toId, type: 'default' }

  if (branchName && fromNode.type === 'decision') {
    const branches = fromNode.data?.branches || []
    const branch = branches.find((b: any) => b.name === branchName)
    if (!branch) throw new Error(`分支不存在: ${branchName}`)
    edge.sourceHandle = branch.id
    edge.branchId = branch.id
    edge.branchDescription = branch.name
  }

  flow.edges.push(edge)
  writeFlowJsonTo(root, dir, flow)
  return edgeId
}

export function addBranch(root: string, wfName: string, nodeId: string, name: string, description?: string): string {
  const flow = readFlowJson(root, wfName)
  const dir = editDirOfExisting(root, wfName)
  const node = flow.nodes.find((n: any) => n.id === nodeId)
  if (!node) throw new Error(`节点不存在: ${nodeId}`)
  if (node.type !== 'decision') throw new Error(`节点不是 decision 类型: ${nodeId}`)

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

  writeFlowJsonTo(root, dir, flow)
  return branchId
}

export function removeNode(root: string, wfName: string, nodeId: string): void {
  const flow = readFlowJson(root, wfName)
  const dir = editDirOfExisting(root, wfName)
  flow.nodes = flow.nodes.filter((n: any) => n.id !== nodeId)
  // delete associated edges (与 GUI flowEditorStore.ts:124-128 一致)
  flow.edges = flow.edges.filter((e: any) => e.source !== nodeId && e.target !== nodeId)
  writeFlowJsonTo(root, dir, flow)
}

export function disconnect(root: string, wfName: string, fromId: string, toId: string, branchName?: string): void {
  const flow = readFlowJson(root, wfName)
  const dir = editDirOfExisting(root, wfName)
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
  writeFlowJsonTo(root, dir, flow)
}

// --- list operations ---

export function listNodes(root: string, wfName: string): string {
  // 读取类命令只反映正式位置（G7），草稿用 ocean review show / diff 查看
  const flow = readFormalFlowJson(root, wfName)
  const rows = flow.nodes.map((n: any) => {
    const refPath = n.data?.nodeRefPath || n.data?.content || ''
    return `| ${n.id} | ${n.type} | ${n.data?.label || ''} | ${refPath} |`
  })
  return ['| ID | type | label | ref-path |', '|------|------|-------|----------|', ...rows].join('\n')
}

export function listEdges(root: string, wfName: string): string {
  const flow = readFormalFlowJson(root, wfName)
  const rows = flow.edges.map((e: any) => {
    const branch = e.branchId || ''
    return `| ${e.source} | ${e.target} | ${branch} |`
  })
  return ['| source | target | branch |', '|--------|--------|--------|', ...rows].join('\n')
}

// --- generate WORKFLOW.md ---

export function generate(root: string, wfName: string): void {
  // 生成 = 一次保存：读取最新快照（否则正式）的 flow，写入新快照
  const prevDraft = review.latestDraft(root, 'workflow', wfName)
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
      node.data.nodeRefPath = `.ocean/nodes/${node.data.nodeDefName}.md`
    }
  }

  // 新快照：先按正式基底建立（newSnapshotDir），若此前有更新的草稿快照则以其为基底覆盖（局部节点等草稿文件不丢）
  const dir = review.newSnapshotDir(root, 'workflow', wfName)
  if (dir.error) throw new Error(dir.error)
  if (prevDraft && prevDraft.dir !== dir.dir) {
    fs.rmSync(dir.dir, { recursive: true, force: true })
    fs.cpSync(prevDraft.dir, dir.dir, { recursive: true })
  }

  // save local nodes (与 GUI 保存一致)
  const lnd = snapNodesDir(dir.dir)
  for (const node of flow.nodes) {
    if (node.type === 'local' && node.data?.localNodeName && node.data?.content) {
      fs.mkdirSync(lnd, { recursive: true })
      fs.writeFileSync(path.join(lnd, `${node.data.localNodeName}.md`), node.data.content, 'utf-8')
    }
  }

  // generate WORKFLOW.md（快照 frontmatter 只写 reviewStatus，version 由审核通过时在正式文件维护）
  if (!flow.name) flow.name = wfName
  const md = generateWorkflowMd(flow, flow.nodes, flow.edges, { baseCommit: review.baseCommitField(root) || undefined })
  fs.writeFileSync(snapMdPath(dir.dir), md, 'utf-8')

  // write cleaned flow.json back（快照内）
  writeFlowJsonTo(root, dir.dir, flow)
}

// --- doctor (11 checks, ported from GUI validateWorkflow + CLI extensions) ---

interface CheckResult {
  check: string
  passed: boolean
  message: string
}

export function doctor(root: string, wfName: string, json: boolean = false): string {
  const flow = readFormalFlowJson(root, wfName)
  const nodes: any[] = flow.nodes || []
  const edges: any[] = flow.edges || []
  const results: CheckResult[] = []

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
  let branchIssues: string[] = []
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
    return JSON.stringify(results, null, 2)
  }

  const rows = results.map(r => `| ${r.check} | ${r.passed ? '通过' : '失败'} | ${r.message} |`)
  return ['| 检查项 | 结果 | 说明 |', '|------|------|------|', ...rows].join('\n')
}

// --- local node CRUD ---

export function listLocalNodes(root: string, wfName: string): string[] {
  const t = review.resolveEditTarget(root, 'workflow', wfName)
  const d = t.error ? localNodesDir(root, wfName) : snapNodesDir(t.dir)
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''))
    .sort()
}

export function readLocalNode(root: string, wfName: string, nodeName: string): string {
  const t = review.resolveEditTarget(root, 'workflow', wfName)
  const d = t.error ? localNodesDir(root, wfName) : snapNodesDir(t.dir)
  const p = path.join(d, `${nodeName}.md`)
  return fs.readFileSync(p, 'utf-8')
}

export function createLocalNode(root: string, wfName: string, nodeName: string, content: string): void {
  const d = snapNodesDir(editDirOfExisting(root, wfName))
  const p = path.join(d, `${nodeName}.md`)
  if (fs.existsSync(p)) throw new Error(`局部节点已存在: ${nodeName}`)
  fs.mkdirSync(d, { recursive: true })
  fs.writeFileSync(p, content, 'utf-8')
  markSnapshotPending(root, path.dirname(d))
}

export function delLocalNode(root: string, wfName: string, nodeName: string): void {
  const p = path.join(snapNodesDir(editDirOfExisting(root, wfName)), `${nodeName}.md`)
  if (fs.existsSync(p)) fs.unlinkSync(p)
  markSnapshotPending(root, path.dirname(path.dirname(p)))
}

// --- auto layout (ported from GUI flowEditorStore.ts:431-625) ---

