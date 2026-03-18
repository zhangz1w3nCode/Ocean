import { useState, useRef, useCallback, useEffect, type FC, type TextareaHTMLAttributes } from 'react'
import { ReferenceSelectModal } from './ReferenceSelectModal'
import { useReferenceItems } from '../../hooks/useReferenceItems'
import type { ReferenceItem } from '../../types'

interface ReferenceTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  invalid?: boolean
  excludePath?: string  // 排除特定路径（如 ".claude/nodes/xxx.md"）
}

// 引用路径的正则匹配：`xxx/xxx.md` 或 `xxx/`（库引用）
const REFERENCE_PATTERN = /`([^`\n]+(\.md|\/))`/g

export const ReferenceTextarea: FC<ReferenceTextareaProps> = ({
  label,
  error,
  invalid,
  excludePath,
  onChange,
  value,
  className = '',
  disabled,
  placeholder,
  rows = 4,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalPosition, setModalPosition] = useState<{ x: number; y: number } | undefined>()
  const [editingReference, setEditingReference] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const referenceItems = useReferenceItems({ excludePath })

  // 同步滚动
  useEffect(() => {
    const textarea = textareaRef.current
    const overlay = overlayRef.current
    if (!textarea || !overlay) return

    const handleScroll = () => {
      overlay.scrollTop = textarea.scrollTop
      overlay.scrollLeft = textarea.scrollLeft
    }

    textarea.addEventListener('scroll', handleScroll)
    return () => textarea.removeEventListener('scroll', handleScroll)
  }, [])

  // 解析内容，分割为普通文本和引用块
  const parseContent = useCallback((text: string) => {
    const parts: Array<{ type: 'text' | 'reference'; content: string; path?: string }> = []
    let lastIndex = 0
    let match

    REFERENCE_PATTERN.lastIndex = 0
    while ((match = REFERENCE_PATTERN.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
      }
      parts.push({ type: 'reference', content: match[0], path: match[1] })
      lastIndex = match.index + match[0].length
    }
    if (lastIndex < text.length) {
      parts.push({ type: 'text', content: text.slice(lastIndex) })
    }
    return parts
  }, [])

  // 处理点击引用块 - 重新打开选择弹窗
  const handleReferenceClick = useCallback((path: string) => {
    const item = referenceItems.find(item => item.path === path)
    if (item) {
      setEditingReference(path)
    }
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setModalPosition({ x: rect.left, y: rect.bottom + 5 })
    }
    setIsModalOpen(true)
  }, [referenceItems])

  // 处理输入
  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value
    const cursorPos = e.target.selectionStart || 0

    // 检测是否输入了 @
    if (newValue[cursorPos - 1] === '@') {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setModalPosition({ x: rect.left, y: rect.bottom + 5 })
      }
      setIsModalOpen(true)
      setEditingReference(null)
    }

    if (onChange) {
      onChange(e)
    }
  }, [onChange])

  // 处理选择引用项
  const handleSelectReference = useCallback((item: ReferenceItem) => {
    const currentValue = String(value || '')
    let newValue: string
    let cursorPos: number

    if (editingReference) {
      newValue = currentValue.replace(
        new RegExp(`\`${editingReference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``, 'g'),
        `\`${item.path}\``
      )
      // 找到替换后的位置
      const replacedIndex = newValue.indexOf(`\`${item.path}\``)
      cursorPos = replacedIndex + `\`${item.path}\``.length
    } else {
      const atIndex = currentValue.lastIndexOf('@')
      if (atIndex !== -1) {
        newValue = currentValue.slice(0, atIndex) + `\`${item.path}\`` + currentValue.slice(atIndex + 1)
      } else {
        newValue = currentValue + `\`${item.path}\``
      }
      cursorPos = atIndex !== -1 ? atIndex + `\`${item.path}\``.length : newValue.length
    }

    if (onChange) {
      const syntheticEvent = {
        target: { value: newValue },
        currentTarget: { value: newValue },
      } as React.ChangeEvent<HTMLTextAreaElement>
      onChange(syntheticEvent)
    }

    // 设置光标到引用块末尾
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(cursorPos, cursorPos)
      }
    }, 0)

    setIsModalOpen(false)
    setEditingReference(null)
  }, [value, onChange, editingReference])

  // 关闭弹窗
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false)
    setEditingReference(null)
  }, [])

  // 查找光标位置所在的引用块
  const findReferenceAtPosition = useCallback((text: string, pos: number) => {
    REFERENCE_PATTERN.lastIndex = 0
    let match
    while ((match = REFERENCE_PATTERN.exec(text)) !== null) {
      if (match.index !== undefined) {
        const start = match.index
        const end = start + match[0].length
        if (pos >= start && pos <= end) {
          return { start, end, content: match[0] }
        }
      }
    }
    return null
  }, [])

  // 处理键盘事件 - 整体删除引用块 + 光标跳跃
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const currentValue = String(value || '')
    const cursorPos = textareaRef.current?.selectionStart || 0

    // 退格键：如果光标在引用块末尾，整体删除
    if (e.key === 'Backspace') {
      const beforeCursor = currentValue.slice(0, cursorPos)
      const match = beforeCursor.match(/`[^`\n]+(\.md|\/)`$/)
      if (match) {
        e.preventDefault()
        const start = cursorPos - match[0].length
        const newValue = currentValue.slice(0, start) + currentValue.slice(cursorPos)
        if (onChange) {
          const syntheticEvent = {
            target: { value: newValue },
            currentTarget: { value: newValue },
          } as React.ChangeEvent<HTMLTextAreaElement>
          onChange(syntheticEvent)
        }
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(start, start)
          }
        }, 0)
      }
    }

    // 左箭头：如果光标在引用块末尾，跳到引用块开头
    if (e.key === 'ArrowLeft') {
      const ref = findReferenceAtPosition(currentValue, cursorPos)
      if (ref && cursorPos === ref.end) {
        e.preventDefault()
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(ref.start, ref.start)
          }
        }, 0)
      }
    }

    // 右箭头：如果光标在引用块开头，跳到引用块末尾
    if (e.key === 'ArrowRight') {
      const ref = findReferenceAtPosition(currentValue, cursorPos)
      if (ref && cursorPos === ref.start) {
        e.preventDefault()
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.setSelectionRange(ref.end, ref.end)
          }
        }, 0)
      }
    }
  }, [value, onChange, findReferenceAtPosition])

  // 渲染高亮覆盖层
  const renderOverlay = useCallback(() => {
    const currentValue = String(value || '')
    const parts = parseContent(currentValue)

    return parts.map((part, index) => {
      if (part.type === 'reference') {
        // 将引用块分成：开始反引号、路径、结束反引号
        // 只给路径部分加背景色，以便光标在边界时可见
        // 注意：不添加额外的padding，保持文字对齐
        return (
          <span
            key={index}
            onClick={(e) => {
              e.stopPropagation()
              handleReferenceClick(part.path || '')
            }}
            className="cursor-pointer select-none pointer-events-auto"
          >
            <span className="text-blue-700">`</span>
            <span className="bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors">
              {part.path}
            </span>
            <span className="text-blue-700">`</span>
          </span>
        )
      }
      return <span key={index}>{part.content || (currentValue === '' ? placeholder : '')}</span>
    })
  }, [value, parseContent, handleReferenceClick, placeholder])

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-macos-text mb-1.5">
          {label}
        </label>
      )}
      <div
        ref={containerRef}
        className={`
          relative w-full bg-white border rounded-lg
          transition-[border-color,box-shadow] duration-200
          ${error
            ? 'border-red-300 hover:border-red-400 focus-within:border-red-400'
            : invalid
              ? 'border-gray-400'
              : 'border-gray-200 hover:border-gray-300 focus-within:border-gray-400 focus-within:shadow-[0_4px_12px_rgba(0,0,0,0.08)]'
          }
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
          ${className}
        `}
      >
        {/* 透明的 textarea 输入层 - 在下方 */}
        <textarea
          ref={textareaRef}
          value={value || ''}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          className={`
            relative w-full px-3 py-2.5 text-sm bg-transparent
            caret-macos-text resize-none
            focus:outline-none
            font-mono
            ${disabled ? 'text-macos-text-secondary' : 'text-transparent'}
          `}
          style={{
            lineHeight: '1.5',
            letterSpacing: 'normal',
          }}
        />

        {/* 高亮覆盖层 - 在上方，普通文本点击穿透 */}
        <div
          ref={overlayRef}
          className="absolute inset-0 px-3 py-2.5 text-sm text-macos-text overflow-hidden whitespace-pre-wrap break-words pointer-events-none font-mono"
          style={{
            lineHeight: '1.5',
            letterSpacing: 'normal',
          }}
        >
          {renderOverlay()}
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-macos-error">{error}</p>}

      <ReferenceSelectModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        items={referenceItems}
        onSelect={handleSelectReference}
        position={modalPosition}
        defaultSelectedPath={editingReference || undefined}
      />
    </div>
  )
}