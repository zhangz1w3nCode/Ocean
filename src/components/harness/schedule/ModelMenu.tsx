import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, X, Search, ChevronRight, ChevronLeft, Sparkles, BrainCog } from 'lucide-react'

export interface ModelMenuEntry {
  id: string
  name: string
  provider: string
}

interface ModelMenuProps {
  open: boolean
  models: ModelMenuEntry[]
  currentId: string | null
  currentLevel: string | null
  levels: string[]
  onSelectModel: (provider: string, modelId: string) => void
  onSelectLevel: (level: string) => void
  onClose: () => void
}

// 对齐 DSH ModelSelect：根面板两行（模型/推理等级，钻入式）→ 模型面板（provider 分组 + 搜索 + 键盘）
// → 推理等级面板（级别单选 check）
type Pane = 'root' | 'model' | 'effort'

export const ModelMenu: FC<ModelMenuProps> = ({ open, models, currentId, currentLevel, levels, onSelectModel, onSelectLevel, onClose }) => {
  const [pane, setPane] = useState<Pane>('root')
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setPane('root')
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  const showSearch = pane === 'model' && models.length > 4

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const groups = new Map<string, ModelMenuEntry[]>()
    for (const m of models) {
      if (
        q &&
        !m.name.toLowerCase().includes(q) &&
        !m.id.toLowerCase().includes(q) &&
        !m.provider.toLowerCase().includes(q)
      ) {
        continue
      }
      if (!groups.has(m.provider)) groups.set(m.provider, [])
      groups.get(m.provider)!.push(m)
    }
    return [...groups.entries()]
  }, [models, query])

  const flatModels = useMemo(
    () => filteredGroups.flatMap(([provider, items]) => items.map((m) => ({ ...m, provider }))),
    [filteredGroups]
  )

  useEffect(() => {
    if (activeIndex >= flatModels.length) setActiveIndex(0)
  }, [flatModels.length, activeIndex])

  if (!open) return null

  const currentModelName = models.find((m) => m.id === currentId)?.name ?? currentId ?? '未设置'
  const levelItems = levels

  const choose = (provider: string, modelId: string) => onSelectModel(provider, modelId)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (flatModels.length === 0) return
      const direction = e.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((i) => (i + direction + flatModels.length) % flatModels.length)
      return
    }
    if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
      if (flatModels.length === 0) return
      e.preventDefault()
      const highlighted = flatModels[activeIndex]
      if (highlighted) choose(highlighted.provider, highlighted.id)
      return
    }
  }

  let flatIndex = -1

  return (
    <div
      className="absolute bottom-full mb-1 right-0 w-80 rounded-xl border border-macos-border bg-white shadow-lg z-20 overflow-hidden"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          if (pane !== 'root') setPane('root')
          else onClose()
        }
      }}
    >
      {pane === 'root' && (
        <div className="py-1" role="menu">
          <button
            onClick={() => setPane('model')}
            disabled={models.length === 0}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-macos-text hover:bg-macos-bg transition-colors disabled:opacity-50"
          >
            <Sparkles size={13} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
            <span className="shrink-0 font-medium">模型</span>
            <span className="flex-1 min-w-0 text-right truncate text-macos-text-secondary">{currentModelName}</span>
            <ChevronRight size={12} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
          </button>
          <button
            onClick={() => setPane('effort')}
            disabled={levelItems.length === 0}
            title={levelItems.length === 0 ? '当前模型未提供推理等级' : undefined}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-macos-text hover:bg-macos-bg transition-colors disabled:opacity-50"
          >
            <BrainCog size={13} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
            <span className="shrink-0 font-medium">推理等级</span>
            <span className="flex-1 min-w-0 text-right truncate text-macos-text-secondary">{currentLevel ?? '默认'}</span>
            <ChevronRight size={12} strokeWidth={1.5} className="text-macos-text-tertiary shrink-0" />
          </button>
        </div>
      )}

      {pane === 'model' && (
        <button
          onClick={() => setPane('root')}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-macos-text hover:bg-macos-bg border-b border-macos-border transition-colors"
        >
          <ChevronLeft size={12} strokeWidth={1.5} className="text-macos-text-tertiary" />
          <span className="font-medium">模型</span>
        </button>
      )}

      {showSearch && (
        <div className="relative p-2 border-b border-macos-border bg-white">
          <Search size={12} strokeWidth={1.5} className="absolute left-4 top-1/2 -translate-y-1/2 text-macos-text-tertiary pointer-events-none" />
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索模型…"
            className={`w-full text-xs text-macos-text placeholder:text-macos-text-tertiary outline-none bg-macos-bg rounded-md py-1.5 ${query ? 'pl-8 pr-7' : 'pl-8 pr-2'}`}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('')
                setActiveIndex(0)
                inputRef.current?.focus()
              }}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center text-macos-text-tertiary hover:text-macos-text hover:bg-black/5"
              title="清除"
            >
              <X size={11} strokeWidth={1.8} />
            </button>
          )}
        </div>
      )}

      {pane === 'model' && (
      <div className="max-h-72 overflow-y-auto" role="menu">
        {flatModels.length === 0 && (
          <div className="px-3 py-2 text-xs text-macos-text-tertiary" role="status">
            {models.length === 0 ? '暂无可用模型' : '没有匹配的模型。'}
          </div>
        )}
        {filteredGroups.map(([provider, items]) => (
          <div key={provider}>
            <div className="sticky top-0 bg-white px-3 py-1 text-[10px] font-medium text-macos-text-tertiary uppercase tracking-wide border-b border-macos-border/60">
              {provider}
            </div>
            {items.map((m) => {
              flatIndex += 1
              const selected = m.id === currentId
              const isActive = flatIndex === activeIndex
              return (
                <button
                  key={`${provider}/${m.id}`}
                  role="menuitemradio"
                  aria-checked={selected}
                  onMouseMove={() => setActiveIndex(flatIndex)}
                  onClick={() => choose(provider, m.id)}
                  title={m.id}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                    isActive ? 'bg-[#E8EAED] text-macos-text' : 'text-macos-text-secondary hover:bg-macos-bg'
                  }`}
                >
                  <span className="flex-1 min-w-0 text-left truncate">{m.name}</span>
                  <span className="shrink-0 w-4 flex items-center justify-center">
                    {selected && <Check size={13} strokeWidth={1.8} className="text-macos-text" />}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      )}

      {pane === 'effort' && (
        <div>
          <button
            onClick={() => setPane('root')}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-macos-text hover:bg-macos-bg border-b border-macos-border transition-colors"
          >
            <ChevronLeft size={12} strokeWidth={1.5} className="text-macos-text-tertiary" />
            <span className="font-medium">推理等级</span>
          </button>
          <div className="max-h-60 overflow-y-auto py-1" role="menu">
            {levelItems.length === 0 && (
              <div className="px-3 py-2 text-xs text-macos-text-tertiary" role="status">当前模型未提供推理等级。</div>
            )}
            {levelItems.map((level) => {
              const selected = level === currentLevel
              return (
                <button
                  key={level}
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => onSelectLevel(level)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                    selected ? 'text-macos-text' : 'text-macos-text-secondary hover:bg-macos-bg'
                  }`}
                >
                  <span className="flex-1 text-left">{level}</span>
                  <span className="shrink-0 w-4 flex items-center justify-center">
                    {selected && <Check size={13} strokeWidth={1.8} className="text-macos-text" />}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
