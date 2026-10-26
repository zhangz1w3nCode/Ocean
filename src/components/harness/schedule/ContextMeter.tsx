import type { FC } from 'react'

export interface ContextStats {
  totalTokens: number
  cost: number
  contextPercent: number | null
  contextTokens: number | null
  contextWindow: number | null
}

interface ContextMeterProps {
  stats: ContextStats | null
  open: boolean
  onToggle: () => void
  onClose: () => void
}

const R = 5.5
const CIRC = 2 * Math.PI * R

const fmtTokens = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

const ringColor = (percent: number): string => {
  if (percent >= 85) return '#FF3B30'
  if (percent >= 60) return '#FF9500'
  return '#6E6E73'
}

// 上下文使用指示器：圆环进度 + 百分比（每轮回复完成后随统计刷新，过渡动画 0.4s）
export const ContextMeter: FC<ContextMeterProps> = ({ stats, open, onToggle, onClose }) => {
  const rawPct = stats?.contextPercent
  const percent = rawPct == null ? null : Math.min(100, Math.max(0, rawPct))
  const color = percent == null ? '#8E8E93' : ringColor(percent)

  return (
    <div className="relative flex items-center">
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        disabled={!stats}
        className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs text-macos-text-secondary hover:bg-macos-bg transition-colors disabled:opacity-50"
        title={stats && percent != null ? `上下文已用 ${Math.round(percent)}%` : '上下文使用情况'}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
          <circle cx="7" cy="7" r={R} fill="none" stroke="#E5E7EB" strokeWidth="2" />
          <circle
            cx="7"
            cy="7"
            r={R}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - (percent ?? 0) / 100)}
            transform="rotate(-90 7 7)"
            style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
          />
        </svg>
        <span className="tabular-nums">{percent != null ? `${Math.round(percent)}%` : 'ctx'}</span>
      </button>

      {open && (
        <div
          className="absolute bottom-full mb-1 right-0 w-64 rounded-xl border border-macos-border bg-white shadow-lg z-20 p-3 space-y-2.5"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-[10px] font-medium text-macos-text-tertiary uppercase tracking-wide">上下文使用</div>
          <div className="text-xs text-macos-text-secondary">
            上下文已用 <span className="font-medium text-macos-text tabular-nums">{percent != null ? `${Math.round(percent)}%` : '—'}</span>
          </div>
          {stats?.contextTokens != null && stats?.contextWindow != null && stats.contextWindow > 0 && (
            <div className="text-xs text-macos-text tabular-nums">
              {fmtTokens(stats.contextTokens)} / {fmtTokens(stats.contextWindow)}
            </div>
          )}
          <div className="h-1.5 rounded-full bg-[#E5E7EB] overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${percent ?? 0}%`, background: color, transition: 'width 0.5s ease, background 0.3s ease' }}
            />
          </div>
          <div className="pt-2 border-t border-macos-border/60 text-[10px] text-macos-text-tertiary space-y-0.5">
            <div>会话累计 {stats ? stats.totalTokens.toLocaleString() : 0} tokens</div>
            {stats && stats.cost > 0 && <div>费用 ${stats.cost.toFixed(4)}</div>}
            <div>每轮回复完成后自动刷新</div>
          </div>
          <button className="hidden" onClick={onClose} />
        </div>
      )}
    </div>
  )
}
