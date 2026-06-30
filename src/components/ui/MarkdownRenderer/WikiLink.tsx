import type { FC, ReactElement } from 'react'
import { ExternalLink } from 'lucide-react'

/**
 * WikiLink 组件
 * 用于渲染 [[xxx.md|关系]] 格式的链接
 */

interface WikiLinkProps {
  /** 原始路径 */
  path: string
  /** 关系名称 */
  relation?: string
  /** 显示的名称（从路径提取的文件名） */
  displayName: string
}

/**
 * 从路径中提取显示名称
 */
export function extractDisplayName(path: string): string {
  // 清理可能存在的反引号
  const cleanedPath = path.replace(/^`+|`+$/g, '')

  // 特殊处理：技能路径 .claude/skills/{name}/SKILL.md
  if (cleanedPath.includes('/skills/')) {
    const match = cleanedPath.match(/\/skills\/([^/]+)\/SKILL\.md$/i)
    if (match) return match[1]
  }

  // 特殊处理：工作流路径 .claude/workflows/{name}/WORKFLOW.md
  if (cleanedPath.includes('/workflows/')) {
    const match = cleanedPath.match(/\/workflows\/([^/]+)\/WORKFLOW\.md$/i)
    if (match) return match[1]
  }

  // 默认处理：提取文件名（去除路径前缀和扩展名）
  const fileName = cleanedPath.split('/').pop() || cleanedPath
  return fileName.replace(/\.(md|mdx)$/, '')
}

/**
 * 根据路径判断引用类型
 */
export function getReferenceType(path: string): { icon: string; color: string; bgColor: string } {
  if (path.includes('/agents/')) {
    return { icon: '智能体', color: '#9333EA', bgColor: '#F3E8FF' } // 紫色
  }
  if (path.includes('/nodes/')) {
    return { icon: '节点', color: '#2563EB', bgColor: '#DBEAFE' } // 蓝色
  }
  if (path.includes('/workflows/')) {
    return { icon: '工作流', color: '#DC2626', bgColor: '#FEE2E2' } // 红色
  }
  if (path.includes('/resources/')) {
    return { icon: '资源', color: '#059669', bgColor: '#D1FAE5' } // 绿色
  }
  if (path.includes('/skills/')) {
    return { icon: '技能', color: '#7C3AED', bgColor: '#EDE9FE' } // 紫罗兰色
  }
  if (path.includes('/knowledges/')) {
    return { icon: '知识', color: '#2563EB', bgColor: '#DBEAFE' } // 蓝色
  }
  // 默认样式
  return { icon: '引用', color: '#6B7280', bgColor: '#F3F4F6' } // 灰色
}

export const WikiLink: FC<WikiLinkProps> = ({ path, relation, displayName }) => {
  const name = displayName || extractDisplayName(path)
  const refType = getReferenceType(path)

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[13px] cursor-pointer transition-all duration-150 hover:opacity-80"
      style={{
        backgroundColor: refType.bgColor,
        color: refType.color,
      }}
      title={path}
    >
      {/* 关系标签 */}
      {relation && (
        <span className="font-medium opacity-70">
          {relation}
        </span>
      )}
      {/* 分隔符 */}
      {relation && (
        <span className="opacity-50">:</span>
      )}
      {/* 文件名 */}
      <span className="font-medium">
        {name}
      </span>
      <ExternalLink size={12} className="opacity-50" />
    </span>
  )
}

/**
 * WikiLink 正则表达式
 * 匹配 [[xxx.md|关系]] 或 [[xxx.md]] 格式
 */
export const WIKI_LINK_REGEX = /\[\[([^\]|]+\.(?:md|mdx)`?)(?:\|([^\]]+))?\]\]/g

/**
 * 解析内容中的 WikiLink 并渲染
 * @param content 原始内容
 * @returns 渲染后的 React 节点数组
 */
export function renderWikiLinks(content: string): Array<string | ReactElement> {
  const parts: Array<string | ReactElement> = []
  let lastIndex = 0
  let keyIndex = 0

  // 重置正则表达式
  WIKI_LINK_REGEX.lastIndex = 0

  let match
  while ((match = WIKI_LINK_REGEX.exec(content)) !== null) {
    // 添加前面的纯文本
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const rawPath = match[1].trim()
    const relation = match[2]?.trim()
    const displayName = extractDisplayName(rawPath)

    // 添加 WikiLink 组件
    parts.push(
      <WikiLink
        key={`wikilink-${keyIndex++}`}
        path={rawPath}
        relation={relation}
        displayName={displayName}
      />
    )

    lastIndex = match.index + match[0].length
  }

  // 添加最后的纯文本
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts.length > 0 ? parts : [content]
}

export default WikiLink