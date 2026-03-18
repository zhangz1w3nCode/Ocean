import { useState, useEffect, useRef, useMemo, useCallback, type FC } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Bot, Box, GitBranch, Folder, Terminal, FolderOpen, Zap, BookOpen } from 'lucide-react'
import type { ReferenceItem, ReferenceCategory } from '../../types'

interface ReferenceSelectModalProps {
  isOpen: boolean
  onClose: () => void
  items: ReferenceItem[]
  onSelect: (item: ReferenceItem) => void
  position?: { x: number; y: number }
  defaultSelectedPath?: string  // 默认选中的引用路径
}

const categoryLabels: Record<ReferenceCategory, string> = {
  agents: '智能体',
  nodes: '节点',
  workflows: '工作流',
  resources: '资源文件',
  commands: '命令',
  abilities: '能力',
  knowledges: '知识',
}

// 与侧边栏图标保持一致
const categoryIcons: Record<ReferenceCategory, FC<{ size?: number; className?: string }>> = {
  agents: Bot,
  nodes: Box,
  workflows: GitBranch,
  resources: Folder,
  commands: Terminal,
  abilities: Zap,
  knowledges: BookOpen,
}

export const ReferenceSelectModal: FC<ReferenceSelectModalProps> = ({
  isOpen,
  onClose,
  items,
  onSelect,
  position,
  defaultSelectedPath,
}) => {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ReferenceCategory | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const isInitializedRef = useRef(false) // 跟踪是否已初始化

  // 按分类分组
  const groupedItems = useMemo(() => {
    const groups: Record<ReferenceCategory, ReferenceItem[]> = {
      agents: [],
      nodes: [],
      workflows: [],
      resources: [],
      commands: [],
      abilities: [],
      knowledges: [],
    }
    items.forEach((item) => {
      groups[item.category].push(item)
    })
    return groups
  }, [items])

  // 有内容的分类列表
  const availableCategories = useMemo(() => {
    return (Object.keys(groupedItems) as ReferenceCategory[]).filter(
      (cat) => groupedItems[cat].length > 0
    )
  }, [groupedItems])

  // 当前分类下的项目（带搜索过滤）
  const currentCategoryItems = useMemo(() => {
    const category = selectedCategory || availableCategories[0]
    if (!category) return []
    const categoryItems = groupedItems[category] || []
    if (!search.trim()) return categoryItems
    const lowerSearch = search.toLowerCase()
    return categoryItems.filter(
      (item) =>
        item.name.toLowerCase().includes(lowerSearch) ||
        item.description?.toLowerCase().includes(lowerSearch)
    )
  }, [selectedCategory, availableCategories, groupedItems, search])

  // 自动选择第一个有内容的分类或默认路径对应的分类（只在打开时执行一次）
  useEffect(() => {
    if (isOpen && availableCategories.length > 0 && !isInitializedRef.current) {
      isInitializedRef.current = true
      // 如果有默认选中路径，找到对应的项目
      if (defaultSelectedPath) {
        const defaultItem = items.find(item => item.path === defaultSelectedPath)
        if (defaultItem) {
          setSelectedCategory(defaultItem.category)
          // 设置选中索引
          const categoryItems = groupedItems[defaultItem.category]
          const itemIndex = categoryItems.findIndex(item => item.path === defaultSelectedPath)
          if (itemIndex !== -1) {
            setTimeout(() => setSelectedIndex(itemIndex), 0)
          }
          return
        }
      }
      // 否则选择第一个分类
      setSelectedCategory(availableCategories[0])
    }
  }, [isOpen, availableCategories, defaultSelectedPath, items, groupedItems])

  // 重置选中索引
  useEffect(() => {
    setSelectedIndex(0)
  }, [selectedCategory, search])

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus()
      }, 0)
    } else {
      setSearch('')
      setSelectedIndex(0)
      setSelectedCategory(null)
      isInitializedRef.current = false // 关闭时重置初始化标志
    }
  }, [isOpen])

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) =>
            prev < currentCategoryItems.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          break
        case 'ArrowLeft':
          e.preventDefault()
          {
            const currentIdx = availableCategories.indexOf(selectedCategory || availableCategories[0])
            if (currentIdx > 0) {
              setSelectedCategory(availableCategories[currentIdx - 1])
            }
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          {
            const currentIdx = availableCategories.indexOf(selectedCategory || availableCategories[0])
            if (currentIdx < availableCategories.length - 1) {
              setSelectedCategory(availableCategories[currentIdx + 1])
            }
          }
          break
        case 'Enter':
          e.preventDefault()
          if (currentCategoryItems[selectedIndex]) {
            onSelect(currentCategoryItems[selectedIndex])
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    },
    [currentCategoryItems, selectedIndex, selectedCategory, availableCategories, onSelect, onClose]
  )

  // 滚动到选中项
  useEffect(() => {
    if (listRef.current && currentCategoryItems.length > 0) {
      const selectedElement = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
      if (selectedElement) {
        selectedElement.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex, currentCategoryItems.length])

  // 计算弹窗位置
  const modalStyle = useMemo(() => {
    if (position) {
      return {
        position: 'fixed' as const,
        left: Math.min(position.x, window.innerWidth - 500),
        top: Math.min(position.y, window.innerHeight - 450),
      }
    }
    return {
      position: 'fixed' as const,
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    }
  }, [position])

  const handleItemClick = (item: ReferenceItem, index: number) => {
    setSelectedIndex(index)
    onSelect(item)
    onClose()
  }

  const handleCategoryClick = (category: ReferenceCategory) => {
    setSelectedCategory(category)
    setSelectedIndex(0)
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 遮罩层 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[60]"
            onClick={onClose}
          />

          {/* 弹窗内容 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            style={modalStyle}
            className="w-[520px] bg-white rounded-xl shadow-2xl z-[70] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            {/* 搜索框 */}
            <div className="p-3 border-b border-gray-100">
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  ref={inputRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索引用项..."
                  className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg
                    placeholder:text-gray-400 focus:outline-none focus:border-gray-400
                    focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)] transition-[border-color,box-shadow] duration-200"
                />
              </div>
            </div>

            {/* 主内容区域 - 左右布局 */}
            <div className="flex h-72">
              {/* 左侧分类列表 */}
              <div className="w-36 border-r border-gray-100 bg-gray-50/50 py-2 flex-shrink-0">
                {availableCategories.map((category) => {
                  const Icon = categoryIcons[category]
                  const isActive = selectedCategory === category
                  const count = groupedItems[category].length
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleCategoryClick(category)}
                      className={`w-full px-3 py-2 flex items-center gap-2 text-left transition-colors ${
                        isActive
                          ? 'bg-white text-gray-800 border-r-2 border-gray-400'
                          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                      }`}
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span className="text-sm truncate flex-1">{categoryLabels[category]}</span>
                      <span className={`text-xs ${isActive ? 'text-gray-400' : 'text-gray-300'}`}>
                        {count}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* 右侧文件列表 */}
              <div ref={listRef} className="flex-1 overflow-y-auto p-2">
                {currentCategoryItems.length === 0 ? (
                  <div className="py-8 text-center text-gray-400 text-sm">
                    {search ? '没有找到匹配的引用项' : '暂无内容'}
                  </div>
                ) : (
                  currentCategoryItems.map((item, index) => {
                    const isSelected = index === selectedIndex
                    const Icon = item.isLibrary ? FolderOpen : categoryIcons[item.category]
                    return (
                      <div
                        key={item.id}
                        data-index={index}
                        onClick={() => handleItemClick(item, index)}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
                          transition-colors duration-150 ${
                            isSelected
                              ? 'bg-gray-100'
                              : 'hover:bg-gray-50'
                          } ${item.isLibrary ? 'bg-blue-50/50 border-b border-gray-100 mb-1' : ''}`}
                      >
                        <Icon size={16} className={`${item.isLibrary ? 'text-blue-500' : 'text-gray-400'} flex-shrink-0`} />
                        <span className={`text-sm truncate ${item.isLibrary ? 'text-blue-600 font-medium' : 'text-gray-700'}`}>
                          {item.isLibrary ? `引用${item.name}` : item.name}
                        </span>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* 底部提示 */}
            <div className="px-3 py-2 border-t border-gray-100 bg-gray-50/50">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-3">
                  <span>左右键切换分类</span>
                  <span>上下键导航</span>
                </div>
                <div className="flex items-center gap-3">
                  <span>Enter 选择</span>
                  <span>Esc 关闭</span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}