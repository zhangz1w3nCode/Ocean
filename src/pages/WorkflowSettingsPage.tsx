import { useState, useEffect, useCallback } from 'react'
import type { FC } from 'react'
import { Settings, CheckCircle2, AlertCircle, Loader2, Terminal, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { useToastStore } from '../stores/toastStore'

interface CliCheckResult {
  installed: boolean
  working: boolean
  commandPath: string | null
  wrapperPath: string | null
}

export const WorkflowSettingsPage: FC = () => {
  const { addToast } = useToastStore()
  const [cliStatus, setCliStatus] = useState<CliCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [installing, setInstalling] = useState(false)

  const checkCli = useCallback(async (showToast = false) => {
    setChecking(true)
    try {
      const result = await window.electronAPI?.checkCliInstalled()
      setCliStatus(result ?? null)
      if (showToast) {
        if (result?.installed && result?.working) {
          addToast('CLI 已安装且可用', 'success')
        } else if (result?.installed && !result?.working) {
          addToast('CLI 已安装但无法正常运行', 'warning')
        } else {
          addToast('CLI 未安装', 'info')
        }
      }
    } catch {
      setCliStatus(null)
      if (showToast) addToast('检测失败', 'error')
    } finally {
      setChecking(false)
    }
  }, [addToast])

  const installCli = useCallback(async () => {
    setInstalling(true)
    try {
      const result = await window.electronAPI?.installCli()
      if (result?.success) {
        addToast('CLI 安装成功，可直接使用 workflow 命令', 'success')
        await checkCli()
      } else {
        addToast(`安装失败: ${result?.error || '未知错误'}`, 'error')
      }
    } catch (e: any) {
      addToast(`安装失败: ${e.message || String(e)}`, 'error')
    } finally {
      setInstalling(false)
    }
  }, [checkCli, addToast])

  useEffect(() => {
    checkCli()
  }, [checkCli])

  return (
    <>
      <div className="h-16 px-6 flex items-center justify-end" />

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-6">
            <Settings size={20} className="text-macos-text-secondary" strokeWidth={1.5} />
            <h2 className="text-base font-medium text-macos-text">工作流设置</h2>
          </div>

          <div className="flex flex-col gap-4">
            {/* 工作流存储路径 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">工作流存储路径</div>
              <div className="text-xs text-macos-text-tertiary">
                工作流定义和实例数据存储在项目根目录的 .workflows/ 目录下
              </div>
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded text-xs font-mono text-macos-text-secondary">
                .workflows/
              </div>
            </div>

            {/* 实例保留策略 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">实例保留</div>
              <div className="text-xs text-macos-text-tertiary">
                Agent 使用工作流产生的实例将自动存储在对应工作流的 instance/ 目录下，可在"实例"标签页中查看
              </div>
            </div>

            {/* 节点存储路径 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-medium text-macos-text mb-1">节点存储路径</div>
              <div className="text-xs text-macos-text-tertiary">
                节点定义存储在项目根目录的 .nodes/ 目录下，跨资产来源共享
              </div>
              <div className="mt-2 px-3 py-2 bg-gray-50 rounded text-xs font-mono text-macos-text-secondary">
                .nodes/
              </div>
            </div>

            {/* workflow-cli 安装 */}
            <div className="p-4 rounded-lg border border-gray-100">
              <div className="flex items-center gap-2 mb-1">
                <Terminal size={14} className="text-macos-text-secondary" strokeWidth={1.5} />
                <div className="text-sm font-medium text-macos-text">workflow-cli 安装</div>
              </div>
              <div className="text-xs text-macos-text-tertiary mb-3">
                安装 CLI 命令后，Agent 可通过 workflow next/complete/choose 等命令驱动工作流执行
              </div>

              {/* 状态显示 */}
              <div className="flex items-center gap-2 text-xs">
                {checking ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-macos-text-tertiary" />
                    <span className="text-macos-text-tertiary">检测中...</span>
                  </>
                ) : cliStatus?.installed && cliStatus?.working ? (
                  <>
                    <CheckCircle2 size={14} className="text-green-500" />
                    <span className="text-macos-text">已安装且可用</span>
                    {cliStatus.commandPath && (
                      <span className="px-2 py-0.5 bg-gray-50 rounded font-mono text-macos-text-tertiary">
                        {cliStatus.commandPath}
                      </span>
                    )}
                  </>
                ) : cliStatus?.installed && !cliStatus?.working ? (
                  <>
                    <AlertCircle size={14} className="text-amber-500" />
                    <span className="text-macos-text-secondary">已安装但无法正常运行，请重新安装</span>
                  </>
                ) : (
                  <>
                    <AlertCircle size={14} className="text-macos-text-tertiary" />
                    <span className="text-macos-text-tertiary">未安装</span>
                  </>
                )}
              </div>

              {/* 操作按钮 */}
              <div className="mt-3 flex items-center gap-2">
                {!cliStatus?.installed && !installing && (
                  <Button variant="outline" size="sm" onClick={installCli}
                    className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400">
                    安装 CLI
                  </Button>
                )}
                {installing && (
                  <Button variant="outline" size="sm" disabled
                    className="bg-[#E5E7EB] border border-gray-300 text-gray-700">
                    <Loader2 size={14} className="animate-spin mr-1" />
                    安装中...
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => checkCli(true)}
                  disabled={checking || installing}
                  className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-3 py-1.5 text-sm"
                >
                  <RefreshCw size={14} className={`flex-shrink-0 ${checking ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
