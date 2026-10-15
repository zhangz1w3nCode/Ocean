import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Plus, Check, X } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'

interface TagChipsInputProps {
  items: string[]
  onChange: (items: string[]) => void
  /** 添加按钮文案，如「添加标签」「添加仓库」 */
  addLabel: string
  /** 输入框占位符 */
  placeholder: string
  /** 校验提示中的条目名称，如「标签」「仓库」 */
  itemLabel: string
  /** 徽标配色：blue（标签，同知识卡片）/ gray（仓库） */
  variant?: 'blue' | 'gray'
  /** 单项长度上限（0 不限） */
  maxLength?: number
}

// 多值胶囊输入（参照知识卡片创建弹窗的标签交互）：已选项为可删除的胶囊，
// 虚线按钮展开内联输入，Enter/确认添加，Esc/取消收起，含去重与长度校验
export const TagChipsInput: FC<TagChipsInputProps> = ({
  items,
  onChange,
  addLabel,
  placeholder,
  itemLabel,
  variant = 'blue',
  maxLength = 20,
}) => {
  const { addToast } = useToastStore()
  const [isAdding, setIsAdding] = useState(false)
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isAdding])

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
        <span key={index} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm ${chipClass}`}>
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

      {/* 添加按钮或内联输入 */}
      {isAdding ? (
        <div className="inline-flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="px-2.5 py-1 w-24 text-sm border border-gray-300 rounded-full focus:outline-none focus:border-gray-400"
          />
          <button
            type="button"
            onClick={handleAdd}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Check size={16} className="text-green-600" />
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X size={16} className="text-gray-400" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-gray-300 text-gray-500 rounded-full text-sm hover:border-gray-400 hover:text-gray-600 transition-colors"
        >
          <Plus size={14} />
          {addLabel}
        </button>
      )}
    </div>
  )
}
