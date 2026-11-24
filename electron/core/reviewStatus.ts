import * as fs from 'node:fs'

// 资产审核门控（D13）：CLI 与 GUI 同语义——仅 validated 可见可操作；pending/rejected 只能在审核页处理

export type ReviewStatus = 'pending' | 'validated' | 'rejected'

// 从文件 frontmatter 读取 reviewStatus（未写/无 frontmatter 视为 pending；allowLegacyStatus 兼容知识旧 status 字段）
export function readReviewStatus(filePath: string, allowLegacyStatus = false): ReviewStatus {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const m = raw.match(/^---\n([\s\S]*?)\n---/)
    if (!m) return 'pending'
    const fm = m[1]
    const rs = fm.match(/^reviewStatus:\s*(\S+)/m)
    if (rs) {
      if (rs[1] === 'validated') return 'validated'
      if (rs[1] === 'rejected') return 'rejected'
      return 'pending'
    }
    if (allowLegacyStatus) {
      const ls = fm.match(/^status:\s*(\S+)/m)
      if (ls && ls[1] === 'validated') return 'validated'
    }
    return 'pending'
  } catch {
    return 'pending'
  }
}

// 操作门卫：非 validated 抛错（create 不受限；update/del/read 前调用）
export function assertOperable(status: ReviewStatus, label: string): void {
  if (status === 'validated') return
  const stateText = status === 'rejected' ? '已驳回' : '待审核'
  throw new Error(
    `${label} 处于${stateText}状态（reviewStatus: ${status}），仅审核通过的资产可操作；请先在 Ocean 桌面端「审核」页处理`,
  )
}
