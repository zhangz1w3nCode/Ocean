import { useEffect, useMemo, useState, type FC } from 'react'
import { Network, FileQuestion } from 'lucide-react'
import type { GraphData, GraphLink, GraphNode } from '../../hooks/useKnowledgeGraph'
import type { KnowledgeFile } from '../../types'
import { KnowledgeMiniGraph } from './KnowledgeMiniGraph'

/** d3-force 会把 link.source/target 就地替换成节点对象，两种形态都可能出现 */
const endId = (end: string | GraphNode): string => (typeof end === 'string' ? end : end.id)

const EMPTY_GRAPH: GraphData = { nodes: [], links: [] }

interface RelatedKnowledgePanelProps {
  graphData: GraphData
  /** 仅 validated 的知识列表，与 graphData 出自同一次 memo */
  knowledgeFiles: KnowledgeFile[]
  selectedPath: string | null
  onSelectKnowledge: (path: string) => void
}

/**
 * 知识目录「相关知识」栏：上下两个 box 各放一张 mini 知识图谱，
 * 上图「引用知识拓扑」为当前知识指向的节点，下图「被引用知识拓扑」为指向当前知识的节点。
 *
 * 图谱渲染复用 KnowledgeMiniGraph（由整页知识图谱组件复制改造而来），
 * 因此缩放、平移、拖拽、hover 高亮渐变与配色/字号配置与知识图谱页一致。
 *
 * 当前知识只由 selectedPath 表达、每次渲染现查 node id：
 * KnowledgeFile.id 由 storage.ts 用 Date.now()+random 生成，保存后 loadKnowledgeFiles()
 * 会全量重排，缓存 id 的写法在保存后即失效。
 */
export const RelatedKnowledgePanel: FC<RelatedKnowledgePanelProps> = ({
  graphData,
  knowledgeFiles,
  selectedPath,
  onSelectKnowledge,
}) => {
  const [hoverArmed, setHoverArmed] = useState(false)
  useEffect(() => {
    // 侧栏入场动画期间容器尺寸会变化，延后一拍再挂图谱，避免量到中间态尺寸
    const t = setTimeout(() => setHoverArmed(true), 220)
    return () => clearTimeout(t)
  }, [])

  const activeKnowledge = useMemo(
    () =>
      selectedPath
        ? knowledgeFiles.find((k) => (k.filepath || k.name) === selectedPath)
        : undefined,
    [knowledgeFiles, selectedPath],
  )

  // 以当前知识为中心切出两个方向的局部子图
  const { outGraph, inGraph } = useMemo(() => {
    if (!activeKnowledge) return { outGraph: EMPTY_GRAPH, inGraph: EMPTY_GRAPH }
    const centerId = activeKnowledge.id
    const nodeById = new Map(graphData.nodes.map((n) => [n.id, n]))
    const outIds = new Set<string>([centerId])
    const inIds = new Set<string>([centerId])
    const outLinks: GraphLink[] = []
    const inLinks: GraphLink[] = []

    graphData.links.forEach((link) => {
      const s = endId(link.source)
      const t = endId(link.target)
      if (s === centerId) {
        outIds.add(t)
        outLinks.push({ source: centerId, target: t, label: link.label })
      } else if (t === centerId) {
        inIds.add(s)
        inLinks.push({ source: s, target: centerId, label: link.label })
      }
    })

    // 出入度一律按本局部子图自身的边重算，不沿用整库全图的度数：
    // 整页图谱的节点大小与配色都由 in/outDegree 驱动（出度>0 为活跃节点画蓝并按
    // 1+sqrt(outDegree)*0.3 放大，出度 0 且入度>0 为汇节点画灰），
    // 若照抄全图度数，一个在整库引用了多篇的邻居会在局部图里被误画成大号蓝点，
    // 而它在局部图里其实一条出边都没有。
    // 同时节点实例必须新建：力导向会就地改写传入对象，复用整页图谱对象会互相污染。
    const build = (ids: Set<string>, links: GraphLink[]): GraphData => {
      const inDeg = new Map<string, number>()
      const outDeg = new Map<string, number>()
      links.forEach((l) => {
        const s = typeof l.source === 'string' ? l.source : l.source.id
        const t = typeof l.target === 'string' ? l.target : l.target.id
        outDeg.set(s, (outDeg.get(s) ?? 0) + 1)
        inDeg.set(t, (inDeg.get(t) ?? 0) + 1)
      })
      return {
        nodes: [...ids].map((id) => {
          const src = nodeById.get(id)
          return {
            id,
            name: src?.name ?? id,
            description: src?.description,
            tags: src?.tags,
            inDegree: inDeg.get(id) ?? 0,
            outDegree: outDeg.get(id) ?? 0,
          }
        }),
        links,
      }
    }

    return { outGraph: build(outIds, outLinks), inGraph: build(inIds, inLinks) }
  }, [activeKnowledge, graphData.nodes, graphData.links])

  const handleNodeClick = (knowledge: KnowledgeFile) => {
    const path = knowledge.filepath || knowledge.name
    if (path && path !== selectedPath) onSelectKnowledge(path)
  }

  // 两张图各占一半高度，只加一圈细边框用于区分，不带标题栏与灰底
  const renderGraph = (
    graph: GraphData,
    centerId: string,
    centerSizeBy: 'none' | 'inDegree' | 'outDegree',
  ) => (
    <div className="flex-1 min-h-0 rounded-lg border border-gray-200 overflow-hidden">
      {graph.links.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <FileQuestion size={28} className="text-macos-text-tertiary" />
        </div>
      ) : (
        hoverArmed && (
          <KnowledgeMiniGraph
            graphData={graph}
            knowledgeFiles={knowledgeFiles}
            onNodeClick={handleNodeClick}
            focusNodeId={centerId}
            centerSizeBy={centerSizeBy}
          />
        )
      )}
    </div>
  )

  return (
    <div className="h-full flex flex-col min-h-0">
      {!activeKnowledge ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <p className="text-xs leading-5 text-macos-text-tertiary">
            <Network size={20} className="mx-auto mb-2 text-macos-text-tertiary" />
            当前文件未纳入知识图谱
            <br />
            （未通过审核或不属于知识库）
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-3 pl-4 pr-0 py-3">
          {renderGraph(outGraph, activeKnowledge.id, 'outDegree')}
          {renderGraph(inGraph, activeKnowledge.id, 'inDegree')}
        </div>
      )}
    </div>
  )
}
