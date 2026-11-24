import { create } from 'zustand'
import type { PendingAssetItem } from '../utils/storage'

interface ReviewState {
  reviewAssets: PendingAssetItem[]
  loading: boolean
  reviewing: PendingAssetItem | null
  reviewModalOpen: boolean
  loadReviewAssets: () => Promise<void>
  openReview: (item: PendingAssetItem) => void
  closeReview: () => void
}

export const useReviewStore = create<ReviewState>((set) => ({
  reviewAssets: [],
  loading: false,
  reviewing: null,
  reviewModalOpen: false,
  loadReviewAssets: async () => {
    set({ loading: true })
    try {
      const { loadPendingAssetsFromLocal } = await import('../utils/storage')
      const items = await loadPendingAssetsFromLocal()
      set({ reviewAssets: items })
    } finally {
      set({ loading: false })
    }
  },
  openReview: (item) => set({ reviewing: item, reviewModalOpen: true }),
  closeReview: () => set({ reviewing: null, reviewModalOpen: false }),
}))
