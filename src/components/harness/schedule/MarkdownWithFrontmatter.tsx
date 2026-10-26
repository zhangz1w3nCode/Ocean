import type { FC } from 'react'
import { useMemo } from 'react'
import { Braces } from 'lucide-react'
import { parse as parseYaml } from 'yaml'
import { MarkdownRenderer } from '../../ui/MarkdownRenderer/MarkdownRenderer'

interface FrontmatterProps {
  raw: string
}

// YAML frontmatter 渲染：键值卡片（等宽字体 + 灰底 + 分隔线）
const FrontmatterBlock: FC<FrontmatterProps> = ({ raw }) => {
  const entries = useMemo(() => {
    try {
      const parsed = parseYaml(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return Object.entries(parsed as Record<string, unknown>)
      }
    } catch {
      // 解析失败时回退为纯文本行
    }
    return raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const idx = l.indexOf(':')
        return idx > 0 ? [l.slice(0, idx).trim(), l.slice(idx + 1).trim()] : [l, '']
      })
  }, [raw])

  if (entries.length === 0) return null

  return (
    <div className="mx-3 mb-3 rounded-xl border border-macos-border/50 bg-white overflow-hidden">
      <div className="px-3.5 py-2.5 space-y-1.5">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-3 text-xs leading-relaxed">
            <span className="shrink-0 text-macos-text-tertiary min-w-20">{key}</span>
            <span className="flex-1 min-w-0 text-macos-text break-all">{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

interface MarkdownWithFrontmatterProps {
  content: string
}

const FM_RE = /^---\s*\n([\s\S]*?)\n---\s*\n/

// markdown 文件渲染（带 YAML frontmatter 检测分离）
export const MarkdownWithFrontmatter: FC<MarkdownWithFrontmatterProps> = ({ content }) => {
  const { frontmatter, body } = useMemo(() => {
    const m = FM_RE.exec(content)
    if (m) {
      return { frontmatter: m[1], body: content.slice(m[0].length) }
    }
    return { frontmatter: null, body: content }
  }, [content])

  return (
    <div>
      {frontmatter && <FrontmatterBlock raw={frontmatter} />}
      <MarkdownRenderer content={body} />
    </div>
  )
}
