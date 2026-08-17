import type { FC } from 'react'
import { useEffect, useMemo, useState } from 'react'
import {
  Trash2,
  RotateCcw,
  Bot,
  Wand2,
  BookOpen,
  FolderGit2,
  Box,
  Folder,
  LayoutGrid,
} from 'lucide-react'
import { Button, ConfirmModal } from '../components/ui'
import { useTrashStore } from '../stores/trashStore'
import { useToastStore } from '../stores/toastStore'
import type { TrashItem, TrashModule } from '../types'

const MODULE_META: Record<TrashModule, { label: string; icon: typeof Bot; color: string }> = {
  agents: { label: '智能体', icon: Bot, color: 'text-violet-600' },
  skills: { label: '技能', icon: Wand2, color: 'text-violet-600' },
  knowledges: { label: '知识', icon: BookOpen, color: 'text-blue-600' },
  workflows: { label: '工作流', icon: FolderGit2, color: 'text-green-600' },
  nodes: { label: '节点', icon: Box, color: 'text-amber-600' },
  resources: { label: '资源文件', icon: Folder, color: 'text-sky-600' },
}

const MODULE_ORDER: TrashModule[] = ['agents', 'skills', 'knowledges', 'workflows', 'nodes', 'resources']

type ModuleFilter = 'all' | TrashModule

const FILTER_TABS: { id: ModuleFilter; label: string; icon: typeof Bot; color: string }[] = [
  { id: 'all', label: '全部', icon: LayoutGrid, color: 'text-gray-600' },
  ...MODULE_ORDER.map((m) => ({
    id: m,
    label: MODULE_META[m].label,
    icon: MODULE_META[m].icon,
    color: MODULE_META[m].color,
  })),
]

interface ConfirmState {
  mode: 'delete' | 'batchDelete' | 'clear'
  ids: string[]
}

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return iso
  }
}

export const TrashPage: FC = () => {
  const { items, loadItems, restoreItem, deleteItemPermanently, clearAll } = useTrashStore()
  const { addToast } = useToastStore()

  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>('all')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [confirm, setConfirm] = useState<ConfirmState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadItems()
  }, [loadItems])

  // 过滤 + 分组
  const filteredItems = useMemo(() => {
    return items.filter((item) => moduleFilter === 'all' || item.module === moduleFilter)
  }, [items, moduleFilter])

  const grouped = useMemo(() => {
    return MODULE_ORDER.map((module) => ({
      module,
      items: filteredItems.filter((item) => item.module === module),
    })).filter((group) => group.items.length > 0)
  }, [filteredItems])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const toggleSelectAll = () => {
    const allSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id))
    if (allSelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(filteredItems.map((item) => item.id))
    }
  }

  const handleRestore = async (id: string) => {
    const result = await restoreItem(id)
    if (result.success) {
      addToast('已恢复', 'success')
      setSelectedIds((prev) => prev.filter((x) => x !== id))
    } else {
      addToast(result.error || '恢复失败，请重试', 'error')
    }
  }

  const handleBatchRestore = async () => {
    setBusy(true)
    let successCount = 0
    for (const id of selectedIds) {
      const result = await restoreItem(id)
      if (result.success) successCount += 1
    }
    setBusy(false)
    if (successCount > 0) {
      addToast(`已恢复 ${successCount} 项`, 'success')
    }
    setSelectedIds([])
  }

  const executeDelete = async (ids: string[]) => {
    setBusy(true)
    let success = true
    for (const id of ids) {
      const ok = await deleteItemPermanently(id)
      if (!ok) success = false
    }
    setBusy(false)
    if (success) {
      addToast(ids.length > 1 ? '已彻底删除所选条目' : '已彻底删除', 'success')
    } else {
      addToast('彻底删除失败，请重试', 'error')
    }
    setSelectedIds((prev) => prev.filter((x) => !ids.includes(x)))
  }

  const executeClear = async () => {
    setBusy(true)
    const ok = await clearAll()
    setBusy(false)
    if (ok) {
      addToast('回收站已清空', 'success')
      setSelectedIds([])
    } else {
      addToast('清空回收站失败，请重试', 'error')
    }
  }

  const handleConfirm = async () => {
    if (!confirm) return
    if (confirm.mode === 'clear') {
      await executeClear()
    } else {
      await executeDelete(confirm.ids)
    }
    setConfirm(null)
  }

  const renderItem = (item: TrashItem) => {
    const meta = MODULE_META[item.module]
    const Icon = meta.icon
    const selected = selectedIds.includes(item.id)
    return (
      <div
        key={item.id}
        className="group flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleSelect(item.id)}
          className="w-4 h-4 rounded border-gray-300 text-macos-accent focus:ring-0 cursor-pointer flex-shrink-0"
        />
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 flex-shrink-0">
          <Icon size={16} className="text-gray-600" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-macos-text truncate">{item.name}</div>
          <div className="text-xs text-macos-text-tertiary truncate">
            {meta.label} · {item.originalRelativePath} · {formatTime(item.deletedAt)}
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={() => handleRestore(item.id)}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-macos-text-secondary hover:bg-gray-100 hover:text-macos-text transition-colors"
          >
            <RotateCcw size={13} />
            恢复
          </button>
          <button
            onClick={() => setConfirm({ mode: 'delete', ids: [item.id] })}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-macos-text-secondary hover:bg-red-50 hover:text-macos-error transition-colors"
          >
            <Trash2 size={13} />
            彻底删除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full pl-2 pr-4 pt-4 pb-4">
      {/* 白色圆角卡片容器 */}
      <div className="h-full bg-white rounded-2xl shadow-sm flex flex-col overflow-hidden">
        {/* 页面头部 */}
        <div className="h-16 px-6 flex items-center justify-center">
          <div className="inline-flex items-center gap-1 bg-gray-100 rounded-xl p-1.5">
            {FILTER_TABS.map((tab) => {
              const Icon = tab.icon
              const isActive = moduleFilter === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModuleFilter(tab.id)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                  }`}
                >
                  <Icon size={16} className={isActive ? tab.color : ''} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>


        {/* 批量操作栏 */}
        {selectedIds.length > 0 && (
          <div className="px-6 py-2 bg-gray-50 border-t border-gray-100 flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="text-xs text-macos-text-secondary hover:text-macos-text transition-colors"
            >
              {filteredItems.length > 0 && filteredItems.every((item) => selectedIds.includes(item.id))
                ? '取消全选'
                : '全选'}
            </button>
            <span className="text-xs text-macos-text-tertiary">已选 {selectedIds.length} 项</span>
            <div className="flex-1" />
            <Button size="sm" variant="outline" disabled={busy} onClick={handleBatchRestore}>
              <RotateCcw size={14} />
              批量恢复
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => setConfirm({ mode: 'batchDelete', ids: selectedIds })}
            >
              <Trash2 size={14} />
              批量彻底删除
            </Button>
          </div>
        )}

        {/* 页面内容 */}
        <div className="flex-1 p-4 overflow-y-auto">
          {grouped.length > 0 ? (
            <div className="max-w-4xl mx-auto space-y-5">
              {grouped.map((group) => {
                const meta = MODULE_META[group.module]
                return (
                  <div key={group.module}>
                    <div className="flex items-center gap-2 px-1 mb-1.5">
                      <meta.icon size={14} className="text-macos-text-tertiary" strokeWidth={1.5} />
                      <span className="text-xs font-medium text-macos-text-secondary">
                        {meta.label}
                      </span>
                      <span className="text-xs text-macos-text-tertiary">{group.items.length}</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {group.items.map(renderItem)}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* 空状态 */
            <div className="h-full flex flex-col items-center justify-center text-center">
              <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                <Trash2 size={32} className="text-macos-text-tertiary" />
              </div>
              <p className="mt-3 text-sm text-macos-text-tertiary">
                {items.length === 0 ? '回收站是空的' : '没有匹配的条目'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 彻底删除确认弹窗 */}
      <ConfirmModal
        isOpen={confirm?.mode === 'delete' || confirm?.mode === 'batchDelete'}
        title="彻底删除"
        message={
          confirm?.mode === 'batchDelete'
            ? `确定要彻底删除选中的 ${confirm?.ids.length ?? 0} 个条目吗？此操作不可恢复。`
            : '确定要彻底删除这个条目吗？此操作不可恢复。'
        }
        confirmText="彻底删除"
        cancelText="取消"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />

      {/* 清空回收站确认弹窗 */}
      <ConfirmModal
        isOpen={confirm?.mode === 'clear'}
        title="清空回收站"
        message="确定要清空回收站吗？所有条目将被彻底删除，此操作不可恢复。"
        confirmText="清空"
        cancelText="取消"
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}