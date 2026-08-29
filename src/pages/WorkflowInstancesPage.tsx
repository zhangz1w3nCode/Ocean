import type { FC } from 'react'
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, RefreshCw, Activity, FileText, Package, ChevronRight, ChevronLeft, Clock, Hash, GitBranch, Repeat, RotateCcw, Maximize2, X, Radio, ChevronUp, ChevronDown, CircleDot, ListOrdered, Files, Terminal } from 'lucide-react'
import { Button, Dropdown, MarkdownRenderer, Modal } from '../components/ui'
import { InstanceFlowGraph } from '../components/workflow'
import { useWorkflowInstanceStore } from '../stores/workflowInstanceStore'
import type { WorkflowInstance, InstanceTraceEvent, InstanceArtifact } from '../types'
import { formatStatus, formatRelativeTime } from '../utils/format'

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const MIN_W = 600, MIN_H = 300
const resizeCursors: Record<ResizeDirection, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }

const statusColors: Record<string, string> = {
  completed: 'bg-green-50 text-green-600',
  executing: 'bg-blue-50 text-blue-600',
  awaitingchoice: 'bg-amber-50 text-amber-600',
  awaiting_choice: 'bg-amber-50 text-amber-600',
  aborted: 'bg-red-50 text-red-600',
  idle: 'bg-gray-100 text-gray-500',
  unknown: 'bg-gray-100 text-gray-500',
}

const statusDotColors: Record<string, string> = {
  completed: 'bg-green-500',
  executing: 'bg-blue-500',
  awaitingchoice: 'bg-amber-500',
  awaiting_choice: 'bg-amber-500',
  aborted: 'bg-red-500',
  idle: 'bg-gray-400',
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
  const statusOptions = ['completed', 'executing', 'awaitingchoice', 'aborted', 'idle', 'active']

  const filtered = instances.filter((inst) => {
    if (filterWorkflow && inst.workflowName !== filterWorkflow) return false
    if (filterStatus && inst.status !== filterStatus) return false
    const q = searchQuery.toLowerCase()
    return inst.instanceId.toLowerCase().includes(q) ||
      inst.workflowName.toLowerCase().includes(q) ||
      inst.status.toLowerCase().includes(q) ||
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
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDotColors[inst.status] || statusDotColors.unknown}`} />
                  <span className="text-xs font-mono text-macos-text truncate">{inst.instanceId}</span>
                </div>
                <span className="flex-1 min-w-0 text-sm text-macos-text truncate text-center">{inst.workflowName}</span>
                <span className="flex-1 min-w-0 text-xs text-macos-text-secondary truncate text-center" title={inst.initialInput || ''}>
                  {inst.initialInput || '-'}
                </span>
                <div className="flex-1 min-w-0 flex justify-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inst.status] || statusColors.unknown}`}>
                    {formatStatus(inst.status)}
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

const TraceTable: FC<{ trace: InstanceTraceEvent[] }> = ({ trace }) => (
  <div className="overflow-x-auto">
    <table className="w-full text-xs">
      <thead>
        <tr className="text-macos-text-tertiary border-b border-gray-200">
          <th className="text-left py-2 pr-4 font-medium w-8">#</th>
          <th className="text-left py-2 pr-4 font-medium w-20">状态</th>
          <th className="text-left py-2 pr-4 font-medium">节点</th>
          <th className="text-left py-2 pr-4 font-medium w-32">执行ID</th>
          <th className="text-left py-2 font-medium w-28">执行时间</th>
        </tr>
      </thead>
      <tbody>
        {trace.map((evt, i) => (
          <tr key={i} className="border-b border-gray-100 last:border-0">
            <td className="py-2 pr-4 text-macos-text-tertiary">{i + 1}</td>
            <td className="py-2 pr-4">
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusDotColors[evt.status] || statusDotColors.unknown}`} />
              <span className="text-macos-text">{formatStatus(evt.status)}</span>
            </td>
            <td className="py-2 pr-4 text-macos-text">
              {evt.node}
              {evt.branch && <span className="text-macos-text-tertiary ml-1">({evt.branch})</span>}
            </td>
            <td className="py-2 font-mono text-macos-text-tertiary text-[10px] pr-4">{evt.invoke}</td>
            <td className="py-2 text-xs text-macos-text-tertiary">{evt.time}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)

const ArtifactList: FC<{
  artifacts: InstanceArtifact[]
  selected: InstanceArtifact | null
  onSelect: (a: InstanceArtifact | null) => void
}> = ({ artifacts, selected, onSelect }) => (
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
          <span className="text-[10px] font-mono text-macos-text-tertiary flex-shrink-0">{art.invokeId.replace('invoke-', '')}</span>
        </button>
      ))}
    </div>
  )

const InstanceDetail: FC = () => {
  const { selectedInstance, detail, isLoadingDetail, selectedArtifact, selectInstance, selectArtifact, clearDetail, isLiveRefresh, startLiveRefresh, stopLiveRefresh } = useWorkflowInstanceStore()
  const [isFlowFullscreen, setIsFlowFullscreen] = useState(false)
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

  if (!selectedInstance) return null
  const inst = selectedInstance

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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
            isLiveRefresh
              ? 'bg-green-50 text-green-600'
              : 'text-macos-text-secondary hover:text-macos-text hover:bg-gray-100'
          }`}
        >
          <Radio size={14} strokeWidth={1.5} className={isLiveRefresh ? 'animate-pulse' : ''} />
          {isLiveRefresh ? '实时刷新中' : '实时刷新'}
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
                  <DetailField icon={CircleDot} label="状态"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[detail?.wfStatus || inst.status] || statusColors.unknown}`}>{formatStatus(detail?.wfStatus || inst.status)}</span></DetailField>
                  <DetailField icon={GitBranch} label="工作流">{inst.workflowName}</DetailField>
                  <DetailField icon={Hash} label="实例ID"><span className="font-mono text-xs">{inst.instanceId}</span></DetailField>
                  <DetailField icon={Clock} label="创建">{formatRelativeTime(inst.createdAt)}</DetailField>
                  <DetailField icon={Terminal} label="输入">{inst.initialInput || '-'}</DetailField>
                  <DetailField icon={ListOrdered} label="步骤">{inst.step ?? 0}</DetailField>
                  <DetailField icon={Repeat} label="循环">{inst.loopCount ?? 0}</DetailField>
                  <DetailField icon={RotateCcw} label="重试">{inst.retryCount ?? 0}</DetailField>
                  <DetailField icon={Files} label="产物">{inst.artifactCount}</DetailField>
                </div>
              </div>

              {/* 执行进度 */}
              {detail.flowData && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-macos-text">执行进度</span>
                    <button
                      onClick={() => setIsFlowFullscreen(true)}
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

              {detail.trace.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="text-sm font-bold text-macos-text mb-3">时间线</div>
                  <TraceTable trace={detail.trace} />
                </div>
              )}

              {/* 节点产物 */}
              {detail.artifacts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <div className="text-sm font-bold text-macos-text mb-3">节点产物</div>
                  <ArtifactList artifacts={detail.artifacts} selected={selectedArtifact} onSelect={selectArtifact} />
                </div>
              )}

              {/* 选中产物弹框 — 复用项目 Modal 组件（拖拽/缩放/双击全屏） */}
              {selectedArtifact && (
                <Modal
                  isOpen={true}
                  onClose={() => selectArtifact(null)}
                  title={selectedArtifact.nodeName}
                  size="lg"
                  layoutKey="instance-artifact"
                  persistLayout
                >
                  <div className="mb-3 pb-2 border-b border-gray-100">
                    <span className="text-xs font-mono text-macos-text-tertiary">{selectedArtifact.invokeId}</span>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    <MarkdownRenderer content={selectedArtifact.content} className="text-sm" />
                  </div>
                </Modal>
              )}
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
