import * as fs from 'node:fs'
import * as path from 'node:path'

export interface Branch {
  id: string
  name: string
  description?: string
}

export interface NodeData {
  label: string
  nodeRefPath?: string
  condition?: string
  branches: Branch[]
  content?: string
}

export interface Node {
  id: string
  type: string
  data: NodeData
}

export interface Edge {
  source: string
  target: string
  branchId?: string
}

export interface Flow {
  nodes: Node[]
  edges: Edge[]
}

export function fromFile(filePath: string): Flow {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf-8')
  } catch (e: any) {
    throw new Error(`读取 flow.json 失败 ${filePath}: ${e.message}`)
  }
  try {
    return JSON.parse(content) as Flow
  } catch (e: any) {
    throw new Error(`解析 flow.json 失败: ${e.message}`)
  }
}

export function node(flow: Flow, id: string): Node | undefined {
  return flow.nodes.find((n) => n.id === id)
}

export function startNode(flow: Flow): Node | undefined {
  return flow.nodes.find((n) => n.type === 'start')
}
