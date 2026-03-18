import type { FC, ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import 'highlight.js/styles/github.css'
import { MermaidBlock } from './MermaidBlock'
import { WIKI_LINK_REGEX, extractDisplayName, getReferenceType } from './WikiLink'

interface MarkdownRendererProps {
  content: string
  className?: string
}

// 自定义代码块渲染器
const CodeBlock: FC<{
  inline?: boolean
  className?: string
  children?: ReactNode
}> = ({ inline, className, children }) => {
  // 提取语言标识
  const match = /language-(\w+)/.exec(className || '')
  const language = match ? match[1] : ''

  // 获取代码内容 - 正确处理children可能是数组的情况
  const getCodeContent = (): string => {
    if (typeof children === 'string') {
      return children.replace(/\n$/, '')
    }
    if (Array.isArray(children)) {
      return children.map(child => String(child)).join('').replace(/\n$/, '')
    }
    if (children !== undefined && children !== null) {
      return String(children).replace(/\n$/, '')
    }
    return ''
  }

  const codeContent = getCodeContent()

  // 如果是mermaid代码块，使用MermaidBlock渲染
  if (!inline && language === 'mermaid' && codeContent) {
    return <MermaidBlock code={codeContent} />
  }

  // 其他代码块使用默认渲染（语法高亮）
  if (inline) {
    return <code className={className}>{children}</code>
  }

  return (
    <code className={className}>
      {children}
    </code>
  )
}

/**
 * 自定义 WikiLink 标签渲染器
 * 用于渲染 <wiki-link> 标签
 */
const WikiLinkElement: FC<{
  path?: string
  relation?: string
  children?: ReactNode
}> = ({ path, relation, children }) => {
  if (!path) return <>{children}</>

  const displayName = extractDisplayName(path)
  const refType = getReferenceType(path)

  return (
    <span
      className="wiki-link"
      style={{
        backgroundColor: refType.bgColor,
        color: refType.color,
      }}
      title={path}
    >
      {/* 关系标签 */}
      {relation && (
        <span style={{ opacity: 0.75 }}>
          {relation}
        </span>
      )}
      {/* 分隔符 */}
      {relation && (
        <span style={{ opacity: 0.5 }}>:</span>
      )}
      {/* 文件名 */}
      <span>
        {displayName}
      </span>
    </span>
  )
}

/**
 * 预处理内容：将 WikiLink 格式转换为 HTML 标签
 */
function preprocessWikiLinks(content: string): string {
  // 重置正则表达式
  WIKI_LINK_REGEX.lastIndex = 0

  return content.replace(WIKI_LINK_REGEX, (_match, path, relation) => {
    const cleanPath = path.trim().replace(/^`+|`+$/g, '')
    const relationAttr = relation ? ` relation="${relation.trim()}"` : ''
    // 返回一个自定义HTML标签，用于后续渲染
    return `<wiki-link path="${cleanPath}"${relationAttr}></wiki-link>`
  })
}

export const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  content,
  className = '',
}) => {
  // 预处理 WikiLink
  const processedContent = preprocessWikiLinks(content)

  return (
    <div className={`prose prose-custom prose-sm max-w-none prose-headings:text-macos-text prose-p:text-macos-text-secondary prose-li:text-macos-text-secondary prose-code:text-macos-text prose-pre:bg-gray-100 prose-pre:p-3 prose-pre:rounded-lg prose-code-custom ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeRaw]}
        components={{
          code: CodeBlock,
          // @ts-expect-error - 自定义标签支持
          'wiki-link': WikiLinkElement,
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  )
}