import type { FC } from 'react'
import { useState, useEffect, useRef, memo } from 'react'
import { motion, AnimatePresence, Reorder, useDragControls } from 'framer-motion'
import {
  Search, RefreshCw, ClipboardList, Plus, ChevronLeft, ChevronUp, ChevronDown,
  X, Home, Clock, User, GitBranch, Tags, CircleDot, StickyNote, FileText, Maximize2,
} from 'lucide-react'
import { Button, Dropdown, MarkdownRenderer } from '../components/ui'
import { useTaskStore } from '../stores/taskStore'
import { useToastStore } from '../stores/toastStore'
import type { TaskSummary, TaskContextFile, TaskTraceEvent, TaskStatus } from '../types'
import { formatRelativeTime } from '../utils/format'
import { TaskFormModal, TaskContextModal, TaskContextFormModal, TaskContentModal, TaskTimelineModal, traceTypeLabels, traceTypeColors } from '../components/tasks'

// 任务状态配色（列表/详情/标签页统一）
const statusColors: Record<string, string> = {
  '等待处理': 'bg-gray-100 text-gray-500',
  '处理中': 'bg-blue-50 text-blue-600',
  '已完成': 'bg-green-50 text-green-600',
  '已取消': 'bg-red-50 text-red-600',
}

const statusDotColors: Record<string, string> = {
  '等待处理': 'bg-gray-400',
  '处理中': 'bg-blue-500',
  '已完成': 'bg-green-500',
  '已取消': 'bg-red-400',
}

const TASK_STATUS_OPTIONS: TaskStatus[] = ['等待处理', '处理中', '已完成', '已取消']

// ===== 列表视图 =====

const TaskList: FC<{ onCreateClick: () => void }> = ({ onCreateClick }) => {
  const {
    tasks, isLoaded, loadTasks, selectTask,
    listSearchQuery: searchQuery, listFilterStatus: filterStatus, listSortOrder: sortOrder,
  } = useTaskStore()
  const setListState = useTaskStore.setState

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const filtered = tasks.filter((task) => {
    if (filterStatus && task.status !== filterStatus) return false
    const q = searchQuery.toLowerCase()
    return task.name.toLowerCase().includes(q) ||
      task.handler.toLowerCase().includes(q) ||
      task.repo.some(r => r.toLowerCase().includes(q)) ||
      task.tags.some(t => t.toLowerCase().includes(q)) ||
      task.status.toLowerCase().includes(q)
  }).sort((a, b) => {
    const cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    return sortOrder === 'desc' ? -cmp : cmp
  })

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-2.5">
          <Dropdown
            value={filterStatus}
            onChange={(v) => setListState({ listFilterStatus: v })}
            placeholder="全部状态"
            options={[
              { value: '', label: '全部状态' },
              ...TASK_STATUS_OPTIONS.map(s => ({ value: s, label: s })),
            ]}
          />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
            <input
              type="text"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setListState({ listSearchQuery: e.target.value })}
              className="pl-9 pr-4 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg
                         placeholder:text-macos-text-tertiary focus:outline-none
                         hover:border-gray-300 focus:border-gray-400
                         focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                         transition-[border-color,box-shadow] duration-200"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => loadTasks()}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm"
          >
            <RefreshCw size={16} className="flex-shrink-0" />
          </Button>
          <Button
            variant="outline"
            onClick={onCreateClick}
            className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm overflow-hidden"
          >
            <Plus size={16} className="flex-shrink-0" />
            <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
              创建任务
            </span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length > 0 ? (
          <div className="w-full">
            <div className="flex items-center px-3 py-2.5 gap-4 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
              <span className="flex-1 min-w-0 text-center">任务名称</span>
              <span className="flex-1 min-w-0 text-center">处理人</span>
              <span className="flex-1 min-w-0 text-center">关联仓库</span>
              <span className="flex-1 min-w-0 text-center">标签</span>
              <span className="flex-1 min-w-0 text-center">状态</span>
              <button onClick={() => setListState({ listSortOrder: sortOrder === 'desc' ? 'asc' : 'desc' })} className="flex-1 min-w-0 flex items-center justify-center gap-1 cursor-pointer hover:text-macos-text transition-colors">
                更新时间
                {sortOrder === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
            </div>
            {filtered.map((task) => (
              <div
                key={task.name}
                className="flex items-center px-3 py-3 gap-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                onClick={() => selectTask(task)}
              >
                <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColors[task.status] || statusDotColors['等待处理']}`} />
                  <span className="text-sm text-macos-text truncate" title={task.name}>{task.name}</span>
                </div>
                <span className="flex-1 min-w-0 text-sm text-macos-text-secondary truncate text-center" title={task.handler}>
                  {task.handler || '-'}
                </span>
                <div className="flex-1 min-w-0 flex justify-center gap-1 overflow-hidden">
                  {task.repo.length > 0 ? (
                    <>
                      {task.repo.slice(0, 2).map(r => (
                        <span key={r} className="text-xs px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-600 truncate max-w-[80px]" title={r}>{r}</span>
                      ))}
                      {task.repo.length > 2 && (
                        <span className="text-xs text-macos-text-tertiary flex-shrink-0">+{task.repo.length - 2}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-macos-text-tertiary">-</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex justify-center gap-1 overflow-hidden">
                  {task.tags.length > 0 ? (
                    <>
                      {task.tags.slice(0, 2).map(t => (
                        <span key={t} className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 truncate max-w-[80px]" title={t}>{t}</span>
                      ))}
                      {task.tags.length > 2 && (
                        <span className="text-xs text-macos-text-tertiary flex-shrink-0">+{task.tags.length - 2}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-xs text-macos-text-tertiary">-</span>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex justify-center">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusColors[task.status] || statusColors['等待处理']}`}>
                    {task.status}
                  </span>
                </div>
                <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center">
                  {task.updatedAt ? formatRelativeTime(task.updatedAt) : '-'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <ClipboardList size={32} className="text-macos-text-tertiary" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-macos-text-tertiary mt-4">{isLoaded ? '暂无任务' : '加载中...'}</p>
            <p className="text-xs text-macos-text-tertiary mt-1">点击右上角「创建任务」开始</p>
          </div>
        )}
      </div>
    </>
  )
}

// ===== 详情视图 =====

const DetailField: FC<{ icon: typeof Clock; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex items-center gap-2">
    <Icon size={14} className="text-macos-text-tertiary flex-shrink-0" strokeWidth={1.5} />
    <span className="text-xs text-macos-text-tertiary w-14 flex-shrink-0">{label}</span>
    <span className="text-sm text-macos-text truncate">{children}</span>
  </div>
)

const TraceTable: FC<{ trace: TaskTraceEvent[] }> = ({ trace }) => {
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('asc')

  const sorted = [...trace].sort((a, b) => {
    const cmp = new Date(a.ts).getTime() - new Date(b.ts).getTime()
    return sortOrder === 'desc' ? -cmp : cmp
  })

  return (
    <div className="w-full">
      <div className="flex items-center px-3 py-2.5 gap-4 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
        <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="flex-1 min-w-0 flex items-center justify-center gap-1 cursor-pointer hover:text-macos-text transition-colors">
          时间
          {sortOrder === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        <span className="flex-1 min-w-0 text-center">事件</span>
        <span className="flex-[2] min-w-0 text-center">说明</span>
      </div>
      {sorted.map((evt, i) => (
        <div key={i} className="flex items-center px-3 py-3 gap-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center" title={evt.ts}>
            {evt.ts ? formatRelativeTime(evt.ts) : '-'}
          </span>
          <div className="flex-1 min-w-0 flex justify-center">
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${traceTypeColors[evt.type] || 'bg-gray-100 text-gray-500'}`}>
              {traceTypeLabels[evt.type] || evt.type}
            </span>
          </div>
          <span className="flex-[2] min-w-0 text-xs text-macos-text truncate text-center" title={evt.message}>
            {evt.message || '-'}
          </span>
        </div>
      ))}
    </div>
  )
}

const TaskDetail: FC<{ onEditClick: () => void }> = ({ onEditClick }) => {
  const { selectedTask, detail, isLoadingDetail, showList, refreshDetail, updateTask, saveTaskContext } = useTaskStore()
  const { addToast } = useToastStore()
  const [isRefreshing, setIsRefreshing] = useState(false)
  // 详情页自持弹窗状态：上下文查看/编辑/新增、任务内容编辑、时间线可视化
  const [viewingContext, setViewingContext] = useState<TaskContextFile | null>(null)
  const [editingContext, setEditingContext] = useState<TaskContextFile | null>(null)
  const [isAddContextOpen, setIsAddContextOpen] = useState(false)
  const [isEditContentOpen, setIsEditContentOpen] = useState(false)
  const [isTimelineOpen, setIsTimelineOpen] = useState(false)

  if (!selectedTask) return null
  const task = detail?.task

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    await refreshDetail()
    setIsRefreshing(false)
  }

  // 任务内容卡片放大编辑：只更新内容，状态与其它字段保持不变
  const handleContentSave = async (content: string) => {
    if (!task) return false
    const success = await updateTask({
      name: task.name,
      content,
      handler: task.handler,
      repo: task.repo,
      tags: task.tags,
    })
    if (!success) addToast('保存任务内容失败，请重试', 'error')
    return success
  }

  const handleSaveContext = async (contextName: string, content: string) => {
    if (!task) return false
    const success = await saveTaskContext(task.name, contextName, content)
    if (!success) addToast('保存上下文失败，请重试', 'error')
    return success
  }

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-between">
        <button
          onClick={() => showList()}
          className="p-1.5 rounded-lg text-macos-text-secondary hover:text-macos-text hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm"
          >
            <RefreshCw size={16} className={`flex-shrink-0 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="w-full">
          {isLoadingDetail ? (
            <div className="py-20 text-center">
              <p className="text-sm text-macos-text-tertiary">加载中...</p>
            </div>
          ) : detail ? (
            <div className="grid grid-cols-2 gap-4 items-stretch">
              {/* 基本信息（右上角放大按钮 → 更新任务弹窗，任务内容锁定） */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-macos-text">基本信息</span>
                  <button
                    onClick={onEditClick}
                    disabled={!task}
                    title="更新任务信息"
                    className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors"
                  >
                    <Maximize2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="flex flex-col gap-2.5">
                  <DetailField icon={CircleDot} label="状态">
                    <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusColors[task!.status] || statusColors['等待处理']}`}>
                      {task!.status}
                    </span>
                  </DetailField>
                  <DetailField icon={FileText} label="名称">
                    <span title={task!.name}>{task!.name}</span>
                  </DetailField>
                  <DetailField icon={User} label="处理人">
                    {task!.handler || <span className="text-macos-text-tertiary">未分配</span>}
                  </DetailField>
                  <DetailField icon={GitBranch} label="仓库">
                    {task!.repo.length > 0 ? (
                      <span className="flex gap-1 overflow-hidden">
                        {task!.repo.map(r => (
                          <span key={r} className="text-xs px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-600 truncate max-w-[80px]" title={r}>{r}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-macos-text-tertiary">-</span>
                    )}
                  </DetailField>
                  <DetailField icon={Tags} label="标签">
                    {task!.tags.length > 0 ? (
                      <span className="flex gap-1 overflow-hidden">
                        {task!.tags.map(t => (
                          <span key={t} className="text-xs px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-600 truncate max-w-[80px]" title={t}>{t}</span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-macos-text-tertiary">-</span>
                    )}
                  </DetailField>
                  <DetailField icon={Clock} label="创建">
                    {task!.createdAt ? formatRelativeTime(task!.createdAt) : '-'}
                  </DetailField>
                  <DetailField icon={Clock} label="更新">
                    {task!.updatedAt ? formatRelativeTime(task!.updatedAt) : '-'}
                  </DetailField>
                </div>
              </div>

              {/* 任务内容（右上角放大编辑，支持 md 编辑/预览） */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-macos-text">任务内容</span>
                  <button
                    onClick={() => setIsEditContentOpen(true)}
                    disabled={!task}
                    title="编辑任务内容"
                    className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors"
                  >
                    <Maximize2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
                <div className="max-h-200 overflow-y-auto">
                  {task!.content ? (
                    <MarkdownRenderer content={task!.content} className="text-sm" />
                  ) : (
                    <p className="text-sm text-macos-text-tertiary text-center py-8">暂无任务内容</p>
                  )}
                </div>
              </div>

              {/* 任务上下文 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-bold text-macos-text">任务上下文</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsAddContextOpen(true)}
                    className="group bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg text-xs overflow-hidden"
                  >
                    <Plus size={14} className="flex-shrink-0" />
                    <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
                      添加上下文
                    </span>
                  </Button>
                </div>
                {detail.contexts.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {detail.contexts.map(ctx => (
                      <div
                        key={ctx.name}
                        className="rounded-lg border border-gray-100 p-3 transition-colors cursor-pointer hover:border-gray-200 hover:bg-gray-50/50"
                        onClick={() => setViewingContext(ctx)}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-macos-text truncate" title={ctx.name}>{ctx.name}</span>
                          <StickyNote size={14} className="text-macos-text-tertiary flex-shrink-0" strokeWidth={1.5} />
                        </div>
                        <p className="text-xs text-macos-text-tertiary truncate" title={ctx.content.split('\n')[0] || ''}>
                          {ctx.content.split('\n')[0] || '（空）'}
                        </p>
                        <p className="text-[10px] text-macos-text-tertiary mt-1">
                          {ctx.updatedAt ? formatRelativeTime(ctx.updatedAt) : '-'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-macos-text-tertiary text-center py-8">暂无上下文，点击「添加上下文」创建</p>
                )}
              </div>

              {/* 处理时间线（右上角可视化大图） */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-macos-text">处理时间线</span>
                  <button
                    onClick={() => setIsTimelineOpen(true)}
                    disabled={!detail || detail.trace.length === 0}
                    title="查看完整时间线"
                    className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors"
                  >
                    <Maximize2 size={14} strokeWidth={1.5} />
                  </button>
                </div>
                {detail.trace.length > 0 ? (
                  <TraceTable trace={detail.trace} />
                ) : (
                  <p className="text-sm text-macos-text-tertiary text-center py-8">暂无事件记录</p>
                )}
              </div>
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-sm text-macos-text-tertiary">无法加载详情数据</p>
            </div>
          )}
        </div>
      </div>

      {/* 上下文查看弹窗（footer 编辑入口） */}
      <TaskContextModal
        context={viewingContext}
        onClose={() => setViewingContext(null)}
        onEdit={(ctx) => {
          setViewingContext(null)
          setEditingContext(ctx)
        }}
      />

      {/* 添加/更新上下文弹窗（md 编辑+预览） */}
      <TaskContextFormModal
        isOpen={isAddContextOpen || editingContext !== null}
        onClose={() => { setIsAddContextOpen(false); setEditingContext(null) }}
        mode={editingContext ? 'edit' : 'create'}
        initialContext={editingContext}
        existingContextNames={(detail?.contexts || []).map(c => c.name)}
        onConfirm={handleSaveContext}
      />

      {/* 任务内容编辑弹窗（放大：查看态优先，可进入编辑，md 编辑/预览） */}
      <TaskContentModal
        isOpen={isEditContentOpen}
        onClose={() => setIsEditContentOpen(false)}
        initialContent={task?.content || ''}
        onConfirm={handleContentSave}
      />

      {/* 可视化时间线弹窗 */}
      <TaskTimelineModal
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        trace={detail?.trace || []}
      />
    </>
  )
}

// ===== Tab 标签栏 =====

const TaskTabItem: FC<{ tab: TaskSummary; isActive: boolean }> = ({ tab, isActive }) => {
  const { switchTab, closeTab } = useTaskStore()
  const dragControls = useDragControls()
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  return (
    <Reorder.Item
      value={tab}
      dragListener={false}
      dragControls={dragControls}
      dragTransition={{ bounceStiffness: 800, bounceDamping: 40 }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        const ev = e
        pressTimer.current = setTimeout(() => { setIsDragging(true); dragControls.start(ev) }, 200)
      }}
      onPointerUp={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null } }}
      onPointerLeave={() => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null } }}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => switchTab(tab.name)}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs cursor-grab transition-colors flex-1 min-w-0 max-w-[200px] select-none ${isDragging ? 'cursor-grabbing' : ''} ${isActive ? 'bg-white text-macos-text shadow-sm border border-gray-200' : 'text-macos-text-secondary hover:bg-gray-100 hover:text-macos-text'}`}
    >
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDotColors[tab.status] || statusDotColors['等待处理']}`} />
      <span className="flex-1 min-w-0 truncate">{tab.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); closeTab(tab.name) }}
        className="hover:bg-gray-200 rounded p-0.5 transition-colors flex-shrink-0"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </Reorder.Item>
  )
}

const TaskTabs: FC = () => {
  const { openTabs, activeTabId, reorderTabs, showList } = useTaskStore()

  return (
    <div className="h-10 px-2 flex items-center gap-0.5 flex-shrink-0">
      <button
        onClick={() => showList()}
        className={`flex items-center gap-1 px-4 py-1.5 rounded-lg text-xs cursor-grab transition-colors flex-shrink-0 ${activeTabId === null ? 'bg-white text-macos-text shadow-sm border border-gray-200' : 'text-macos-text-secondary hover:bg-gray-100 hover:text-macos-text'}`}
      >
        <Home size={14} strokeWidth={1.5} />
        <span>首页</span>
      </button>
      <Reorder.Group
        axis="x"
        values={openTabs}
        onReorder={reorderTabs}
        className="flex items-center gap-0.5 flex-1 min-w-0"
      >
        <AnimatePresence mode="popLayout">
          {openTabs.map((tab) => (
            <TaskTabItem key={tab.name} tab={tab} isActive={activeTabId === tab.name} />
          ))}
        </AnimatePresence>
      </Reorder.Group>
    </div>
  )
}

// ===== 页面入口 =====

export const TaskLibraryPage: FC = () => {
  const { activeTabId, tasks, detail, createTask, updateTask } = useTaskStore()
  const { addToast } = useToastStore()
  const showDetail = activeTabId !== null

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)

  const showDetailError = (action: string) => addToast(`${action}失败，请重试`, 'error')

  const handleCreate = async (payload: Parameters<typeof createTask>[0]) => {
    const success = await createTask(payload)
    if (!success) showDetailError('创建任务')
    return success
  }

  const handleUpdate = async (payload: Parameters<typeof updateTask>[0]) => {
    const success = await updateTask(payload)
    if (!success) showDetailError('更新任务')
    return success
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TaskTabs />
      <AnimatePresence mode="wait">
        <motion.div
          key={showDetail ? `detail-${activeTabId}` : 'list'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.15 }}
          className="flex-1 flex flex-col overflow-hidden"
        >
          {showDetail ? (
            <TaskDetail
              onEditClick={() => setIsEditModalOpen(true)}
            />
          ) : (
            <TaskList onCreateClick={() => setIsCreateModalOpen(true)} />
          )}
        </motion.div>
      </AnimatePresence>

      {/* 创建任务弹窗 */}
      <TaskFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        mode="create"
        existingNames={tasks.map(t => t.name)}
        onConfirm={handleCreate}
      />

      {/* 更新任务弹窗（需要详情已加载，提供含内容的任务数据） */}
      <TaskFormModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        mode="edit"
        task={detail?.task ?? null}
        onConfirm={handleUpdate}
      />
    </div>
  )
}
