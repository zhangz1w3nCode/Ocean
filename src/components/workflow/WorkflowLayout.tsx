import type { FC } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { WorkflowSidebar } from './WorkflowSidebar'
import { WorkflowsPage } from '../../pages/WorkflowsPage'
import { NodesPage } from '../../pages/NodesPage'
import { WorkflowInstancesPage } from '../../pages/WorkflowInstancesPage'
import { WorkflowSettingsPage } from '../../pages/WorkflowSettingsPage'

export const WorkflowLayout: FC = () => {
  const { workflowSubPage } = useAppStore()

  const renderContent = () => {
    switch (workflowSubPage) {
      case 'nodes':
        return <NodesPage nested />
      case 'workflows':
        return <WorkflowsPage nested />
      case 'instances':
        return <WorkflowInstancesPage />
      case 'settings':
        return <WorkflowSettingsPage />
      default:
        return <WorkflowsPage nested />
    }
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex overflow-hidden">
        <WorkflowSidebar />
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full rounded-xl border border-gray-100 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={workflowSubPage}
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
