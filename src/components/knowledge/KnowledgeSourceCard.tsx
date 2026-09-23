import type { FC } from 'react'
import { FileText, File } from 'lucide-react'
import { Card } from '../ui/Card'
import { formatRelativeTime, formatFileSize, fileExtensionOf } from '../../utils/format'
import type { KnowledgeRawFile } from '../../utils/storage'

interface KnowledgeSourceCardProps {
  file: KnowledgeRawFile
  onClick?: () => void
}

export const KnowledgeSourceCard: FC<KnowledgeSourceCardProps> = ({ file, onClick }) => {
  const ext = fileExtensionOf(file.name)
  const Icon = ext === 'MD' ? FileText : File

  return (
    <Card className="relative p-0 h-full flex flex-col" onClick={onClick}>
      {/* 头部区域 */}
      <div className="px-4 pb-0 pt-4">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 flex-shrink-0">
              <Icon size={18} className="text-gray-600" strokeWidth={1.5} />
            </div>
            <h3 className="font-bold text-[17px] text-gray-900 break-all line-clamp-2">
              {file.name}
            </h3>
          </div>
          <span className="inline-flex items-center px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-xs flex-shrink-0">
            {ext || '未知'}
          </span>
        </div>

        {/* 元信息区域 */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">
            {formatFileSize(file.size)}
          </span>
          <span className="text-xs text-gray-400">{formatRelativeTime(file.mtime)}</span>
        </div>
      </div>

      {/* 内容预览区 - 浅灰色背景 */}
      <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
          {file.head?.trim() || '暂无内容'}
        </p>
      </div>
    </Card>
  )
}
