import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Code, FileText, Loader2 } from 'lucide-react'
import { Modal, Button, MarkdownRenderer } from '../ui'
import type { CodebaseInfo } from '../../types'
import { useCodebaseStore } from '../../stores/codebaseStore'

interface CodebaseDetailModalProps {
  isOpen: boolean
  onClose: () => void
  onEdit: () => void
  codebase: CodebaseInfo | null
}

export const CodebaseDetailModal: FC<CodebaseDetailModalProps> = ({
  isOpen,
  onClose,
  onEdit,
  codebase,
}) => {
  const { readCodebase } = useCodebaseStore()
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && codebase) {
      setLoading(true)
      setContent('')
      const load = async () => {
        const result = await readCodebase(codebase.name)
        setContent(result?.content || '')
        setLoading(false)
      }
      load()
    }
  }, [isOpen, codebase, readCodebase])

  if (!codebase) return null

  return (
    <Modal
      layoutKey="codebase"
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
      {/* 头部信息：项目名称 */}
      <div className="flex items-center gap-4 pb-4 mb-4 border-b border-gray-100">
        <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
          <Code size={28} className="text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-semibold text-macos-text mb-1">{codebase.name}</h2>
          <span className="text-sm text-macos-text-tertiary">.codebases/{codebase.name}/README.md</span>
        </div>
      </div>

      {/* README 内容 */}
      <div className="flex-1 min-h-0 flex flex-col">
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <FileText size={16} />
          README
        </label>
        <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-macos-text-tertiary">
              <Loader2 size={18} className="animate-spin mr-2" />
              正在加载 README...
            </div>
          ) : content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <p className="text-sm text-macos-text-tertiary text-center py-8">
              暂无 README 内容
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
