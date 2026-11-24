import { create } from 'zustand'
import type { PendingAssetItem } from '../utils/storage'

interface ReviewState {
  /** 队列条目（pending 与 rejected 合并，页面按状态筛选客户端过滤） */
  reviewAssets: PendingAssetItem[]
  loading: boolean
  reviewing: PendingAssetItem | null
  reviewModalOpen: boolean
  /** 拉取审核队列（pending + rejected 两个列表合并） */
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
      const { reviewList } = await import('../utils/storage')
      const [pending, rejected] = await Promise.all([
        reviewList('pending'),
        reviewList('rejected'),
      ])
      set({ reviewAssets: [...pending, ...rejected] })
    } finally {
      set({ loading: false })
    }
  },
  openReview: (item) => set({ reviewing: item, reviewModalOpen: true }),
  closeReview: () => set({ reviewing: null, reviewModalOpen: false }),
}))
