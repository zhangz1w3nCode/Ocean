import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, BookOpen, Eye, Edit3, MessageSquare, Tag, Plus, X, Check } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import type { KnowledgeFile } from '../../types'

interface KnowledgeModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (knowledge: Omit<KnowledgeFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => void
  mode: 'create' | 'edit'
  initialData?: KnowledgeFile
  existingNames?: string[]
}

export const KnowledgeModal: FC<KnowledgeModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  mode,
  initialData,
  existingNames = [],
}) => {
  const { addToast } = useToastStore()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // 标签输入状态
  const [isAddingTag, setIsAddingTag] = useState(false)
  const [newTagInput, setNewTagInput] = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  // 计算排除路径（编辑模式下排除当前知识库）
  const excludePath = mode === 'edit' && initialData ? `.claude/knowledges/${initialData.name}.md` : undefined

  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)

  // 验证失败的字段
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 初始数据快照（用于检测是否有修改）
  const initialSnapshot = useRef<string>('')

  // 生成当前数据快照
  const getSnapshot = () => {
    return JSON.stringify({
      name,
      description,
      content,
      tags,
    })
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  // 当弹窗打开或 initialData 变化时，重置表单
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        setName(initialData.name)
        setDescription(initialData.description || '')
        setContent(initialData.content || '')
        setTags(initialData.tags || [])
      } else {
        // 创建模式：重置为默认值
        setName('')
        setDescription('')
        setContent('')
        setTags([])
      }
      setIsAddingTag(false)
      setNewTagInput('')
      setInvalidFields(new Set())
      setViewMode('edit')
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData])

  // 标签输入框自动聚焦
  useEffect(() => {
    if (isAddingTag && tagInputRef.current) {
      tagInputRef.current.focus()
    }
  }, [isAddingTag])

  // 添加标签
  const handleAddTag = () => {
    const trimmedTag = newTagInput.trim()
    if (!trimmedTag) {
      setIsAddingTag(false)
      setNewTagInput('')
      return
    }

    // 检查标签是否已存在
    if (tags.includes(trimmedTag)) {
      addToast('标签已存在', 'warning')
      return
    }

    // 限制标签长度
    if (trimmedTag.length > 20) {
      addToast('标签长度不能超过20个字符', 'warning')
      return
    }

    setTags([...tags, trimmedTag])
    setNewTagInput('')
    setIsAddingTag(false)
  }

  // 删除标签
  const handleRemoveTag = (index: number) => {
    setTags(tags.filter((_, i) => i !== index))
  }

  // 取消添加标签
  const handleCancelAddTag = () => {
    setIsAddingTag(false)
    setNewTagInput('')
  }

  // 标签输入键盘事件
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddTag()
    } else if (e.key === 'Escape') {
      handleCancelAddTag()
    }
  }

  const handleSubmit = () => {
    // 验证知识名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入知识名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 创建模式下检查名称唯一性
    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('知识名称已存在，请使用其他名称', 'warning')
      return
    }

    // 验证内容
    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入知识内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 清除验证失败状态
    setInvalidFields(new Set())

    // 提交
    onConfirm({
      name: name.trim(),
      description: description.trim(),
      content: content.trim(),
      tags,
    })

    // 显示成功提示
    addToast(mode === 'create' ? '知识创建成功' : '知识更新成功', 'success')

    handleClose(true)
  }

  const handleClose = (skipConfirm = false) => {
    // 如果不是跳过确认，且有修改，则显示确认弹窗
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }

    setName('')
    setDescription('')
    setContent('')
    setTags([])
    setIsAddingTag(false)
    setNewTagInput('')
    setInvalidFields(new Set())
    onClose()
  }

  // 确认关闭
  const handleConfirmClose = () => {
    setShowConfirm(false)
    handleClose(true)
  }

  // 取消关闭
  const handleCancelClose = () => {
    setShowConfirm(false)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'create' ? '创建新知识' : '编辑知识'}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose()}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmit}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              {mode === 'create' ? '创建' : '保存'}
            </Button>
          </div>
        }
      >
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2">
          {/* 知识名称 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              知识名称 *
            </label>
            <Input
              placeholder="例如：业务知识文档"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (invalidFields.has('name')) setInvalidFields(new Set())
              }}
              autoFocus
              disabled={mode === 'edit'}
              invalid={invalidFields.has('name')}
            />
            {mode === 'edit' && (
              <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下知识名称不可修改</p>
            )}
          </div>

          {/* 知识描述 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} className="text-macos-text-secondary" />
              知识描述
            </label>
            <Textarea
              placeholder="简要描述这个知识的用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* 知识标签 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Tag size={16} className="text-macos-text-secondary" />
              知识标签
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {/* 已添加的标签 */}
              {tags.map((tag, index) => (
                <span
                  key={index}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-sm"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(index)}
                    className="ml-0.5 hover:text-blue-800 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}

              {/* 添加标签按钮或输入框 */}
              {isAddingTag ? (
                <div className="inline-flex items-center gap-1">
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="输入标签"
                    className="px-2.5 py-1 w-24 text-sm border border-gray-300 rounded-full focus:outline-none focus:border-gray-400"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <Check size={16} className="text-green-600" />
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelAddTag}
                    className="p-1 hover:bg-gray-100 rounded-full transition-colors"
                  >
                    <X size={16} className="text-gray-400" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingTag(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-dashed border-gray-300 text-gray-500 rounded-full text-sm hover:border-gray-400 hover:text-gray-600 transition-colors"
                >
                  <Plus size={14} />
                  添加标签
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-macos-text-tertiary">标签用于分类和检索知识文档</p>
          </div>

          {/* 知识内容 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
                <BookOpen size={16} className="text-macos-text-secondary" />
                知识内容 *
              </label>
              {/* 编辑/预览切换 */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'edit'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 size={14} />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'preview'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye size={14} />
                  预览
                </button>
              </div>
            </div>

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <MarkdownEditor
                placeholder="在此输入知识内容，支持 Markdown 格式...&#10;&#10;例如：&#10;# 知识说明&#10;- 这是业务知识...&#10;&#10;提示：输入@和%可引用其他业务内容"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  if (invalidFields.has('content')) setInvalidFields(new Set())
                }}
                rows={12}
                invalid={invalidFields.has('content')}
                className="font-mono text-sm"
                excludePath={excludePath}
              />
            )}

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div
                className={`bg-gray-50 rounded-lg p-4 min-h-[280px] max-h-[400px] overflow-y-auto ${
                  invalidFields.has('content') ? 'ring-2 ring-gray-400' : ''
                }`}
              >
                {content.trim() ? (
                  <MarkdownRenderer content={content} />
                ) : (
                  <p className="text-sm text-macos-text-tertiary text-center py-8">
                    暂无内容，请切换到编辑模式输入内容
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 确认关闭弹窗 */}
      <ConfirmModal
        isOpen={showConfirm}
        title="确认退出"
        message="当前有未保存的修改，确定要退出吗？"
        confirmText="退出"
        cancelText="继续编辑"
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />
    </>
  )
}