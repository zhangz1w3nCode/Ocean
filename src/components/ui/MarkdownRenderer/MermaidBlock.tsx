import type { FC } from 'react'
import { useEffect, useState, useRef } from 'react'
import mermaid from 'mermaid'
// 预加载常用图表类型，避免动态导入问题
import 'mermaid/dist/mermaid.core.mjs'

interface MermaidBlockProps {
  code: string
}

// 是否已初始化
let isInitialized = false

// 生成唯一ID
let mermaidIdCounter = 0
const generateId = () => `mermaid-${Date.now()}-${++mermaidIdCounter}`

// 初始化mermaid（只执行一次）
export const initMermaid = () => {
  if (isInitialized) return

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
    flowchart: {
      useMaxWidth: true,
      htmlLabels: true,
      curve: 'basis',
    },
    sequence: {
      useMaxWidth: true,
      diagramMarginX: 50,
      diagramMarginY: 10,
      actorMargin: 50,
      width: 150,
      height: 65,
    },
  })
  isInitialized = true
}

// 检查代码是否包含有效的mermaid图表类型
export const isValidMermaidCode = (code: string): boolean => {
  const trimmedCode = code.trim()
  if (!trimmedCode) return false

  // 检查是否包含有效的mermaid图表类型关键字
  const validKeywords = [
    'graph ', 'flowchart ', 'sequenceDiagram', 'classDiagram',
    'stateDiagram', 'erDiagram', 'gantt', 'pie', 'gitGraph',
    'mindmap', 'timeline', 'quadrantChart', 'requirementDiagram',
    'json', 'yaml', 'block-beta', 'packet-beta', 'architecture-beta'
  ]

  const firstLine = trimmedCode.split('\n')[0].toLowerCase()
  return validKeywords.some(keyword => firstLine.includes(keyword.toLowerCase()))
}

export const MermaidBlock: FC<MermaidBlockProps> = ({ code }) => {
  const [svg, setSvg] = useState<string>('')
  const idRef = useRef<string>(generateId())

  useEffect(() => {
    const renderMermaid = async () => {
      // 如果没有代码内容，直接返回
      const trimmedCode = code?.trim()
      if (!trimmedCode) {
        setSvg('')
        return
      }

      // 检查是否是有效的mermaid语法
      if (!isValidMermaidCode(trimmedCode)) {
        console.warn('Mermaid: Invalid or unsupported diagram type')
        setSvg('')
        return
      }

      // 本次渲染自己的 id：必须用局部变量持有，不能到 finally 里再读 idRef.current。
      // 否则 React StrictMode 下 effect 连跑两次时，前一次的 finally 会把后一次
      // 正在使用的临时节点删掉，mermaid.render 会抛 “Cannot read properties of null”。
      let ownId = ''
      try {
        // 初始化mermaid配置
        initMermaid()

        // 生成新的ID用于每次渲染
        ownId = generateId()
        idRef.current = ownId

        // 渲染SVG
        const { svg: renderedSvg } = await mermaid.render(ownId, trimmedCode)
        setSvg(renderedSvg || '')
      } catch (err) {
        // 静默失败，不显示错误
        console.warn('Mermaid render warning:', err)
        setSvg('')
      } finally {
        // mermaid.render 会在 document.body 上挂一个 id 为 d<渲染id> 的临时容器：
        // 成功时它自行移除，但抛异常的路径不会，导致 “Syntax error in text” + 炸弹的
        // SVG 残留在 body 上（在 #root 之外，表现为应用卡片下方出现一排炸弹）。
        // 只清理本次自己的节点，不改变任何渲染判定逻辑。
        if (ownId) document.getElementById(`d${ownId}`)?.remove()
      }
    }

    renderMermaid()
  }, [code])

  // 没有内容时不显示任何东西
  if (!svg) {
    return null
  }

  return (
    <div
      className="mermaid-container mermaid-svg"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}