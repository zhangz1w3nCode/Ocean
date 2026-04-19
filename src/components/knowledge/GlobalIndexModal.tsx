import { useState } from 'react'
import type { FC } from 'react'
import { FileSearch, Save, RefreshCw } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'

interface GlobalIndexModalProps {
  isOpen: boolean
  onClose: () => void
  content: string | null
  exists: boolean
  generatedContent: string | null
  onSave: () => void
  onRefresh: () => Promise<string | null>
}

// 全局索引使用浅灰色主题，区别于普通知识的蓝色
const colorConfig = {
  color: '#6B7280',     // 灰色图标
  bgColor: '#F3F4F6',   // 浅灰色背景
}

export const GlobalIndexModal: FC<GlobalIndexModalProps> = ({
  isOpen,
  onClose,
  content,
  exists,
  generatedContent,
  onSave,
  onRefresh,
}) => {
  // 刷新后的内容状态：null 表示未刷新，使用默认逻辑
  const [refreshedContent, setRefreshedContent] = useState<string | null>(null)
  // 刷新中的加载状态
  const [isRefreshing, setIsRefreshing] = useState(false)

  // 决定显示的内容：刷新后优先显示刷新内容，否则本地优先
  const displayContent = refreshedContent !== null
    ? refreshedContent
    : (exists ? content : generatedContent)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      const newContent = await onRefresh()
      if (newContent !== undefined) {
        setRefreshedContent(newContent)
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  // 弹窗关闭时重置刷新状态
  const handleClose = () => {
    setRefreshedContent(null)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title=""
      size="xl"
      footer={
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={handleClose}>
            关闭
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw size={14} className={`mr-1.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? '刷新中...' : '刷新'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onSave}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              <Save size={14} className="mr-1.5" />
              保存
            </Button>
          </div>
        </div>
      }
    >
      {/* 头部信息 - 固定在顶部 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        {/* 全局索引图标 */}
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: colorConfig.bgColor }}
        >
          <FileSearch size={28} style={{ color: colorConfig.color }} />
        </div>

        {/* 全局索引信息 */}
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">全局索引</h2>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center px-2.5 py-1 rounded-lg text-sm font-medium"
              style={{ backgroundColor: colorConfig.bgColor, color: colorConfig.color }}
            >
              INDEX.md
            </span>
            <span className="text-sm text-macos-text-tertiary">
              知识库全局索引
            </span>
          </div>
        </div>
      </div>

      {/* 内容区域 - 固定高度，超出滚动 */}
      <div className="max-h-[400px] overflow-y-auto pr-2">
        {displayContent ? (
          <div>
            <div className="bg-gray-50 rounded-lg p-4">
              <MarkdownRenderer content={displayContent} />
            </div>
                      </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <FileSearch size={32} className="text-gray-400" />
            </div>
            <p className="text-sm text-macos-text-tertiary">
              当前知识库中没有文档
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}