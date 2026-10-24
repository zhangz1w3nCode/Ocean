import type { FC } from 'react'
import { useEffect } from 'react'
import { Terminal } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useHarnessStore } from '../stores/harnessStore'
import { SessionPanel } from '../components/harness/schedule/SessionPanel'
import { ChatFlow } from '../components/harness/schedule/ChatFlow'
import { Composer } from '../components/harness/schedule/Composer'

// 调度页：会话面板（worktree 分组 + 历史会话）+ 聊天工作区（消息流 + composer）
export const HarnessSchedulePage: FC = () => {
  const initialized = useHarnessStore((s) => s.initialized)
  const available = useHarnessStore((s) => s.available)
  const detectError = useHarnessStore((s) => s.detectError)
  const setHarnessSubPage = useAppStore((s) => s.setHarnessSubPage)

  useEffect(() => {
    useHarnessStore.getState().init()
  }, [initialized])

  if (available === false) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="max-w-sm text-center space-y-3">
          <Terminal size={28} strokeWidth={1.5} className="mx-auto text-macos-text-tertiary" />
          <div className="text-sm font-medium text-macos-text">Harness 会话不可用</div>
          <div className="text-xs text-macos-text-secondary">{detectError || '未检测到 pi'}</div>
          <button
            onClick={() => setHarnessSubPage('settings')}
            className="px-4 py-2 rounded-lg text-xs font-medium text-macos-text bg-[#E5E7EB] hover:bg-gray-300 transition-colors"
          >
            前往设置查看安装指引
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      <SessionPanel />
      <div className="flex-1 min-w-0 flex flex-col">
        <ChatFlow />
        <Composer />
      </div>
    </div>
  )
}
