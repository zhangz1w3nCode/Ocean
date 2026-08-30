import { Edge, Flow, Node, node } from './model'

export class Graph {
  private flow: Flow

  constructor(flow: Flow) {
    this.flow = flow
  }

  private outgoing(nodeId: string): Edge[] {
    return this.flow.edges.filter((e) => e.source === nodeId)
  }

  nextNode(currentId: string, branchId?: string): string {
    const n = node(this.flow, currentId)
    if (!n) {
      throw new Error(`节点不存在: ${currentId}`)
    }

    switch (n.type) {
      case 'end':
        throw new Error('当前已是结束节点')
      case 'decision': {
        if (!branchId) {
          throw new Error('decision 节点需要分支选择')
        }
        const edge = this.outgoing(currentId).find((e) => e.branchId === branchId)
        if (!edge) {
          throw new Error(`分支 ${branchId} 不存在`)
        }
        return edge.target
      }
      default: {
        const outs = this.outgoing(currentId)
        if (outs.length === 1) {
          return outs[0].target
        }
        if (outs.length === 0) {
          throw new Error(`节点 ${currentId} 无出边`)
        }
        throw new Error(`business 节点 ${currentId} 存在多条出边`)
      }
    }
  }

  isLoopBack(decisionId: string, branchId: string, visited: string[]): boolean {
    try {
      const targetId = this.nextNode(decisionId, branchId)
      const targetNode = node(this.flow, targetId)
      if (!targetNode) return false
      return visited.includes(targetNode.data.label)
    } catch {
      return false
    }
  }

  branchNames(decisionId: string): string[] {
    const n = node(this.flow, decisionId)
    if (!n) return []
    return n.data.branches.map((b) => b.name)
  }
}
