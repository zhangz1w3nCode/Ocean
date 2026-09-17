import { useEffect, useMemo, useRef, useState, type FC } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { forceX, forceY } from 'd3-force'
import { X, Network } from 'lucide-react'
import type { GraphData, GraphNode } from '../../hooks/useKnowledgeGraph'
import type { KnowledgeFile, KnowledgeGraphConfig } from '../../types'
import {
  DEFAULT_KNOWLEDGE_GRAPH_CONFIG,
  loadKnowledgeGraphConfig,
} from '../../utils/storage'

/** d3-force 会把 link.source/target 就地替换成节点对象，两种形态都可能出现 */
const endId = (end: string | GraphNode): string => (typeof end === 'string' ? end : end.id)

/** 配色沿用知识图谱页语义：活跃 #2e86de / 汇节点 #9CA3AF */
const COLOR_CENTER = '#2e86de'
const COLOR_LEAF = '#9CA3AF'
const COLOR_LINK = '#D1D5DB'

type MiniNode = {
  id: string
  name: string
  isCenter: boolean
  degree: number
  filepath?: string
  x?: number
  y?: number
}
type MiniLink = { source: string | MiniNode; target: string | MiniNode; label: string }

interface MiniGraphProps {
  nodes: MiniNode[]
  links: MiniLink[]
  config: KnowledgeGraphConfig
  onSelect: (filepath: string) => void
}

/**
 * 局部力导向图：中心为当前知识，四周为其邻居。
 *
 * 渲染参数全部取自知识图谱页那份持久化配置（AppConfig.knowledgeGraphConfig），
 * 不另立一套默认值：节点大小 / 连线长度与粗细 / 标签与关系标签字号 /
 * 向心力 / 吸引力 / 互斥力 / 是否展示关系标签，与整页图谱保持同一观感。
 *
 * 节点对象自建而非复用 graphData：力导向会就地改写传入对象，直接复用会污染整页图谱。
 */
const MiniGraph: FC<MiniGraphProps> = ({ nodes, links, config, onSelect }) => {
  const boxRef = useRef<HTMLDivElement>(null)
  const fgRef = useRef<any>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  // ForceGraph2D 不显式传宽高时会沿祖先链量尺寸，在侧栏/入场动画期间会量到视口大小导致裁切
  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const measure = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      setSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const data = useMemo(
    () => ({ nodes: nodes.map((n) => ({ ...n })), links: links.map((l) => ({ ...l })) }),
    [nodes, links],
  )

  // 与知识图谱页同一段力导向设置；延迟一拍确保引擎已初始化。
  // 注意：ref 只暴露 d3Force / d3ReheatSimulation / zoomToFit，warmupTicks 在本版本仅是 prop
  useEffect(() => {
    if (size.width === 0) return
    const t = setTimeout(() => {
      const fg = fgRef.current
      if (!fg) return
      const linkForce = fg.d3Force('link')
      if (linkForce) {
        linkForce.distance(config.linkDistance)
        linkForce.strength(config.linkStrength)
      }
      fg.d3Force('x', forceX(0).strength(config.centerForce))
      fg.d3Force('y', forceY(0).strength(config.centerForce))
      const chargeForce = fg.d3Force('charge')
      if (chargeForce) chargeForce.strength(config.chargeStrength)
      fg.d3ReheatSimulation()
      // 邻居铺开后会超出画布，按实际内容重新适配，避免节点与标签被裁切
      fg.zoomToFit(400, 30)
    }, 100)
    return () => clearTimeout(t)
  }, [data, size, config])

  const paintNode = (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    // 出度放大公式与整页图谱一致
    const sizeMultiplier = Math.min(1 + Math.sqrt(node.degree) * 0.3, 3)
    const baseNodeSize = config.nodeSize * sizeMultiplier
    const visualSize = globalScale < 1 ? baseNodeSize / globalScale : baseNodeSize

    ctx.beginPath()
    ctx.arc(node.x, node.y, visualSize, 0, 2 * Math.PI, true)
    ctx.fillStyle = node.isCenter ? COLOR_CENTER : COLOR_LEAF
    ctx.fill()
    if (node.isCenter) {
      ctx.lineWidth = Math.max(2 / globalScale, 0.5)
      ctx.strokeStyle = 'rgba(46,134,222,0.22)'
      ctx.stroke()
    }

    const baseFontSize = config.labelSize * 0.6
    const visualFontSize = globalScale < 1 ? baseFontSize / globalScale : baseFontSize
    ctx.font = `${node.isCenter ? 600 : 400} ${visualFontSize}px -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    // 白色描边，避免标签与连线重叠时读不出
    ctx.lineWidth = Math.max(3 / globalScale, 0.6)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'
    ctx.strokeText(node.name, node.x, node.y + visualSize + 2)
    ctx.fillStyle = node.isCenter ? '#1F2937' : '#6B7280'
    ctx.fillText(node.name, node.x, node.y + visualSize + 2)
  }

  const paintLink = (link: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const s = link.source
    const t = link.target
    if (typeof s !== 'object' || typeof t !== 'object' || s.x == null || t.x == null) return

    const visualLinkWidth = globalScale < 1 ? config.linkWidth / globalScale : config.linkWidth
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = COLOR_LINK
    ctx.lineWidth = visualLinkWidth
    ctx.stroke()

    // 箭头标示引用方向
    const angle = Math.atan2(t.y - s.y, t.x - s.x)
    const tip = Math.sqrt((t.x - s.x) ** 2 + (t.y - s.y) ** 2) > 12 ? 8 : 4
    const tipX = t.x - Math.cos(angle) * tip
    const tipY = t.y - Math.sin(angle) * tip
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - 5 * Math.cos(angle - Math.PI / 6), tipY - 5 * Math.sin(angle - Math.PI / 6))
    ctx.lineTo(tipX - 5 * Math.cos(angle + Math.PI / 6), tipY - 5 * Math.sin(angle + Math.PI / 6))
    ctx.closePath()
    ctx.fillStyle = COLOR_LINK
    ctx.fill()

    if (!config.showRelationLabel || !link.label) return
    const mx = (s.x + t.x) / 2
    const my = (s.y + t.y) / 2
    const baseFontSize = config.relationLabelSize
    const visualFontSize = globalScale < 1 ? baseFontSize / globalScale : baseFontSize
    ctx.font = `${visualFontSize}px -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const w = ctx.measureText(link.label).width + 3
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fillRect(mx - w / 2, my - visualFontSize * 0.8, w, visualFontSize * 1.6)
    ctx.fillStyle = '#9CA3AF'
    ctx.fillText(link.label, mx, my)
  }

  return (
    <div ref={boxRef} className="w-full h-full">
      {size.width > 0 && size.height > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={data}
          nodeRelSize={config.nodeSize}
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D) => {
            ctx.beginPath()
            ctx.arc(node.x, node.y, Math.max(config.nodeSize * 1.6, 8), 0, 2 * Math.PI, true)
            ctx.fillStyle = color
            ctx.fill()
          }}
          linkCanvasObject={paintLink}
          onNodeClick={(node: any) => {
            if (!node.isCenter && node.filepath) onSelect(node.filepath)
          }}
          onEngineStop={() => fgRef.current?.zoomToFit(200, 30)}
          enableZoomInteraction={false}
          enablePanInteraction={false}
          enableNodeDrag
          d3AlphaDecay={0.06}
          d3VelocityDecay={0.4}
          warmupTicks={60}
          cooldownTicks={80}
        />
      )}
    </div>
  )
}

interface RelatedKnowledgePanelProps {
  graphData: GraphData
  /** 仅 validated 的知识列表，与 graphData 出自同一次 memo */
  knowledgeFiles: KnowledgeFile[]
  selectedPath: string | null
  onClose: () => void
  onSelectKnowledge: (path: string) => void
}

/**
 * 知识目录「相关知识」栏：两个 box 各放一张 mini 知识图谱，
 * 上图为当前知识指向的节点，下图为指向当前知识的节点，两者均分整栏高度。
 *
 * 当前知识只由 selectedPath 表达、每次渲染现查 node id：
 * KnowledgeFile.id 由 storage.ts 用 Date.now()+random 生成，保存后 loadKnowledgeFiles()
 * 会全量重排，缓存 id 的写法在保存后即失效。
 */
export const RelatedKnowledgePanel: FC<RelatedKnowledgePanelProps> = ({
  graphData,
  knowledgeFiles,
  selectedPath,
  onClose,
  onSelectKnowledge,
}) => {
  const [config, setConfig] = useState<KnowledgeGraphConfig>(DEFAULT_KNOWLEDGE_GRAPH_CONFIG)

  // 与知识图谱页读同一份持久化配置，整页改过参数后这里跟随
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const saved = await loadKnowledgeGraphConfig()
      if (!cancelled) setConfig(saved)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [selectedPath])

  const activeKnowledge = useMemo(
    () =>
      selectedPath
        ? knowledgeFiles.find((k) => (k.filepath || k.name) === selectedPath)
        : undefined,
    [knowledgeFiles, selectedPath],
  )

  const { outNodes, outLinks, inNodes, inLinks } = useMemo(() => {
    if (!activeKnowledge) {
      return { outNodes: [] as MiniNode[], outLinks: [] as MiniLink[], inNodes: [] as MiniNode[], inLinks: [] as MiniLink[] }
    }
    const center: MiniNode = {
      id: activeKnowledge.id,
      name: activeKnowledge.name,
      isCenter: true,
      degree: 0,
      filepath: activeKnowledge.filepath,
    }
    const fileById = new Map(knowledgeFiles.map((k) => [k.id, k]))
    const nodeById = new Map(graphData.nodes.map((n) => [n.id, n]))
    const leaf = (otherId: string): MiniNode => ({
      id: otherId,
      name: nodeById.get(otherId)?.name || fileById.get(otherId)?.name || otherId,
      isCenter: false,
      degree: 1,
      filepath: fileById.get(otherId)?.filepath,
    })

    const outN: MiniNode[] = [center]
    const outL: MiniLink[] = []
    const inN: MiniNode[] = [center]
    const inL: MiniLink[] = []
    graphData.links.forEach((link) => {
      const s = endId(link.source)
      const t = endId(link.target)
      if (s === activeKnowledge.id) {
        const n = leaf(t)
        outN.push(n)
        outL.push({ source: center.id, target: n.id, label: link.label })
      } else if (t === activeKnowledge.id) {
        const n = leaf(s)
        inN.push(n)
        inL.push({ source: n.id, target: center.id, label: link.label })
      }
    })
    center.degree = outL.length + inL.length
    return { outNodes: outN, outLinks: outL, inNodes: inN, inLinks: inL }
  }, [activeKnowledge, graphData.links, graphData.nodes, knowledgeFiles])

  const renderBox = (title: string, nodes: MiniNode[], links: MiniLink[], emptyText: string) => (
    <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center px-3 py-2 bg-gray-50 border-b border-gray-100 flex-shrink-0">
        <span className="text-xs font-medium text-gray-600">{title}</span>
      </div>
      {links.length === 0 ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <p className="text-xs text-macos-text-tertiary">{emptyText}</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <MiniGraph nodes={nodes} links={links} config={config} onSelect={onSelectKnowledge} />
        </div>
      )}
    </div>
  )

  return (
    <div className="h-full flex flex-col min-h-0 bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between gap-2 px-3 h-10 flex-shrink-0 border-b border-gray-100">
        <div className="flex items-center gap-1.5 min-w-0">
          <Network size={14} className="flex-shrink-0 text-macos-text-tertiary" />
        </div>
        <button
          onClick={onClose}
          title="关闭"
          className="p-1 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
        >
          <X size={14} className="text-gray-400" />
        </button>
      </div>

      {!activeKnowledge ? (
        <div className="flex-1 flex items-center justify-center px-4 text-center">
          <p className="text-xs leading-5 text-macos-text-tertiary">
            当前文件未纳入知识图谱
            <br />
            （未通过审核或不属于知识库）
          </p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2 p-2">
          {renderBox('引用知识拓扑', outNodes, outLinks, '没有指向其他知识')}
          {renderBox('被引用知识拓扑', inNodes, inLinks, '没有被其他知识引用')}
        </div>
      )}
    </div>
  )
}
