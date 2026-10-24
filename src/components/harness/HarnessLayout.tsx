import type { FC } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { HarnessSidebar } from './HarnessSidebar'
import { HarnessSchedulePage } from '../../pages/HarnessSchedulePage'
import { HarnessSettingsPage } from '../../pages/HarnessSettingsPage'

export const HarnessLayout: FC = () => {
  const { harnessSubPage } = useAppStore()

  const renderContent = () => {
    switch (harnessSubPage) {
      case 'schedule':
        return <HarnessSchedulePage />
      case 'settings':
        return <HarnessSettingsPage />
      default:
        return <HarnessSchedulePage />
    }
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex overflow-hidden">
        <HarnessSidebar />
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full rounded-xl border border-gray-100 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={harnessSubPage}
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
