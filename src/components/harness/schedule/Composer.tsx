import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Send, Square, Trash2, Sparkles, BrainCog, Layers, ChevronDown, ImagePlus } from 'lucide-react'
import { useHarnessStore, type HarnessImageAttachment } from '../../../stores/harnessStore'
import { CommandMenu } from './CommandMenu'
import { ModelMenu } from './ModelMenu'

const readImageAsAttachment = (file: File): Promise<HarnessImageAttachment> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const base64 = result.slice(result.indexOf(',') + 1)
      resolve({ type: 'image', data: base64, mimeType: file.type || 'image/png' })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

export const Composer: FC = () => {
  const activeSessionId = useHarnessStore((s) => s.activeSessionId)
  const runtime = useHarnessStore((s) => (s.activeSessionId ? s.runtimes[s.activeSessionId] : undefined))
  const sendPrompt = useHarnessStore((s) => s.sendPrompt)
  const abort = useHarnessStore((s) => s.abort)
  const compact = useHarnessStore((s) => s.compact)
  const setModel = useHarnessStore((s) => s.setModel)
  const setThinkingLevel = useHarnessStore((s) => s.setThinkingLevel)

  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<HarnessImageAttachment[]>([])
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuActiveIndex, setMenuActiveIndex] = useState(0)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const commandToken = /^\/(\S*)$/.exec(text.trim())

  useEffect(() => {
    if (commandToken) {
      setMenuOpen(true)
      setMenuActiveIndex(0)
    } else {
      setMenuOpen(false)
    }
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  // pi 扩展 set_editor_text 预填输入框（fire-and-forget，暂以空实现占位：事件已入流但未路由到此处）

  const insertCommand = useCallback((name: string) => {
    setText(`/${name} `)
    setMenuOpen(false)
    textareaRef.current?.focus()
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMenuActiveIndex((i) => Math.max(0, i - 1))
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMenuActiveIndex((i) => Math.min(i + 1, 64))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const q = commandToken ? commandToken[1].toLowerCase() : ''
        const filtered = (runtime?.commands ?? []).filter(
          (c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
        )
        const selected = filtered[menuActiveIndex]
        if (selected) insertCommand(selected.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuOpen(false)
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleSend()
    }
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    const imgs = await Promise.all(files.map(readImageAsAttachment))
    setAttachments((prev) => [...prev, ...imgs])
  }

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || !activeSessionId) return
    const ok = await sendPrompt(trimmed, attachments.length > 0 ? attachments : undefined)
    if (ok) {
      setText('')
      setAttachments([])
      setMenuOpen(false)
    }
  }, [text, attachments, activeSessionId, sendPrompt])

  const disabled = !activeSessionId || !runtime || runtime.status === 'closed' || runtime.status === 'connecting'
  const isStreaming = !!runtime?.isStreaming

  const handleCycleThinking = () => {
    if (!activeSessionId || !runtime) return
    const levels = runtime.availableThinkingLevels.length > 0 ? runtime.availableThinkingLevels : ['off', 'low', 'medium', 'high']
    const idx = runtime.thinkingLevel ? levels.indexOf(runtime.thinkingLevel) : -1
    const next = levels[(idx + 1) % levels.length]
    void setThinkingLevel(activeSessionId, next)
  }

  const stats = runtime?.stats

  const filteredCommands = useMemo(() => {
    if (!menuOpen || !commandToken) return []
    const q = commandToken[1].toLowerCase()
    return (runtime?.commands ?? []).filter(
      (c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    )
  }, [menuOpen, commandToken, runtime?.commands])

  return (
    <div className="shrink-0 border-t border-macos-border bg-white/80 backdrop-blur">
      {/* 控制行 */}
      <div className="max-w-3xl mx-auto px-4 pt-2 flex items-center gap-2 text-xs text-macos-text-secondary">
        <button
          onClick={() => {
            if (!activeSessionId) return
            const name = window.prompt('会话名称', runtime?.sessionName ?? '')
            if (name === null) return
            void useHarnessStore.getState().setSessionName(activeSessionId, name.trim())
          }}
          className="max-w-40 truncate px-2 py-1 rounded-md bg-macos-bg hover:bg-[#E8EAED] transition-colors"
          title="点击重命名会话"
        >
          {runtime?.sessionName || (activeSessionId ? `会话 ${activeSessionId.slice(-6)}` : '未选择会话')}
        </button>

        <div className="relative">
          <button
            onClick={() => setModelMenuOpen((o) => !o)}
            disabled={!runtime || (runtime.modelList ?? []).length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-md bg-macos-bg hover:bg-[#E8EAED] transition-colors disabled:opacity-50 max-w-56 truncate"
            title={runtime?.model ? `${runtime.model.id}` : '切换模型'}
          >
            <Sparkles size={11} strokeWidth={1.5} />
            <span className="truncate">{runtime?.model?.name ?? '模型'}</span>
            <ChevronDown size={10} strokeWidth={1.5} />
          </button>
          <ModelMenu
            open={modelMenuOpen}
            models={runtime?.modelList ?? []}
            currentId={runtime?.model?.id ?? null}
            onSelect={(provider, modelId) => {
              setModelMenuOpen(false)
              if (activeSessionId) void setModel(activeSessionId, provider, modelId)
            }}
            onClose={() => setModelMenuOpen(false)}
          />
        </div>

        <button
          onClick={handleCycleThinking}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-macos-bg hover:bg-[#E8EAED] transition-colors"
          title="循环切换 thinking 级别"
        >
          <BrainCog size={11} strokeWidth={1.5} />
          {runtime?.thinkingLevel ?? 'thinking'}
        </button>

        <button
          onClick={() => activeSessionId && void compact(activeSessionId)}
          disabled={!activeSessionId || isStreaming}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-macos-bg hover:bg-[#E8EAED] transition-colors disabled:opacity-50"
          title="压缩上下文（保留摘要继续）"
        >
          <Layers size={11} strokeWidth={1.5} />
          compact
        </button>

        <div className="flex-1" />

        {runtime?.pendingApproval && (
          <span className="px-2 py-1 rounded-md bg-macos-warning/10 text-macos-warning">待确认（见消息流审批卡）</span>
        )}

        {stats && stats.totalTokens > 0 && (
          <div className="flex items-center gap-2 text-[10px] text-macos-text-tertiary" title={`总 tokens ${stats.totalTokens}，费用 $${stats.cost.toFixed(4)}`}>
            <span>{stats.totalTokens.toLocaleString()} tokens</span>
            {stats.contextPercent != null && <span>ctx {stats.contextPercent}%</span>}
            {stats.cost > 0 && <span>${stats.cost.toFixed(2)}</span>}
          </div>
        )}
      </div>

      {/* 输入区 */}
      <div className="max-w-3xl mx-auto px-4 py-2 relative" onClick={() => setModelMenuOpen(false)}>
        {menuOpen && filteredCommands.length > 0 && (
          <CommandMenu
            commands={runtime?.commands ?? []}
            filter={commandToken ? commandToken[1] : ''}
            activeIndex={menuActiveIndex}
            onSelect={insertCommand}
            onClose={() => setMenuOpen(false)}
          />
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-1.5">
            {attachments.map((img, i) => (
              <div key={i} className="relative group">
                <img src={`data:${img.mimeType};base64,${img.data}`} alt="" className="h-16 rounded-lg border border-macos-border object-cover" />
                <button
                  onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-macos-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  title="移除图片"
                >
                  <Trash2 size={10} strokeWidth={1.5} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-2xl border border-macos-border bg-white px-3 py-2 focus-within:border-macos-text/25 transition-colors">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={(e) => void handlePaste(e)}
            disabled={disabled}
            rows={1}
            placeholder={
              disabled
                ? '新建或选择一个会话开始对话…'
                : isStreaming
                  ? '运行中：发送将排队插入（steer）…'
                  : '发送消息（/ 命令 · @ 引用路径 · 粘贴图片）'
            }
            className="flex-1 resize-none bg-transparent text-sm text-macos-text placeholder:text-macos-text-tertiary outline-none leading-relaxed max-h-40"
          />
          <button
            onClick={() => {
              if (isStreaming) {
                if (activeSessionId) void abort(activeSessionId)
              } else {
                void handleSend()
              }
            }}
            disabled={disabled || (!isStreaming && text.trim().length === 0)}
            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
              isStreaming
                ? 'bg-macos-error text-white hover:opacity-80'
                : text.trim().length > 0 && !disabled
                  ? 'bg-macos-text text-white hover:opacity-80'
                  : 'bg-macos-bg text-macos-text-tertiary'
            }`}
            title={isStreaming ? '停止当前回合' : '发送'}
          >
            {isStreaming ? <Square size={12} strokeWidth={2} /> : <Send size={13} strokeWidth={1.8} />}
          </button>
        </div>

        <div className="flex items-center gap-1 mt-1 text-[10px] text-macos-text-tertiary">
          <ImagePlus size={10} strokeWidth={1.5} />
          <span>Enter 发送 · Shift+Enter 换行{isStreaming ? ' · 运行中发送即 steer 排队' : ''}</span>
        </div>
      </div>
    </div>
  )
}
