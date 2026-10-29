import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Type, FileText, User, GitBranch, Tags, CircleDot, Edit3, Eye, Link2 } from 'lucide-react'
import { Modal, Input, Button, ConfirmModal, Dropdown, MarkdownEditor, MarkdownRenderer } from '../ui'
import { TagChipsInput } from './TagChipsInput'
import { useToastStore } from '../../stores/toastStore'
import { useCodebaseStore } from '../../stores/codebaseStore'
import type { TaskSummary, TaskStatus, CreateTaskPayload, UpdateTaskPayload } from '../../types'

interface TaskFormModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'create' | 'edit'
  /** 编辑模式下的当前任务（提供名称/内容/处理人/仓库/标签/状态初值） */
  task?: TaskSummary & { content?: string } | null
  /** 创建模式的名称唯一性校验（已有任务名列表） */
  existingNames?: string[]
  /** 可关联的已有任务名列表（编辑模式自动排除自身） */
  taskOptions?: string[]
  onConfirm: (payload: CreateTaskPayload | UpdateTaskPayload) => Promise<boolean>
}

const STATUS_BADGE_CLASSES: Record<string, string> = {
  '等待处理': 'bg-gray-100 text-gray-500',
  '处理中': 'bg-blue-50 text-blue-600',
  '已完成': 'bg-green-50 text-green-600',
  '已取消': 'bg-red-50 text-red-600',
}

export const TaskFormModal: FC<TaskFormModalProps> = ({
  isOpen,
  onClose,
  mode,
  task = null,
  existingNames = [],
  taskOptions = [],
  onConfirm,
}) => {
  const { addToast } = useToastStore()
  // 「关联仓库」可选项：当前项目 .codebases/ 下的代码库名称，打开表单时拉取
  const codebases = useCodebaseStore(s => s.codebases)
  useEffect(() => {
    if (isOpen) void useCodebaseStore.getState().loadCodebases()
  }, [isOpen])
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [handler, setHandler] = useState('')
  const [repoList, setRepoList] = useState<string[]>([])
  const [tagsList, setTagsList] = useState<string[]>([])
  const [relatedTaskList, setRelatedTaskList] = useState<string[]>([])
  const [status, setStatus] = useState<TaskStatus>('等待处理')
  // 任务内容编辑/预览切换（仅创建模式的内容字段）
  const [contentPreview, setContentPreview] = useState<'edit' | 'preview'>('edit')

  const [invalidFields, setInvalidFields] = useState<Set<string>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const initialSnapshot = useRef<string>('')

  // 表单实时镜像（ref）：脏检测快照必须读到重置后的值，
  // 直接闭包捕获 state 会拿到「上一次会话 → 重置」间的旧值造成误判
  const formStateRef = useRef({ name, content, handler, repoList, tagsList, relatedTaskList, status })
  formStateRef.current = { name, content, handler, repoList, tagsList, relatedTaskList, status }

  const isCreate = mode === 'create'
  const taskStatus = (task?.status || '等待处理') as TaskStatus
  const isTerminal = !isCreate && (taskStatus === '已完成' || taskStatus === '已取消')
  // 非终态均可手动选择状态（等待处理含自动流转选项；手动选择优先于自动规则）
  const canSelectStatus = !isCreate && !isTerminal
  // 选项 = 当前状态 + 可手动流转的前进状态
  const statusOptions: { value: TaskStatus; label: string }[] = taskStatus === '等待处理'
    ? [{ value: '等待处理', label: '等待处理' }, { value: '处理中', label: '处理中' }, { value: '已完成', label: '已完成' }, { value: '已取消', label: '已取消' }]
    : [{ value: '处理中', label: '处理中' }, { value: '已完成', label: '已完成' }, { value: '已取消', label: '已取消' }]

  const getSnapshot = () => {
    return JSON.stringify(formStateRef.current)
  }

  const hasChanges = () => getSnapshot() !== initialSnapshot.current

  useEffect(() => {
    if (isOpen) {
      if (isCreate) {
        setName('')
        setContent('')
        setHandler('')
        setRepoList([])
        setTagsList([])
        setRelatedTaskList([])
        setStatus('等待处理')
        setContentPreview('edit')
      } else {
        setName(task?.name || '')
        setContent(task?.content || '')
        setHandler(task?.handler || '')
        setRepoList(task?.repo || [])
        setTagsList(task?.tags || [])
        setRelatedTaskList(task?.relatedTasks || [])
        setStatus(taskStatus)
      }
      setInvalidFields(new Set())
      setTimeout(() => {
        initialSnapshot.current = getSnapshot()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, task])

  const handleSubmit = async () => {
    if (isSubmitting) return

    // 门禁：等待处理 → 处中 必须先指定处理人（与后端状态机同步）
    if (!isCreate && status === '处理中' && taskStatus === '等待处理' && !handler.trim()) {
      setInvalidFields(new Set(['handler']))
      addToast('请先填写任务处理人，再推进到「处理中」', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (!name.trim()) {
      setInvalidFields(new Set(['name']))
      addToast('请输入任务名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (isCreate && existingNames.includes(name.trim())) {
      setInvalidFields(new Set(['name']))
      addToast('任务名称已存在，请使用其他名称', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    if (isCreate && !content.trim()) {
      setInvalidFields(new Set(['content']))
      addToast('请输入任务内容', 'warning')
      setTimeout(() => setInvalidFields(new Set()), 3000)
      return
    }

    setInvalidFields(new Set())
    setIsSubmitting(true)

    let success: boolean
    if (isCreate) {
      success = await onConfirm({
        name: name.trim(),
        content: content.trim(),
        handler: handler.trim(),
        repo: repoList,
        tags: tagsList,
        relatedTasks: relatedTaskList,
      } as CreateTaskPayload)
      if (success) addToast('任务创建成功', 'success')
    } else {
      success = await onConfirm({
        name: name.trim(),
        content: content.trim(),
        handler: handler.trim(),
        repo: repoList,
        tags: tagsList,
        relatedTasks: relatedTaskList,
        status: canSelectStatus ? status : undefined,
      } as UpdateTaskPayload)
      if (success) addToast('任务更新成功', 'success')
    }

    setIsSubmitting(false)
    if (success) handleClose(true)
  }

  const handleClose = (skipConfirm = false) => {
    if (!skipConfirm && hasChanges()) {
      setShowConfirm(true)
      return
    }
    setInvalidFields(new Set())
    setShowConfirm(false)
    onClose()
  }

  const handleConfirmClose = () => {
    setShowConfirm(false)
    handleClose(true)
  }

  const handleCancelClose = () => {
    setShowConfirm(false)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleClose()}
        title={isCreate ? '创建任务' : '更新任务'}
        size="lg"
        autoHeight
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="ghost" size="sm" onClick={() => handleClose()}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg"
            >
              {isCreate ? '创建' : '保存'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 flex-1 min-h-0 pr-2">
          {/* 任务名称 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Type size={16} className="text-macos-text-secondary" />
              任务名称 *
            </label>
            <Input
              placeholder="例如：实现登录功能"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (invalidFields.has('name')) setInvalidFields(new Set())
              }}
              autoFocus
              disabled={!isCreate}
              invalid={invalidFields.has('name')}
            />
            {!isCreate && (
              <p className="text-xs text-macos-text-tertiary mt-1">任务名称创建后不可修改</p>
            )}
          </div>

          {/* 任务处理人 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <User size={16} className="text-macos-text-secondary" />
              任务处理人（可选）
            </label>
            <Input
              placeholder="例如：张三"
              value={handler}
              onChange={(e) => {
                setHandler(e.target.value)
                if (invalidFields.has('handler')) setInvalidFields(new Set())
              }}
              invalid={invalidFields.has('handler')}
            />
            {!isCreate && taskStatus === '等待处理' && !handler.trim() && (
              <p className="text-xs text-macos-text-tertiary mt-1">填写处理人并保存后，状态将自动转为「处理中」</p>
            )}
          </div>

          {/* 关联仓库（胶囊多选） */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <GitBranch size={16} className="text-macos-text-secondary" />
              关联仓库（可选）
            </label>
            <TagChipsInput
              items={repoList}
              onChange={setRepoList}
              addLabel="添加仓库"
              placeholder="选择代码库"
              itemLabel="仓库"
              variant="gray"
              options={codebases.map(c => c.name)}
              emptyOptionHint="暂无可关联的代码库，可先在「代码库」页添加"
            />
          </div>

          {/* 任务标签（胶囊多选） */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Tags size={16} className="text-macos-text-secondary" />
              任务标签（可选）
            </label>
            <TagChipsInput
              items={tagsList}
              onChange={setTagsList}
              addLabel="添加标签"
              placeholder="输入标签"
              itemLabel="标签"
            />
          </div>

          {/* 关联任务（选择模式：从已有任务中选择，编辑模式排除自身） */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
              <Link2 size={16} className="text-macos-text-secondary" />
              关联任务（可选）
            </label>
            <TagChipsInput
              items={relatedTaskList}
              onChange={setRelatedTaskList}
              addLabel="添加任务"
              placeholder="选择任务"
              itemLabel="关联任务"
              variant="gray"
              options={taskOptions.filter(t => t !== name)}
              emptyOptionHint="暂无可关联的任务"
            />
          </div>

          {/* 任务内容：置于表单最下，携 flex-1 填满弹窗剩余高度；md 编辑（语法高亮）+ 预览切换；更新弹窗不渲染（内容编辑走任务内容卡片的放大弹窗） */}
          {isCreate && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-macos-text">
                  <FileText size={16} className="text-macos-text-secondary" />
                  任务内容 *
                </label>
                {/* 编辑/预览切换 */}
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setContentPreview('edit')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      contentPreview === 'edit'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Edit3 size={14} />
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => setContentPreview('preview')}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                      contentPreview === 'preview'
                        ? 'bg-white text-gray-800 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <Eye size={14} />
                    预览
                  </button>
                </div>
              </div>
              {contentPreview === 'edit' ? (
                <div className="flex-1 min-h-0">
                  <MarkdownEditor
                    placeholder="描述任务的目标、范围与验收标准，支持 Markdown 格式..."
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value)
                      if (invalidFields.has('content')) setInvalidFields(new Set())
                    }}
                    invalid={invalidFields.has('content')}
                    rows={8}
                    fill
                  />
                </div>
              ) : (
                <div className={`bg-gray-50 rounded-lg p-4 flex-1 min-h-0 overflow-y-auto ${invalidFields.has('content') ? 'ring-2 ring-gray-400' : ''}`}>
                  {content.trim() ? (
                    <MarkdownRenderer content={content} className="text-sm" />
                  ) : (
                    <p className="text-sm text-macos-text-tertiary text-center py-8">暂无内容</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 状态：编辑模式 */}
          {!isCreate && (
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-macos-text mb-1.5">
                <CircleDot size={16} className="text-macos-text-secondary" />
                任务状态
              </label>
              {canSelectStatus ? (
                <div className="flex items-center gap-3">
                  <Dropdown
                    value={status}
                    onChange={(v) => setStatus(v as TaskStatus)}
                    options={statusOptions}
                    placeholder={taskStatus}
                    className="w-48"
                  />
                  {taskStatus === '等待处理' && !handler.trim() && (
                    <span className="text-xs text-macos-text-tertiary">不选择时，填写处理人并保存将自动转为「处理中」</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_BADGE_CLASSES[taskStatus] || STATUS_BADGE_CLASSES['等待处理']}`}>
                    {taskStatus}
                  </span>
                  <span className="text-xs text-macos-text-tertiary">终态任务不可再变更状态</span>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 确认关闭弹窗（有未保存修改时） */}
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
