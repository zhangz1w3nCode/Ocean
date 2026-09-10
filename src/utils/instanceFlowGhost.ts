/**
 * 实例执行进度图的「候选后继虚化」派生计算。
 *
 * 引擎在 complete() 时就把 current 推进到下一节点，但 decision 的分支 target 要等到
 * choose() 才确定；在这段窗口里图上只点亮了当前节点，看不出接下来会走哪个节点。
 * 这里纯函数地算出「当前节点尚未实体化的候选后继」，交给渲染层以虚化样式预渲染。
 */

export interface GhostFlowNode {
  id: string
  type?: string
  data?: { label?: string; branches?: { id: string; name: string }[] }
}

export interface GhostFlowEdge {
  id: string
  source: string
  target: string
  branchId?: string
  /** 多 handle 节点（decision 每个分支一个 source handle）必须带上，否则 ReactFlow 会回退到第一个 handle */
  sourceHandle?: string
}

export interface GhostFlowData {
  nodes?: GhostFlowNode[]
  edges?: GhostFlowEdge[]
}

export interface GhostPathEntry {
  node: string
  branch?: string
}

export interface GhostEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
}

export interface GhostResult {
  nodeIds: string[]
  edges: GhostEdge[]
}

const EMPTY: GhostResult = { nodeIds: [], edges: [] }

export function computeGhostSuccessors(args: {
  flowData: GhostFlowData | null
  /** 已实体渲染节点的 label 集合，与 InstanceFlowGraph 的 visited 同源 */
  visited: Set<string>
  /** 图当前指向的节点 label（status.json 的 current_name） */
  currentName: string
  /** trace.jsonl 解析出的执行路径，用于判断 decision 分支是否已选定 */
  path: GhostPathEntry[]
  /** 终态（completed/aborted）与无图时置 false，不做任何预告 */
  enabled: boolean
}): GhostResult {
  const { flowData, visited, currentName, path, enabled } = args
  if (!enabled || !currentName || !flowData?.nodes?.length || !flowData.edges?.length) return EMPTY

  const frontier = flowData.nodes.find(n => (n.data?.label || '') === currentName)
  if (!frontier) return EMPTY

  let candidates = flowData.edges.filter(e => e.source === frontier.id)
  if (!candidates.length) return EMPTY

  // 分支已选定（choose 会把 branch 回填到 trace）时，只剩那条分支的候选；
  // 未选定则把全部分支 target 都作为候选虚化出来。
  if (frontier.type === 'decision') {
    const chosen = [...path].reverse().find(p => p.node === currentName)?.branch
    if (chosen) {
      const branchId = frontier.data?.branches?.find(b => b.name === chosen)?.id
      candidates = branchId ? candidates.filter(e => e.branchId === branchId) : []
      if (!candidates.length) return EMPTY
    }
  }

  const labelById = new Map(flowData.nodes.map(n => [n.id, n.data?.label || '']))

  const nodeIds: string[] = []
  const ghostTargets = new Set<string>()
  const seenTargets = new Set<string>()
  for (const edge of candidates) {
    // 多分支可指向同一 target，先去重再判定
    if (seenTargets.has(edge.target)) continue
    seenTargets.add(edge.target)
    // 已实体化的节点不进候选集（含回环指回已走过的节点）：
    // 它已经是个实心节点，再往它画虚线预览边会变成「虚线指向实心节点」的错乱
    if (visited.has(labelById.get(edge.target) || '')) continue
    ghostTargets.add(edge.target)
    nodeIds.push(edge.target)
  }
  if (!nodeIds.length) return EMPTY

  const edges: GhostEdge[] = []
  const seenPair = new Set<string>()
  for (const edge of candidates) {
    if (!ghostTargets.has(edge.target)) continue
    // 按「分支 handle + target」去重：同一 decision 的不同分支指向同一节点时各画一条线。
    // 不能只按 source|target 去重：那样 其他→分支甲 会被 走1→分支甲 合并掉，整条预览线消失。
    const handle = edge.sourceHandle || edge.branchId
    const key = `${edge.source}|${handle || ''}|${edge.target}`
    if (seenPair.has(key)) continue
    seenPair.add(key)
    // 加前缀：同一底层边将来会成为实体边（用原始 id），两者不可撞 id
    edges.push({ id: `ghost:${edge.id}`, source: edge.source, target: edge.target, sourceHandle: handle })
  }

  return { nodeIds, edges }
}
