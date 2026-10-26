import type { FC } from 'react'
import { useMemo } from 'react'

interface DiffLine {
  kind: 'meta' | 'hunk' | 'add' | 'del' | 'ctx'
  text: string
  oldNo: number | null
  newNo: number | null
}

const HUNK_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

const META_PREFIXES = [
  'diff --git',
  'index ',
  'new file',
  'deleted file',
  'similarity index',
  'rename from',
  'rename to',
  'old mode',
  'new mode',
  'Binary files',
  '--- ',
  '+++ ',
  '\\ No newline',
]

export const parseUnifiedDiff = (diff: string): DiffLine[] => {
  const out: DiffLine[] = []
  let oldNo = 0
  let newNo = 0
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('@@')) {
      const m = HUNK_RE.exec(raw)
      if (m) {
        oldNo = Number(m[1])
        newNo = Number(m[2])
      }
      out.push({ kind: 'hunk', text: raw, oldNo: null, newNo: null })
      continue
    }
    if (META_PREFIXES.some((p) => raw.startsWith(p))) {
      out.push({ kind: 'meta', text: raw, oldNo: null, newNo: null })
      continue
    }
    if (raw.startsWith('+')) {
      out.push({ kind: 'add', text: raw.slice(1), oldNo: null, newNo: newNo++ })
      continue
    }
    if (raw.startsWith('-')) {
      out.push({ kind: 'del', text: raw.slice(1), oldNo: oldNo++, newNo: null })
      continue
    }
    if (raw.startsWith(' ')) {
      out.push({ kind: 'ctx', text: raw.slice(1), oldNo: oldNo++, newNo: newNo++ })
      continue
    }
    if (raw === '') {
      out.push({ kind: 'ctx', text: '', oldNo: oldNo++, newNo: newNo++ })
      continue
    }
    out.push({ kind: 'ctx', text: raw, oldNo: oldNo++, newNo: newNo++ })
  }
  return out
}

// unified diff 渲染：双列行号 + 符号列 + 增删行着色（绿/红）+ hunk 头
export const DiffView: FC<{ diff: string }> = ({ diff }) => {
  const lines = useMemo(() => parseUnifiedDiff(diff), [diff])
  const stats = useMemo(() => {
    let adds = 0
    let dels = 0
    for (const l of lines) {
      if (l.kind === 'add') adds += 1
      else if (l.kind === 'del') dels += 1
    }
    return { adds, dels }
  }, [lines])

  if (!diff.trim()) {
    return <div className="px-4 py-6 text-xs text-macos-text-tertiary">该文件无差异内容</div>
  }

  return (
    <div className="text-[11px] font-mono">
      <div className="sticky top-0 z-10 px-3 py-1.5 bg-white/95 backdrop-blur border-b border-macos-border/60 text-[10px] text-macos-text-tertiary flex items-center gap-2 shrink-0">
        <span className="text-macos-success">+{stats.adds}</span>
        <span className="text-macos-error">-{stats.dels}</span>
      </div>
      {lines.map((l, i) => {
        if (l.kind === 'meta') {
          return (
            <div key={i} className="px-3 py-0.5 text-macos-text-tertiary/80 truncate" title={l.text}>
              {l.text}
            </div>
          )
        }
        if (l.kind === 'hunk') {
          return (
            <div key={i} className="px-3 py-1 bg-macos-bg text-macos-accent/80 select-none">
              {l.text}
            </div>
          )
        }
        const isAdd = l.kind === 'add'
        const isDel = l.kind === 'del'
        const sign = isAdd ? '+' : isDel ? '-' : ' '
        return (
          <div
            key={i}
            className={`flex ${isAdd ? 'bg-macos-success/10' : isDel ? 'bg-macos-error/10' : ''}`}
          >
            <span className="w-8 shrink-0 text-right pr-1.5 text-macos-text-tertiary/60 select-none tabular-nums">
              {l.oldNo ?? ''}
            </span>
            <span className="w-8 shrink-0 text-right pr-1.5 text-macos-text-tertiary/60 select-none tabular-nums">
              {l.newNo ?? ''}
            </span>
            <span
              className={`w-3.5 shrink-0 select-none ${isAdd ? 'text-macos-success' : isDel ? 'text-macos-error' : 'text-macos-text-tertiary/40'}`}
            >
              {sign}
            </span>
            <span
              className={`flex-1 whitespace-pre-wrap break-all ${
                isAdd ? 'text-macos-success' : isDel ? 'text-macos-error' : 'text-macos-text-secondary'
              }`}
            >
              {l.text || ' '}
            </span>
          </div>
        )
      })}
    </div>
  )
}
