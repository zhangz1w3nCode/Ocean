import type { FC } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { ReviewSidebar } from './ReviewSidebar'
import { AssetReviewPage } from '../../pages/AssetReviewPage'
import { ReviewSettingsPage } from '../../pages/ReviewSettingsPage'

export const ReviewLayout: FC = () => {
  const { reviewSubPage } = useAppStore()

  const renderContent = () => {
    switch (reviewSubPage) {
      case 'assets':
        return <AssetReviewPage />
      case 'settings':
        return <ReviewSettingsPage />
      default:
        return <AssetReviewPage />
    }
  }

  return (
    <div className="h-full pl-4 pr-4 pt-4 pb-4">
      <div className="h-full bg-white rounded-2xl shadow-sm flex overflow-hidden">
        <ReviewSidebar />
        <div className="flex-1 p-4 overflow-hidden">
          <div className="h-full rounded-xl border border-gray-100 flex flex-col overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={reviewSubPage}
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
