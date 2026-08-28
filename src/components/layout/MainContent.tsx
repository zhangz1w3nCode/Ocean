import type { FC } from 'react'
import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore, type PageType } from '../../stores/appStore'
import { WorkflowsPage } from '../../pages/WorkflowsPage'
import { NodesPage } from '../../pages/NodesPage'
import { AgentsPage } from '../../pages/AgentsPage'
import { ResourcesPage } from '../../pages/ResourcesPage'
import { KnowledgesPage } from '../../pages/KnowledgesPage'
import { SkillsPage } from '../../pages/SkillsPage'
import { SettingsPage } from '../../pages/SettingsPage'
import { WorkflowEditorModal } from '../workflow'

// 空白页面组件（用于 project 类型，实际项目选择页面在 App.tsx 中处理）
const EmptyPage: FC = () => null

const pageComponents: Record<PageType, FC> = {
  project: EmptyPage,
  workflows: WorkflowsPage,
  nodes: NodesPage,
  agents: AgentsPage,
  resources: ResourcesPage,
  knowledges: KnowledgesPage,
  skills: SkillsPage,
  settings: SettingsPage,
}

export const MainContent: FC = () => {
  const { currentPage, isEditing, editingWorkflowId, stopEditing, isSidebarCollapsed, toggleSidebar } = useAppStore()
  const CurrentPageComponent = pageComponents[currentPage]
  const dragStartXRef = useRef(0)

  const handleEdgeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragStartXRef.current = e.clientX

    const handleMouseUp = (e: MouseEvent) => {
      const delta = e.clientX - dragStartXRef.current
      if (Math.abs(delta) < 5) {
        toggleSidebar()
      } else if (delta < -50 && !isSidebarCollapsed) {
        toggleSidebar()
      } else if (delta > 50 && isSidebarCollapsed) {
        toggleSidebar()
      }
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <main className="flex-1 h-full flex flex-col bg-macos-bg overflow-hidden relative">
      {/* 内容区左边缘交互热区 - 隐藏/展开侧边栏 */}
      <div
        onMouseDown={handleEdgeMouseDown}
        className="absolute top-0 left-4 h-full w-1.5 cursor-col-resize z-10"
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="flex-1 overflow-hidden"
        >
          <CurrentPageComponent />
        </motion.div>
      </AnimatePresence>

      {/* 工作流编辑器弹窗 */}
      <WorkflowEditorModal
        isOpen={isEditing}
        workflowId={editingWorkflowId}
        onClose={stopEditing}
      />
    </main>
  )
}