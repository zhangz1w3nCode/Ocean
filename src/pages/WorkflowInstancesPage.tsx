import type { FC } from 'react'
import { useState, useEffect, useCallback, useRef, memo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, RefreshCw, Activity, FileText, Package, ChevronRight, ChevronLeft, Clock, Hash, GitBranch, Repeat, RotateCcw, Maximize2, X, Radio, ChevronUp, ChevronDown, CircleDot, ListOrdered, Files, Terminal } from 'lucide-react'
import { Button, Dropdown, MarkdownRenderer, Modal } from '../components/ui'
import ReactDiffViewer from 'react-diff-viewer-continued'
import { useWorkflowInstanceStore } from '../stores/workflowInstanceStore'
import type { WorkflowInstance, InstanceTraceEvent, InstanceArtifact } from '../types'
import { formatStatus, formatRelativeTime } from '../utils/format'
import { INSTANCE_STATUSES, instanceStatusOfInstance, instanceStatusOfDetail } from '../utils/instanceStatus'
import { InstanceFlowGraph } from '../components/workflow'

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const MIN_W = 600, MIN_H = 300
const resizeCursors: Record<ResizeDirection, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }

// 实例整体状态（三态）配色；TraceTable 复用时，节点级 active/failed 没命中则走 unknown
const statusColors: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  running: 'bg-blue-50 text-blue-600',
  completed: 'bg-green-50 text-green-600',
  unknown: 'bg-gray-100 text-gray-500',
}

const typeColors: Record<string, string> = {
  start: 'bg-green-50 text-green-600',
  end: 'bg-red-50 text-red-600',
  process: 'bg-blue-50 text-blue-600',
  decision: 'bg-amber-50 text-amber-600',
  business: 'bg-purple-50 text-purple-600',
  local: 'bg-gray-100 text-gray-500',
}

const statusDotColors: Record<string, string> = {
  pending: 'bg-gray-400',
  running: 'bg-blue-500',
  completed: 'bg-green-500',
  unknown: 'bg-gray-400',
}


// ===== 列表视图 =====

const InstanceList: FC = () => {
  const { instances, isLoaded, loadInstances, selectInstance } = useWorkflowInstanceStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterWorkflow, setFilterWorkflow] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc')

  useEffect(() => {
    loadInstances()
  }, [loadInstances])

  const workflowNames = [...new Set(instances.map(i => i.workflowName))]
  const statusOptions = [...INSTANCE_STATUSES]

  const filtered = instances.filter((inst) => {
    if (filterWorkflow && inst.workflowName !== filterWorkflow) return false
    // 实例状态不直接用引擎原始值，而是在展示层由 status + step + completedNodes 投影成三态
    const st = instanceStatusOfInstance(inst)
    if (filterStatus && st !== filterStatus) return false
    const q = searchQuery.toLowerCase()
    return inst.instanceId.toLowerCase().includes(q) ||
      inst.workflowName.toLowerCase().includes(q) ||
      st.toLowerCase().includes(q) ||
      formatStatus(st).includes(searchQuery) ||
      (inst.initialInput || '').toLowerCase().includes(q)
  }).sort((a, b) => {
    const cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    return sortOrder === 'desc' ? -cmp : cmp
  })

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-2.5">
          <Dropdown
            value={filterWorkflow}
            onChange={setFilterWorkflow}
            placeholder="全部工作流"
            options={[
              { value: '', label: '全部工作流' },
              ...workflowNames.map(name => ({ value: name, label: name })),
            ]}
          />
          <Dropdown
            value={filterStatus}
            onChange={setFilterStatus}
            placeholder="全部状态"
            options={[
              { value: '', label: '全部状态' },
              ...statusOptions.map(s => ({ value: s, label: formatStatus(s) })),
            ]}
          />
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
            <input
              type="text"
              placeholder="搜索"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-48 text-sm bg-white border border-gray-200 rounded-lg
                         placeholder:text-macos-text-tertiary focus:outline-none
                         hover:border-gray-300 focus:border-gray-400
                         focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]
                         transition-[border-color,box-shadow] duration-200"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => loadInstances()}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-2 text-sm"
          >
            <RefreshCw size={16} className="flex-shrink-0" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length > 0 ? (
          <div className="w-full">
            <div className="flex items-center px-3 py-2.5 gap-4 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
              <span className="flex-1 min-w-0 text-center">实例ID</span>
              <span className="flex-1 min-w-0 text-center">工作流</span>
              <span className="flex-1 min-w-0 text-center">输入信息</span>
              <span className="flex-1 min-w-0 text-center">状态</span>
              <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="flex-1 min-w-0 flex items-center justify-center gap-1 cursor-pointer hover:text-macos-text transition-colors">
                创建时间
                {sortOrder === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
            </div>
            {filtered.map((inst) => (
              <div
                key={`${inst.workflowName}-${inst.instanceId}`}
                className="flex items-center px-3 py-3 gap-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer group"
                onClick={() => selectInstance(inst)}
              >
                <div className="flex-1 min-w-0 flex items-center justify-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColors[instanceStatusOfInstance(inst)] || statusDotColors.unknown}`} />
                  <span className="text-xs font-mono text-macos-text truncate">{inst.instanceId}</span>
                </div>
                <span className="flex-1 min-w-0 text-sm text-macos-text truncate text-center">{inst.workflowName}</span>
                <span className="flex-1 min-w-0 text-xs text-macos-text-secondary truncate text-center" title={inst.initialInput || ''}>
                  {inst.initialInput || '-'}
                </span>
                <div className="flex-1 min-w-0 flex justify-center">
                  <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusColors[instanceStatusOfInstance(inst)] || statusColors.unknown}`}>
                    {formatStatus(instanceStatusOfInstance(inst))}
                  </span>
                </div>
                <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center">
                  {formatRelativeTime(inst.createdAt)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
              <Activity size={32} className="text-macos-text-tertiary" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-macos-text-tertiary mt-4">暂无工作流实例</p>
            <p className="text-xs text-macos-text-tertiary mt-1">Agent 使用工作流后将在此显示</p>
          </div>
        )}
      </div>
    </>
  )
}

// ===== 详情视图 =====

const DetailField: FC<{ icon: typeof Hash; label: string; children: React.ReactNode }> = ({ icon: Icon, label, children }) => (
  <div className="flex items-center gap-2">
    <Icon size={14} className="text-macos-text-tertiary flex-shrink-0" strokeWidth={1.5} />
    <span className="text-xs text-macos-text-tertiary w-14 flex-shrink-0">{label}</span>
    <span className="text-sm text-macos-text truncate">{children}</span>
  </div>
)

const typeLabels: Record<string, string> = { start: '开始', end: '结束', business: '业务', decision: '决策', process: '处理', local: '局部' }

function formatDuration(start: string, end: string): string {
  if (!start || !end) return '-'
  const diff = new Date(end).getTime() - new Date(start).getTime()
  if (isNaN(diff) || diff < 0) return '-'
  if (diff < 1000) return `${diff}ms`
  if (diff < 60000) return `${Math.round(diff / 1000)}s`
  const m = Math.floor(diff / 60000)
  const s = Math.round((diff % 60000) / 1000)
  return `${m}m${s}s`
}

function formatDurationMs(start: string, end: string): number {
  if (!start || !end) return 0
  const diff = new Date(end).getTime() - new Date(start).getTime()
  return isNaN(diff) || diff < 0 ? 0 : diff
}


const TraceTable = memo(({ trace, artifacts, flowData, onViewArtifact }: { trace: InstanceTraceEvent[]; artifacts: InstanceArtifact[]; flowData: { nodes: any[]; edges: any[] } | null; onViewArtifact?: (art: InstanceArtifact, nodeName: string, allArts: InstanceArtifact[]) => void }) => {
  const [sortCol, setSortCol] = useState<'time' | 'duration'>('time')
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('asc')

  const handleSort = (col: 'time' | 'duration') => {
    if (sortCol === col) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortOrder('desc')
    }
  }

  const sorted = [...trace].sort((a, b) => {
    if (!sortCol) return 0
    if (sortCol === 'time') {
      const cmp = new Date(a.time).getTime() - new Date(b.time).getTime()
      return sortOrder === 'desc' ? -cmp : cmp
    }
    if (sortCol === 'duration') {
      const da = formatDurationMs(a.time, a.completedTime || '')
      const db = formatDurationMs(b.time, b.completedTime || '')
      const cmp = da - db
      return sortOrder === 'desc' ? -cmp : cmp
    }
    return 0
  })

  const sortIcon = (col: 'time' | 'duration') => sortCol === col ? (sortOrder === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />) : null

  return (
  <div className="w-full">
    <div className="flex items-center px-3 py-2.5 gap-4 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
      <span className="flex-1 min-w-0 text-center">节点</span>
      <span className="flex-1 min-w-0 text-center">类型</span>
      <span className="flex-1 min-w-0 text-center">状态</span>
      <span className="flex-1 min-w-0 text-center">执行ID</span>
      <button onClick={() => handleSort('time')} className="flex-1 min-w-0 flex items-center justify-center gap-1 cursor-pointer hover:text-macos-text transition-colors">执行时间{sortIcon('time')}</button>
      <span className="flex-1 min-w-0 text-center">完成时间</span>
      <button onClick={() => handleSort('duration')} className="flex-1 min-w-0 flex items-center justify-center gap-1 cursor-pointer hover:text-macos-text transition-colors">耗时{sortIcon('duration')}</button>
      <span className="flex-1 min-w-0 text-center">产物</span>
    </div>
    {sorted.map((evt, i) => {
      const art = artifacts.find(a => a.nodeName === evt.node && a.invokeId === evt.invoke)
      const flowNode = flowData?.nodes?.find(n => n.data?.label === evt.node)
      const nodeType = flowNode ? (typeLabels[flowNode.type] || flowNode.type) : '-'
      const duration = formatDuration(evt.time, evt.completedTime || '')
      return (
        <div key={i} className="flex items-center px-3 py-3 gap-4 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <span className="flex-1 min-w-0 text-xs text-macos-text truncate text-center" title={evt.node}>
            {evt.node}
            {evt.branch && <span className="text-macos-text-tertiary ml-1">({evt.branch})</span>}
          </span>
          <div className="flex-1 min-w-0 flex justify-center">
            {flowNode ? (
              <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${typeColors[flowNode.type] || 'bg-gray-100 text-gray-500'}`}>{nodeType}</span>
            ) : (
              <span className="text-xs text-macos-text-tertiary">-</span>
            )}
          </div>
          <div className="flex-1 min-w-0 flex justify-center">
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusColors[evt.status] || statusColors.unknown}`}>
              {formatStatus(evt.status)}
            </span>
          </div>
          <span className="flex-1 min-w-0 text-xs font-mono text-macos-text-tertiary truncate text-center" title={evt.invoke}>{evt.invoke}</span>
          <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center">{evt.time}</span>
          <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center">{evt.completedTime || '-'}</span>
          <span className="flex-1 min-w-0 text-xs text-macos-text-tertiary text-center">{duration}</span>
          <div className="flex-1 min-w-0 flex justify-center">
            {art ? (
              <button onClick={() => {
                const nodeArts = artifacts.filter(a => a.nodeName === evt.node)
                onViewArtifact?.(art, evt.node, nodeArts)
              }} className="text-xs text-blue-500 hover:text-blue-600 hover:underline cursor-pointer">查看</button>
            ) : (
              <span className="text-xs text-macos-text-tertiary">-</span>
            )}
          </div>
        </div>
      )
    })}
  </div>
  )
})

const ArtifactList = memo(({ artifacts, selected, onSelect }: { artifacts: InstanceArtifact[]; selected: InstanceArtifact | null; onSelect: (a: InstanceArtifact | null) => void }) => (
    <div className="flex flex-col gap-1.5">
      {artifacts.map((art, i) => (
        <button
          key={i}
          onClick={() => onSelect(selected === art ? null : art)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${
            selected === art
              ? 'border-gray-300 bg-gray-100'
              : 'border-gray-100 hover:bg-gray-50 hover:border-gray-200'
          }`}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
          <span className="text-sm text-macos-text truncate flex-1 min-w-0">{art.nodeName}</span>
          <span className="text-[10px] font-mono text-macos-text-tertiary flex-shrink-0">{art.invokeId.replace('invoke-', '')} {art.version}</span>
        </button>
      ))}
    </div>
  )
)

const InstanceDetail: FC = () => {
  const { selectedInstance, detail, isLoadingDetail, selectedArtifact, selectInstance, selectArtifact, clearDetail, isLiveRefresh, startLiveRefresh, stopLiveRefresh } = useWorkflowInstanceStore()
  const [isFlowFullscreen, setIsFlowFullscreen] = useState(false)
  const [isContextFullscreen, setIsContextFullscreen] = useState(false)
  const [diffData, setDiffData] = useState<{
    nodeName: string; arts: InstanceArtifact[];
    fromInvoke: string; fromVersion: string;
    toInvoke: string; toVersion: string;
  } | null>(null)
  const [detailArts, setDetailArts] = useState<InstanceArtifact[] | null>(null)
  const [detailNodeName, setDetailNodeName] = useState('')
  const [detailInvoke, setDetailInvoke] = useState('')
  const [detailVersion, setDetailVersion] = useState('')
  const [artifactSearch, setArtifactSearch] = useState('')
  const [flowPos, setFlowPos] = useState({ x: Math.max(16, (window.innerWidth - 1000) / 2), y: 60 })
  const [flowDim, setFlowDim] = useState({ width: Math.min(1000, window.innerWidth - 32), height: Math.min(600, window.innerHeight - 80) })
  const [isFlowMax, setIsFlowMax] = useState(false)
  const [isFlowDragging, setIsFlowDragging] = useState(false)
  const flowDragData = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  const flowResizeData = useRef<{ direction: ResizeDirection; startX: number; startY: number; startW: number; startH: number; posX: number; posY: number } | null>(null)
  const flowPrevLayout = useRef<{ pos: { x: number; y: number }; dim: { width: number; height: number } } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFlowFullscreen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); stopLiveRefresh() }
  }, [])

  // 拖动移动
  const handleFlowDragStart = useCallback((e: React.MouseEvent) => {
    if (isFlowMax) return
    e.preventDefault()
    setIsFlowDragging(true)
    flowDragData.current = { startX: e.clientX, startY: e.clientY, posX: flowPos.x, posY: flowPos.y }
    const prevCursor = document.body.style.cursor
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      if (!flowDragData.current) return
      const d = flowDragData.current
      setFlowPos({ x: ev.clientX - d.startX + d.posX, y: Math.max(40, ev.clientY - d.startY + d.posY) })
    }
    const onUp = () => {
      flowDragData.current = null; setIsFlowDragging(false)
      document.body.style.cursor = prevCursor; document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [flowPos.x, flowPos.y, isFlowMax])

  // 边框缩放
  const handleFlowResizeStart = useCallback((dir: ResizeDirection) => (e: React.MouseEvent) => {
    if (isFlowMax) return
    e.preventDefault(); e.stopPropagation()
    flowResizeData.current = { direction: dir, startX: e.clientX, startY: e.clientY, startW: flowDim.width, startH: flowDim.height, posX: flowPos.x, posY: flowPos.y }
    const prevCursor = document.body.style.cursor; const prevSelect = document.body.style.userSelect
    document.body.style.cursor = resizeCursors[dir]; document.body.style.userSelect = 'none'
    const onMove = (ev: MouseEvent) => {
      if (!flowResizeData.current) return
      const d = flowResizeData.current; const dx = ev.clientX - d.startX; const dy = ev.clientY - d.startY
      let w = d.startW, h = d.startH, x = d.posX, y = d.posY
      if (dir.includes('e')) w = Math.min(window.innerWidth - 32, Math.max(MIN_W, d.startW + dx))
      if (dir.includes('w')) { w = Math.min(d.startW + d.posX - 16, Math.max(MIN_W, d.startW - dx)); x = d.posX + (d.startW - w) }
      if (dir.includes('s')) h = Math.min(window.innerHeight - d.posY - 16, Math.max(MIN_H, d.startH + dy))
      if (dir.includes('n')) { h = Math.max(MIN_H, d.startH - dy); y = Math.max(40, d.posY + (d.startH - h)) }
      setFlowDim({ width: w, height: h }); setFlowPos({ x, y })
    }
    const onUp = () => {
      flowResizeData.current = null
      document.body.style.cursor = prevCursor; document.body.style.userSelect = prevSelect
      document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [flowDim.width, flowDim.height, flowPos.x, flowPos.y, isFlowMax])

  // 双击全屏/恢复
  const handleFlowDoubleClick = useCallback(() => {
    if (isFlowMax) {
      if (flowPrevLayout.current) { setFlowPos(flowPrevLayout.current.pos); setFlowDim(flowPrevLayout.current.dim) }
      setIsFlowMax(false)
    } else {
      flowPrevLayout.current = { pos: { ...flowPos }, dim: { ...flowDim } }
      setFlowPos({ x: 16, y: 40 })
      setFlowDim({ width: window.innerWidth - 32, height: window.innerHeight - 56 })
      setIsFlowMax(true)
    }
  }, [isFlowMax, flowPos, flowDim])

  // 点击放大：直接以全屏尺寸打开浮窗（同时缓存窗口态，双击标题栏可回退到普通窗口尺寸）
  const openFlowFullscreen = useCallback(() => {
    flowPrevLayout.current = {
      pos: { x: Math.max(16, (window.innerWidth - 1000) / 2), y: 60 },
      dim: { width: Math.min(1000, window.innerWidth - 32), height: Math.min(600, window.innerHeight - 80) },
    }
    setFlowPos({ x: 16, y: 40 })
    setFlowDim({ width: window.innerWidth - 32, height: window.innerHeight - 56 })
    setIsFlowMax(true)
    setIsFlowFullscreen(true)
  }, [])

  if (!selectedInstance) return null
  const inst = selectedInstance
  // 详情已加载时用详情原始值，否则用列表项原始值；两者均为引擎态，统一在展示层投影
  const instStatus = detail ? instanceStatusOfDetail(detail) : instanceStatusOfInstance(inst)

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-between">
        <button
          onClick={() => clearDetail()}
          className="p-1.5 rounded-lg text-macos-text-secondary hover:text-macos-text hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft size={16} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => isLiveRefresh ? stopLiveRefresh() : startLiveRefresh()}
          title={isLiveRefresh ? '实时刷新中' : '实时刷新'}
          className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
            isLiveRefresh
              ? 'bg-green-50 text-green-600'
              : 'text-macos-text-secondary hover:text-macos-text hover:bg-gray-100'
          }`}
        >
          <motion.span
            animate={isLiveRefresh ? { scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] } : { scale: 1, opacity: 1 }}
            transition={isLiveRefresh ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.2 }}
          >
            <Radio size={20} strokeWidth={1.5} />
          </motion.span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="w-full">

          {isLoadingDetail ? (
            <div className="py-20 text-center">
              <p className="text-sm text-macos-text-tertiary">加载中...</p>
            </div>
          ) : detail ? (
            <div className="grid grid-cols-2 gap-4 items-stretch">
              {/* 基本信息 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-sm font-bold text-macos-text mb-3">基本信息</div>
                <div className="flex flex-col gap-2.5">
                  <DetailField icon={CircleDot} label="状态"><span className={`text-xs px-2 py-0.5 rounded-md font-medium ${statusColors[instStatus] || statusColors.unknown}`}>{formatStatus(instStatus)}</span></DetailField>
                  <DetailField icon={GitBranch} label="工作流">{inst.workflowName}</DetailField>
                  <DetailField icon={Hash} label="实例ID"><span className="font-mono text-xs">{inst.instanceId}</span></DetailField>
                  <DetailField icon={Clock} label="创建">{formatRelativeTime(inst.createdAt)}</DetailField>
                  <DetailField icon={ListOrdered} label="步骤">{detail.wfStep ?? 0}</DetailField>
                  <DetailField icon={Repeat} label="循环">{detail.wfLoopCount ?? 0}</DetailField>
                  <DetailField icon={RotateCcw} label="重试">{detail.wfRetryCount ?? 0}</DetailField>
                  <DetailField icon={Files} label="产物">{detail.artifacts.length}</DetailField>
                </div>
              </div>

              {/* 执行进度 */}
              {detail.flowData && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-macos-text">执行进度</span>
                    <button
                      onClick={openFlowFullscreen}
                      className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors"
                    >
                      <Maximize2 size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <InstanceFlowGraph
                    traceLog={detail.traceLog}
                    flowData={detail.flowData}
                    completedNodes={detail.completedNodes}
                    currentName={detail.currentName}
                    wfStatus={detail.wfStatus}
                    artifacts={detail.artifacts}
                  />
                </div>
              )}

              {/* 用户输入 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="text-sm font-bold text-macos-text mb-3">用户输入</div>
                <div className="max-h-200 overflow-y-auto">
                  {inst.initialInput ? (
                    <MarkdownRenderer content={inst.initialInput} className="text-sm" />
                  ) : (
                    <p className="text-sm text-macos-text-tertiary text-center py-8">暂无用户输入</p>
                  )}
                </div>
              </div>

              {/* 产物 */}
              {detail.artifacts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-bold text-macos-text">产物</span>
                    <div className="relative">
                      <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
                      <input
                        type="text"
                        placeholder="搜索产物内容"
                        value={artifactSearch}
                        onChange={(e) => setArtifactSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 w-48 text-xs bg-white border border-gray-200 rounded-lg placeholder:text-macos-text-tertiary focus:outline-none hover:border-gray-300 focus:border-gray-400 transition-[border-color] duration-200"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(
                      detail.artifacts.reduce((acc, art) => {
                        if (!acc[art.nodeName]) acc[art.nodeName] = []
                        acc[art.nodeName].push(art)
                        return acc
                      }, {} as Record<string, InstanceArtifact[]>)
                    ).filter(([nodeName, arts]) => {
                      if (!artifactSearch) return true
                      const q = artifactSearch.toLowerCase()
                      return nodeName.toLowerCase().includes(q) || arts.some(a => a.content.toLowerCase().includes(q))
                    }).map(([nodeName, arts]) => {
                      const flowNode = detail.flowData?.nodes?.find(n => n.data?.label === nodeName)
                      const nodeType = flowNode ? (typeLabels[flowNode.type] || flowNode.type) : '-'
                      const isMatched = artifactSearch && (nodeName.toLowerCase().includes(artifactSearch.toLowerCase()) || arts.some(a => a.content.toLowerCase().includes(artifactSearch.toLowerCase())))
                      return (
                        <div key={nodeName} className={`rounded-lg border p-3 transition-colors cursor-pointer ${isMatched ? 'border-blue-300 bg-blue-50/30' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50/50'}`} onClick={() => {
                          setDetailArts(arts)
                          setDetailNodeName(nodeName)
                          const byInvoke = new Map<string, InstanceArtifact[]>()
                          for (const art of arts) {
                            const list = byInvoke.get(art.invokeId) || []
                            list.push(art)
                            byInvoke.set(art.invokeId, list)
                          }
                          const invokeIds = [...byInvoke.keys()].sort((a, b) => b.localeCompare(a))
                          const latestInvoke = invokeIds[0] || ''
                          const latestArts = (byInvoke.get(latestInvoke) || []).sort((a, b) => (parseInt(a.version.slice(1), 10) || 0) - (parseInt(b.version.slice(1), 10) || 0))
                          setDetailInvoke(latestInvoke)
                          setDetailVersion(latestArts[latestArts.length - 1]?.version || 'v1')
                        }}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-macos-text truncate">{nodeName}</span>
                            {flowNode && <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${typeColors[flowNode.type] || 'bg-gray-100 text-gray-500'}`}>{nodeType}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 时间线 */}
              {detail.trace.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 col-span-2">
                  <div className="text-sm font-bold text-macos-text mb-3">时间线</div>
                  <TraceTable trace={detail.trace} artifacts={detail.artifacts} flowData={detail.flowData} onViewArtifact={(art, nodeName, allArts) => {
                    setDetailArts(allArts)
                    setDetailNodeName(nodeName)
                    setDetailInvoke(art.invokeId)
                    setDetailVersion(art.version)
                  }} />
                </div>
              )}

              {/* 上下文 — 独占一行 */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 col-span-2">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-bold text-macos-text">上下文</span>
                  {detail.contextMd && (
                  <button
                    onClick={() => setIsContextFullscreen(true)}
                    className="p-1 rounded-md text-macos-text-tertiary hover:text-macos-text hover:bg-gray-100 transition-colors"
                  >
                    <Maximize2 size={14} strokeWidth={1.5} />
                  </button>
                  )}
                </div>
                <div className="max-h-200 overflow-y-auto">
                  {detail.contextMd ? (
                    <MarkdownRenderer content={detail.contextMd} className="text-sm" />
                  ) : (
                    <p className="text-sm text-macos-text-tertiary text-center py-8">暂无上下文</p>
                  )}
                </div>
              </div>

              {/* 选中产物弹框 — 复用项目 Modal 组件（拖拽/缩放/双击全屏） */}
              {/* 产物详情弹框 */}
              {detailArts && (() => {
                const arts = detailArts
                const invokeIds = [...new Set(arts.map(a => a.invokeId))].sort((a, b) => b.localeCompare(a))
                const versions = arts.filter(a => a.invokeId === detailInvoke).map(a => a.version).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
                const current = arts.find(a => a.invokeId === detailInvoke && a.version === detailVersion)
                return (
                  <Modal isOpen={true} onClose={() => setDetailArts(null)} title={detailNodeName} size="lg" layoutKey="instance-artifact" persistLayout>
                    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                      <span className="text-base text-macos-text-tertiary flex-shrink-0">Invoke-Id</span>
                      <Dropdown
                        value={detailInvoke}
                        onChange={(v) => {
                          setDetailInvoke(v)
                          const vList = arts.filter(a => a.invokeId === v).map(a => a.version).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
                          setDetailVersion(vList[vList.length - 1] || 'v1')
                        }}
                        options={invokeIds.map(inv => ({ value: inv, label: inv.replace('invoke-', '').slice(-8) }))}
                        placeholder="Invoke"
                        className="min-w-[120px]"
                      />
                      <span className="text-base text-macos-text-tertiary flex-shrink-0">Version</span>
                      <Dropdown
                        value={detailVersion}
                        onChange={setDetailVersion}
                        options={versions.map(v => ({ value: v, label: v }))}
                        placeholder="Version"
                        className="min-w-[80px]"
                      />
                      {arts.length >= 2 && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const byInvoke = new Map<string, InstanceArtifact[]>()
                            for (const art of arts) {
                              const list = byInvoke.get(art.invokeId) || []
                              list.push(art)
                              byInvoke.set(art.invokeId, list)
                            }
                            const invIds = [...byInvoke.keys()].sort().reverse()
                            const latestInv = invIds[0]
                            const latestArts = (byInvoke.get(latestInv) || []).sort((a, b) => parseInt(a.version.slice(1), 10) - parseInt(b.version.slice(1), 10))
                            const fromVer = latestArts.length >= 2 ? latestArts[latestArts.length - 2].version : latestArts[0].version
                            const toVer = latestArts[latestArts.length - 1].version
                            setDiffData({
                              nodeName: detailNodeName, arts,
                              fromInvoke: latestInv, fromVersion: fromVer,
                              toInvoke: latestInv, toVersion: toVer,
                            })
                          }}
                          className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg py-1.5 px-3 text-xs ml-auto flex items-center gap-1.5"
                        >
                          <GitBranch size={14} className="flex-shrink-0" />
                          查看节点变化
                        </Button>
                      )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      {current ? (
                        <MarkdownRenderer content={current.content} className="text-sm" />
                      ) : (
                        <p className="text-sm text-macos-text-tertiary text-center py-8">未找到产物</p>
                      )}
                    </div>
                  </Modal>
                )
              })()}
              {/* 产物 diff 弹框 */}
              {diffData && (() => {
                const arts = diffData.arts
                const invokeIds = [...new Set(arts.map(a => a.invokeId))].sort((a, b) => b.localeCompare(a))
                const fromVersions = arts.filter(a => a.invokeId === diffData.fromInvoke).map(a => a.version).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
                const toVersions = arts.filter(a => a.invokeId === diffData.toInvoke).map(a => a.version).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
                const fromArt = arts.find(a => a.invokeId === diffData.fromInvoke && a.version === diffData.fromVersion)
                const toArt = arts.find(a => a.invokeId === diffData.toInvoke && a.version === diffData.toVersion)
                return (
                  <Modal isOpen={true} onClose={() => setDiffData(null)} title={`产物对比 - ${diffData.nodeName}`} size="xl" layoutKey="instance-diff" persistLayout>
                    <div className="flex-1 flex flex-col min-h-0">
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-100 flex-shrink-0 flex-wrap">
                        <span className="text-base text-macos-text-tertiary flex-shrink-0">Invoke-Id</span>
                        <Dropdown
                          value={diffData.fromInvoke}
                          onChange={(v) => {
                            const vList = arts.filter(a => a.invokeId === v).map(a => a.version).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
                            setDiffData({...diffData, fromInvoke: v, fromVersion: vList[vList.length - 1] || 'v1'})
                          }}
                          options={invokeIds.map(inv => ({ value: inv, label: inv.replace('invoke-', '').slice(-8) }))}
                          placeholder="From Invoke"
                          className="min-w-[120px]"
                        />
                        <span className="text-base text-macos-text-tertiary flex-shrink-0">Version</span>
                        <Dropdown
                          value={diffData.fromVersion}
                          onChange={(v) => setDiffData({...diffData, fromVersion: v})}
                          options={fromVersions.map(v => ({ value: v, label: v }))}
                          placeholder="From Version"
                          className="min-w-[80px]"
                        />
                        <ChevronRight size={14} className="text-macos-text-tertiary flex-shrink-0" />
                        <span className="text-base text-macos-text-tertiary flex-shrink-0">Invoke-Id</span>
                        <Dropdown
                          value={diffData.toInvoke}
                          onChange={(v) => {
                            const vList = arts.filter(a => a.invokeId === v).map(a => a.version).sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10))
                            setDiffData({...diffData, toInvoke: v, toVersion: vList[vList.length - 1] || 'v1'})
                          }}
                          options={invokeIds.map(inv => ({ value: inv, label: inv.replace('invoke-', '').slice(-8) }))}
                          placeholder="To Invoke"
                          className="min-w-[120px]"
                        />
                        <span className="text-base text-macos-text-tertiary flex-shrink-0">Version</span>
                        <Dropdown
                          value={diffData.toVersion}
                          onChange={(v) => setDiffData({...diffData, toVersion: v})}
                          options={toVersions.map(v => ({ value: v, label: v }))}
                          placeholder="To Version"
                          className="min-w-[80px]"
                        />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto">
                        <ReactDiffViewer
                          oldValue={fromArt?.content || ''}
                          newValue={toArt?.content || ''}
                          splitView={true}
                          useDarkTheme={false}
                          hideLineNumbers={false}
                          styles={{ contentText: { fontSize: '12px', fontFamily: 'monospace' } }}
                        />
                      </div>
                    </div>
                  </Modal>
                )
              })()}
            </div>
          ) : (
            <div className="py-20 text-center">
              <p className="text-sm text-macos-text-tertiary">无法加载详情数据</p>
            </div>
          )}
        </div>
      </div>

      {/* 浮动窗口 — 可拖动/缩放/双击全屏 */}
      <AnimatePresence>
        {isFlowFullscreen && detail?.flowData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              left: flowPos.x,
              top: flowPos.y,
              width: flowDim.width,
              height: flowDim.height,
            }}
            className="fixed z-[60] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
          >
            {/* 工具栏 — 拖动区域 + 双击全屏 */}
            <div
              onMouseDown={handleFlowDragStart}
              onDoubleClick={handleFlowDoubleClick}
              className={`flex items-center justify-between px-6 h-14 flex-shrink-0 border-b border-gray-100 ${isFlowDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <Activity size={16} className="text-macos-text-secondary" strokeWidth={1.5} />
                <span className="text-sm font-medium text-macos-text">执行进度</span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setIsFlowFullscreen(false) }}
                className="p-2 rounded-lg text-macos-text-secondary hover:text-macos-text hover:bg-gray-100 transition-colors"
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            {/* 画布 */}
            <div className="flex-1 overflow-hidden bg-gray-50">
              <InstanceFlowGraph
                traceLog={detail!.traceLog}
                flowData={detail!.flowData}
                completedNodes={detail!.completedNodes}
                currentName={detail!.currentName}
                wfStatus={detail!.wfStatus}
                artifacts={detail!.artifacts}
                fullHeight
              />
            </div>

            {/* 缩放手柄 — 四边 */}
            <div onMouseDown={handleFlowResizeStart('n')} className="absolute top-0 left-3 right-3 h-1.5 cursor-ns-resize z-20" />
            <div onMouseDown={handleFlowResizeStart('s')} className="absolute bottom-0 left-3 right-3 h-1.5 cursor-ns-resize z-20" />
            <div onMouseDown={handleFlowResizeStart('w')} className="absolute left-0 top-3 bottom-3 w-1.5 cursor-ew-resize z-20" />
            <div onMouseDown={handleFlowResizeStart('e')} className="absolute right-0 top-3 bottom-3 w-1.5 cursor-ew-resize z-20" />
            {/* 缩放手柄 — 四角 */}
            <div onMouseDown={handleFlowResizeStart('nw')} className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-20" />
            <div onMouseDown={handleFlowResizeStart('ne')} className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-20" />
            <div onMouseDown={handleFlowResizeStart('sw')} className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-20" />
            <div onMouseDown={handleFlowResizeStart('se')} className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize z-20" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 上下文全屏浮窗 */}
      <AnimatePresence>
        {isContextFullscreen && detail?.contextMd && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            style={{ position: 'fixed', left: 16, top: 40, width: 'calc(100vw - 32px)', height: 'calc(100vh - 56px)' }}
            className="fixed z-[60] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden pointer-events-auto"
          >
            <div className="flex items-center justify-between px-6 h-14 flex-shrink-0 border-b border-gray-100 cursor-default">
              <span className="text-sm font-medium text-macos-text">上下文</span>
              <button onClick={() => setIsContextFullscreen(false)} className="p-2 rounded-lg text-macos-text-secondary hover:text-macos-text hover:bg-gray-100 transition-colors">
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <MarkdownRenderer content={detail.contextMd} className="text-sm" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ===== 主组件 =====

export const WorkflowInstancesPage: FC = () => {
  const { selectedInstance } = useWorkflowInstanceStore()

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={selectedInstance ? 'detail' : 'list'}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        {selectedInstance ? <InstanceDetail /> : <InstanceList />}
      </motion.div>
    </AnimatePresence>
  )
}
