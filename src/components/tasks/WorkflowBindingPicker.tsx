import type { FC } from 'react'
import { useState, useEffect, useRef } from 'react'
import { Plus, Check, X, ChevronLeft } from 'lucide-react'

interface WorkflowBindingPickerProps {
  /** 已绑定的工作流（空串=未绑定） */
  workflow: string
  /** 已绑定的实例 ID（空串=只绑工作流） */
  instance: string
  /** 候选工作流名称 */
  workflows: string[]
  /** 候选实例（工作流名 → 实例 ID 列表） */
  instancesByWorkflow: Record<string, string[]>
  onChange: (next: { workflow: string; instance: string }) => void
}

// 工作流绑定选择器：与任务标签同形态的「虚线添加按钮 + 弹层」，弹层内为两级菜单——
// 一级列出工作流（点击进入）；二级列出该工作流下的实例 ID（含「仅绑定该工作流」与返回）。
export const WorkflowBindingPicker: FC<WorkflowBindingPickerProps> = ({
  workflow,
  instance,
  workflows,
  instancesByWorkflow,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const [activeWorkflow, setActiveWorkflow] = useState('')
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  // 打开时若有已绑定工作流，直接进入其二级（便于改选实例）；否则停在一级
  useEffect(() => {
    if (isOpen) setActiveWorkflow(workflow || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  const chipLabel = workflow ? (instance ? `${workflow} / ${instance}` : workflow) : ''

  const select = (wf: string, inst: string) => {
    onChange({ workflow: wf, instance: inst })
    setIsOpen(false)
  }

  const rowClass = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded-md text-left transition-colors ${
      active ? 'bg-gray-50 text-macos-text font-medium' : 'text-macos-text hover:bg-gray-50'
    }`

  const instances = activeWorkflow && Object.hasOwn(instancesByWorkflow, activeWorkflow) ? instancesByWorkflow[activeWorkflow] : []

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chipLabel && (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm bg-gray-100 text-gray-600">
          {chipLabel}
          <button
            type="button"
            title="移除绑定"
            onClick={() => onChange({ workflow: '', instance: '' })}
            className="ml-0.5 hover:text-gray-800 transition-colors"
          >
            <X size={14} />
          </button>
        </span>
      )}

      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm transition-colors ${
            isOpen
              ? 'border border-gray-300 text-gray-600 bg-gray-50'
              : 'border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-600'
          }`}
        >
          {isOpen ? <X size={14} /> : <Plus size={14} />}
          {isOpen ? '收起' : '添加工作流'}
        </button>

        {isOpen && (
          <div className="absolute top-full left-0 mt-1.5 min-w-[240px] max-w-[320px] max-h-60 overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg p-1 z-50">
            {activeWorkflow === '' ? (
              <>
                {workflows.length === 0 && (
                  <p className="px-3 py-2 text-xs text-macos-text-tertiary">暂无工作流，可先在「工作流」页创建</p>
                )}
                {workflows.map((wf) => (
                  <button
                    key={wf}
                    type="button"
                    onClick={() => setActiveWorkflow(wf)}
                    className={rowClass(workflow === wf)}
                  >
                    <span className="truncate" title={wf}>{wf}</span>
                    <span className="flex items-center gap-1 flex-shrink-0">
                      {workflow === wf && <Check size={14} className="text-gray-400" />}
                      <ChevronLeft size={14} className="rotate-180 text-macos-text-tertiary" />
                    </span>
                  </button>
                ))}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setActiveWorkflow('')}
                  className="w-full flex items-center gap-1 px-3 py-1.5 text-xs rounded-md text-macos-text-secondary hover:bg-gray-50 transition-colors"
                >
                  <ChevronLeft size={14} />
                  返回工作流列表
                </button>
                <div className="px-3 py-1 text-xs text-macos-text-tertiary truncate" title={activeWorkflow}>{activeWorkflow}</div>
                <button
                  type="button"
                  onClick={() => select(activeWorkflow, '')}
                  className={rowClass(workflow === activeWorkflow && instance === '')}
                >
                  <span>仅绑定该工作流</span>
                  {workflow === activeWorkflow && instance === '' && <Check size={14} className="flex-shrink-0 text-gray-400" />}
                </button>
                {instances.length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-macos-text-tertiary">该工作流暂无实例</p>
                )}
                {instances.map((id) => {
                  const selected = workflow === activeWorkflow && instance === id
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => select(activeWorkflow, id)}
                      className={rowClass(selected)}
                    >
                      <span className="truncate" title={id}>{id}</span>
                      {selected && <Check size={14} className="flex-shrink-0 text-gray-400" />}
                    </button>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
