import { useState, useRef } from 'react'
import type { FC } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { CodebasesSidebar } from './CodebasesSidebar'
import { CodebasesPage } from '../../pages/CodebasesPage'
import { CodebasesSettingsPage } from '../../pages/CodebasesSettingsPage'

export const CodebasesLayout: FC = () => {
  const { codebaseSubPage } = useAppStore()
  const [isCollapsed, setIsCollapsed] = useState(false)
  const dragStartXRef = useRef(0)

  const toggleSidebar = () => setIsCollapsed(prev => !prev)

  const handleEdgeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStartXRef.current = e.clientX

    const handleMouseUp = (e: MouseEvent) => {
      const delta = e.clientX - dragStartXRef.current
      if (Math.abs(delta) < 5) {
        toggleSidebar()
      } else if (delta < -50 && !isCollapsed) {
        toggleSidebar()
      } else if (delta > 50 && isCollapsed) {
        toggleSidebar()
      }
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mouseup', handleMouseUp)
  }

  const renderContent = () => {
    switch (codebaseSubPage) {
      case 'manage':
        return <CodebasesPage nested />
      case 'settings':
        return <CodebasesSettingsPage />
      default:
        return <CodebasesPage nested />
    }
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex overflow-hidden">
        <motion.div
          animate={{ width: isCollapsed ? 0 : 176 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="h-full flex-shrink-0 overflow-hidden"
        >
          <CodebasesSidebar />
        </motion.div>
        <div className="flex-1 p-4 overflow-hidden relative">
          <div
            onMouseDown={handleEdgeMouseDown}
            className="absolute top-0 left-3 h-full w-1.5 cursor-col-resize z-10"
          />
          <div className="h-full rounded-xl border border-gray-100 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={codebaseSubPage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col overflow-hidden"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}
