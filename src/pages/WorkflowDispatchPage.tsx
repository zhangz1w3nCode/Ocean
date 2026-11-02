import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, Loader2,
  Plus, RefreshCw, Search, Square, Terminal, X,
} from 'lucide-react'
import { useDispatchStore, dispatchSelectedRecord, type DispatchRecordView, type DispatchRunView } from '../stores/workflowDispatchStore'
import { useWorkflowStore } from '../stores/workflowStore'
import { Button } from '../components/ui/Button'
import { Dropdown } from '../components/ui/Dropdown'
import { Modal } from '../components/ui/Modal'
import { formatRelativeTime } from '../utils/format'
import { isElectron } from '../utils/storage'

// ===== 状态投影 =====

const STATUS_LABEL: Record<string, string> = {
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  aborted: '已中止',
  stopped: '已停止',
}

const STATUS_PILL: Record<string, string> = {
  running: 'bg-blue-50 text-blue-600',
  completed: 'bg-green-50 text-green-600',
  failed: 'bg-red-50 text-red-600',
  aborted: 'bg-orange-50 text-orange-600',
  stopped: 'bg-gray-100 text-gray-500',
}

const STATUS_DOT: Record<string, string> = {
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  aborted: 'bg-orange-500',
  stopped: 'bg-gray-400',
}

const OUTCOME_LABEL: Record<string, string> = {
  completed: '产物已提交',
  chosen: '已选分支',
  rejected: '被打回',
  agent_failed: 'agent 失败',
  aborted: '已取消',
}

const OUTCOME_PILL: Record<string, string> = {
  completed: 'bg-green-50 text-green-600',
  chosen: 'bg-indigo-50 text-indigo-600',
  rejected: 'bg-orange-50 text-orange-600',
  agent_failed: 'bg-red-50 text-red-600',
  aborted: 'bg-gray-100 text-gray-500',
}

function durationText(record: { started_at: string; finished_at?: string }): string {
  const start = new Date(record.started_at.replace(' ', 'T')).getTime()
  const end = record.finished_at ? new Date(record.finished_at.replace(' ', 'T')).getTime() : Date.now()
  if (!Number.isFinite(start) || !Number.isFinite(end)) return '-'
  const sec = Math.max(0, Math.round((end - start) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m${String(sec % 60).padStart(2, '0')}s`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}m`
}

// ===== 页面 =====

export const WorkflowDispatchPage: FC = () => {
  const { records, isLoaded, load, selectedKey, select, close, applyUpdate, stop, start } = useDispatchStore()
  const selected = useDispatchStore(dispatchSelectedRecord)
  const { workflows, loadWorkflows } = useWorkflowStore()

  const [isNewOpen, setIsNewOpen] = useState(false)
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    load()
    loadWorkflows()
  }, [load, loadWorkflows])

  // 主进程推送：调度状态实时更新
  useEffect(() => {
    if (!isElectron()) return
    const off = window.electronAPI!.onDispatchUpdate((record) => {
      applyUpdate(record as DispatchRecordView)
    })
    return off
  }, [applyUpdate])

  // 有执行中的记录时，每 5 秒兜底刷新一次（推送丢失/刷新页面后追赶）
  const hasRunning = records.some((r) => r.status === 'running')
  useEffect(() => {
    if (!hasRunning) return
    const timer = setInterval(() => { load() }, 5000)
    return () => clearInterval(timer)
  }, [hasRunning, load])

  const counts = useMemo(() => ({
    running: records.filter((r) => r.status === 'running').length,
    completed: records.filter((r) => r.status === 'completed').length,
    failed: records.filter((r) => r.status === 'failed' || r.status === 'aborted').length,
    stopped: records.filter((r) => r.status === 'stopped').length,
  }), [records])

  const filtered = useMemo(
    () => (filterStatus ? records.filter((r) => r.status === filterStatus) : records),
    [records, filterStatus],
  )

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-macos-text">调度</h2>
          <p className="text-xs text-macos-text-tertiary mt-0.5">程序驱动的工作流实例，节点内容转发给本地 agent 执行</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Dropdown
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="全部状态"
            options={[
              { value: '', label: '全部状态' },
              ...Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })),
            ]}
          />
          <Button
            variant="outline"
            onClick={() => load()}
            className="h-[38px] bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-0 text-sm"
          >
            <RefreshCw size={16} className="flex-shrink-0" />
          </Button>
          <Button
            variant="outline"
            onClick={() => setIsNewOpen(true)}
            disabled={!isElectron()}
            title="新建调度"
            className="group h-[38px] bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-0 text-sm overflow-hidden"
          >
            <Plus size={16} className="flex-shrink-0" />
            <span className="max-w-0 group-hover:max-w-[80px] overflow-hidden whitespace-nowrap transition-[max-width,margin] duration-500 ease-in-out group-hover:ml-1.5">
              新建调度
            </span>
          </Button>
        </div>
      </div>

      <div className="px-6 pb-4 flex gap-3 flex-shrink-0">
        <StatCard label="执行中" value={counts.running} tone="running" />
        <StatCard label="已完成" value={counts.completed} tone="completed" />
        <StatCard label="失败 / 中止" value={counts.failed} tone="failed" />
        <StatCard label="已停止" value={counts.stopped} tone="stopped" />
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length > 0 ? (
          <div className="w-full">
            <div className="flex items-center px-3 py-2.5 gap-4 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
              <span className="w-24 flex-shrink-0 text-center">状态</span>
              <span className="w-20 flex-shrink-0 text-center">Agent</span>
              <span className="flex-1 min-w-0 text-center">工作流 / 实例</span>
              <span className="flex-1 min-w-0 text-center">当前节点</span>
              <span className="w-16 flex-shrink-0 text-center">步数</span>
              <span className="w-24 flex-shrink-0 text-center">用时</span>
            </div>
            {filtered.map((record) => (
              <div
                key={`${record.workflow}/${record.instance_id}`}
                className={`flex items-center px-3 py-3 gap-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer ${
                  selectedKey === `${record.workflow}/${record.instance_id}` ? 'bg-gray-50' : ''
                }`}
                onClick={() => select(record.workflow, record.instance_id)}
              >
                <div className="w-24 flex-shrink-0 flex justify-center">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_PILL[record.status] || STATUS_PILL.stopped}`}>
                    {record.status === 'running'
                      ? <Loader2 size={11} className="animate-spin" />
                      : <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[record.status] || STATUS_DOT.stopped}`} />}
                    {STATUS_LABEL[record.status] || record.status}
                  </span>
                </div>
                <div className="w-20 flex-shrink-0 flex justify-center">
                  <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium">{record.agent?.type || 'pi'}</span>
                </div>
                <div className="flex-1 min-w-0 text-center">
                  <div className="text-sm text-macos-text truncate">{record.workflow}</div>
                  <div className="text-xs text-macos-text-tertiary font-mono truncate">{record.instance_id}</div>
                </div>
                <span className="flex-1 min-w-0 text-xs text-macos-text-secondary truncate text-center">{record.current_node || '-'}</span>
                <span className="w-16 flex-shrink-0 text-xs text-macos-text-secondary text-center">{record.steps}</span>
                <span className="w-24 flex-shrink-0 text-xs text-macos-text-tertiary text-center">{durationText(record)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Terminal size={32} className="text-macos-text-tertiary" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-macos-text-tertiary mt-4">{isLoaded ? '暂无调度记录' : '加载中'}</p>
            <p className="text-xs text-macos-text-tertiary mt-1">点击「新建调度」把工作流交给 agent 自动执行</p>
          </div>
        )}
      </div>

      <DispatchDetailDrawer
        record={selected}
        onClose={close}
        onStop={async (instanceId) => { await stop(instanceId) }}
      />

      <NewDispatchModal
        isOpen={isNewOpen}
        onClose={() => setIsNewOpen(false)}
        workflows={workflows.map((w) => w.name)}
        onSubmit={async (payload) => {
          const result = await start(payload)
          if (result.success) setIsNewOpen(false)
          return result
        }}
      />
    </>
  )
}

// ===== 模型下拉（数据源 ~/.pi/agent/models.json，主进程只回传 provider/模型 id/上下文，不含密钥） =====

interface ModelGroup {
  provider: string
  models: { id: string; contextWindow: number | null }[]
}

const fmtCtx = (n: number | null): string => {
  if (!n) return ''
  return n >= 1e6 ? `${Math.round(n / 1e6)}M` : `${Math.round(n / 1e3)}K`
}

const modelLabel = (value: string): string =>
  value ? value.replace('/', ' / ') : 'Agent 默认 · 不指定 --model'

const ModelPicker: FC<{
  value: string
  onChange: (value: string) => void
  groups: ModelGroup[]
  defaultModel: { provider: string; id: string } | null
  loading: boolean
  source?: string
}> = ({ value, onChange, groups, defaultModel, loading, source }) => {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    if (!isOpen) setQuery('')
  }, [isOpen])

  const q = query.trim().toLowerCase()
  const visibleGroups = groups
    .map((g) => ({
      provider: g.provider,
      models: g.models.filter((m) => !q || m.id.toLowerCase().includes(q) || g.provider.toLowerCase().includes(q)),
    }))
    .filter((g) => g.models.length > 0)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 h-[38px] px-3 text-sm bg-white border border-gray-200 rounded-lg
                   hover:border-gray-400 focus:outline-none transition-[border-color] duration-150"
      >
        <span className={`truncate ${value ? 'text-macos-text' : 'text-macos-text-tertiary'}`}>{modelLabel(value)}</span>
        <ChevronDown size={14} className="flex-shrink-0 text-macos-text-tertiary" />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-full z-50 bg-white rounded-xl p-2 shadow-[3px_5px_30px_rgba(0,0,0,0.22)]">
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索模型或 provider"
              className="w-full pl-8 pr-2 py-1.5 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-macos-text-tertiary focus:outline-none focus:border-gray-400"
            />
          </div>

          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false) }}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-gray-50 ${value ? '' : 'bg-gray-50'}`}
            >
              <span className="flex-1 min-w-0 truncate text-macos-text">Agent 默认</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-macos-text-tertiary flex-shrink-0">不指定 --model</span>
              {!value && <Check size={13} className="text-macos-text flex-shrink-0" />}
            </button>

            {loading && <p className="px-2 py-3 text-xs text-macos-text-tertiary">正在读取模型目录…</p>}
            {!loading && visibleGroups.length === 0 && (
              <p className="px-2 py-3 text-xs text-macos-text-tertiary">无匹配模型</p>
            )}

            {visibleGroups.map((g) => (
              <div key={g.provider}>
                <div className="px-2 pt-2 pb-1 text-[10px] tracking-wide text-macos-text-tertiary">{g.provider}</div>
                {g.models.map((m) => {
                  const optionValue = `${g.provider}/${m.id}`
                  const selected = value === optionValue
                  const isPiDefault = defaultModel?.provider === g.provider && defaultModel?.id === m.id
                  return (
                    <button
                      key={optionValue}
                      type="button"
                      onClick={() => { onChange(optionValue); setIsOpen(false) }}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-gray-50 ${selected ? 'bg-gray-50' : ''}`}
                    >
                      <span className="flex-1 min-w-0 truncate text-macos-text">{m.id}</span>
                      {isPiDefault && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-macos-text-secondary flex-shrink-0">pi 默认</span>
                      )}
                      {m.contextWindow ? (
                        <span className="text-[10px] text-macos-text-tertiary flex-shrink-0">{fmtCtx(m.contextWindow)} ctx</span>
                      ) : null}
                      {selected && <Check size={13} className="text-macos-text flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {source && (
            <p className="px-2 pt-2 pb-1 mt-1 text-[10px] text-macos-text-tertiary border-t border-gray-100">
              目录来源 {source.replace(/^.*\/\.pi\//, '~/.pi/')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const StatCard: FC<{ label: string; value: number; tone: string }> = ({ label, value, tone }) => {
  const bar: Record<string, string> = {
    running: 'bg-blue-500', completed: 'bg-green-500', failed: 'bg-red-500', stopped: 'bg-gray-400',
  }
  return (
    <div className="flex-1 rounded-xl border border-gray-100 px-4 py-3 bg-white">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${bar[tone] || bar.stopped}`} />
        <span className="text-xs text-macos-text-tertiary">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-macos-text mt-1">{value}</div>
    </div>
  )
}

// ===== 详情抽屉 =====

const LOG_TABS: { key: 'result' | 'prompt' | 'events'; label: string }[] = [
  { key: 'result', label: '产物' },
  { key: 'prompt', label: '下发的指令' },
  { key: 'events', label: '事件流' },
]

const DispatchDetailDrawer: FC<{
  record: DispatchRecordView | null
  onClose: () => void
  onStop: (instanceId: string) => Promise<void>
}> = ({ record, onClose, onStop }) => {
  const [activeRun, setActiveRun] = useState<string | null>(null)
  const [logTab, setLogTab] = useState<'result' | 'prompt' | 'events'>('result')
  const [logContent, setLogContent] = useState('')
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    setActiveRun(null)
    setLogContent('')
  }, [record?.instance_id, record?.workflow])

  const activeRunView = useMemo<DispatchRunView | null>(() => {
    if (!record) return null
    if (activeRun) return record.runs.find((r) => r.invoke === activeRun) ?? null
    return record.runs[record.runs.length - 1] ?? null
  }, [record, activeRun])

  useEffect(() => {
    let cancelled = false
    const run = activeRunView
    if (!record || !run || !isElectron()) { setLogContent(''); return }
    window.electronAPI!
      .readDispatchRunFile(record.workflow, record.instance_id, run.invoke, logTab)
      .then((res) => {
        if (cancelled) return
        setLogContent(res.success ? (res.content || '') : `（${res.error}）`)
      })
      .catch((e) => { if (!cancelled) setLogContent(String(e)) })
    return () => { cancelled = true }
  }, [record?.instance_id, record?.workflow, activeRunView?.invoke, logTab, record])

  useEffect(() => {
    if (logTab === 'events' && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logContent, logTab])

  return (
    <AnimatePresence>
      {record && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.24 }}
            className="fixed right-0 top-0 h-full w-[560px] bg-white shadow-2xl z-50 flex flex-col"
          >
            <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between flex-shrink-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-md font-medium ${STATUS_PILL[record.status] || STATUS_PILL.stopped}`}>
                    {record.status === 'running' && <Loader2 size={11} className="animate-spin" />}
                    {STATUS_LABEL[record.status] || record.status}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 font-medium">{record.agent?.type || 'pi'}</span>
                </div>
                <h3 className="text-sm font-semibold text-macos-text mt-2 truncate">{record.workflow}</h3>
                <p className="text-xs text-macos-text-tertiary font-mono truncate">{record.instance_id}</p>
              </div>
              <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-macos-text-tertiary flex-shrink-0">
                <X size={16} />
              </button>
            </div>

            <div className="px-6 py-3 grid grid-cols-3 gap-3 border-b border-gray-100 flex-shrink-0">
              <MetaCell label="SESSION" value={record.session_id} mono />
              <MetaCell label="PID" value={String(record.pid)} />
              <MetaCell label="用时" value={durationText(record)} />
              <MetaCell label="步数" value={`${record.steps} 个节点`} />
              <MetaCell label="开始" value={record.started_at} />
              <MetaCell label="结束" value={record.finished_at || '-'} />
            </div>

            {record.last_error && (
              <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-red-50 border border-red-100 flex items-start gap-2 flex-shrink-0">
                <AlertCircle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-600 whitespace-pre-wrap break-all">{record.last_error}</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="text-xs font-medium text-macos-text-tertiary mb-2">节点记录</div>
              <div className="space-y-1">
                {record.runs.map((run) => {
                  const isActive = (activeRunView?.invoke === run.invoke)
                  return (
                    <button
                      key={run.invoke}
                      onClick={() => setActiveRun(run.invoke)}
                      className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left transition-colors ${
                        isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      {run.outcome === 'completed' || run.outcome === 'chosen'
                        ? <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                        : run.outcome === 'rejected'
                          ? <AlertCircle size={13} className="text-orange-500 flex-shrink-0" />
                          : <AlertCircle size={13} className="text-red-500 flex-shrink-0" />}
                      <span className="text-xs text-macos-text truncate flex-1 min-w-0">{run.node}</span>
                      {run.branch && <span className="text-xs text-indigo-600 flex-shrink-0">{run.branch}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${OUTCOME_PILL[run.outcome] || OUTCOME_PILL.aborted}`}>
                        {OUTCOME_LABEL[run.outcome] || run.outcome}
                      </span>
                      {run.attempts > 1 && <span className="text-xs text-macos-text-tertiary flex-shrink-0">×{run.attempts}</span>}
                      <ChevronRight size={13} className="text-macos-text-tertiary flex-shrink-0" />
                    </button>
                  )
                })}
                {record.runs.length === 0 && (
                  <p className="text-xs text-macos-text-tertiary px-2 py-3">还没有节点记录</p>
                )}
              </div>

              {activeRunView && (
                <div className="mt-4">
                  <div className="flex items-center gap-1 mb-2">
                    {LOG_TABS.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setLogTab(tab.key)}
                        className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                          logTab === tab.key ? 'bg-gray-900 text-white' : 'text-macos-text-secondary hover:bg-gray-100'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                    {activeRunView.error && (
                      <span className="text-xs text-orange-600 ml-auto truncate max-w-[240px]" title={activeRunView.error}>
                        {activeRunView.error}
                      </span>
                    )}
                  </div>
                  <pre
                    ref={logRef}
                    className="text-xs leading-relaxed bg-gray-900 text-gray-100 rounded-lg p-3 overflow-auto max-h-[340px] whitespace-pre-wrap break-words font-mono"
                  >
                    {logContent || '（暂无内容）'}
                  </pre>
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
              <span className="text-xs text-macos-text-tertiary flex items-center gap-1">
                <Clock size={12} />
                更新于 {formatRelativeTime(record.updated_at)}
              </span>
              {record.status === 'running' && (
                <Button variant="danger" size="sm" onClick={() => onStop(record.instance_id)}>
                  <Square size={13} className="mr-1.5" />
                  停止
                </Button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

const MetaCell: FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <div className="text-[10px] text-macos-text-tertiary tracking-wide">{label}</div>
    <div className={`text-xs text-macos-text truncate ${mono ? 'font-mono' : ''}`} title={value}>{value || '-'}</div>
  </div>
)

// ===== 新建调度 =====

const NewDispatchModal: FC<{
  isOpen: boolean
  onClose: () => void
  workflows: string[]
  onSubmit: (payload: { workflow: string; input: string; model?: string; nodeTimeoutMs?: number; maxAttempts?: number }) => Promise<{ success: boolean; error?: string }>
}> = ({ isOpen, onClose, workflows, onSubmit }) => {
  const [workflow, setWorkflow] = useState('')
  const [input, setInput] = useState('')
  const [model, setModel] = useState('')
  const [timeoutMin, setTimeoutMin] = useState('30')
  const [maxAttempts, setMaxAttempts] = useState('3')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [modelGroups, setModelGroups] = useState<ModelGroup[]>([])
  const [defaultModel, setDefaultModel] = useState<{ provider: string; id: string } | null>(null)
  const [modelSource, setModelSource] = useState('')
  const [modelsLoading, setModelsLoading] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setWorkflow(workflows[0] || '')
      setInput('')
      setModel('')
      setTimeoutMin('30')
      setMaxAttempts('3')
      setError('')
    }
  }, [isOpen, workflows])

  // 打开弹窗时读取 pi 模型目录（~/.pi/agent/models.json）
  useEffect(() => {
    if (!isOpen || !isElectron()) return
    let cancelled = false
    setModelsLoading(true)
    window.electronAPI!
      .loadPiModels()
      .then((res) => {
        if (cancelled) return
        setModelGroups(res.success ? (res.groups || []) : [])
        setDefaultModel(res.defaultModel || null)
        setModelSource(res.source || '')
      })
      .catch(() => { if (!cancelled) setModelGroups([]) })
      .finally(() => { if (!cancelled) setModelsLoading(false) })
    return () => { cancelled = true }
  }, [isOpen])

  const submit = async () => {
    setError('')
    if (!workflow) { setError('请选择工作流'); return }
    if (!input.trim()) { setError('初始输入不能为空'); return }
    setSubmitting(true)
    const result = await onSubmit({
      workflow,
      input: input.trim(),
      model: model.trim() || undefined,
      nodeTimeoutMs: Math.max(1, Number(timeoutMin) || 30) * 60 * 1000,
      maxAttempts: Math.max(1, Number(maxAttempts) || 3),
    })
    setSubmitting(false)
    if (!result.success) setError(result.error || '启动失败')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="新建调度" size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-macos-text-secondary mb-1.5">工作流</label>
          <Dropdown
            value={workflow}
            onChange={setWorkflow}
            placeholder="选择工作流"
            options={workflows.map((w) => ({ value: w, label: w }))}
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-macos-text-secondary mb-1.5">初始输入</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={4}
            placeholder="这段内容会作为实例的 initial_input，并出现在 start 节点"
            className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg placeholder:text-macos-text-tertiary focus:outline-none focus:border-gray-400 resize-none"
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-macos-text-secondary mb-1.5">Agent</label>
            <div className="px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg text-macos-text-secondary">pi（本地）</div>
          </div>
          <div>
            <label className="block text-xs font-medium text-macos-text-secondary mb-1.5">单节点超时（分钟）</label>
            <input
              value={timeoutMin}
              onChange={(e) => setTimeoutMin(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-macos-text-secondary mb-1.5">审核失败最大重投</label>
            <input
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-macos-text-secondary mb-1.5">模型（可选，留空用 agent 默认）</label>
          <ModelPicker
            value={model}
            onChange={setModel}
            groups={modelGroups}
            defaultModel={defaultModel}
            loading={modelsLoading}
            source={modelSource}
          />
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600 whitespace-pre-wrap">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="h-[38px] py-0">取消</Button>
          <Button
            variant="outline"
            onClick={submit}
            disabled={submitting}
            className="h-[38px] bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-4 py-0 text-sm"
          >
            {submitting && <Loader2 size={14} className="mr-1.5 animate-spin" />}
            启动
          </Button>
        </div>
      </div>
    </Modal>
  )
}