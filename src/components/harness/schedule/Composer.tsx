import type { FC } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Square, Trash2, Sparkles, ChevronDown, ImagePlus, Plus } from 'lucide-react'
import { useHarnessStore, type HarnessImageAttachment } from '../../../stores/harnessStore'
import { CommandMenu } from './CommandMenu'
import { ModelMenu } from './ModelMenu'
import { ContextMeter } from './ContextMeter'

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
  const setModel = useHarnessStore((s) => s.setModel)
  const setThinkingLevel = useHarnessStore((s) => s.setThinkingLevel)
  const draftQuote = useHarnessStore((s) => s.draftQuote)
  const clearDraftQuote = useHarnessStore((s) => s.clearDraftQuote)

  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<HarnessImageAttachment[]>([])
  const [menuForced, setMenuForced] = useState(false)
  const [menuDismissed, setMenuDismissed] = useState(false)
  const [menuActiveIndex, setMenuActiveIndex] = useState(0)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const commandToken = /^\/(\S*)$/.exec(text.trim())
  const menuOpen = (!!commandToken || menuForced) && !menuDismissed
  const menuFilter = commandToken ? commandToken[1] : ''

  // 消息流选中文本引用：以 markdown 引用格式插入输入框
  useEffect(() => {
    if (draftQuote) {
      setText((prev) => (prev ? `${prev}\n` : '') + `> ${draftQuote.replace(/\n/g, '\n> ')}\n`)
      clearDraftQuote()
      textareaRef.current?.focus()
    }
  }, [draftQuote, clearDraftQuote])

  useEffect(() => {
    setMenuActiveIndex(0)
  }, [text, menuForced])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const insertCommand = useCallback((name: string) => {
    setText(`/${name} `)
    setMenuForced(false)
    setMenuDismissed(false)
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
        const q = menuFilter.toLowerCase()
        const filtered = (runtime?.commands ?? []).filter(
          (c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
        )
        const selected = filtered[menuActiveIndex]
        if (selected) insertCommand(selected.name)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMenuForced(false)
        setMenuDismissed(true)
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

  const handlePickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) {
      const imgs = await Promise.all(files.map(readImageAsAttachment))
      setAttachments((prev) => [...prev, ...imgs])
    }
    e.target.value = ''
  }

  const handleDrop = async (e: React.DragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
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
      setMenuForced(false)
      setMenuDismissed(false)
    }
  }, [text, attachments, activeSessionId, sendPrompt])

  const disabled = !activeSessionId || !runtime || runtime.status === 'closed' || runtime.status === 'connecting'
  const isStreaming = !!runtime?.isStreaming

  const filteredCommands = useMemo(() => {
    if (!menuOpen) return []
    const q = menuFilter.toLowerCase()
    return (runtime?.commands ?? []).filter(
      (c) => !q || c.name.toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)
    )
  }, [menuOpen, menuFilter, runtime?.commands])

  return (
    <div className="shrink-0">
      {/* 待确认提示（仅在有未答复的扩展请求时出现） */}
      {runtime?.pendingApproval && (
        <div className="w-full px-4 pt-2">
          <span className="px-2 py-1 rounded-md bg-macos-warning/10 text-macos-warning text-xs">待确认（见消息流审批卡）</span>
        </div>
      )}

      {/* 输入区 */}
      <div className="w-full px-[60px] py-2 relative" onClick={() => { setModelMenuOpen(false); setContextOpen(false) }}>
        {menuOpen && filteredCommands.length > 0 && (
          <CommandMenu
            commands={runtime?.commands ?? []}
            filter={menuFilter}
            activeIndex={menuActiveIndex}
            onSelect={insertCommand}
            onClose={() => setMenuForced(false)}
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

        <div
          onDrop={(e) => void handleDrop(e)}
          onDragOver={(e) => e.preventDefault()}
          className="rounded-[20px] bg-white border border-macos-border/70 shadow-sm focus-within:border-macos-text/20 transition-colors px-3 pt-2.5 pb-2"
        >
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setMenuDismissed(false)
            }}
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
            className="w-full resize-none bg-transparent text-sm text-macos-text placeholder:text-macos-text-tertiary outline-none leading-relaxed max-h-40"
          />

          {/* 底部工具行（DSH InputBar：+命令 / 图片 / 模型·等级 / 发送） */}
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={() => {
                setMenuForced((o) => !o)
                setMenuDismissed(false)
              }}
              disabled={disabled}
              className={`w-7 h-7 rounded-full grid place-items-center transition-colors disabled:opacity-40 shrink-0 ${
                menuForced ? 'bg-[#E8EAED] text-macos-text' : 'bg-macos-bg text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED]'
              }`}
              title="命令与技能（/）"
            >
              <Plus size={14} strokeWidth={1.8} />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled}
              className="w-7 h-7 rounded-full grid place-items-center bg-macos-bg text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED] transition-colors disabled:opacity-40 shrink-0"
              title="添加图片"
            >
              <ImagePlus size={13} strokeWidth={1.5} />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => void handlePickFiles(e)} />

            <div className="flex-1" />

            <ContextMeter
              stats={runtime?.stats ?? null}
              open={contextOpen}
              onToggle={() => setContextOpen((o) => !o)}
              onClose={() => setContextOpen(false)}
            />

            <div className="relative flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setModelMenuOpen((o) => !o)
                }}
                disabled={!runtime || (runtime.modelList ?? []).length === 0}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-macos-text-secondary hover:bg-macos-bg transition-colors disabled:opacity-50 max-w-64"
                title={runtime?.model?.id ?? '切换模型与推理等级'}
              >
                <Sparkles size={12} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate">{runtime?.model?.name ?? '模型'}</span>
                {runtime?.thinkingLevel && <span className="text-macos-text-tertiary shrink-0">· {runtime.thinkingLevel}</span>}
                <ChevronDown size={10} strokeWidth={1.5} className={`shrink-0 transition-transform ${modelMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              <ModelMenu
                open={modelMenuOpen}
                models={runtime?.modelList ?? []}
                currentId={runtime?.model?.id ?? null}
                currentLevel={runtime?.thinkingLevel ?? null}
                levels={runtime?.availableThinkingLevels ?? []}
                onSelectModel={(provider, modelId) => {
                  setModelMenuOpen(false)
                  if (activeSessionId) void setModel(activeSessionId, provider, modelId)
                }}
                onSelectLevel={(level) => {
                  setModelMenuOpen(false)
                  if (activeSessionId) void setThinkingLevel(activeSessionId, level)
                }}
                onClose={() => setModelMenuOpen(false)}
              />
            </div>

            <button
              onClick={() => {
                if (isStreaming) {
                  if (activeSessionId) void abort(activeSessionId)
                } else {
                  void handleSend()
                }
              }}
              disabled={disabled || (!isStreaming && text.trim().length === 0)}
              className={`shrink-0 w-9 h-9 rounded-xl grid place-items-center text-white transition-all ${
                isStreaming ? 'bg-macos-error hover:opacity-90' : 'bg-macos-text hover:opacity-90 disabled:opacity-40'
              }`}
              title={isStreaming ? '停止当前回合' : '发送'}
            >
              {isStreaming ? <Square size={12} strokeWidth={2.5} /> : <ArrowUp size={18} strokeWidth={2} />}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
