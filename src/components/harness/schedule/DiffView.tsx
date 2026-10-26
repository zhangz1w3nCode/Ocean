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

// ---- 并排 diff 配对：将 unified 行重组为左右行对 ----
interface SidePair {
  oldLine: DiffLine | null
  newLine: DiffLine | null
}

const buildSidePairs = (lines: DiffLine[]): SidePair[] => {
  const pairs: SidePair[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.kind === 'meta' || line.kind === 'hunk') {
      pairs.push({ oldLine: line, newLine: line })
      i++
      continue
    }
    // 收集连续的 del + add 块
    if (line.kind === 'del') {
      const dels: DiffLine[] = []
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].kind === 'del') {
        dels.push(lines[i])
        i++
      }
      while (i < lines.length && lines[i].kind === 'add') {
        adds.push(lines[i])
        i++
      }
      // 配对
      const maxLen = Math.max(dels.length, adds.length)
      for (let j = 0; j < maxLen; j++) {
        pairs.push({
          oldLine: j < dels.length ? dels[j] : null,
          newLine: j < adds.length ? adds[j] : null,
        })
      }
      continue
    }
    if (line.kind === 'add') {
      // 只有新增没有删除
      const adds: DiffLine[] = []
      while (i < lines.length && lines[i].kind === 'add') {
        adds.push(lines[i])
        i++
      }
      for (const a of adds) {
        pairs.push({ oldLine: null, newLine: a })
      }
      continue
    }
    // ctx 行：左右各一行
    pairs.push({ oldLine: line, newLine: line })
    i++
  }
  return pairs
}

// ---- 内连 diff 渲染 ----
const InlineDiff: FC<{ lines: DiffLine[] }> = ({ lines }) => (
  <>
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
        <div key={i} className={`flex ${isAdd ? 'bg-macos-success/10' : isDel ? 'bg-macos-error/10' : ''}`}>
          <span className="w-8 shrink-0 text-right pr-1.5 text-macos-text-tertiary/60 select-none tabular-nums">{l.oldNo ?? ''}</span>
          <span className="w-8 shrink-0 text-right pr-1.5 text-macos-text-tertiary/60 select-none tabular-nums">{l.newNo ?? ''}</span>
          <span className={`w-3.5 shrink-0 select-none ${isAdd ? 'text-macos-success' : isDel ? 'text-macos-error' : 'text-macos-text-tertiary/40'}`}>{sign}</span>
          <span className={`flex-1 whitespace-pre-wrap break-all ${isAdd ? 'text-macos-success' : isDel ? 'text-macos-error' : 'text-macos-text-secondary'}`}>{l.text || ' '}</span>
        </div>
      )
    })}
  </>
)

// ---- 并排 diff 渲染 ----
const SideCell: FC<{ line: DiffLine | null; side: 'old' | 'new' }> = ({ line, side }) => {
  if (!line) {
    return <div className="flex-1 min-w-0 bg-macos-bg/40" />
  }
  if (line.kind === 'meta' || line.kind === 'hunk') {
    return null // 由外层处理
  }
  const isAdd = line.kind === 'add'
  const isDel = line.kind === 'del'
  const sign = isAdd ? '+' : isDel ? '-' : ' '
  const no = side === 'old' ? line.oldNo : line.newNo
  const isHighlighted = (side === 'old' && isDel) || (side === 'new' && isAdd)
  return (
    <div className={`flex-1 min-w-0 flex ${isHighlighted ? (side === 'old' ? 'bg-macos-error/10' : 'bg-macos-success/10') : ''}`}>
      <span className="w-8 shrink-0 text-right pr-1 text-macos-text-tertiary/50 select-none tabular-nums">{no ?? ''}</span>
      <span className={`w-3 shrink-0 select-none ${isHighlighted ? (side === 'old' ? 'text-macos-error' : 'text-macos-success') : 'text-macos-text-tertiary/30'}`}>{sign}</span>
      <span className={`flex-1 min-w-0 whitespace-pre-wrap break-all ${isHighlighted ? (side === 'old' ? 'text-macos-error' : 'text-macos-success') : 'text-macos-text-secondary'}`}>{line.text || ' '}</span>
    </div>
  )
}

const SplitDiff: FC<{ lines: DiffLine[] }> = ({ lines }) => {
  const pairs = useMemo(() => buildSidePairs(lines), [lines])
  return (
    <>
      {pairs.map((pair, i) => {
        // meta/hunk 行跨全宽
        if (pair.oldLine && (pair.oldLine.kind === 'meta' || pair.oldLine.kind === 'hunk')) {
          const l = pair.oldLine
          if (l.kind === 'meta') {
            return (
              <div key={i} className="px-3 py-0.5 text-macos-text-tertiary/80 truncate" title={l.text}>
                {l.text}
              </div>
            )
          }
          return (
            <div key={i} className="px-3 py-1 bg-macos-bg text-macos-accent/80 select-none">
              {l.text}
            </div>
          )
        }
        return (
          <div key={i} className="flex border-b border-macos-border/20">
            <SideCell line={pair.oldLine} side="old" />
            <div className="w-px bg-macos-border/60 shrink-0" />
            <SideCell line={pair.newLine} side="new" />
          </div>
        )
      })}
    </>
  )
}

// unified diff 渲染：mode=inline 内连 / mode=split 并排
export const DiffView: FC<{ diff: string; mode?: 'inline' | 'split' }> = ({ diff, mode = 'inline' }) => {
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
      {mode === 'split' ? <SplitDiff lines={lines} /> : <InlineDiff lines={lines} />}
    </div>
  )
}
