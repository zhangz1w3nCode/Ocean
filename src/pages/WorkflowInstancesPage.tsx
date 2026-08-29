import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Search, RefreshCw, ArrowLeft, Activity, FileText, Package, ChevronRight } from 'lucide-react'
import { Button } from '../components/ui'
import { MarkdownRenderer } from '../components/ui'
import { useWorkflowInstanceStore } from '../stores/workflowInstanceStore'
import type { WorkflowInstance } from '../types'
import { formatStatus, formatRelativeTime } from '../utils/format'

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  executing: 'bg-blue-100 text-blue-700',
  awaiting_choice: 'bg-amber-100 text-amber-700',
  aborted: 'bg-red-100 text-red-700',
  idle: 'bg-gray-100 text-gray-500',
  unknown: 'bg-gray-100 text-gray-500',
}

const StatusBadge: FC<{ status: string }> = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[status] || statusColors.unknown}`}>
    {formatStatus(status)}
  </span>
)

// ===== 列表视图 =====

const InstanceList: FC = () => {
  const { instances, isLoaded, loadInstances, selectInstance } = useWorkflowInstanceStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterWorkflow, setFilterWorkflow] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  useEffect(() => {
    if (!isLoaded) loadInstances()
  }, [isLoaded, loadInstances])

  const workflowNames = [...new Set(instances.map(i => i.workflowName))]
  const statusOptions = ['completed', 'executing', 'awaiting_choice', 'aborted', 'idle']

  const filtered = instances.filter((inst) => {
    if (filterWorkflow && inst.workflowName !== filterWorkflow) return false
    if (filterStatus && inst.status !== filterStatus) return false
    const q = searchQuery.toLowerCase()
    return inst.instanceId.toLowerCase().includes(q) ||
      inst.workflowName.toLowerCase().includes(q) ||
      inst.status.toLowerCase().includes(q) ||
      (inst.initialInput || '').toLowerCase().includes(q)
  })

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          <select
            value={filterWorkflow}
            onChange={(e) => setFilterWorkflow(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg
                       text-macos-text-secondary focus:outline-none
                       hover:border-gray-300 focus:border-gray-400
                       transition-[border-color,box-shadow] duration-200 cursor-pointer"
          >
            <option value="">全部工作流</option>
            {workflowNames.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg
                       text-macos-text-secondary focus:outline-none
                       hover:border-gray-300 focus:border-gray-400
                       transition-[border-color,box-shadow] duration-200 cursor-pointer"
          >
            <option value="">全部状态</option>
            {statusOptions.map(s => (
              <option key={s} value={s}>{formatStatus(s)}</option>
            ))}
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-macos-text-tertiary" />
            <input
              type="text"
              placeholder="搜索实例"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 w-56 text-sm bg-white border border-gray-200 rounded-lg
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
            <span className="ml-1.5">刷新</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {filtered.length > 0 ? (
          <div className="max-w-5xl mx-auto">
            {/* 表头 */}
            <div className="flex items-center gap-4 px-4 py-2 text-xs font-medium text-macos-text-tertiary border-b border-gray-100">
              <span className="w-32 flex-shrink-0">实例ID</span>
              <span className="w-32 flex-shrink-0">关联工作流</span>
              <span className="w-20 flex-shrink-0">状态</span>
              <span className="w-24 flex-shrink-0">输入</span>
              <span className="w-20 flex-shrink-0">创建时间</span>
              <span className="w-16 flex-shrink-0 text-right">操作</span>
            </div>
            {/* 行 */}
            {filtered.map((inst) => (
              <div
                key={`${inst.workflowName}-${inst.instanceId}`}
                className="flex items-center gap-4 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <span className="w-32 flex-shrink-0 text-xs font-mono text-macos-text truncate" title={inst.instanceId}>
                  {inst.instanceId}
                </span>
                <span className="w-32 flex-shrink-0 text-sm text-macos-text truncate" title={inst.workflowName}>
                  {inst.workflowName}
                </span>
                <div className="w-20 flex-shrink-0">
                  <StatusBadge status={inst.status} />
                </div>
                <span className="w-24 flex-shrink-0 text-xs text-macos-text-secondary truncate" title={inst.initialInput || ''}>
                  {inst.initialInput || '-'}
                </span>
                <span className="w-20 flex-shrink-0 text-xs text-macos-text-tertiary">
                  {formatRelativeTime(inst.createdAt)}
                </span>
                <div className="w-16 flex-shrink-0 text-right">
                  <button
                    onClick={() => selectInstance(inst)}
                    className="inline-flex items-center text-xs text-macos-text-secondary hover:text-macos-text transition-colors"
                  >
                    详情
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
              <Activity size={28} className="text-macos-text-tertiary" />
            </div>
            <p className="text-sm text-macos-text-tertiary">暂无工作流实例</p>
            <p className="text-xs text-macos-text-tertiary mt-1">Agent 使用工作流后将在此显示</p>
          </div>
        )}
      </div>
    </>
  )
}

// ===== 详情视图 =====

const SectionTitle: FC<{ icon: typeof FileText; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-2 mb-3">
    <Icon size={16} className="text-macos-text-secondary" strokeWidth={1.5} />
    <h3 className="text-sm font-medium text-macos-text">{children}</h3>
  </div>
)

const InfoRow: FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-macos-text-tertiary w-20 flex-shrink-0">{label}</span>
    <span className="text-sm text-macos-text">{children}</span>
  </div>
)

const InstanceDetail: FC = () => {
  const { selectedInstance, detail, isLoadingDetail, selectedArtifact, selectInstance, selectArtifact, clearDetail } = useWorkflowInstanceStore()

  if (!selectedInstance) return null
  const inst = selectedInstance

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-between">
        <button
          onClick={() => clearDetail()}
          className="flex items-center gap-1.5 text-sm text-macos-text-secondary hover:text-macos-text transition-colors"
        >
          <ArrowLeft size={16} />
          返回列表
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="max-w-4xl mx-auto">
          {/* 基本信息 */}
          <div className="mb-6">
            <SectionTitle icon={FileText}>基本信息</SectionTitle>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                <InfoRow label="实例ID">
                  <span className="font-mono text-xs">{inst.instanceId}</span>
                </InfoRow>
                <InfoRow label="关联工作流">{inst.workflowName}</InfoRow>
                <InfoRow label="状态">
                  <StatusBadge status={inst.status} />
                </InfoRow>
                <InfoRow label="创建时间">{formatRelativeTime(inst.createdAt)}</InfoRow>
                <InfoRow label="输入参数">
                  {inst.initialInput || '-'}
                </InfoRow>
                <InfoRow label="当前节点">
                  {inst.currentName || '-'}
                </InfoRow>
                <InfoRow label="步骤数">{inst.step ?? 0}</InfoRow>
                <InfoRow label="循环次数">{inst.loopCount ?? 0}</InfoRow>
                <InfoRow label="重试次数">{inst.retryCount ?? 0}</InfoRow>
                <InfoRow label="产物数">{inst.artifactCount}</InfoRow>
              </div>
            </div>
          </div>

          {/* 工作流执行进度 + 执行轨迹 */}
          {isLoadingDetail ? (
            <div className="mb-6 py-12 text-center">
              <p className="text-sm text-macos-text-tertiary">加载中...</p>
            </div>
          ) : detail ? (
            <>
              {/* 执行进度图 */}
              {detail.mermaid && (
                <div className="mb-6">
                  <SectionTitle icon={Activity}>执行进度</SectionTitle>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 overflow-x-auto">
                    <MarkdownRenderer content={'```mermaid\n' + detail.mermaid + '\n```'} className="text-sm" />
                  </div>
                </div>
              )}

              {/* 执行轨迹 */}
              {detail.trace.length > 0 && (
                <div className="mb-6">
                  <SectionTitle icon={FileText}>执行轨迹</SectionTitle>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-100 overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-macos-text-tertiary border-b border-gray-200">
                          <th className="text-left py-2 pr-4 font-medium">#</th>
                          <th className="text-left py-2 pr-4 font-medium">状态</th>
                          <th className="text-left py-2 pr-4 font-medium">节点</th>
                          <th className="text-left py-2 pr-4 font-medium">执行ID</th>
                          <th className="text-left py-2 font-medium">时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.trace.map((evt, i) => (
                          <tr key={i} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 pr-4 text-macos-text-tertiary">{i + 1}</td>
                            <td className="py-2 pr-4 text-macos-text">{evt.status}</td>
                            <td className="py-2 pr-4 text-macos-text">
                              {evt.node}
                              {evt.branch && (
                                <span className="text-macos-text-tertiary ml-1">({evt.branch})</span>
                              )}
                            </td>
                            <td className="py-2 pr-4 font-mono text-macos-text-tertiary text-[10px]">{evt.invoke}</td>
                            <td className="py-2 text-macos-text-tertiary">{evt.time}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 产物 */}
              {detail.artifacts.length > 0 && (
                <div className="mb-6">
                  <SectionTitle icon={Package}>节点产物 ({detail.artifacts.length})</SectionTitle>
                  <div className="flex flex-col gap-2 mb-4">
                    {detail.artifacts.map((art, i) => (
                      <button
                        key={i}
                        onClick={() => selectArtifact(selectedArtifact === art ? null : art)}
                        className={`flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${
                          selectedArtifact === art
                            ? 'border-gray-300 bg-[#E5E7EB]'
                            : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-sm font-medium text-macos-text truncate">{art.nodeName}</span>
                          <span className="text-xs font-mono text-macos-text-tertiary truncate">{art.invokeId}</span>
                        </div>
                        <span className="text-xs text-macos-text-tertiary flex-shrink-0 ml-2">
                          {formatRelativeTime(art.updatedAt)}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* 选中产物的详细内容 */}
                  {selectedArtifact && (
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
                        <FileText size={14} className="text-macos-text-secondary" />
                        <span className="text-xs font-medium text-macos-text">{selectedArtifact.nodeName}</span>
                        <span className="text-xs font-mono text-macos-text-tertiary">{selectedArtifact.invokeId}</span>
                      </div>
                      <MarkdownRenderer content={selectedArtifact.content} className="text-sm" />
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="mb-6 py-12 text-center">
              <p className="text-sm text-macos-text-tertiary">无法加载详情数据</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ===== 主组件 =====

export const WorkflowInstancesPage: FC = () => {
  const { selectedInstance } = useWorkflowInstanceStore()

  if (selectedInstance) {
    return <InstanceDetail />
  }
  return <InstanceList />
}
