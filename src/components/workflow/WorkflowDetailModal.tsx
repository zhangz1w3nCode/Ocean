import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { GitBranch, MessageSquare, FileText, Loader2 } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { Workflow } from '../../types'

interface WorkflowDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  workflow: Workflow | null
}

// 工作流统一使用深灰色，与主题保持一致
const colorConfig = {
  color: '#374151',
  bgColor: '#E5E7EB',
}

/**
 * 去掉 Markdown 内容中的 frontmatter
 */
const stripFrontmatter = (content: string): string => {
  // 匹配 frontmatter（--- 包裹的部分）
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n*/
  return content.replace(frontmatterRegex, '')
}

/**
 * 从本地文件加载 WORKFLOW.md 内容
 */
const loadWorkflowMdFromFile = async (name: string): Promise<string | null> => {
  // 检查是否在 Electron 环境
  if (window.electronAPI?.loadWorkflowMd) {
    try {
      const result = await window.electronAPI.loadWorkflowMd(name)
      if (result.success && result.content) {
        return result.content
      }
      console.error('加载 WORKFLOW.md 失败:', result.error)
      return null
    } catch (error) {
      console.error('加载 WORKFLOW.md 出错:', error)
      return null
    }
  }

  // 浏览器环境：从 localStorage 加载
  try {
    const content = localStorage.getItem(`workflow-folder-${name}-workflow-md`)
    return content
  } catch (error) {
    console.error('从 localStorage 加载 WORKFLOW.md 失败:', error)
    return null
  }
}

export const WorkflowDetailModal: FC<WorkflowDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  workflow,
}) => {
  const [workflowContent, setWorkflowContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 实时加载 WORKFLOW.md 文件内容
  useEffect(() => {
    if (!isOpen || !workflow) {
      setWorkflowContent('')
      setLoadError(null)
      return
    }

    const loadContent = async () => {
      setIsLoading(true)
      setLoadError(null)

      try {
        const rawContent = await loadWorkflowMdFromFile(workflow.name)
        if (rawContent) {
          const content = stripFrontmatter(rawContent)
          setWorkflowContent(content)
        } else {
          setLoadError('无法加载工作流内容，文件可能不存在')
          setWorkflowContent('')
        }
      } catch (error) {
        console.error('加载工作流内容失败:', error)
        setLoadError('加载工作流内容失败')
        setWorkflowContent('')
      } finally {
        setIsLoading(false)
      }
    }

    loadContent()
  }, [isOpen, workflow?.name])

  if (!workflow) return null

  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Modal
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
      {/* 头部信息 - 固定在顶部 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        {/* 工作流图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorConfig.bgColor }}
        >
          <GitBranch size={28} style={{ color: colorConfig.color }} />
        </div>

        {/* 工作流信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{workflow.name}</h2>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}
            >
              workflow
            </span>
            <span className="text-sm text-macos-text-tertiary">
              更新于 {formatDate(workflow.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2 space-y-4">
        {/* 工作流描述 */}
        {workflow.description && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <MessageSquare size={16} />
              描述
            </label>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm text-macos-text-secondary">{workflow.description}</p>
            </div>
          </div>
        )}

        {/* 工作流内容 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
            <FileText size={16} />
            工作流内容
          </label>
          <div className="bg-gray-50 rounded-lg p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-gray-400 mr-2" />
                <span className="text-sm text-macos-text-tertiary">正在加载...</span>
              </div>
            ) : loadError ? (
              <p className="text-sm text-red-500 text-center py-4">
                {loadError}
              </p>
            ) : workflowContent ? (
              <MarkdownRenderer content={workflowContent} />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-4">
                暂无工作流内容
              </p>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}