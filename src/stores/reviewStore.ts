import { create } from 'zustand'
import type { PendingAssetItem } from '../utils/storage'

interface ReviewState {
  /** 队列条目（pending 与 rejected 合并，页面按状态筛选客户端过滤） */
  reviewAssets: PendingAssetItem[]
  loading: boolean
  reviewing: PendingAssetItem | null
  reviewModalOpen: boolean
  /** 最近一次直改收编结果（H7/H8：审核页加载时先收编再拉列表） */
  lastAdopt: { adopted: { type: string; name: string; kind: string }[]; restoredDeletions: string[] } | null
  /** 拉取审核队列（先 reviewAdopt 收编直改，再合并 pending + rejected 两个列表） */
  loadReviewAssets: () => Promise<void>
  openReview: (item: PendingAssetItem) => void
  closeReview: () => void
}

export const useReviewStore = create<ReviewState>((set) => ({
  reviewAssets: [],
  loading: false,
  reviewing: null,
  reviewModalOpen: false,
  lastAdopt: null,
  loadReviewAssets: async () => {
    set({ loading: true })
    try {
      const { reviewList, reviewAdopt } = await import('../utils/storage')
      // H8：仅在审核页加载时触发直改收编；未托管等 success:false 视为软无操作，不弹错误
      const adopt = await reviewAdopt()
      const [pending, rejected] = await Promise.all([
        reviewList('pending'),
        reviewList('rejected'),
      ])
      set({
        reviewAssets: [...pending, ...rejected],
        lastAdopt: { adopted: adopt.adopted, restoredDeletions: adopt.restoredDeletions },
      })
    } finally {
      set({ loading: false })
    }
  },
  openReview: (item) => set({ reviewing: item, reviewModalOpen: true }),
  closeReview: () => set({ reviewing: null, reviewModalOpen: false }),
}))
