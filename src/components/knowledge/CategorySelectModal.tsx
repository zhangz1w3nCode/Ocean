import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, Check, X } from 'lucide-react'
import { Modal, Button } from '../ui'
import { isElectron } from '../../utils/storage'
import type { KnowledgeFolder } from '../../utils/storage'

interface CategorySelectModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (category: string) => void
  currentCategory: string
}

export const CategorySelectModal: FC<CategorySelectModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentCategory,
}) => {
  const [folders, setFolders] = useState<KnowledgeFolder[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [isCreating, setIsCreating] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [createParentPath, setCreateParentPath] = useState('')
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  // 加载文件夹列表
  useEffect(() => {
    if (isOpen && isElectron()) {
      loadFolders()
    }
  }, [isOpen])

  // 创建新分类时自动聚焦
  useEffect(() => {
    if (isCreating && newFolderInputRef.current) {
      newFolderInputRef.current.focus()
    }
  }, [isCreating])

  const ROOT_EXPAND_KEY = '__root__'

  const loadFolders = async () => {
    try {
      const result = await window.electronAPI!.listKnowledgeFolders()
      if (result.success) {
        const folderList = result.folders || []
        setFolders(folderList)

        // 默认全部折叠，仅展开 currentCategory 路径上的父级
        const pathsToExpand = new Set<string>()

        if (currentCategory) {
          // 展开根目录（因为当前分类不在根目录）
          pathsToExpand.add(ROOT_EXPAND_KEY)
          const parts = currentCategory.split('/')
          // 逐级展开，如 "backend/v2/design" -> 展开 ["backend", "backend/v2"]
          let accumulated = ''
          for (let i = 0; i < parts.length - 1; i++) {
            accumulated = accumulated ? `${accumulated}/${parts[i]}` : parts[i]
            pathsToExpand.add(accumulated)
          }
        }

        setExpandedPaths(pathsToExpand)
      }
    } catch (error) {
      console.error('加载知识库文件夹列表失败:', error)
    }
  }

  // 切换文件夹展开/折叠
  const toggleExpand = (path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  // 选择分类
  const handleSelect = (path: string) => {
    onSelect(path)
    onClose()
  }

  // 选择根目录（无分类）
  const handleSelectRoot = () => {
    onSelect('')
    onClose()
  }

  // 开始创建新分类
  const handleStartCreate = (parentPath?: string) => {
    setIsCreating(true)
    setCreateParentPath(parentPath || '')
    setNewFolderName('')
  }

  // 确认创建新分类
  const handleConfirmCreate = () => {
    const trimmed = newFolderName.trim()
    if (!trimmed) {
      setIsCreating(false)
      return
    }

    const newPath = createParentPath ? `${createParentPath}/${trimmed}` : trimmed

    // 检查同级是否已存在同名分类
    const checkDuplicate = (items: KnowledgeFolder[], parentPath: string): boolean => {
      if (!parentPath) {
        return items.some(f => f.name === trimmed)
      }
      for (const item of items) {
        if (item.path === parentPath) {
          return item.children.some(f => f.name === trimmed)
        }
        if (item.children.length > 0) {
          const found = checkDuplicate(item.children, parentPath)
          if (found) return true
        }
      }
      return false
    }

    if (checkDuplicate(folders, createParentPath)) {
      return
    }

    // 在本地状态中添加新分类节点
    const newFolder: KnowledgeFolder = {
      name: trimmed,
      path: newPath,
      children: [],
    }

    const addToTree = (items: KnowledgeFolder[]): KnowledgeFolder[] => {
      if (!createParentPath) {
        return [...items, newFolder]
      }
      return items.map(item => {
        if (item.path === createParentPath) {
          return { ...item, children: [...item.children, newFolder] }
        }
        if (item.children.length > 0) {
          return { ...item, children: addToTree(item.children) }
        }
        return item
      })
    }

    setFolders(addToTree(folders))
    setExpandedPaths(prev => {
      const next = new Set(prev)
      next.add(createParentPath)
      return next
    })

    // 自动选中新创建的分类
    handleSelect(newPath)
  }

  // 渲染分类树节点
  const renderFolderNode = (folder: KnowledgeFolder, depth: number = 0) => {
    const isExpanded = expandedPaths.has(folder.path)
    const isSelected = currentCategory === folder.path
    const hasChildren = folder.children.length > 0

    return (
      <div key={folder.path}>
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer group transition-colors ${
            isSelected
              ? 'bg-blue-50 text-blue-700'
              : 'hover:bg-gray-50 text-gray-700'
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => handleSelect(folder.path)}
        >
          {/* 展开/折叠图标 */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(folder.path)
              }}
              className="p-0.5 hover:bg-gray-100 rounded"
            >
              {isExpanded ? (
                <ChevronDown size={14} className="text-gray-400" />
              ) : (
                <ChevronRight size={14} className="text-gray-400" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* 文件夹图标 */}
          {isSelected ? (
            <FolderOpen size={16} className="text-blue-500 flex-shrink-0" />
          ) : (
            <FolderClosed size={16} className="text-gray-400 flex-shrink-0" />
          )}

          {/* 分类名称 */}
          <span className="text-sm truncate">{folder.name}</span>
          {/* 悬浮时显示新建子分类按钮 */}
          {!isCreating && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStartCreate(folder.path)
                if (!isExpanded) toggleExpand(folder.path)
              }}
              className="ml-auto p-0.5 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="新建子分类"
            >
              <Plus size={14} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* 展开后的子区域 */}
        {isExpanded && (
          <div>
            {folder.children.map(child => renderFolderNode(child, depth + 1))}
            {/* 在子级创建新分类 */}
            {isCreating && createParentPath === folder.path && (
              <div
                className="flex items-center gap-1.5 px-2 py-1"
                style={{ paddingLeft: `${(depth + 1) * 20 + 8}px` }}
              >
                <span className="w-5" />
                <FolderClosed size={16} className="text-gray-300 flex-shrink-0" />
                <input
                  ref={newFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate()
                    if (e.key === 'Escape') { setIsCreating(false); setNewFolderName('') }
                  }}
                  placeholder="新分类名"
                  className="flex-1 text-sm px-1.5 py-0.5 border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                />
                <button onClick={handleConfirmCreate} className="p-0.5 hover:bg-gray-100 rounded">
                  <Check size={14} className="text-green-600" />
                </button>
                <button onClick={() => { setIsCreating(false); setNewFolderName('') }} className="p-0.5 hover:bg-gray-100 rounded">
                  <X size={14} className="text-gray-400" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="选择分类"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
        </div>
      }
    >
      <div className="space-y-1 max-h-[400px] overflow-y-auto">
        {/* 根目录 - 可展开/折叠，悬浮显示+按钮 */}
        <div
          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer group transition-colors ${
            currentCategory === ''
              ? 'bg-blue-50 text-blue-700'
              : 'hover:bg-gray-50 text-gray-700'
          }`}
          onClick={handleSelectRoot}
        >
          {/* 展开/折叠图标 */}
          {folders.length > 0 || isCreating ? (
            <button
              onClick={(e) => {
                e.stopPropagation()
                toggleExpand(ROOT_EXPAND_KEY)
              }}
              className="p-0.5 hover:bg-gray-100 rounded"
            >
              {expandedPaths.has(ROOT_EXPAND_KEY) ? (
                <ChevronDown size={14} className="text-gray-400" />
              ) : (
                <ChevronRight size={14} className="text-gray-400" />
              )}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <FolderOpen size={16} className={currentCategory === '' ? 'text-blue-500' : 'text-gray-400'} />
          <span className="text-sm">根目录</span>
          {/* 悬浮时显示新建子分类按钮 */}
          {!isCreating && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleStartCreate('')
                if (!expandedPaths.has(ROOT_EXPAND_KEY)) toggleExpand(ROOT_EXPAND_KEY)
              }}
              className="ml-auto p-0.5 rounded hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="新建子分类"
            >
              <Plus size={14} className="text-gray-400" />
            </button>
          )}
        </div>

        {/* 根目录展开后：子分类树 + 新建输入框 */}
        {expandedPaths.has(ROOT_EXPAND_KEY) && (
          <>
            {folders.map(folder => renderFolderNode(folder, 1))}

            {/* 根级创建新分类输入框 */}
            {isCreating && !createParentPath && (
              <div className="flex items-center gap-1.5 px-2 py-1" style={{ paddingLeft: `${1 * 20 + 8}px` }}>
                <span className="w-5" />
                <FolderClosed size={16} className="text-gray-300 flex-shrink-0" />
                <input
                  ref={newFolderInputRef}
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmCreate()
                    if (e.key === 'Escape') { setIsCreating(false); setNewFolderName('') }
                  }}
                  placeholder="新分类名"
                  className="flex-1 text-sm px-1.5 py-0.5 border border-gray-300 rounded focus:outline-none focus:border-blue-400"
                />
                <button onClick={handleConfirmCreate} className="p-0.5 hover:bg-gray-100 rounded">
                  <Check size={14} className="text-green-600" />
                </button>
                <button onClick={() => { setIsCreating(false); setNewFolderName('') }} className="p-0.5 hover:bg-gray-100 rounded">
                  <X size={14} className="text-gray-400" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}