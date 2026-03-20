import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Plus, Trash2, X, FileCode, FileText, FolderOpen, Edit3 } from 'lucide-react'
import { Modal, Button, Textarea, Input, ConfirmModal } from '../ui'
import { useSkillStore } from '../../stores/skillStore'
import { useToastStore } from '../../stores/toastStore'
import type { SkillFile, SkillResource } from '../../types'

interface SkillResourceManagerProps {
  isOpen: boolean
  onClose: () => void
  skill: SkillFile | null
  resourceType: 'scripts' | 'references' | 'examples'
  onUpdate: () => void
}

const resourceTypeConfig = {
  scripts: {
    label: '脚本文件',
    icon: FileCode,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    description: '存放 Python、JavaScript 等脚本文件',
  },
  references: {
    label: '参考文档',
    icon: FileText,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    description: '存放技术文档、API 说明等',
  },
  examples: {
    label: '示例文档',
    icon: FolderOpen,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    description: '存放使用示例、案例说明等',
  },
}

export const SkillResourceManager: FC<SkillResourceManagerProps> = ({
  isOpen,
  onClose,
  skill,
  resourceType,
  onUpdate,
}) => {
  const { loadResources, saveResource, deleteResource } = useSkillStore()
  const { addToast } = useToastStore()

  const [resources, setResources] = useState<SkillResource[]>([])
  const [isLoading, setIsLoading] = useState(false)

  // 新建/编辑状态
  const [isEditing, setIsEditing] = useState(false)
  const [editingFileName, setEditingFileName] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')

  // 删除确认
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingFileName, setDeletingFileName] = useState<string | null>(null)

  const config = resourceTypeConfig[resourceType]
  const IconComponent = config.icon

  // 加载资源文件列表
  useEffect(() => {
    if (isOpen && skill) {
      setIsLoading(true)
      loadResources(skill.name, resourceType).then((loadedResources) => {
        setResources(loadedResources)
        setIsLoading(false)
      })
    }
  }, [isOpen, skill, resourceType, loadResources])

  // 重置编辑状态
  const resetEditState = () => {
    setIsEditing(false)
    setEditingFileName(null)
    setFileName('')
    setFileContent('')
  }

  // 关闭弹窗
  const handleClose = () => {
    resetEditState()
    onClose()
  }

  // 打开新建
  const handleCreate = () => {
    resetEditState()
    setIsEditing(true)
  }

  // 打开编辑
  const handleEdit = (resource: SkillResource) => {
    setEditingFileName(resource.name)
    setFileName(resource.name)
    setFileContent(resource.content || '')
    setIsEditing(true)
  }

  // 保存文件
  const handleSave = async () => {
    if (!skill) return

    if (!fileName.trim()) {
      addToast('请输入文件名', 'warning')
      return
    }

    if (!fileContent.trim()) {
      addToast('请输入文件内容', 'warning')
      return
    }

    const success = await saveResource(skill.name, resourceType, fileName.trim(), fileContent.trim())
    if (success) {
      addToast(editingFileName ? '文件更新成功' : '文件创建成功', 'success')
      // 重新加载资源列表
      const loadedResources = await loadResources(skill.name, resourceType)
      setResources(loadedResources)
      resetEditState()
      onUpdate()
    } else {
      addToast('保存失败', 'error')
    }
  }

  // 点击删除
  const handleDeleteClick = (name: string) => {
    setDeletingFileName(name)
    setDeleteConfirmOpen(true)
  }

  // 确认删除
  const handleConfirmDelete = async () => {
    if (!skill || !deletingFileName) return

    const success = await deleteResource(skill.name, resourceType, deletingFileName)
    if (success) {
      addToast('文件删除成功', 'success')
      // 重新加载资源列表
      const loadedResources = await loadResources(skill.name, resourceType)
      setResources(loadedResources)
      onUpdate()
    } else {
      addToast('删除失败', 'error')
    }
    setDeleteConfirmOpen(false)
    setDeletingFileName(null)
  }

  if (!skill) return null

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title={`管理 ${config.label}`}
        size="xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={handleClose}>
              关闭
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 目录说明 */}
          <div className={`${config.bgColor} rounded-lg p-3`}>
            <div className="flex items-center gap-2 mb-1">
              <IconComponent size={16} className={config.color} />
              <span className={`text-sm font-medium ${config.color}`}>
                {resourceType}/
              </span>
            </div>
            <p className="text-xs text-gray-500">{config.description}</p>
          </div>

          {/* 编辑区域 */}
          {isEditing ? (
            <div className="space-y-3 border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-700">
                  {editingFileName ? '编辑文件' : '新建文件'}
                </h4>
                <button
                  onClick={resetEditState}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X size={16} className="text-gray-400" />
                </button>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">文件名</label>
                <Input
                  placeholder={resourceType === 'scripts' ? 'main.py' : 'api-docs.md'}
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  disabled={!!editingFileName}
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">文件内容</label>
                <Textarea
                  placeholder={resourceType === 'scripts' ? '# 脚本内容...' : '# 文档内容...'}
                  value={fileContent}
                  onChange={(e) => setFileContent(e.target.value)}
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={resetEditState}>
                  取消
                </Button>
                <Button variant="outline" size="sm" onClick={handleSave}>
                  保存
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* 文件列表 */}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
                {isLoading ? (
                  <div className="p-4 text-center text-sm text-gray-400">加载中...</div>
                ) : resources.length > 0 ? (
                  resources.map((resource) => (
                    <div
                      key={resource.name}
                      className="flex items-center justify-between p-3 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <IconComponent size={16} className={config.color} />
                        <span className="text-sm text-gray-700">{resource.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEdit(resource)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDeleteClick(resource.name)}
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
                onClick={handleCreate}
                className="w-full border-dashed"
              >
                <Plus size={16} />
                添加文件
              </Button>
            </>
          )}
        </div>
      </Modal>

      {/* 删除确认弹窗 */}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="确认删除"
        message={`确定要删除文件 "${deletingFileName}" 吗？此操作不可恢复。`}
        confirmText="删除"
        cancelText="取消"
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false)
          setDeletingFileName(null)
        }}
      />
    </>
  )
}