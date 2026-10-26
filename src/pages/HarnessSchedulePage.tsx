import type { FC } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useHarnessStore } from '../stores/harnessStore'
import { SessionPanel } from '../components/harness/schedule/SessionPanel'
import { ChatFlow } from '../components/harness/schedule/ChatFlow'
import { Composer } from '../components/harness/schedule/Composer'
import { FileViewer } from '../components/harness/schedule/FileViewer'

// 调度页三栏布局（对齐知识目录页模式）：会话树 | 1px 可拖拽分割线 | 聊天主区 | 文件预览（带分割线滑入）
export const HarnessSchedulePage: FC = () => {
  const initialized = useHarnessStore((s) => s.initialized)
  const available = useHarnessStore((s) => s.available)
  const detectError = useHarnessStore((s) => s.detectError)
  const setHarnessSubPage = useAppStore((s) => s.setHarnessSubPage)

  const [treeWidth, setTreeWidth] = useState(240)
  const [viewerWidth, setViewerWidth] = useState(380)
  const resizeRef = useRef<{ kind: 'tree' | 'viewer'; startX: number; startW: number } | null>(null)

  useEffect(() => {
    useHarnessStore.getState().init()
  }, [initialized])

  const startResize = useCallback((kind: 'tree' | 'viewer') => (e: React.MouseEvent) => {
    e.preventDefault()
    resizeRef.current = {
      kind,
      startX: e.clientX,
      startW: kind === 'tree' ? treeWidth : viewerWidth,
    }
    const move = (ev: MouseEvent) => {
      const info = resizeRef.current
      if (!info) return
      const delta = ev.clientX - info.startX
      if (info.kind === 'tree') {
        setTreeWidth(Math.min(480, Math.max(200, info.startW + delta)))
      } else {
        // 预览面板分割线在左缘：向左拖 = 变宽
        setViewerWidth(Math.min(760, Math.max(300, info.startW - delta)))
      }
    }
    const up = () => {
      resizeRef.current = null
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }, [treeWidth, viewerWidth])

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
    <div className="h-full flex min-h-0 gap-1 p-4 overflow-hidden">
      <SessionPanel width={treeWidth} />

      {/* 分割线 1：会话树 ↔ 聊天主区（可拖拽调宽） */}
      <div
        onMouseDown={startResize('tree')}
        title="拖动调整宽度"
        className="w-px flex-shrink-0 bg-gray-200 hover:bg-gray-300 transition-colors cursor-col-resize relative group"
      >
        <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <ChatFlow />
        <Composer />
      </div>

      <FileViewer width={viewerWidth} onResizeStart={startResize('viewer')} />
    </div>
  )
}
