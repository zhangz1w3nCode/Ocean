import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, Bot, Cpu, Palette, Eye, Edit3, MessageSquare } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import type { AgentFile } from '../../types'

interface AgentModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (agent: Omit<AgentFile, 'id' | 'createdAt' | 'updatedAt' | 'type'>) => void
  mode: 'create' | 'edit'
  initialData?: AgentFile
  existingNames?: string[]
}

// model 选项
const modelOptions: { id: string; label: string; color: string; bgColor: string }[] = [
  { id: 'haiku', label: 'Haiku', color: '#34C759', bgColor: '#E8F5E9' },
  { id: 'sonnet', label: 'Sonnet', color: '#FF9500', bgColor: '#FFF3E0' },
  { id: 'opus', label: 'Opus', color: '#FF3B30', bgColor: '#FFEBEE' },
]

// 颜色选项
const colorOptions: { id: string; label: string; color: string; bgColor: string }[] = [
  { id: 'blue', label: '蓝色', color: '#007AFF', bgColor: '#E3F2FD' },
  { id: 'green', label: '绿色', color: '#34C759', bgColor: '#E8F5E9' },
  { id: 'purple', label: '紫色', color: '#5856D6', bgColor: '#EDE7F6' },
  { id: 'yellow', label: '黄色', color: '#FF9500', bgColor: '#FFF3E0' },
  { id: 'red', label: '红色', color: '#FF3B30', bgColor: '#FFEBEE' },
  { id: 'orange', label: '橙色', color: '#FF9500', bgColor: '#FFF3E0' },
]

export const AgentModal: FC<AgentModalProps> = ({
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
  const [model, setModel] = useState<string>('haiku')
  const [color, setColor] = useState<string>('blue')
  const [content, setContent] = useState('')

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
      model,
      color,
      content,
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
        setModel(initialData.model || 'haiku')
        setColor(initialData.color || 'blue')
        setContent(initialData.content || '')
      } else {
        // 创建模式：重置为默认值
        setName('')
        setDescription('')
        setModel('haiku')
        setColor('blue')
        setContent('')
      }
      setInvalidFields(new Set())
      setViewMode('edit')
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData])

  const handleSubmit = () => {
    // 验证智能体名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入智能体名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 创建模式下检查名称唯一性
    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('智能体名称已存在，请使用其他名称', 'warning')
      return
    }

    // 验证内容
    if (!content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入智能体内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 清除验证失败状态
    setInvalidFields(new Set())

    // 提交
    onConfirm({
      name: name.trim(),
      description: description.trim(),
      model: model,
      color: color,
      content: content.trim(),
    })

    // 显示成功提示
    addToast(mode === 'create' ? '智能体创建成功' : '智能体更新成功', 'success')

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
    setModel('haiku')
    setColor('blue')
    setContent('')
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
        title={mode === 'create' ? '创建新智能体' : '编辑智能体'}
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
          {/* 智能体名称 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              智能体名称 *
            </label>
            <Input
              placeholder="例如：ant-doc-agent"
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
              <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下智能体名称不可修改</p>
            )}
          </div>

          {/* 智能体描述 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} className="text-macos-text-secondary" />
              智能体描述
            </label>
            <Textarea
              placeholder="简要描述这个智能体的用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* 模型选择 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-2">
              <Cpu size={16} className="text-macos-text-secondary" />
              模型选择
            </label>
            <div className="flex items-center gap-2">
              {modelOptions.map((opt) => {
                const isSelected = model === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setModel(opt.id)}
                    className={`
                      flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all
                      ${
                        isSelected
                          ? 'border-gray-400 bg-gray-100 text-gray-800'
                          : 'border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary'
                      }
                    `}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 颜色选择 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-2">
              <Palette size={16} className="text-macos-text-secondary" />
              图标颜色
            </label>
            <div className="flex items-center gap-2">
              {colorOptions.map((opt) => {
                const isSelected = color === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setColor(opt.id)}
                    className={`
                      flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm transition-all
                      ${
                        isSelected
                          ? 'border-gray-400 bg-gray-100 text-gray-800'
                          : 'border-macos-border hover:border-gray-300 hover:bg-gray-50 text-macos-text-secondary'
                      }
                    `}
                  >
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 智能体内容 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
                <Bot size={16} className="text-macos-text-secondary" />
                角色指令内容 *
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
                placeholder="在此输入智能体的角色指令内容，支持 Markdown 格式...&#10;&#10;例如：&#10;# 角色&#10;- 你是一个充分理解人类自然语言的助手...&#10;&#10;提示：输入@可引用其他业务内容"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  if (invalidFields.has('content')) setInvalidFields(new Set())
                }}
                rows={12}
                invalid={invalidFields.has('content')}
                className="font-mono text-sm"
                excludePath={mode === 'edit' && initialData ? `.claude/agents/${initialData.name}.md` : undefined}
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