import type { AssetRoot } from '../types'

// 资产加载来源缓存（供同步路径拼接使用）
// 由 settingsStore（setAssetRoot/loadAssetRoot）和 storage.loadAppConfig 维护
let cachedAssetRoot: AssetRoot = 'claude'

export const updateCachedAssetRoot = (root: AssetRoot): void => {
  cachedAssetRoot = root
}

export const getAssetRoot = (): AssetRoot => cachedAssetRoot

// 获取资产根目录名（.claude 或 .pi）
export const getAssetDirName = (): string => (cachedAssetRoot === 'pi' ? '.pi' : '.claude')
