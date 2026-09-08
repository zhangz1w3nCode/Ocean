import type { FC } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { KnowledgeSidebar } from './KnowledgeSidebar'
import { KnowledgesPage } from '../../pages/KnowledgesPage'
import { KnowledgeGraphView } from './KnowledgeGraphView'
import { KnowledgeCatalogPage } from '../../pages/KnowledgeCatalogPage'
import { KnowledgeSettingsPage } from '../../pages/KnowledgeSettingsPage'

export const KnowledgeLayout: FC = () => {
  const { knowledgeSubPage } = useAppStore()

  const renderContent = () => {
    switch (knowledgeSubPage) {
      case 'library':
        return <KnowledgesPage nested />
      case 'graph':
        return <KnowledgeGraphView />
      case 'catalog':
        return <KnowledgeCatalogPage />
      case 'settings':
        return <KnowledgeSettingsPage />
      default:
        return <KnowledgesPage nested />
    }
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex overflow-hidden">
        <KnowledgeSidebar />
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full rounded-xl border border-gray-100 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={knowledgeSubPage}
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
