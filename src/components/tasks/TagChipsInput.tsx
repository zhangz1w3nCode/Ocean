import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'

interface TagChipsInputProps {
  items: string[]
  onChange: (items: string[]) => void
  /** 添加按钮文案，如「添加标签」「添加仓库」 */
  addLabel: string
  /** 输入框占位符（自由输入模式） */
  placeholder: string
  /** 校验提示中的条目名称，如「标签」「仓库」 */
  itemLabel: string
  /** 徽标配色：blue（标签，同知识卡片）/ gray（仓库） */
  variant?: 'blue' | 'gray'
  /** 单项长度上限（0 不限） */
  maxLength?: number
  /** 可选项列表：传入则启用选择模式——点击添加按钮弹出选项列表（已选项置灰），点击选项追加胶囊；不传则自由输入 */
  options?: string[]
  /** 选择模式无可用选项时的提示 */
  emptyOptionHint?: string
}

// 多值胶囊输入（参照知识卡片创建弹窗的标签交互）：已选项为可删除的胶囊，
// 虚线按钮展开内联输入（自由输入模式）或选项列表（选择模式），
// Enter/确认添加，Esc/取消收起，含去重与长度校验
export const TagChipsInput: FC<TagChipsInputProps> = ({
  items,
  onChange,
  addLabel,
  placeholder,
  itemLabel,
  variant = 'blue',
  maxLength = 20,
  options,
  emptyOptionHint = '暂无可选项',
}) => {
  const { addToast } = useToastStore()
  const [isAdding, setIsAdding] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const isSelectMode = Array.isArray(options)

  useEffect(() => {
    if (isAdding && !isSelectMode && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAdding, isSelectMode])

  // 选择模式：点击外部关闭选项列表
  useEffect(() => {
    if (!isAdding || !isSelectMode) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsAdding(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isAdding, isSelectMode])

  const chipClass = variant === 'blue'
    ? 'bg-blue-50 text-blue-600'
    : 'bg-gray-100 text-gray-600'
  const chipRemoveHover = variant === 'blue' ? 'hover:text-blue-800' : 'hover:text-gray-800'

  const handleAdd = () => {
    const trimmed = input.trim()
    if (!trimmed) {
      setIsAdding(false)
      setInput('')
      return
    }
    if (items.includes(trimmed)) {
      addToast(`${itemLabel}已存在`, 'warning')
      return
    }
    if (maxLength > 0 && trimmed.length > maxLength) {
      addToast(`${itemLabel}长度不能超过${maxLength}个字符`, 'warning')
      return
    }
    onChange([...items, trimmed])
    setInput('')
    setIsAdding(false)
  }

  // 选择模式：点击选项追加胶囊（列表保持展开可连续多选；已选项不可重复选）
  const handleSelectOption = (option: string) => {
    if (items.includes(option)) return
    onChange([...items, option])
  }

  const handleCancel = () => {
    setIsAdding(false)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAdd()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 已添加的胶囊（X 删除） */}
      {items.map((item, index) => (
        <span key={index} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm ${chipClass}`}>
          {item}
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className={`ml-0.5 ${chipRemoveHover} transition-colors`}
          >
            <X size={14} />
          </button>
        </span>
      ))}

      {/* 添加按钮或内联输入/选项列表 */}
      {isAdding && !isSelectMode ? (
        <div className="inline-flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="px-2.5 py-1 w-24 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Check size={16} className="text-green-600" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
      ) : isSelectMode ? (
        <div className="relative" ref={popoverRef}>
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm transition-colors ${
              isAdding
                ? 'border border-gray-300 text-gray-600 bg-gray-50'
                : 'border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600'
            }`}
          >
            {isAdding ? <X size={14} /> : <Plus size={14} />}
            {isAdding ? '收起' : addLabel}
          </button>
          {isAdding && (
            <div className="absolute top-full left-0 mt-1.5 min-w-[200px] max-w-[280px] max-h-48 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg p-1 z-50">
              {(options || []).map((option) => {
                const selected = items.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={selected}
                    onClick={() => handleSelectOption(option)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md text-left transition-colors ${
                      selected
                        ? 'text-macos-text-tertiary cursor-default'
                        : 'text-macos-text hover:bg-gray-50 cursor-pointer'
                    }`}
                  >
                    <span className="truncate" title={option}>{option}</span>
                    {selected && <Check size={14} className="flex-shrink-0 text-gray-400" />}
                  </button>
                )
              })}
              {(options || []).length === 0 && (
                <p className="px-3 py-2 text-xs text-macos-text-tertiary">{emptyOptionHint}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-gray-300 text-gray-500 rounded-lg text-sm hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          <Plus size={14} />
          {addLabel}
        </button>
      )}
    </div>
  )
}
