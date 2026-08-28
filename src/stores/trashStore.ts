import { create } from 'zustand'
import type { TrashItem } from '../types'
import {
  loadTrashItems,
  restoreTrashItem,
  deleteTrashItemPermanently,
  clearTrash,
} from '../utils/storage'

interface TrashState {
  items: TrashItem[]
  isLoaded: boolean
  loadItems: () => Promise<void>
  restoreItem: (id: string) => Promise<{ success: boolean; error?: string }>
  deleteItemPermanently: (id: string) => Promise<boolean>
  clearAll: () => Promise<boolean>
}

export const useTrashStore = create<TrashState>((set, get) => ({
  items: [],
  isLoaded: false,

  loadItems: async () => {
    const items = await loadTrashItems()
    set({ items, isLoaded: true })
  },

  restoreItem: async (id) => {
    const result = await restoreTrashItem(id)
    if (result.success) {
      set({ items: get().items.filter((it) => it.id !== id) })
    }
    return result
  },

  deleteItemPermanently: async (id) => {
    const success = await deleteTrashItemPermanently(id)
    if (success) {
      set({ items: get().items.filter((it) => it.id !== id) })
    }
    return success
  },

  clearAll: async () => {
    const success = await clearTrash()
    if (success) {
      set({ items: [] })
    }
    return success
  },
}))