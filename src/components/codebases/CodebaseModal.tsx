import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Type, Eye, Edit3, Link2, FilePlus2, FolderOpen, Loader2, FileText } from 'lucide-react'
import { Modal, Input, Button, MarkdownEditor, MarkdownRenderer } from '../ui'
import { openFolderDialog } from '../../utils/storage'
import { useToastStore } from '../../stores/toastStore'
import type { CodebaseInfo, CodebaseSource } from '../../types'

// 添加方式：select 为三方式选择页；url/blank/local 为对应表单
type CreateMode = 'select' | 'url' | 'blank' | 'local'

interface CodebaseModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  // 创建确认：返回 false 表示失败（错误提示由调用方处理）
  onConfirm: (name: string, source: CodebaseSource, payload: { url?: string; content?: string; sourcePath?: string }) => Promise<boolean>
  // 编辑确认：仅更新 README 内容
  onUpdate: (name: string, content: string) => Promise<boolean>
  editingName?: string
  initialContent?: string
  existingNames?: string[]
  isBusy?: boolean
}

export const CodebaseModal: FC<CodebaseModalProps> = ({
  isOpen,
  onClose,
  mode,
  onConfirm,
  onUpdate,
  editingName,
  initialContent = '',
  existingNames = [],
  isBusy = false,
}) => {
  const [createMode, setCreateMode] = useState<CreateMode>('select')
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [content, setContent] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())

  // 打开弹窗时重置状态
  useEffect(() => {
    if (isOpen) {
      setCreateMode('select')
      setName(editingName || '')
      setUrl('')
      setContent(mode === 'edit' ? initialContent : '')
      setViewMode('edit')
      setInvalidFields(new Set())
    }
  }, [isOpen, mode, editingName, initialContent])

  // 选择本地目录：点击「从本地文件添加」后直接弹操作系统原生文件选择器（项目选择页同款通道），
  // 选中即以目录名直接创建；取消则停留选择页；重名预检并提示
  const { addToast } = useToastStore()
  const handleLocalAdd = async () => {
    const dirPath = await openFolderDialog()
    if (!dirPath) return
    const base = dirPath.split('/').pop() || dirPath.split('\\').pop() || ''
    if (!base.trim()) return
    if (existingNames.includes(base)) {
      addToast(`代码库已存在: ${base}`, 'error')
      return
    }
    setName(base)
    setCreateMode('local')
    const ok = await onConfirm(base, 'local', { sourcePath: dirPath })
    if (!ok) setCreateMode('select')
  }

  // 创建模式选择页（三卡片并排，样式与技能添加页一致）
  const renderModeSelect = () => (
    <div className="flex flex-col items-center justify-center py-8 px-10">
      <div className="flex gap-6">
        <button
          onClick={() => setCreateMode('url')}
          className="flex flex-col items-center gap-3 p-7 w-40 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
            <Link2 size={24} className="text-blue-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">从 URL 添加</span>
        </button>
        <button
          onClick={() => setCreateMode('blank')}
          className="flex flex-col items-center gap-3 p-7 w-40 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
            <FilePlus2 size={24} className="text-yellow-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">从空项目添加</span>
        </button>
        <button
          onClick={handleLocalAdd}
          className="flex flex-col items-center gap-3 p-7 w-40 border border-gray-200 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-all"
        >
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center">
            <FolderOpen size={24} className="text-green-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">从本地文件添加</span>
        </button>
      </div>
    </div>
  )

  // 名称输入（三种创建方式共用）
  const renderNameInput = () => (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
        <Type size={16} className="text-macos-text-secondary" />
        代码库名称 *
      </label>
      <Input
        placeholder="例如：my-project"
        value={name}
        autoFocus
        onChange={(e) => {
          setName(e.target.value)
          if (invalidFields.has('name')) setInvalidFields(new Set())
        }}
        invalid={invalidFields.has('name')}
      />
    </div>
  )

  // URL 表单
  const renderUrlForm = () => (
    <div className="space-y-5">
      {renderNameInput()}
      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
          <Link2 size={16} className="text-macos-text-secondary" />
          仓库地址 *
        </label>
        <Input
          placeholder="https://github.com/user/repo.git"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (invalidFields.has('url')) setInvalidFields(new Set())
          }}
          invalid={invalidFields.has('url')}
        />
      </div>
    </div>
  )

  // 空项目表单：名称 + README 内容（自适应填充弹窗剩余高度，md 编辑/预览切换，同任务库任务内容模式）
  const renderBlankForm = () => (
    <div className="flex flex-col gap-4 flex-1 min-h-0 pr-2">
      {renderNameInput()}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between mb-1.5">
          <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
            <FileText size={16} className="text-macos-text-secondary" />
            README 内容
          </label>
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
        {viewMode === 'edit' ? (
          <div className="flex-1 min-h-0">
            <MarkdownEditor
              placeholder="在此输入项目 README 内容，支持 Markdown 格式..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              fill
            />
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
            {content.trim() ? (
              <MarkdownRenderer content={content} className="text-sm" />
            ) : (
              <p className="text-sm text-macos-text-tertiary text-center py-8">暂无内容，将生成仅含标题的默认 README</p>
            )}
          </div>
        )}
      </div>
    </div>
  )

  // 编辑模式：README 内容编辑/预览双模式（自适应填充，同空项目创建模式）
  const renderEditContent = () => (
    <div className="flex-1 min-h-0 flex flex-col pr-2">
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
          <FileText size={16} className="text-macos-text-secondary" />
          README 内容
        </label>
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

      {viewMode === 'edit' ? (
        <div className="flex-1 min-h-0">
          <MarkdownEditor
            placeholder="在此输入 README 内容，支持 Markdown 格式..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="font-mono text-sm"
            fill
          />
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto">
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
  )

  // 复制中过渡视图：目录选中后的大目录复制耗时反馈（转圈 loading）
  const renderLocalCopying = () => (
    <div className="flex flex-col items-center justify-center py-16 px-10">
      <Loader2 size={32} className="animate-spin text-macos-text-tertiary" />
    </div>
  )

  const renderContent = () => {
    if (mode === 'edit') return renderEditContent()
    switch (createMode) {
      case 'url': return renderUrlForm()
      case 'blank': return renderBlankForm()
      case 'local': return renderLocalCopying()
      default: return renderModeSelect()
    }
  }

  // 校验并提交
  const handleSubmit = async () => {
    if (mode === 'edit') {
      if (!editingName) return
      await onUpdate(editingName, content)
      return
    }

    if (createMode === 'select') return

    const fields = new Set<string>()
    if (!name.trim() || /[\s\\/:*?"<>|]/.test(name) || name.startsWith('.')) fields.add('name')
    if (createMode === 'url' && !url.trim()) fields.add('url')
    if (existingNames.includes(name.trim())) {
      setInvalidFields(new Set(['name']))
      addToast(`代码库已存在: ${name.trim()}`, 'error')
      return
    }
    if (fields.size > 0) {
      setInvalidFields(fields)
      return
    }

    const source: CodebaseSource = createMode
    await onConfirm(name.trim(), source, {
      url: createMode === 'url' ? url.trim() : undefined,
      content: createMode === 'blank' ? (content.trim() || undefined) : undefined,
    })
  }

  return (
    <Modal
      layoutKey="codebase"
      persistLayout={mode === 'edit' || (createMode !== 'select' && createMode !== 'local')}
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'create' ? '' : `编辑代码库 · ${editingName || ''}`}
      size={mode === 'create' && (createMode === 'select' || createMode === 'local') ? 'sm' : 'xl'}
      footer={
        <div className="flex justify-end gap-3">
          {mode === 'create' && createMode !== 'select' && createMode !== 'local' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCreateMode('select')}
              disabled={isBusy}
            >
              返回选择
            </Button>
          )}
          {mode === 'edit' && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
          )}
          {(mode === 'edit' || (createMode !== 'select' && createMode !== 'local')) && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmit}
              disabled={isBusy}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              {isBusy ? (
                <>
                  <Loader2 size={14} className="animate-spin mr-1.5" />
                  处理中...
                </>
              ) : (
                mode === 'edit' ? '保存' : '添加'
              )}
            </Button>
          )}
        </div>
      }
    >
      {renderContent()}
    </Modal>
  )
}
