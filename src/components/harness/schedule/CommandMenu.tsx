import type { FC } from 'react'
import { useMemo } from 'react'
import { Command, FileCode2, Puzzle } from 'lucide-react'
import type { HarnessCommandItem } from '../../../stores/harnessStore'

const SOURCE_LABELS: Record<string, string> = {
  skill: '技能命令（/skill:）',
  prompt: '提示模板',
  extension: '扩展命令',
}

const SOURCE_ICONS: Record<string, typeof Command> = {
  skill: Puzzle,
  prompt: FileCode2,
  extension: Command,
}

interface CommandMenuProps {
  commands: HarnessCommandItem[]
  filter: string
  activeIndex: number
  onSelect: (name: string) => void
  onClose: () => void
}

export const CommandMenu: FC<CommandMenuProps> = ({ commands, filter, activeIndex, onSelect, onClose }) => {
  const filtered = useMemo(() => {
    const q = filter.toLowerCase()
    return commands.filter(
      (c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    )
  }, [commands, filter])

  const grouped = useMemo(() => {
    const map = new Map<string, HarnessCommandItem[]>()
    for (const c of filtered) {
      const key = c.source || 'extension'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(c)
    }
    return [...map.entries()]
  }, [filtered])

  let flatIndex = -1

  return (
    <div
      className="absolute bottom-full left-[60px] right-[60px] mb-2 max-h-72 overflow-y-auto rounded-xl border border-macos-border bg-white shadow-lg z-20 py-1"
      onMouseDown={(e) => {
        // 防止 textarea blur 收起菜单；菜单外点击由 Composer 的容器监听关闭
        e.stopPropagation()
      }}
    >
      {filtered.length === 0 && (
        <div className="px-3 py-2 text-xs text-macos-text-tertiary">无匹配命令</div>
      )}
      {grouped.map(([source, items]) => {
        const Label = SOURCE_ICONS[source] ?? Command
        return (
          <div key={source}>
            <div className="px-3 py-1 text-[10px] font-medium text-macos-text-tertiary uppercase tracking-wide flex items-center gap-1">
              <Label size={10} strokeWidth={1.5} />
              {SOURCE_LABELS[source] ?? source}
            </div>
            {items.map((c) => {
              flatIndex += 1
              const isActive = flatIndex === activeIndex
              return (
                <button
                  key={`${source}:${c.name}`}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    isActive ? 'bg-[#E8EAED] text-macos-text' : 'text-macos-text-secondary hover:bg-macos-bg'
                  }`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onSelect(c.name)}
                >
                  <span className="font-mono shrink-0">/{c.name}</span>
                  {c.description && (
                    <span className="flex-1 min-w-0 truncate text-[11px] text-macos-text-tertiary">{c.description}</span>
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
      <button className="hidden" onClick={onClose} />
    </div>
  )
}
