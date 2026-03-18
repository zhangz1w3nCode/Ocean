// React Flow 节点和边类型
import type { Node, Edge } from '@xyflow/react'

// 分支配置
export interface Branch {
  id: string
  name: string
  description?: string
}

// 流程图节点（简化版数据结构）
export interface ReactFlowNode extends Node {
  type: 'start' | 'process' | 'decision' | 'end' | 'business' | 'local'
  data: {
    label: string
    description?: string
    // 节点定义关联
    nodeDefId?: string           // 关联的节点定义ID
    nodeDefName?: string         // 节点定义名称（冗余存储）
    // 从节点定义复制过来的完整信息（简化版）
    content?: string             // 节点内容
    // 标记节点是否在工作流中被自定义过
    isCustomized?: boolean
    // 画布实例特有配置
    config?: Record<string, any>
    // 判断节点专用配置
    condition?: string           // 判断条件描述
    branches?: Branch[]          // 分支配置数组，可动态添加
    // 局部节点专用配置
    isLocal?: boolean            // 标记是否为局部节点
    localNodeName?: string       // 局部节点文件名（不含.md后缀）
  }
}

// 流程图边
export interface ReactFlowEdge extends Edge {
  type?: 'default' | 'smoothstep' | 'straight' | 'bezier' | 'step'
  label?: string
}

// 编辑器状态
export interface FlowEditorData {
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  viewport?: {
    x: number
    y: number
    zoom: number
  }
}