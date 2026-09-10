import { describe, expect, it } from 'vitest'

import { computeGhostSuccessors, type GhostFlowData, type GhostPathEntry } from './instanceFlowGhost'

// 拓扑对齐沙箱实测工作流 ghost-e2e：start → A → D(走1→B1, 走2→B2, 其他→B1) → end
// 关键 1：走1 与 其他 指向同一 B1（真实 flow.json 就存在这种拓扑）
// 关键 2：decision 出边带 sourceHandle（与 branchId 同值），每个分支一个 handle
const flowData: GhostFlowData = {
  nodes: [
    { id: 'start-1', type: 'start', data: { label: '开始' } },
    { id: 'end-1', type: 'end', data: { label: '结束' } },
    { id: 'a', type: 'business', data: { label: 'A' } },
    {
      id: 'd', type: 'decision', data: {
        label: 'D',
        branches: [{ id: 'b1', name: '走1' }, { id: 'b2', name: '走2' }, { id: 'bo', name: '其他' }],
      },
    },
    { id: 'x1', type: 'business', data: { label: 'B1' } },
    { id: 'x2', type: 'business', data: { label: 'B2' } },
  ],
  edges: [
    { id: 'e-s-a', source: 'start-1', target: 'a' },
    { id: 'e-a-d', source: 'a', target: 'd' },
    { id: 'e-d-x1', source: 'd', target: 'x1', branchId: 'b1', sourceHandle: 'b1' },
    { id: 'e-d-x2', source: 'd', target: 'x2', branchId: 'b2', sourceHandle: 'b2' },
    { id: 'e-d-x1-other', source: 'd', target: 'x1', branchId: 'bo', sourceHandle: 'bo' },
    { id: 'e-x1-end', source: 'x1', target: 'end-1' },
    { id: 'e-x2-end', source: 'x2', target: 'end-1' },
  ],
}

const visitedOf = (...labels: string[]) => new Set(labels)

const run = (currentName: string, visited: Set<string>, path: GhostPathEntry[] = [], enabled = true) =>
  computeGhostSuccessors({ flowData, visited, currentName, path, enabled })

describe('候选后继虚化集合计算', () => {

  it('单后继：业务节点的唯一候选后继被虚化', () => {
    const r = run('A', visitedOf('开始', 'A'))
    expect(r.nodeIds).toEqual(['d'])
    expect(r.edges).toEqual([{ id: 'ghost:e-a-d', source: 'a', target: 'd', sourceHandle: undefined }])
  })

  it('多候选：decision 未选分支时列全部分支 target', () => {
    const r = run('D', visitedOf('开始', 'A', 'D'))
    expect(r.nodeIds).toEqual(['x1', 'x2'])
  })

  it('节点按 target 去重、边按分支 handle 各留一条', () => {
    const r = run('D', visitedOf('开始', 'A', 'D'))
    // 走1 与 其他 同指 B1：B1 只能出现一次
    expect(r.nodeIds.filter(id => id === 'x1')).toHaveLength(1)
    // 但两条预览线都要在，各自接在自己的 handle 上
    expect(r.edges.map(e => e.id).sort()).toEqual(['ghost:e-d-x1', 'ghost:e-d-x1-other', 'ghost:e-d-x2'])
    expect(r.edges.filter(e => e.target === 'x1').map(e => e.sourceHandle).sort()).toEqual(['b1', 'bo'])
  })

  it('回归：每条 decision 预览边必须带自己的 sourceHandle，不能全部回退到第一个 handle', () => {
    const r = run('D', visitedOf('开始', 'A', 'D'))
    const byTarget = new Map(r.edges.map(e => [e.id, e.sourceHandle]))
    expect(byTarget.get('ghost:e-d-x1')).toBe('b1')
    expect(byTarget.get('ghost:e-d-x2')).toBe('b2')
    expect(byTarget.get('ghost:e-d-x1-other')).toBe('bo')
    // 三条边的 handle 不得全相同
    expect(new Set(r.edges.map(e => e.sourceHandle)).size).toBe(3)
  })

  it('分支已选定：只保留命中 branchId 的候选', () => {
    const r = run('D', visitedOf('开始', 'A', 'D'), [{ node: 'D', branch: '走2' }])
    expect(r.nodeIds).toEqual(['x2'])
    expect(r.edges).toEqual([{ id: 'ghost:e-d-x2', source: 'd', target: 'x2', sourceHandle: 'b2' }])
  })

  it('目标已实体化（含回环指回走过的节点）时不虚化，且不得往实心节点画预览边', () => {
    const loopBack = run('B1', visitedOf('开始', 'A', 'D', 'B1', '结束'))
    expect(loopBack.nodeIds).toEqual([])
    expect(loopBack.edges).toEqual([])

    // 回环回归：D 的候选 B1 已实心、B2 未走 → 只允许虚化 B2 及其那一条边
    // （修复前 seen/ghostTargets 共用一个集合，会把 e-d-x1 也当成 ghost 边，虚线指向实心节点）
    const partial = run('D', visitedOf('开始', 'A', 'D', 'B1'))
    expect(partial.nodeIds).toEqual(['x2'])
    expect(partial.edges).toEqual([{ id: 'ghost:e-d-x2', source: 'd', target: 'x2', sourceHandle: 'b2' }])
  })

  it('结束节点无出边 → 空', () => {
    const r = run('结束', visitedOf('开始', 'A', 'D', 'B2', '结束'))
    expect(r).toEqual({ nodeIds: [], edges: [] })
  })

  it('终态或无图（enabled=false）→ 空', () => {
    expect(run('A', visitedOf('开始', 'A'), [], false)).toEqual({ nodeIds: [], edges: [] })
    expect(run('D', visitedOf('开始', 'A', 'D'), [], false).nodeIds).toEqual([])
  })

  it('frontier 找不到 / 入参缺失 → 空，不抛错', () => {
    expect(run('不存在', visitedOf()).nodeIds).toEqual([])
    expect(run('', visitedOf()).nodeIds).toEqual([])
    expect(computeGhostSuccessors({ flowData: null, visited: visitedOf(), currentName: 'A', path: [], enabled: true }).nodeIds).toEqual([])
    expect(computeGhostSuccessors({ flowData: {}, visited: visitedOf(), currentName: 'A', path: [], enabled: true }).nodeIds).toEqual([])
  })

  it('start 节点也可作为 frontier（main 上 create 后 current 即 start）', () => {
    expect(run('开始', visitedOf('开始')).nodeIds).toEqual(['a'])
  })

  it('ghost 边 id 一律带前缀，避免与实体边 id 撞车', () => {
    for (const e of run('D', visitedOf('开始', 'A', 'D')).edges) {
      expect(e.id.startsWith('ghost:')).toBe(true)
    }
  })
})
