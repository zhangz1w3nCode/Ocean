import type { FC } from 'react'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench, ShieldQuestion, Layers, RefreshCw, BellRing, FileWarning, Braces } from 'lucide-react'
import { MarkdownRenderer } from '../../ui/MarkdownRenderer/MarkdownRenderer'
import { useHarnessStore, type ReasoningNode, type AssistantNode, type ToolNode, type ApprovalNode, type SystemNode, type HarnessImageAttachment, type HarnessSessionRuntime } from '../../../stores/harnessStore'

// ---------- 文件路径链接化（点击在右侧预览） ----------

const FILE_PATH_REGEX = /(^|[\s(（\["'「|])((?:[A-Za-z0-9_.-]+\/)+[A-Za-z0-9_.-]+\.[A-Za-z0-9]{1,8})/g

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function linkifyFilePaths(text: string): string {
  if (!text) return text
  return text.replace(FILE_PATH_REGEX, (_m, prefix: string, p: string) => {
    const safe = escapeHtml(p)
    return `${prefix}<a href="#" data-file="${safe}" class="text-macos-accent hover:underline">${safe}</a>`
  })
}

// ---------- 用户气泡 ----------

export const UserBubble: FC<{ text: string; images?: HarnessImageAttachment[] }> = ({ text, images }) => {
  // 命令消息（/skill:name 等）：命令词高亮，其余为普通文本（对齐 DSH 命令消息气泡）
  const cmd = /^(\s*)(\/[A-Za-z0-9_.:-]+)/.exec(text)
  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] space-y-1.5">
        {images && images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-end">
            {images.map((img, i) => (
              <img key={i} src={`data:${img.mimeType};base64,${img.data}`} alt="" className="h-24 rounded-lg border border-macos-border object-cover" />
            ))}
          </div>
        )}
        {text && (
          <div className="rounded-2xl px-4 py-2.5 bg-[#E8EAED] text-sm text-macos-text leading-relaxed break-words whitespace-pre-wrap">
            {cmd ? (
              <>
                <span className="text-macos-accent font-medium">{cmd[2]}</span>
                {text.slice(cmd[0].length)}
              </>
            ) : (
              text
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- 排队中的 steering 气泡 ----------

export const SteeringBubble: FC<{ text: string }> = ({ text }) => {
  return (
    <div className="flex justify-end">
      <div className="max-w-[72%] rounded-2xl px-4 py-2.5 bg-[#E8EAED]/50 border border-dashed border-macos-border text-sm text-macos-text-secondary leading-relaxed break-words">
        {text}
        <div className="text-[10px] text-macos-text-tertiary mt-0.5">将在当前回合工具执行完成后插入</div>
      </div>
    </div>
  )
}

// ---------- 思考折叠行 ----------

export const ReasoningRow: FC<{ node: ReasoningNode }> = ({ node }) => {
  const [open, setOpen] = useState(false)
  const firstLine = node.text.split('\n')[0] ?? ''
  const summary = firstLine.slice(0, 80) || (node.streaming ? '思考中…' : '思考过程')
  return (
    <div className="rounded-lg border border-macos-border bg-macos-bg/70 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-macos-text-secondary hover:text-macos-text transition-colors text-left"
      >
        {open ? <ChevronDown size={12} strokeWidth={1.5} className="shrink-0" /> : <ChevronRight size={12} strokeWidth={1.5} className="shrink-0" />}
        <span className={`flex-1 min-w-0 truncate ${node.streaming ? 'animate-pulse' : ''}`}>{summary}</span>
        <span className="text-[10px] text-macos-text-tertiary shrink-0">思考</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 text-xs text-macos-text-secondary">
          <MarkdownRenderer content={node.text} className="prose-sm" />
        </div>
      )}
    </div>
  )
}

// ---------- assistant 文本 ----------

export const AssistantBlock: FC<{ node: AssistantNode }> = ({ node }) => {
  return (
    <div className="space-y-1">
      <MarkdownRenderer content={linkifyFilePaths(node.text) || (node.streaming ? '' : '（无文本输出）')} />
      {node.streaming && <span className="inline-block w-1.5 h-4 bg-macos-text/70 animate-pulse rounded-sm" />}
      {node.errorMessage && (
        <div className="text-xs text-macos-error">生成中断：{node.errorMessage}</div>
      )}
      {node.usage && !node.streaming && (
        <div className="text-[10px] text-macos-text-tertiary">
          {(node.usage as { totalTokens?: number; cost?: { total?: number } }).totalTokens ?? '?'} tokens
          {((node.usage as { cost?: { total?: number } }).cost?.total ?? 0) > 0 &&
            ` · $${((node.usage as { cost?: { total?: number } }).cost?.total ?? 0).toFixed(4)}`}
        </div>
      )}
    </div>
  )
}

// ---------- 工具卡 ----------

const formatDuration = (startedAt: number, endedAt: number | null): string => {
  const ms = (endedAt ?? Date.now()) - startedAt
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export const ToolCard: FC<{ node: ToolNode }> = ({ node }) => {
  const [open, setOpen] = useState(false)
  const statusText = node.status === 'running' ? 'Running' : node.isError ? 'Failed' : 'Done'
  const output = node.status === 'running' ? node.partialText : node.resultText
  return (
    <div className={`rounded-lg border overflow-hidden ${node.isError ? 'border-macos-error/40' : 'border-macos-border'} bg-white`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-macos-bg/60 transition-colors"
      >
        {open ? <ChevronDown size={12} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" /> : <ChevronRight size={12} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" />}
        <Wrench size={12} strokeWidth={1.5} className="shrink-0 text-macos-text-tertiary" />
        <span className="font-medium text-macos-text shrink-0">{node.toolName}</span>
        <span className={`shrink-0 ${node.isError ? 'text-macos-error' : node.status === 'running' ? 'text-macos-warning animate-pulse' : 'text-macos-text-tertiary'}`}>
          {statusText}
        </span>
        <span className="flex-1" />
        <span className="text-[10px] text-macos-text-tertiary shrink-0">{formatDuration(node.startedAt, node.endedAt)}</span>
      </button>
      {open && (
        <div className="px-3 pb-2.5 space-y-1.5 text-xs">
          {node.args != null && (
            <details>
              <summary className="cursor-pointer text-macos-text-tertiary flex items-center gap-1 select-none">
                <Braces size={11} strokeWidth={1.5} /> 参数
              </summary>
              <pre className="mt-1 p-2 bg-macos-bg rounded-md text-[11px] font-mono text-macos-text-secondary overflow-x-auto max-h-40 overflow-y-auto">{JSON.stringify(node.args, null, 2)}</pre>
            </details>
          )}
          {output && (
            <pre
              dangerouslySetInnerHTML={{ __html: linkifyFilePaths(escapeHtml(output)) }}
              className={`p-2 bg-macos-bg rounded-md text-[11px] font-mono whitespace-pre-wrap break-all overflow-y-auto max-h-64 ${node.isError ? 'text-macos-error' : 'text-macos-text-secondary'}`}
            />
          )}
        </div>
      )}
    </div>
  )
}

// ---------- 审批卡（extension_ui dialog） ----------

export const ApprovalCard: FC<{ node: ApprovalNode; runtime: HarnessSessionRuntime }> = ({ node, runtime }) => {
  const [inputValue, setInputValue] = useState('')
  const resolveApproval = useHarnessStore((s) => s.resolveApproval)
  const sessionId = runtime.sessionId

  if (node.resolved) {
    return (
      <div className="rounded-lg border border-macos-border bg-macos-bg/60 px-3 py-2 text-xs text-macos-text-tertiary flex items-center gap-2">
        <ShieldQuestion size={12} strokeWidth={1.5} />
        <span className="truncate">{node.title} — 已答复</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-macos-warning/50 bg-macos-warning/5 px-3 py-2.5 space-y-2">
      <div className="text-xs font-medium text-macos-text flex items-center gap-1.5">
        <ShieldQuestion size={12} strokeWidth={1.5} className="text-macos-warning shrink-0" />
        <span className="truncate">{node.title || '扩展请求确认'}</span>
      </div>
      {node.detail && <div className="text-xs text-macos-text-secondary whitespace-pre-wrap">{node.detail}</div>}
      {node.method === 'select' && node.options && (
        <div className="flex flex-wrap gap-1.5">
          {node.options.map((opt) => (
            <button
              key={opt}
              onClick={() => void resolveApproval(sessionId, node.requestId, { value: opt })}
              className="px-2.5 py-1 rounded-md text-xs text-macos-text bg-[#E8EAED] hover:bg-gray-300 transition-colors"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
      {node.method === 'confirm' && (
        <div className="flex gap-1.5">
          <button onClick={() => void resolveApproval(sessionId, node.requestId, { confirmed: true })} className="px-2.5 py-1 rounded-md text-xs text-white bg-macos-text hover:opacity-80 transition-opacity">确认</button>
          <button onClick={() => void resolveApproval(sessionId, node.requestId, { confirmed: false })} className="px-2.5 py-1 rounded-md text-xs text-macos-text bg-[#E8EAED] hover:bg-gray-300 transition-colors">取消</button>
        </div>
      )}
      {(node.method === 'input' || node.method === 'editor') && (
        <div className="flex gap-1.5">
          {node.method === 'editor' ? (
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={4}
              className="flex-1 px-2 py-1.5 rounded-md text-xs bg-white border border-macos-border outline-none focus:border-macos-text/30 resize-y font-mono"
              placeholder="输入内容…"
            />
          ) : (
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="flex-1 px-2 py-1.5 rounded-md text-xs bg-white border border-macos-border outline-none focus:border-macos-text/30"
              placeholder="输入内容…"
            />
          )}
          <button onClick={() => void resolveApproval(sessionId, node.requestId, { value: inputValue })} className="px-2.5 py-1 rounded-md text-xs text-white bg-macos-text hover:opacity-80 transition-opacity shrink-0 self-start">提交</button>
        </div>
      )}
    </div>
  )
}

// ---------- 系统行 ----------

const SYSTEM_ICONS: Record<SystemNode['variant'], typeof Layers> = {
  compaction: Layers,
  retry: RefreshCw,
  'turn-error': FileWarning,
  process: FileWarning,
  'parse-error': FileWarning,
  notify: BellRing,
}

export const SystemRow: FC<{ node: SystemNode }> = ({ node }) => {
  const Icon = SYSTEM_ICONS[node.variant] ?? FileWarning
  return (
    <div className={`flex items-start gap-1.5 px-1 text-[11px] ${node.isError ? 'text-macos-error' : 'text-macos-text-tertiary'}`}>
      <Icon size={11} strokeWidth={1.5} className="shrink-0 mt-0.5" />
      <span className="break-words">{node.text}</span>
    </div>
  )
}
