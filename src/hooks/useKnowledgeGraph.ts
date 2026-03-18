/**
 * 知识图谱数据计算 Hook
 * 从知识数据中提取关系，构建 Force Graph 数据格式
 */

import { useMemo } from 'react'
import { useKnowledgeStore } from '../stores/knowledgeStore'
import { parseKnowledgeLinks } from '../utils/knowledgeGraphParser'

/**
 * 图谱节点数据
 */
export interface GraphNode {
  id: string
  name: string
  description?: string
  tags?: string[]
  inDegree: number    // 入度（被引用次数）
  outDegree: number   // 出度（引用其他节点次数）
  // Force Graph 运行时添加的属性
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number
  fy?: number
}

/**
 * 图谱链接数据
 */
export interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  label: string
}

/**
 * 图谱数据
 */
export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

/**
 * 知识图谱数据 Hook
 * @returns 图谱数据和知识文件列表
 */
export function useKnowledgeGraph() {
  const { knowledgeFiles } = useKnowledgeStore()

  // 构建知识名称到 ID 的映射（不区分大小写）
  const nameToIdMap = useMemo(() => {
    const map = new Map<string, string>()
    knowledgeFiles.forEach((k) => {
      map.set(k.name.toLowerCase(), k.id)
    })
    return map
  }, [knowledgeFiles])

  // 计算图谱数据
  const graphData = useMemo<GraphData>(() => {
    const nodes: GraphNode[] = []
    const links: GraphLink[] = []
    const linkSet = new Set<string>() // 用于去重
    const nodeDegreeMap = new Map<string, { inDegree: number; outDegree: number }>()

    // 1. 初始化所有知识节点和出入度
    knowledgeFiles.forEach((knowledge) => {
      nodes.push({
        id: knowledge.id,
        name: knowledge.name,
        description: knowledge.description,
        tags: knowledge.tags,
        inDegree: 0,
        outDegree: 0,
      })
      nodeDegreeMap.set(knowledge.id, { inDegree: 0, outDegree: 0 })
    })

    // 2. 解析关系并创建链接，同时计算出入度
    knowledgeFiles.forEach((knowledge) => {
      if (!knowledge.content) return

      const parsedLinks = parseKnowledgeLinks(knowledge.content)

      parsedLinks.forEach((link) => {
        const targetId = nameToIdMap.get(link.targetName.toLowerCase())

        if (targetId && targetId !== knowledge.id) {
          // 创建链接的唯一标识（避免重复）
          const linkKey = `${knowledge.id}-${targetId}`

          if (!linkSet.has(linkKey)) {
            linkSet.add(linkKey)

            links.push({
              source: knowledge.id,
              target: targetId,
              label: link.relation,
            })

            // 更新出入度
            const sourceDegree = nodeDegreeMap.get(knowledge.id)
            const targetDegree = nodeDegreeMap.get(targetId)
            if (sourceDegree) {
              sourceDegree.outDegree += 1
            }
            if (targetDegree) {
              targetDegree.inDegree += 1
            }
          }
        }
      })
    })

    // 3. 将计算好的出入度更新到节点数据
    nodes.forEach((node) => {
      const degree = nodeDegreeMap.get(node.id)
      if (degree) {
        node.inDegree = degree.inDegree
        node.outDegree = degree.outDegree
      }
    })

    return { nodes, links }
  }, [knowledgeFiles, nameToIdMap])

  const hasGraph = graphData.nodes.length > 0

  return { graphData, hasGraph, knowledgeFiles }
}