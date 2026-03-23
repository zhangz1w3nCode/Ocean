import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, Wand2, Eye, Edit3, MessageSquare, FileCode, FileText, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import { Modal, Input, Textarea, Button, ConfirmModal, MarkdownEditor, MarkdownRenderer } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useSkillStore } from '../../stores/skillStore'
import type { SkillFile, SkillResource } from '../../types'

interface SkillModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (skill: Omit<SkillFile, 'id' | 'createdAt' | 'updatedAt' | 'type' | 'scripts' | 'references' | 'examples'>) => void
  mode: 'create' | 'edit'
  initialData?: SkillFile
  existingNames?: string[]
}

type TabType = 'content' | 'scripts' | 'references' | 'examples'

const tabConfig = {
  content: {
    label: '技能内容',
    icon: Wand2,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
  },
  scripts: {
    label: '脚本',
    icon: FileCode,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
  },
  references: {
    label: '参考文档',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  examples: {
    label: '示例',
    icon: FolderOpen,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
}

export const SkillModal: FC<SkillModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  mode,
  initialData,
  existingNames = [],
}) => {
  const { addToast } = useToastStore()
  const { loadResources, saveResource, deleteResource } = useSkillStore()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')

  // 计算排除路径（编辑模式下排除当前技能）
  const excludePath = mode === 'edit' && initialData ? `.claude/skills/${initialData.name}/SKILL.md` : undefined

  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')

  // 标签页状态
  const [activeTab, setActiveTab] = useState<TabType>('content')

  // 资源文件状态
  const [resources, setResources] = useState<Record<TabType, SkillResource[]>>({
    scripts: [],
    references: [],
    examples: [],
    content: [],
  })

  // 资源编辑状态
  const [isEditingResource, setIsEditingResource] = useState(false)
  const [editingFileName, setEditingFileName] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')

  // 确认弹窗状态
  const [showConfirm, setShowConfirm] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null)

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
      resources,
    })
  }

  // 检测是否有修改
  const hasChanges = () => {
    return getSnapshot() !== initialSnapshot.current
  }

  // 加载资源文件
  const loadAllResources = async (skillName: string) => {
    const [scripts, references, examples] = await Promise.all([
      loadResources(skillName, 'scripts'),
      loadResources(skillName, 'references'),
      loadResources(skillName, 'examples'),
    ])
    setResources({
      content: [],
      scripts,
      references,
      examples,
    })
  }

  // 当弹窗打开或 initialData 变化时，重置表单
  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && initialData) {
        setName(initialData.name)
        setDescription(initialData.description || '')
        setContent(initialData.content || '')
        // 加载资源文件
        loadAllResources(initialData.name)
      } else {
        // 创建模式：重置为默认值
        setName('')
        setDescription('')
        setContent('')
        setResources({
          content: [],
          scripts: [],
          references: [],
          examples: [],
        })
      }
      setInvalidFields(new Set())
      setViewMode('edit')
      setActiveTab('content')
      resetResourceEditState()
      // 延迟设置快照，确保状态已更新
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
  }, [isOpen, mode, initialData])

  const handleSubmit = () => {
    // 验证技能名称
    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入技能名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 验证名称格式（只允许字母、数字、中划线、下划线）
    const nameRegex = /^[a-zA-Z0-9_-]+$/
    if (!nameRegex.test(name.trim())) {
      setInvalidFields(new Set(['name']))
      addToast('技能名称只能包含字母、数字、中划线和下划线', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    // 创建模式下检查名称唯一性
    if (mode === 'create' && existingNames.includes(name.trim())) {
      addToast('技能名称已存在，请使用其他名称', 'warning')
      return
    }

    // 验证内容
    if (!content.trim()) {
      setActiveTab('content')
      setInvalidFields(new Set(['content']))
      addToast('请输入技能内容', 'warning')
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
    })

    // 显示成功提示
    addToast(mode === 'create' ? '技能创建成功' : '技能更新成功', 'success')

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
    setInvalidFields(new Set())
    setActiveTab('content')
    resetResourceEditState()
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

  // 重置资源编辑状态
  const resetResourceEditState = () => {
    setIsEditingResource(false)
    setEditingFileName(null)
    setFileName('')
    setFileContent('')
  }

  // 创建模式下不能编辑资源
  const canEditResources = mode === 'edit' && initialData

  // 新建资源文件
  const handleCreateResource = () => {
    resetResourceEditState()
    setIsEditingResource(true)
  }

  // 编辑资源文件
  const handleEditResource = (resource: SkillResource) => {
    setEditingFileName(resource.name)
    setFileName(resource.name)
    setFileContent(resource.content || '')
    setIsEditingResource(true)
  }

  // 保存资源文件
  const handleSaveResource = async () => {
    if (!initialData) return

    if (!fileName.trim()) {
      addToast('请输入文件名', 'warning')
      return
    }

    if (!fileContent.trim()) {
      addToast('请输入文件内容', 'warning')
      return
    }

    const success = await saveResource(
      initialData.name,
      activeTab as 'scripts' | 'references' | 'examples',
      fileName.trim(),
      fileContent.trim()
    )

    if (success) {
      addToast(editingFileName ? '文件更新成功' : '文件创建成功', 'success')
      // 重新加载资源列表
      await loadAllResources(initialData.name)
      resetResourceEditState()
    } else {
      addToast('保存失败', 'error')
    }
  }

  // 点击删除资源
  const handleDeleteResourceClick = (name: string) => {
    setDeletingFileName(name)
    setDeleteConfirmOpen(true)
  }

  // 确认删除资源
  const handleConfirmDeleteResource = async () => {
    if (!initialData || !deletingFileName) return

    const success = await deleteResource(
      initialData.name,
      activeTab as 'scripts' | 'references' | 'examples',
      deletingFileName
    )

    if (success) {
      addToast('文件删除成功', 'success')
      // 重新加载资源列表
      await loadAllResources(initialData.name)
    } else {
      addToast('删除失败', 'error')
    }
    setDeleteConfirmOpen(false)
    setDeletingFileName(null)
  }

  // 获取文件扩展名提示
  const getFilePlaceholder = () => {
    switch (activeTab) {
      case 'scripts':
        return 'main.py'
      case 'references':
      case 'examples':
        return 'document.md'
      default:
        return 'filename'
    }
  }

  // 获取内容提示
  const getContentPlaceholder = () => {
    switch (activeTab) {
      case 'scripts':
        return '# 在此输入脚本内容...'
      case 'references':
        return '# 在此输入参考文档内容...'
      case 'examples':
        return '# 在此输入示例文档内容...'
      default:
        return ''
    }
  }

  // 获取当前 tab 的资源列表
  const currentResources = resources[activeTab] || []
  const currentTabConfig = tabConfig[activeTab]

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={mode === 'create' ? '创建新技能' : '编辑技能'}
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
        <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-2">
          {/* 技能名称（创建模式）或头部信息（编辑模式） */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              技能名称 *
            </label>
            <Input
              placeholder="例如：code-analyzer"
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
              <p className="mt-1 text-xs text-macos-text-tertiary">编辑模式下技能名称不可修改</p>
            )}
            {mode === 'create' && (
              <p className="mt-1 text-xs text-macos-text-tertiary">只能包含字母、数字、中划线和下划线</p>
            )}
          </div>

          {/* 技能描述 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} className="text-macos-text-secondary" />
              技能描述
            </label>
            <Textarea
              placeholder="简要描述这个技能的用途..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
            />
          </div>

          {/* 标签页切换 - 仅编辑模式显示 */}
          {mode === 'edit' && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1.5">
              {(Object.keys(tabConfig) as TabType[]).map((tab) => {
                const config = tabConfig[tab]
                const Icon = config.icon
                const isActive = activeTab === tab
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab)
                      resetResourceEditState()
                    }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
                      isActive
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                    }`}
                  >
                    <Icon size={16} className={isActive && 'color' in config ? config.color : ''} />
                    {config.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* 内容区域 */}
          {activeTab === 'content' ? (
            /* 技能内容编辑 */
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
                  <Wand2 size={16} className="text-violet-500" />
                  技能内容 *
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
                  placeholder="在此输入技能内容，支持 Markdown 格式...&#10;&#10;例如：&#10;# 技能说明&#10;这是一个代码分析技能...&#10;&#10;提示：输入@和%可引用其他业务内容 "
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value)
                    if (invalidFields.has('content')) setInvalidFields(new Set())
                  }}
                  rows={8}
                  invalid={invalidFields.has('content')}
                  className="font-mono text-sm"
                  excludePath={excludePath}
                />
              )}

              {/* 预览模式 */}
              {viewMode === 'preview' && (
                <div
                  className={`bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[50vh] overflow-y-auto ${
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
          ) : (
            /* 资源文件管理 */
            <div className="space-y-3">
              {/* 目录说明 */}
              <div className={`${currentTabConfig.bgColor} rounded-lg p-3`}>
                <div className="flex items-center gap-2">
                  <currentTabConfig.icon size={16} className={currentTabConfig.color} />
                  <span className={`text-sm font-medium ${currentTabConfig.color}`}>
                    {activeTab}/
                  </span>
                </div>
              </div>

              {/* 编辑区域 */}
              {isEditingResource ? (
                <div className="space-y-3 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-700">
                      {editingFileName ? '编辑文件' : '新建文件'}
                    </h4>
                    <button
                      onClick={resetResourceEditState}
                      className="p-1 hover:bg-gray-100 rounded"
                    >
                      <X size={16} className="text-gray-400" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">文件名</label>
                    <Input
                      placeholder={getFilePlaceholder()}
                      value={fileName}
                      onChange={(e) => setFileName(e.target.value)}
                      disabled={!!editingFileName}
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">文件内容</label>
                    <Textarea
                      placeholder={getContentPlaceholder()}
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      rows={8}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={resetResourceEditState}>
                      取消
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleSaveResource}>
                      保存
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 文件列表 */}
                  <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                    {currentResources.length > 0 ? (
                      currentResources.map((resource) => (
                        <div
                          key={resource.name}
                          className="flex items-center justify-between p-3 hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-2">
                            <currentTabConfig.icon size={16} className={currentTabConfig.color} />
                            <span className="text-sm text-gray-700">{resource.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleEditResource(resource)}
                              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                            >
                              <Edit3 size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteResourceClick(resource.name)}
                              className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center">
                        <p className="text-sm text-gray-400 mb-2">暂无文件</p>
                        <p className="text-xs text-gray-300">点击下方按钮添加文件</p>
                      </div>
                    )}
                  </div>

                  {/* 新建按钮 */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateResource}
                    className="w-full border-dashed"
                  >
                    <Plus size={16} />
                    添加文件
                  </Button>
                </>
              )}
            </div>
          )}

          {/* 创建模式提示 */}
          {mode === 'create' && (
            <div className="text-xs text-macos-text-tertiary bg-violet-50 rounded-lg p-3">
              <p className="font-medium text-violet-700 mb-1">创建提示</p>
              <p>先创建技能，保存后可以在编辑界面管理 scripts、references、examples 等资源文件。</p>
            </div>
          )}
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

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message={`确定要删除文件 "${deletingFileName}" 吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDeleteResource}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingFileName(null)
        }}
      />
    </>
  )
}
