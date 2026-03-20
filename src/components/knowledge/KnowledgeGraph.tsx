/**
 * 知识图谱弹窗组件
 * 使用 Force Graph 实现类似 Obsidian 的知识图谱可视化
 */

import type { FC } from 'react'
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import ForceGraph2D from 'react-force-graph-2d'
import { motion, AnimatePresence } from 'framer-motion'
import { forceX, forceY } from 'd3-force'

import { useKnowledgeGraph, type GraphNode, type GraphLink } from '../../hooks/useKnowledgeGraph'
import { Network, X, Settings, RotateCcw } from 'lucide-react'
import type { KnowledgeFile, KnowledgeGraphConfig } from '../../types'
import { loadKnowledgeGraphConfig, saveKnowledgeGraphConfig, DEFAULT_KNOWLEDGE_GRAPH_CONFIG } from '../../utils/storage'

interface KnowledgeGraphModalProps {
  isOpen: boolean
  onClose: () => void
  onNodeClick?: (knowledge: KnowledgeFile) => void
}

export const KnowledgeGraphModal: FC<KnowledgeGraphModalProps> = ({
  isOpen,
  onClose,
  onNodeClick,
}) => {
  const { graphData, hasGraph, knowledgeFiles } = useKnowledgeGraph()
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [draggedNode, setDraggedNode] = useState<GraphNode | null>(null)
  const [config, setConfig] = useState<KnowledgeGraphConfig>(DEFAULT_KNOWLEDGE_GRAPH_CONFIG)
  const [showSettings, setShowSettings] = useState(false)
  const graphRef = useRef<any>(null)
  // 使用 ref 追踪拖动状态，避免状态断开导致闪烁
  const isDraggingRef = useRef(false)
  // 延迟清空悬浮节点的定时器
  const hoverClearTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // === 使用 ref 存储最新数据，避免 useEffect 依赖问题 ===
  const graphDataRef = useRef(graphData)
  graphDataRef.current = graphData
  const configRef = useRef(config)
  configRef.current = config
  const hoveredNodeRef = useRef(hoveredNode)
  hoveredNodeRef.current = hoveredNode
  const handleNodeClickRef = useRef<(node: GraphNode) => void>(() => {})

  // === 平滑过渡动画状态 ===
  // 当前动画透明度（1 = 完全不透明，0.12 = 极淡）
  const animatedOpacityRef = useRef(1)
  // 动画帧请求ID
  const animationFrameRef = useRef<number | null>(null)
  // 目标透明度
  const targetOpacityRef = useRef(1)
  // 当前高亮进度（0 = 默认状态，1 = 完全高亮）
  const animatedHighlightRef = useRef(0)
  // 目标高亮进度
  const targetHighlightRef = useRef(0)

  // 当前活跃节点（悬浮或拖动）
  const activeNode = draggedNode || hoveredNode

  // 清理定时器
  useEffect(() => {
    return () => {
      if (hoverClearTimeoutRef.current) {
        clearTimeout(hoverClearTimeoutRef.current)
      }
    }
  }, [])

  // === 平滑过渡动画效果 ===
  // 监听 activeNode 变化，启动平滑过渡动画
  useEffect(() => {
    // 设置目标透明度：有活跃节点时无关节点变为 0.12，否则恢复为 1
    targetOpacityRef.current = activeNode ? 0.12 : 1
    // 设置目标高亮进度：有活跃节点时为 1，否则为 0
    targetHighlightRef.current = activeNode ? 1 : 0

    // 取消之前的动画帧
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    // 动画持续时间（毫秒）- 调长使过渡更丝滑
    const duration = 500
    const startTime = performance.now()
    const startOpacity = animatedOpacityRef.current
    const targetOpacity = targetOpacityRef.current
    const startHighlight = animatedHighlightRef.current
    const targetHighlight = targetHighlightRef.current

    // 如果已经到达目标值，无需动画
    if (Math.abs(startOpacity - targetOpacity) < 0.01 && Math.abs(startHighlight - targetHighlight) < 0.01) {
      animatedOpacityRef.current = targetOpacity
      animatedHighlightRef.current = targetHighlight
      return
    }

    // 触发 ForceGraph2D 重新开始模拟（这会使 Canvas 持续重绘）
    // 由于动画时间很短，节点移动会非常微小
    if (graphRef.current) {
      graphRef.current.d3ReheatSimulation()
    }

    // 动画函数
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // 使用 easeOutCubic 缓动函数，更丝滑
      const easeProgress = 1 - Math.pow(1 - progress, 3)

      // 插值计算当前透明度
      animatedOpacityRef.current = startOpacity + (targetOpacity - startOpacity) * easeProgress
      // 插值计算当前高亮进度
      animatedHighlightRef.current = startHighlight + (targetHighlight - startHighlight) * easeProgress

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [activeNode])

  // 颜色插值辅助函数：在两个颜色之间插值
  const lerpColor = useCallback((color1: { r: number; g: number; b: number }, color2: { r: number; g: number; b: number }, t: number) => {
    return {
      r: Math.round(color1.r + (color2.r - color1.r) * t),
      g: Math.round(color1.g + (color2.g - color1.g) * t),
      b: Math.round(color1.b + (color2.b - color1.b) * t),
    }
  }, [])

  // 定义颜色常量（RGB 格式便于插值）
  const COLORS = useMemo(() => ({
    // 节点颜色
    activeNode: { r: 46, g: 134, b: 222 },      // #2e86de - 活跃节点默认
    highlightNode: { r: 77, g: 171, b: 247 },   // #4dabf7 - 高亮节点
    sinkNode: { r: 156, g: 163, b: 175 },       // #9CA3AF - 汇节点
    isolatedNode: { r: 75, g: 85, b: 99 },      // #4B5563 - 孤岛节点
    // 连线颜色
    link: { r: 156, g: 163, b: 175 },           // #9CA3AF - 默认连线
    highlightLink: { r: 77, g: 171, b: 247 },   // #4dabf7 - 高亮连线
  }), [])

  // 从 .ocean 目录加载配置
  useEffect(() => {
    const loadConfig = async () => {
      const savedConfig = await loadKnowledgeGraphConfig()
      setConfig(savedConfig)
    }
    loadConfig()
  }, [isOpen]) // 弹窗打开时重新加载配置

  // 配置加载后更新力导向
  useEffect(() => {
    if (isOpen && graphRef.current) {
      // 延迟执行确保图谱已初始化
      setTimeout(() => {
        if (graphRef.current) {
          // 连线力
          const linkForce = graphRef.current.d3Force('link')
          if (linkForce) {
            linkForce.distance(config.linkDistance)
            linkForce.strength(config.linkStrength)
          }
          // 向心力（使用 forceX 和 forceY 实现，center force 没有 strength 方法）
          graphRef.current.d3Force('x', forceX(0).strength(config.centerForce))
          graphRef.current.d3Force('y', forceY(0).strength(config.centerForce))
          // 互斥力
          const chargeForce = graphRef.current.d3Force('charge')
          if (chargeForce) {
            chargeForce.strength(config.chargeStrength)
          }
          graphRef.current.d3ReheatSimulation()
          graphRef.current.zoomToFit(400, 80)
        }
      }, 100)
    }
  }, [isOpen, config.linkDistance, config.linkStrength, config.centerForce, config.chargeStrength])

  // 配置变化时自动保存
  const saveConfig = useCallback(async (newConfig: KnowledgeGraphConfig) => {
    await saveKnowledgeGraphConfig(newConfig)
  }, [])

  // 计算与活跃节点相关的节点ID集合
  const relatedNodeIds = useMemo(() => {
    if (!activeNode) return new Set<string>()

    const related = new Set<string>()
    related.add(activeNode.id)

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id

      if (sourceId === activeNode.id) {
        related.add(targetId)
      } else if (targetId === activeNode.id) {
        related.add(sourceId)
      }
    })

    return related
  }, [activeNode, graphData.links])

  // 计算与活跃节点相关的链接集合
  const relatedLinks = useMemo(() => {
    if (!activeNode) return new Set<GraphLink>()

    const related = new Set<GraphLink>()
    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id

      if (sourceId === activeNode.id || targetId === activeNode.id) {
        related.add(link)
      }
    })

    return related
  }, [activeNode, graphData.links])

  // 构建双向引用查找表：记录每对节点之间的所有连线和标签
  const bidirectionalLinksMap = useMemo(() => {
    const map = new Map<string, { forward?: GraphLink; backward?: GraphLink }>()

    graphData.links.forEach((link) => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      // 使用有序的 key 确保双向引用映射到同一个条目
      const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`

      const entry = map.get(key) || {}
      if (sourceId < targetId) {
        entry.forward = link
      } else {
        entry.backward = link
      }
      map.set(key, entry)
    })

    return map
  }, [graphData.links])

  // ESC 键关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        // 移除当前焦点，避免关闭后按钮显示 focus 样式
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
        onClose()
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  // 打开弹窗时锁定 body 滚动（使用 scrollbar-gutter 防止抖动）
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'

      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // 打开时重新计算布局
  useEffect(() => {
    if (isOpen && graphRef.current) {
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80)
      }, 500)
    }
  }, [isOpen, graphData])

  // 重置配置
  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_KNOWLEDGE_GRAPH_CONFIG)
    saveConfig(DEFAULT_KNOWLEDGE_GRAPH_CONFIG)
  }, [saveConfig])

  // 绘制节点
  const paintNode = useCallback((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
    if (!isFinite(node.x!) || !isFinite(node.y!)) return

    const isHovered = activeNode?.id === node.id
    const isRelated = activeNode !== null && relatedNodeIds.has(node.id) && !isHovered
    // 高亮：悬浮节点 或 没有活跃节点时的所有节点
    const isHighlighted = !activeNode || isHovered

    // 计算基于出度的节点大小放大系数
    // 公式：sizeMultiplier = 1 + Math.sqrt(outDegree) * 0.3
    // 出度越大，节点越大，但增长趋于平缓（平方根函数）
    // 最大放大倍数为3倍，避免差异过大
    const outDegreeSizeMultiplier = Math.min(1 + Math.sqrt(node.outDegree) * 0.3, 3)

    // 节点视觉大小：只在缩小时保持一致，放大时正常变大
    // globalScale < 1 时（缩小），绘制更大补偿；globalScale >= 1 时（放大），使用原始大小
    const baseNodeSize = (isHovered ? config.nodeSize + 0.5 : config.nodeSize) * outDegreeSizeMultiplier
    const visualSize = globalScale < 1 ? baseNodeSize / globalScale : baseNodeSize

    // 标签大小同样只在缩小时保持一致
    const baseFontSize = config.labelSize * 0.6
    const visualFontSize = globalScale < 1 ? baseFontSize / globalScale : baseFontSize

    // 计算标签透明度（基于缩放级别的平滑渐变）
    const labelOpacity = Math.max(0, Math.min(1, (globalScale - 0.3) / 0.4))

    // 根据出入度判断节点类型
    const hasOutDegree = node.outDegree > 0
    const hasInDegree = node.inDegree > 0
    const isIsolated = !hasOutDegree && !hasInDegree  // 孤岛节点（无入度无出度）
    const isSinkNode = !hasOutDegree && hasInDegree   // 汇节点（只有入度，没有出度）

    ctx.save()

    // 阴影模糊只在缩小时调整
    const shadowBlur = globalScale < 1 ? Math.min(20, 6 / globalScale) : 6

    // 获取当前高亮进度
    const highlightProgress = animatedHighlightRef.current

    // === 根据出入度设置不同默认颜色 ===
    if (isHovered) {
      // 焦点节点：更亮的蓝色（悬浮状态统一颜色）
      ctx.shadowColor = 'rgba(77, 171, 247, 0.5)'
      ctx.shadowBlur = shadowBlur * 2
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = globalScale < 1 ? 2 / globalScale : 2
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, visualSize, 0, 2 * Math.PI)
      ctx.fillStyle = '#4dabf7' // 更亮的蓝色
      ctx.fill()
    } else if (isRelated) {
      // 相关节点（与悬浮节点相连）：保持默认颜色，不高亮
      let baseColor: { r: number; g: number; b: number }

      if (isIsolated) {
        // 孤岛节点（无入度无出度）：深灰色
        baseColor = COLORS.isolatedNode
      } else if (isSinkNode) {
        // 汇节点（只有入度，没有出度）：灰色
        baseColor = COLORS.sinkNode
      } else {
        // 活跃节点（有出度）：深蓝色
        baseColor = COLORS.activeNode
      }

      const colorStr = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`
      ctx.shadowColor = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.3)`
      ctx.shadowBlur = shadowBlur * 0.7
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = globalScale < 1 ? 1 / globalScale : 1
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, visualSize, 0, 2 * Math.PI)
      ctx.fillStyle = colorStr
      ctx.fill()
    } else if (isHighlighted) {
      // 非活跃状态的所有节点：保持默认颜色，不使用插值
      let baseColor: { r: number; g: number; b: number }

      if (isIsolated) {
        // 孤岛节点（无入度无出度）：深灰色
        baseColor = COLORS.isolatedNode
      } else if (isSinkNode) {
        // 汇节点（只有入度，没有出度）：灰色
        baseColor = COLORS.sinkNode
      } else {
        // 活跃节点（有出度）：深蓝色
        baseColor = COLORS.activeNode
      }

      // 直接使用默认颜色，不插值到高亮色
      const colorStr = `rgb(${baseColor.r}, ${baseColor.g}, ${baseColor.b})`

      ctx.shadowColor = `rgba(${baseColor.r}, ${baseColor.g}, ${baseColor.b}, 0.3)`
      ctx.shadowBlur = shadowBlur * 0.7
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = globalScale < 1 ? 1 / globalScale : 1
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, visualSize, 0, 2 * Math.PI)
      ctx.fillStyle = colorStr
      ctx.fill()
    } else {
      // 无关节点：使用平滑过渡的透明度
      const opacity = animatedOpacityRef.current
      ctx.shadowColor = `rgba(0, 0, 0, ${opacity * 0.15})`
      ctx.shadowBlur = shadowBlur * 0.3
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = globalScale < 1 ? 1 / globalScale : 1
      ctx.beginPath()
      ctx.arc(node.x!, node.y!, visualSize, 0, 2 * Math.PI)
      // 使用动态透明度，从 1 平滑过渡到 0.12
      ctx.fillStyle = `rgba(180, 190, 200, ${opacity})`
      ctx.fill()
    }
    ctx.restore()

    // 绘制标签
    if (labelOpacity > 0.05) {
      ctx.font = `400 ${visualFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Sans-Serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'

      // 无关节点使用平滑过渡透明度
      const nodeLabelOpacity = !isHighlighted && !isRelated ? labelOpacity * animatedOpacityRef.current : labelOpacity

      if (isHovered) {
        // 焦点标签：保持正常深灰色，不变亮
        ctx.fillStyle = `rgba(55, 65, 81, ${labelOpacity})`
      } else if (isRelated) {
        // 相关节点标签：正常深灰
        ctx.fillStyle = `rgba(55, 65, 81, ${labelOpacity})`
      } else if (isHighlighted) {
        // 高亮标签：正常深灰
        ctx.fillStyle = `rgba(55, 65, 81, ${labelOpacity})`
      } else {
        // 无关标签：使用平滑过渡透明度
        ctx.fillStyle = `rgba(180, 190, 200, ${nodeLabelOpacity})`
      }
      // 标签位置基于视觉大小
      ctx.fillText(node.name, node.x!, node.y! + visualSize + (globalScale < 1 ? 2 / globalScale : 2))
    }
  }, [activeNode, relatedNodeIds, config, COLORS, lerpColor])

  // 绘制链接
  const paintLink = useCallback((link: GraphLink, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as GraphNode
    const target = link.target as GraphNode

    if (!isFinite(source.x!) || !isFinite(source.y!) || !isFinite(target.x!) || !isFinite(target.y!)) return

    // 判断连线类型
    const isHoveredLink = activeNode && relatedLinks.has(link)
    const isRelatedLink = !activeNode || relatedLinks.has(link)

    // 判断源节点和目标节点是否被悬浮
    const isSourceHovered = activeNode?.id === source.id
    const isTargetHovered = activeNode?.id === target.id

    // 箭头和关系标签透明度渐变（调整阈值适应新的缩放逻辑）
    const arrowOpacity = Math.max(0, Math.min(1, (globalScale - 0.2) / 0.4))

    const dx = target.x! - source.x!
    const dy = target.y! - source.y!
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 1) return

    // 计算源节点和目标节点的视觉半径：只在缩小时补偿
    // 根据入度动态调整节点大小
    const sourceSizeMultiplier = Math.min(1 + Math.sqrt(source.inDegree) * 0.3, 3)
    const targetSizeMultiplier = Math.min(1 + Math.sqrt(target.inDegree) * 0.3, 3)

    const baseSourceRadius = (isSourceHovered ? config.nodeSize + 0.5 : config.nodeSize) * sourceSizeMultiplier
    const baseTargetRadius = (isTargetHovered ? config.nodeSize + 0.5 : config.nodeSize) * targetSizeMultiplier
    const visualSourceRadius = globalScale < 1 ? baseSourceRadius / globalScale : baseSourceRadius
    const visualTargetRadius = globalScale < 1 ? baseTargetRadius / globalScale : baseTargetRadius

    const startX = source.x! + (dx / distance) * visualSourceRadius
    const startY = source.y! + (dy / distance) * visualSourceRadius
    const endX = target.x! - (dx / distance) * (visualTargetRadius + (globalScale < 1 ? 1 / globalScale : 1))
    const endY = target.y! - (dy / distance) * (visualTargetRadius + (globalScale < 1 ? 1 / globalScale : 1))

    // === 淡蓝水墨质感配色方案 ===
    // 对于不活跃状态，需要判断两个节点都不活跃时才应用褪色效果
    const isInactiveLink = !isRelatedLink

    // 连线宽度：只在缩小时保持视觉一致
    const visualLinkWidth = globalScale < 1 ? config.linkWidth / globalScale : config.linkWidth

    // 绘制连线
    ctx.beginPath()
    ctx.moveTo(startX, startY)
    ctx.lineTo(endX, endY)

    // 计算无关元素的平滑过渡透明度
    const inactiveOpacity = isInactiveLink ? animatedOpacityRef.current : 1
    // 获取当前高亮进度
    const highlightProgress = animatedHighlightRef.current

    if (isHoveredLink) {
      // 焦点连线：更亮的蓝色 #4dabf7
      ctx.strokeStyle = '#4dabf7'
    } else if (isRelatedLink) {
      // 相关连线：使用颜色插值实现平滑高亮过渡
      const currentColor = lerpColor(COLORS.link, COLORS.highlightLink, highlightProgress)
      ctx.strokeStyle = `rgb(${currentColor.r}, ${currentColor.g}, ${currentColor.b})`
    } else {
      // 无关连线：使用平滑过渡透明度
      ctx.strokeStyle = `rgba(200, 220, 240, ${inactiveOpacity * 0.25})`
    }
    ctx.lineWidth = isInactiveLink ? visualLinkWidth * 0.8 : visualLinkWidth
    ctx.lineCap = 'round'
    ctx.stroke()

    // 绘制 V 形箭头
    const visualArrowSize = visualLinkWidth * 4
    const angle = Math.atan2(dy, dx)

    ctx.save()
    ctx.translate(target.x!, target.y!)
    ctx.rotate(angle)

    ctx.beginPath()
    ctx.moveTo(-visualTargetRadius - (globalScale < 1 ? 1 / globalScale : 1), 0)
    ctx.lineTo(-visualTargetRadius - visualArrowSize - (globalScale < 1 ? 1 / globalScale : 1), -visualArrowSize / 2)
    ctx.moveTo(-visualTargetRadius - (globalScale < 1 ? 1 / globalScale : 1), 0)
    ctx.lineTo(-visualTargetRadius - visualArrowSize - (globalScale < 1 ? 1 / globalScale : 1), visualArrowSize / 2)

    // 箭头颜色与连线一致（使用平滑过渡透明度和颜色插值）
    const finalArrowOpacity = arrowOpacity * inactiveOpacity
    if (isHoveredLink) {
      ctx.strokeStyle = `rgba(77, 171, 247, ${finalArrowOpacity})`
    } else if (isRelatedLink) {
      // 相关箭头：使用颜色插值实现平滑高亮过渡
      const currentColor = lerpColor(COLORS.link, COLORS.highlightLink, highlightProgress)
      ctx.strokeStyle = `rgba(${currentColor.r}, ${currentColor.g}, ${currentColor.b}, ${finalArrowOpacity})`
    } else {
      // 无关箭头：使用平滑过渡透明度
      ctx.strokeStyle = `rgba(200, 220, 240, ${finalArrowOpacity})`
    }
    ctx.lineWidth = isInactiveLink ? visualLinkWidth * 0.8 : visualLinkWidth
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.restore()

    // 显示关系标签（根据配置控制是否显示）
    const labelOpacity = arrowOpacity * inactiveOpacity
    if (labelOpacity > 0.1 && config.showRelationLabel) {
      // 获取标签文本
      let labelTexts: string[] = []
      let shouldDrawLabel = false

      // 判断当前连线是否为悬浮节点的出度（source 是悬浮节点）
      const isActiveNodeOutLink = activeNode && source.id === activeNode.id

      if (activeNode) {
        // === 悬浮状态：只显示当前节点的出度关系 ===
        if (isActiveNodeOutLink && link.label) {
          // 只绘制 source 是当前悬浮节点的连线标签
          labelTexts = [link.label]
          shouldDrawLabel = true
        }
      } else {
        // === 默认状态：双向引用合并显示 ===
        // 检查是否存在双向引用
        const sourceId = source.id
        const targetId = target.id
        const key = sourceId < targetId ? `${sourceId}-${targetId}` : `${targetId}-${sourceId}`
        const bidirectionalEntry = bidirectionalLinksMap.get(key)

        // 判断是否为双向引用
        const isBidirectional = bidirectionalEntry?.forward && bidirectionalEntry?.backward

        if (isBidirectional) {
          // 双向引用：只在正向（source.id < target.id）时绘制合并标签
          if (sourceId < targetId) {
            const forwardLabel = bidirectionalEntry.forward?.label || ''
            const backwardLabel = bidirectionalEntry.backward?.label || ''
            // 正向标签在上，反向标签在下
            labelTexts = [forwardLabel, backwardLabel].filter(l => l)
            shouldDrawLabel = labelTexts.length > 0
          }
          // 反向时跳过绘制（由正向负责）
        } else {
          // 单向引用：正常绘制
          if (link.label) {
            labelTexts = [link.label]
            shouldDrawLabel = true
          }
        }
      }

      if (shouldDrawLabel && labelTexts.length > 0) {
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2

        // 关系标签字体大小：只在缩小时保持视觉一致
        const baseFontSize = config.relationLabelSize
        const visualFontSize = globalScale < 1 ? baseFontSize / globalScale : baseFontSize
        const lineHeight = visualFontSize + (globalScale < 1 ? 2 / globalScale : 2) // 行高

        // 根据字体大小动态计算样式参数（更精致的样式）
        const scaleFactor = visualFontSize / 5
        const padding = Math.max(1, 2 * scaleFactor) // 内边距，最小 1px
        const bgRadius = Math.max(1, 2 * scaleFactor) // 圆角，最小 1px
        const borderWidth = Math.max(0.3, 0.5 * scaleFactor) // 边框宽度，更细，最小 0.3px
        const shadowBlur = Math.max(0.5, 2 * scaleFactor) // 阴影模糊，最小 0.5px

        ctx.font = `400 ${visualFontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", Sans-Serif`

        // 计算背景尺寸（取最宽的一行）
        const maxWidth = Math.max(...labelTexts.map(text => ctx.measureText(text).width))
        const bgWidth = maxWidth + padding * 2
        const bgHeight = labelTexts.length * lineHeight + padding

        ctx.save()
        ctx.shadowColor = isInactiveLink ? 'transparent' : 'rgba(0, 0, 0, 0.06)'
        ctx.shadowBlur = isInactiveLink ? 0 : shadowBlur
        ctx.shadowOffsetY = isInactiveLink ? 0 : Math.max(0.5, 1 * scaleFactor)

        ctx.beginPath()
        ctx.roundRect(midX - bgWidth / 2, midY - bgHeight / 2, bgWidth, bgHeight, bgRadius)

        if (isHoveredLink) {
          // 焦点标签背景：极淡蓝色，不透明（覆盖连线）
          ctx.fillStyle = `rgba(227, 244, 255, ${labelOpacity})`
        } else if (isRelatedLink) {
          // 相关标签背景：使用颜色插值，从白色过渡到淡蓝色
          const bgR = Math.round(255 - 28 * highlightProgress)
          const bgG = Math.round(255 - 11 * highlightProgress)
          const bgB = Math.round(255 - 31 * highlightProgress)
          ctx.fillStyle = `rgba(${bgR}, ${bgG}, ${bgB}, ${labelOpacity})`
        } else {
          // 无关标签背景：使用平滑过渡透明度
          ctx.fillStyle = `rgba(240, 245, 250, ${labelOpacity})`
        }
        ctx.fill()

        if (isHoveredLink) {
          ctx.strokeStyle = `rgba(77, 171, 247, ${labelOpacity * 0.5})`
        } else if (isRelatedLink) {
          // 相关边框：使用颜色插值，从灰色过渡到淡蓝色
          const borderR = Math.round(209 - 132 * highlightProgress)
          const borderG = Math.round(213 - 42 * highlightProgress)
          const borderB = Math.round(219 - 28 * highlightProgress)
          ctx.strokeStyle = `rgba(${borderR}, ${borderG}, ${borderB}, ${labelOpacity})`
        } else {
          // 无关边框：使用平滑过渡透明度
          ctx.strokeStyle = `rgba(200, 220, 240, ${labelOpacity})`
        }
        ctx.lineWidth = borderWidth
        ctx.stroke()
        ctx.restore()

        // 绘制标签文字（多行）
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'

        if (isHoveredLink) {
          ctx.fillStyle = `rgba(51, 154, 240, ${labelOpacity})`
        } else if (isRelatedLink) {
          // 相关文字：使用颜色插值，从灰色过渡到蓝色
          const textR = Math.round(107 - 56 * highlightProgress)
          const textG = Math.round(114 - 57 * highlightProgress)
          const textB = Math.round(128 - 94 * highlightProgress)
          ctx.fillStyle = `rgba(${textR}, ${textG}, ${textB}, ${labelOpacity})`
        } else {
          // 无关文字：使用平滑过渡透明度
          ctx.fillStyle = `rgba(180, 190, 200, ${labelOpacity})`
        }

        // 计算起始 Y 坐标（居中对齐多行）
        const totalTextHeight = labelTexts.length * lineHeight
        const startTextY = midY - totalTextHeight / 2 + lineHeight / 2

        labelTexts.forEach((text, index) => {
          const textY = startTextY + index * lineHeight
          ctx.fillText(text, midX, textY)
        })
      }
    }
  }, [activeNode, relatedLinks, config, bidirectionalLinksMap, COLORS, lerpColor])

  const handleNodeClick = useCallback((node: GraphNode) => {
    const knowledge = knowledgeFiles.find((k) => k.id === node.id)
    if (knowledge && onNodeClick) {
      onNodeClick(knowledge)
      // 不关闭知识图谱弹窗，让用户可以继续浏览图谱
    }
  }, [knowledgeFiles, onNodeClick])
  handleNodeClickRef.current = handleNodeClick

  // 自定义鼠标碰撞检测：精确匹配节点的视觉范围
  useEffect(() => {
    if (!isOpen || !hasGraph) return

    // 等待 canvas 渲染完成
    const timer = setTimeout(() => {
      // 尝试多种方式获取 canvas 元素
      let targetCanvas: HTMLCanvasElement | null = null

      // 方式1：通过 force-graph-container 类
      targetCanvas = document.querySelector('.force-graph-container canvas')

      // 方式2：直接查找弹窗内的 canvas
      if (!targetCanvas) {
        targetCanvas = document.querySelector('.fixed canvas')
      }

      // 方式3：查找页面内所有 canvas
      if (!targetCanvas) {
        const allCanvases = document.querySelectorAll('canvas')
        if (allCanvases.length > 0) {
          targetCanvas = allCanvases[allCanvases.length - 1] as HTMLCanvasElement
        }
      }

      if (!targetCanvas) return

      // 辅助函数：将屏幕坐标转换为图形坐标
      const screenToGraphCoords = (screenX: number, screenY: number) => {
        const fg = graphRef.current
        if (!fg) return null

        const zoom = fg.zoom()
        const center = fg.centerAt()
        const rect = targetCanvas.getBoundingClientRect()

        // 鼠标在 canvas 中的坐标
        const canvasX = screenX - rect.left
        const canvasY = screenY - rect.top

        // 转换为图形坐标
        const graphX = (canvasX - rect.width / 2) / zoom + center.x
        const graphY = (canvasY - rect.height / 2) / zoom + center.y

        return { graphX, graphY }
      }

      // 辅助函数：查找鼠标位置的节点（使用视觉半径）
      const findNodeAtPosition = (graphX: number, graphY: number): GraphNode | null => {
        const nodes = graphDataRef.current.nodes
        const nodeSize = configRef.current.nodeSize

        for (const node of nodes) {
          if (!isFinite(node.x!) || !isFinite(node.y!)) continue

          // 计算节点的视觉半径（与 paintNode 一致）
          const outDegreeSizeMultiplier = Math.min(1 + Math.sqrt(node.outDegree) * 0.3, 3)
          const visualRadius = nodeSize * outDegreeSizeMultiplier

          // 计算鼠标到节点中心的距离
          const dx = graphX - node.x!
          const dy = graphY - node.y!
          const distance = Math.sqrt(dx * dx + dy * dy)

          // 如果在视觉范围内，返回该节点
          if (distance <= visualRadius) {
            return node
          }
        }
        return null
      }

      const handleMouseMove = (e: MouseEvent) => {
        // 拖动时不处理
        if (isDraggingRef.current) return

        const coords = screenToGraphCoords(e.clientX, e.clientY)
        if (!coords) return

        const foundNode = findNodeAtPosition(coords.graphX, coords.graphY)

        // 只有当悬浮节点变化时才更新状态
        if (foundNode?.id !== hoveredNodeRef.current?.id) {
          setHoveredNode(foundNode)
        }
      }

      const handleMouseLeave = () => {
        // 鼠标离开画布时清空悬浮状态
        if (!isDraggingRef.current) {
          setHoveredNode(null)
        }
      }

      const handleClick = (e: MouseEvent) => {
        const coords = screenToGraphCoords(e.clientX, e.clientY)
        if (!coords) return

        const clickedNode = findNodeAtPosition(coords.graphX, coords.graphY)
        if (clickedNode) {
          handleNodeClickRef.current(clickedNode)
        }
      }

      targetCanvas.addEventListener('mousemove', handleMouseMove)
      targetCanvas.addEventListener('mouseleave', handleMouseLeave)
      targetCanvas.addEventListener('click', handleClick)

      // 存储清理函数
      ;(targetCanvas as any)._knowledgeGraphCleanup = () => {
        targetCanvas.removeEventListener('mousemove', handleMouseMove)
        targetCanvas.removeEventListener('mouseleave', handleMouseLeave)
        targetCanvas.removeEventListener('click', handleClick)
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      // 尝试找到之前绑定的 canvas 并清理
      const allCanvases = document.querySelectorAll('canvas')
      allCanvases.forEach(c => {
        if ((c as any)._knowledgeGraphCleanup) {
          ;(c as any)._knowledgeGraphCleanup()
        }
      })
    }
  }, [isOpen, hasGraph]) // 只依赖 isOpen 和 hasGraph，使用 ref 获取最新数据

  const updateConfig = useCallback((key: keyof KnowledgeGraphConfig, value: number | boolean) => {
    const newConfig = { ...config, [key]: value }
    setConfig(newConfig)
    saveConfig(newConfig)
  }, [config, saveConfig])

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40"
            onClick={onClose}
          />

          {/* 弹窗内容 */}
          <div className="fixed inset-0 z-40 flex items-center justify-center p-6 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-[90vw] h-[85vh] bg-white rounded-2xl shadow-xl pointer-events-auto overflow-hidden flex flex-col relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Network size={20} className="text-blue-500" />
                  <span className="text-lg font-medium text-gray-800">知识图谱</span>
                  <span className="text-sm text-gray-400">
                    {graphData.nodes.length} 个知识, {graphData.links.length} 条关系
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {/* 设置按钮 */}
                  <button
                    onClick={() => setShowSettings(!showSettings)}
                    className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-500'}`}
                    title="设置"
                  >
                    <Settings size={18} />
                  </button>
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <X size={18} className="text-gray-500" />
                  </button>
                </div>
              </div>

              {/* 图谱区域 */}
              <div className="flex-1 relative bg-gradient-to-br from-gray-50 to-gray-100">
                {hasGraph ? (
                  <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeCanvasObject={paintNode}
                    linkCanvasObject={paintLink}
                    onNodeClick={() => {
                      // 禁用默认的点击检测，使用 canvas 原生 click 事件实现精确碰撞检测
                    }}
                    onNodeHover={() => {
                      // 禁用默认的悬浮检测，使用 canvas 原生 mousemove 事件实现精确碰撞检测
                    }}
                    onNodeDrag={(node) => {
                      // 开始拖动
                      isDraggingRef.current = true
                      setDraggedNode(node as GraphNode | null)
                      setHoveredNode(node as GraphNode | null)
                    }}
                    onNodeDragEnd={() => {
                      isDraggingRef.current = false
                      setDraggedNode(null)
                      setHoveredNode(null)
                    }}
                    onBackgroundClick={() => setShowSettings(false)}
                    nodeRelSize={config.nodeSize}
                    nodeLabel={() => ''}
                    d3AlphaDecay={0.02}
                    d3VelocityDecay={0.3}
                    warmupTicks={100}
                    cooldownTicks={100}
                    enableZoomInteraction={true}
                    enablePanInteraction={true}
                    enableNodeDrag={true}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <Network size={48} className="text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500">暂无知识数据</p>
                      <p className="text-sm text-gray-400 mt-1">创建知识后可查看图谱</p>
                    </div>
                  </div>
                )}
              </div>

              {/* 设置侧边栏 */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ x: 300, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 300, opacity: 0 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="absolute top-16 right-4 w-64 bg-white rounded-2xl shadow-lg border border-gray-100 z-10 overflow-hidden"
                  >
                    {/* 头部 */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                      <span className="text-sm font-medium text-gray-800">图谱设置</span>
                      <button
                        onClick={() => setShowSettings(false)}
                        className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <X size={14} className="text-gray-400" />
                      </button>
                    </div>

                    {/* 设置内容 */}
                    <div className="p-4 space-y-4">
                      {/* 节点大小 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">节点大小</span>
                          <span className="text-sm font-medium text-blue-500">{config.nodeSize}</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="10"
                          step="0.5"
                          value={config.nodeSize}
                          onChange={(e) => updateConfig('nodeSize', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 连线长度 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">连线长度</span>
                          <span className="text-sm font-medium text-blue-500">{config.linkDistance}</span>
                        </div>
                        <input
                          type="range"
                          min="40"
                          max="200"
                          step="10"
                          value={config.linkDistance}
                          onChange={(e) => updateConfig('linkDistance', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 连线粗细 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">连线粗细</span>
                          <span className="text-sm font-medium text-blue-500">{config.linkWidth.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min="0.30"
                          max="1"
                          step="0.05"
                          value={config.linkWidth}
                          onChange={(e) => updateConfig('linkWidth', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 标签大小 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">标签大小</span>
                          <span className="text-sm font-medium text-blue-500">{config.labelSize}</span>
                        </div>
                        <input
                          type="range"
                          min="4"
                          max="10"
                          step="1"
                          value={config.labelSize}
                          onChange={(e) => updateConfig('labelSize', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 关系标签大小 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">关系标签大小</span>
                          <span className="text-sm font-medium text-blue-500">{config.relationLabelSize}</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="7"
                          step="1"
                          value={config.relationLabelSize}
                          onChange={(e) => updateConfig('relationLabelSize', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 是否展示节点关系标签 */}
                      <div className="flex items-center justify-between py-1">
                        <span className="text-sm text-gray-600">展示关系标签</span>
                        <button
                          onClick={() => updateConfig('showRelationLabel', !config.showRelationLabel)}
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            config.showRelationLabel ? 'bg-blue-500' : 'bg-gray-200'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              config.showRelationLabel ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {/* 分隔线 */}
                      <div className="border-t border-gray-100 my-2"></div>

                      {/* 向心力 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">向心力</span>
                          <span className="text-sm font-medium text-blue-500">{config.centerForce.toFixed(3)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="0.1"
                          step="0.005"
                          value={config.centerForce}
                          onChange={(e) => updateConfig('centerForce', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 相连节点吸引力 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">连线吸引力</span>
                          <span className="text-sm font-medium text-blue-500">{config.linkStrength.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={config.linkStrength}
                          onChange={(e) => updateConfig('linkStrength', Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 节点互斥力 */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">节点互斥力</span>
                          <span className="text-sm font-medium text-blue-500">{Math.abs(config.chargeStrength)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          step="10"
                          value={Math.abs(config.chargeStrength)}
                          onChange={(e) => updateConfig('chargeStrength', -Number(e.target.value))}
                          className="w-full h-1.5 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                      </div>

                      {/* 重置按钮 */}
                      <div className="pt-2 border-t border-gray-100">
                        <button
                          onClick={resetConfig}
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                        >
                          <RotateCcw size={14} />
                          重置为默认
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}

/**
 * 知识图谱按钮组件
 */
interface KnowledgeGraphButtonProps {
  onClick: () => void
  count?: number
}

export const KnowledgeGraphButton: FC<KnowledgeGraphButtonProps> = ({ onClick, count = 0 }) => {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
    >
      <Network size={16} />
      <span>知识图谱</span>
      {count > 0 && (
        <span className="text-xs text-gray-400">({count})</span>
      )}
    </button>
  )
}