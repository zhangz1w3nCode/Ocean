import type { FC } from 'react'
import { useState, useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Wand2, MessageSquare, FileText, FileCode, FolderOpen } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import { useSkillStore } from '../../stores/skillStore'
import { SkillResourceDetailModal } from './SkillResourceDetailModal'
import { SkillResourceEditModal } from './SkillResourceEditModal'
import type { SkillFile, SkillResource } from '../../types'

type TabType = 'content' | 'scripts' | 'references' | 'examples'

const tabConfig: Record<TabType, { label: string; icon: LucideIcon; color: string; bgColor: string }> = {
  content: { label: '技能内容', icon: Wand2, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  scripts: { label: '脚本', icon: FileCode, color: 'text-violet-600', bgColor: 'bg-violet-50' },
  references: { label: '参考文档', icon: FileText, color: 'text-blue-600', bgColor: 'bg-blue-50' },
  examples: { label: '示例', icon: FolderOpen, color: 'text-green-600', bgColor: 'bg-green-50' },
}

interface SkillDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  skill: SkillFile | null
}

const colorConfig = {
  color: '#7C3AED',
  bgColor: '#EDE9FE',
}

export const SkillDetailModal: FC<SkillDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  skill,
}) => {
  const { loadResources, saveResource } = useSkillStore()
  const [activeTab, setActiveTab] = useState<TabType>('content')
  const [resources, setResources] = useState<Record<TabType, SkillResource[]>>({
    content: [],
    scripts: [],
    references: [],
    examples: [],
  })
  const [isResourceDetailOpen, setIsResourceDetailOpen] = useState(false)
  const [viewingResource, setViewingResource] = useState<SkillResource | null>(null)
  const [isResourceEditOpen, setIsResourceEditOpen] = useState(false)
  const [editingResource, setEditingResource] = useState<SkillResource | null>(null)

  useEffect(() => {
    if (isOpen && skill) {
      setActiveTab('content')
      setIsResourceDetailOpen(false)
      setViewingResource(null)
      setIsResourceEditOpen(false)
      setEditingResource(null)
      const loadAll = async () => {
        const [scripts, references, examples] = await Promise.all([
          loadResources(skill.name, 'scripts'),
          loadResources(skill.name, 'references'),
          loadResources(skill.name, 'examples'),
        ])
        setResources({ content: [], scripts, references, examples })
      }
      loadAll()
    }
  }, [isOpen, skill, loadResources])

  if (!skill) return null

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const currentResources = resources[activeTab] || []
  const currentTabConfig = tabConfig[activeTab]

  const handleSaveResourceCallback = async (fileName: string, fileContent: string) => {
    if (!skill) return false
    const success = await saveResource(
      skill.name,
      activeTab as 'scripts' | 'references' | 'examples',
      fileName,
      fileContent
    )
    if (success) {
      const [scripts, references, examples] = await Promise.all([
        loadResources(skill.name, 'scripts'),
        loadResources(skill.name, 'references'),
        loadResources(skill.name, 'examples'),
      ])
      setResources({ content: [], scripts, references, examples })
    }
    return success
  }

  return (
    <>
      <Modal
        layoutKey="skill"
        isOpen={isOpen}
        onClose={onClose}
        title=""
        size="xl"
        footer={
          <div className="flex justify-between">
            <Button variant="ghost" size="sm" onClick={onClose}>
              关闭
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              编辑
            </Button>
          </div>
        }
      >
        {/* 头部信息 */}
        <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
          <div
            className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: colorConfig.bgColor }}
          >
            <Wand2 size={28} style={{ color: colorConfig.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-macos-text mb-1">{skill.name}</h2>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
                style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}
              >
                skill
              </span>
              <span className="text-sm text-macos-text-tertiary">
                更新于 {formatDate(skill.updatedAt)}
              </span>
            </div>
          </div>
        </div>

        {/* 技能描述 */}
        {skill.description && (
          <div className="mb-4">
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} />
              技能描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{skill.description}</p>
            </div>
          </div>
        )}

        {/* Tab 分栏 */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1.5 mb-4">
          {(Object.keys(tabConfig) as TabType[]).map((tab) => {
            const config = tabConfig[tab]
            const Icon = config.icon
            const isActive = activeTab === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
                  isActive
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                <Icon size={16} className={isActive ? config.color : ''} />
                {config.label}
              </button>
            )
          })}
        </div>

        {/* 内容区域 */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden pr-2">
          {activeTab === 'content' ? (
            <div className="flex-1 min-h-0 flex flex-col space-y-4">
              {/* 技能内容 */}
              <div className="flex-1 min-h-0 flex flex-col">
                <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
                  <FileText size={16} />
                  技能内容
                </label>
                <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
                  {skill.content ? (
                    <MarkdownRenderer content={skill.content} />
                  ) : (
                    <p className="text-sm text-macos-text-tertiary text-center py-4">
                      暂无技能内容
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
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

              {/* 文件列表 */}
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
                {currentResources.length > 0 ? (
                  currentResources.map((resource) => (
                    <div
                      key={resource.name}
                      className="flex items-center justify-between p-3 hover:bg-gray-50"
                    >
                      <button
                        onClick={() => {
                          setViewingResource(resource)
                          setIsResourceDetailOpen(true)
                        }}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer"
                      >
                        <currentTabConfig.icon size={16} className={currentTabConfig.color} />
                        <span className="text-sm text-gray-700 hover:text-gray-900">{resource.name}</span>
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm text-gray-400 mb-2">暂无文件</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* 资源详情弹窗 */}
      <SkillResourceDetailModal
        isOpen={isResourceDetailOpen}
        onClose={() => {
          setIsResourceDetailOpen(false)
          setViewingResource(null)
        }}
        onEdit={() => {
          setIsResourceDetailOpen(false)
          setEditingResource(viewingResource)
          setViewingResource(null)
          setIsResourceEditOpen(true)
        }}
        resource={viewingResource}
        tabLabel={currentTabConfig.label}
        TabIcon={currentTabConfig.icon}
        tabColor={currentTabConfig.color}
      />

      {/* 资源编辑弹窗 */}
      <SkillResourceEditModal
        isOpen={isResourceEditOpen}
        onClose={() => {
          setIsResourceEditOpen(false)
          setEditingResource(null)
        }}
        onConfirm={handleSaveResourceCallback}
        mode="edit"
        initialData={editingResource}
        filePlaceholder={currentTabConfig.label.toLowerCase()}
        contentPlaceholder="# 在此输入文件内容..."
      />
    </>
  )
}