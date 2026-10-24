import type { FC } from 'react'
import { useCallback, useEffect, useState } from 'react'
import { Terminal, CheckCircle2, XCircle, RefreshCw, Copy, Check } from 'lucide-react'

const INSTALL_COMMAND = 'npm i -g @earendil-works/pi-coding-agent'

interface DetectState {
  loading: boolean
  available: boolean | null
  version: string | null
  piPath: string | null
  error: string | null
}

const INITIAL_STATE: DetectState = { loading: true, available: null, version: null, piPath: null, error: null }

export const HarnessSettingsPage: FC = () => {
  const [state, setState] = useState<DetectState>(INITIAL_STATE)
  const [copied, setCopied] = useState(false)

  const runDetect = useCallback(async () => {
    setState({ ...INITIAL_STATE, loading: true })
    try {
      const api = window.electronAPI
      if (!api || typeof api.harnessDetect !== 'function') {
        setState({ loading: false, available: null, version: null, piPath: null, error: '当前环境不支持 Harness 会话（仅桌面端可用）' })
        return
      }
      const res = await api.harnessDetect()
      if (!res.success) {
        setState({ loading: false, available: null, version: null, piPath: null, error: res.error || 'pi 检测失败' })
        return
      }
      setState({ loading: false, available: !!res.available, version: res.version ?? null, piPath: res.path ?? null, error: null })
    } catch (e) {
      setState({ loading: false, available: null, version: null, piPath: null, error: String(e) })
    }
  }, [])

  useEffect(() => {
    void runDetect()
  }, [runDetect])

  const copyInstallCommand = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用时静默忽略
    }
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal size={18} strokeWidth={1.5} className="text-macos-text-secondary" />
            <h2 className="text-base font-semibold text-macos-text">Harness 基础信息</h2>
          </div>
          <button
            onClick={() => void runDetect()}
            disabled={state.loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED] transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} strokeWidth={1.5} className={state.loading ? 'animate-spin' : ''} />
            重新检测
          </button>
        </div>

        {state.loading && (
          <div className="bg-macos-bg rounded-xl border border-macos-border p-5 text-sm text-macos-text-secondary">
            正在检测本地 pi 安装…
          </div>
        )}

        {!state.loading && state.error && !state.available && (
          <div className="bg-white rounded-xl border border-macos-error/30 p-5">
            <div className="flex items-start gap-3">
              <XCircle size={18} strokeWidth={1.5} className="text-macos-error mt-0.5 shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="text-sm font-medium text-macos-text">{state.error}</div>
                <div className="text-xs text-macos-text-secondary">
                  pi 未安装或不可调用时，调度页的会话功能不可用。可在终端执行以下命令安装后重试检测：
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <code className="flex-1 px-3 py-2 bg-macos-bg rounded-lg text-xs font-mono text-macos-text select-all overflow-x-auto">
                    {INSTALL_COMMAND}
                  </code>
                  <button
                    onClick={() => void copyInstallCommand()}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-medium text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED] transition-colors shrink-0"
                  >
                    {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
                    {copied ? '已复制' : '复制'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {!state.loading && state.available && (
          <div className="bg-white rounded-xl border border-macos-success/30 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} strokeWidth={1.5} className="text-macos-success mt-0.5 shrink-0" />
              <div className="flex-1 space-y-3">
                <div className="text-sm font-medium text-macos-text">pi 可用</div>
                <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-xs">
                  <div className="text-macos-text-secondary">版本</div>
                  <div className="font-mono text-macos-text">{state.version || '未知'}</div>
                  <div className="text-macos-text-secondary">可执行路径</div>
                  <div className="font-mono text-macos-text break-all select-all">{state.piPath || '未知'}</div>
                </div>
                <div className="text-xs text-macos-text-secondary pt-1 border-t border-macos-border">
                  会话文件落 pi 默认目录 ~/.pi/agent/sessions/，与终端内使用的 pi 互通。
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
