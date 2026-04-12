/**
 * 知识图谱解析工具
 * 用于解析知识内容中的链接关系
 * 支持两种格式：
 * 1. [[xxx.md|关系]] - WikiLink 格式
 * 2. `xxx.md` - 反引号格式（@引用生成）
 */

/**
 * 匹配 [[xxx.md|关系]] 或 [[xxx.md]] 格式
 * 支持以下情况：
 * - [[知识A.md|引用]] - 带关系名称
 * - [[知识A.md]] - 不带关系名称，默认"关联"
 * - [[./知识A.md|引用]] - 带相对路径前缀
 * - [[.claude/knowledges/知识A.md|引用]] - 带完整路径前缀
 * - [[`xxx.md`|引用]] - 路径包含反引号的混合格式
 */
const WIKI_LINK_REGEX = /\[\[([^\]|]+\.(?:md|mdx)`?)(?:\|([^\]]+))?\]\]/g

/**
 * 清理路径中的反引号
 * @param path 原始路径
 * @returns 清理后的路径
 */
function cleanBackticks(path: string): string {
  // 去除首尾的反引号
  return path.replace(/^`+|`+$/g, '')
}

/**
 * 匹配反引号格式的引用
 * 支持以下情况：
 * - `知识A.md` - 简单文件名
 * - `./知识A.md` - 相对路径
 * - `.claude/knowledges/知识A.md` - 完整路径
 * - `.claude/agents/xxx.md` - 其他业务模块引用（知识图谱只处理 knowledges 目录）
 */
const BACKTICK_LINK_REGEX = /`([^`]+\.(?:md|mdx))`/g

/**
 * 知识链接信息
 */
export interface KnowledgeLink {
  /** 目标知识名称（去除路径和扩展名） */
  targetName: string
  /** 关系名称 */
  relation: string
  /** 在原文中的位置（用于高亮等） */
  position: number
}

/**
 * 从链接路径中提取知识目标名称（支持子目录路径）
 * - .claude/knowledges/backend/api.md -> backend/api
 * - ./backend/api.md -> backend/api
 * - backend/api.md -> backend/api
 * - api.md -> api
 */
const extractTargetName = (cleanedPath: string): string => {
  const pathWithoutExt = cleanedPath.replace(/\.(md|mdx)$/, '')

  // 处理完整路径：.claude/knowledges/backend/api -> backend/api
  const knowledgesIdx = pathWithoutExt.indexOf('/knowledges/')
  if (knowledgesIdx >= 0) {
    return pathWithoutExt.substring(knowledgesIdx + '/knowledges/'.length)
  }

  // 处理相对路径前缀：./backend/api -> backend/api
  if (pathWithoutExt.startsWith('./')) {
    return pathWithoutExt.substring(2)
  }

  return pathWithoutExt
}

/**
 * 解析知识内容中的链接关系
 * 支持两种格式：
 * 1. [[xxx.md|关系]] - WikiLink 格式，支持自定义关系
 * 2. `xxx.md` - 反引号格式（@引用生成），默认关系为"引用"
 * @param content 知识内容
 * @returns 解析出的链接列表
 */
export function parseKnowledgeLinks(content: string): KnowledgeLink[] {
  const links: KnowledgeLink[] = []
  const wikiLinkRanges: Array<{ start: number; end: number }> = []
  let match: RegExpExecArray | null

  // 1. 解析 WikiLink 格式 [[xxx.md|关系]]
  WIKI_LINK_REGEX.lastIndex = 0
  while ((match = WIKI_LINK_REGEX.exec(content)) !== null) {
    const rawPath = match[1].trim()
    const relation = match[2]?.trim() || '关联'

    // 清理路径中可能存在的反引号（混合格式如 [[`xxx.md`|关系]]）
    const cleanedPath = cleanBackticks(rawPath)
    const targetName = extractTargetName(cleanedPath)

    links.push({
      targetName,
      relation,
      position: match.index,
    })

    // 记录 WikiLink 的位置范围，防止重复解析
    wikiLinkRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    })
  }

  // 2. 解析反引号格式 `xxx.md`（排除已在 WikiLink 中的）
  BACKTICK_LINK_REGEX.lastIndex = 0
  while ((match = BACKTICK_LINK_REGEX.exec(content)) !== null) {
    // 检查这个位置是否在某个 WikiLink 范围内
    const isInWikiLink = wikiLinkRanges.some(
      range => match!.index >= range.start && match!.index < range.end
    )
    if (isInWikiLink) {
      continue // 跳过，已在 WikiLink 中解析
    }

    const rawPath = match[1].trim()
    const cleanedPath = cleanBackticks(rawPath)
    const targetName = extractTargetName(cleanedPath)

    // 检查是否已经解析过相同的目标（避免重复）
    const isDuplicate = links.some(link => link.targetName === targetName)
    if (!isDuplicate) {
      // 根据路径判断关系类型
      let relation = '引用'
      if (rawPath.includes('/agents/')) {
        relation = '引用智能体'
      } else if (rawPath.includes('/nodes/')) {
        relation = '引用节点'
      } else if (rawPath.includes('/workflows/')) {
        relation = '引用工作流'
      } else if (rawPath.includes('/commands/')) {
        relation = '引用命令'
      } else if (rawPath.includes('/resources/')) {
        relation = '引用资源'
      } else if (rawPath.includes('/abilities/')) {
        relation = '引用能力'
      } else if (rawPath.includes('/skills/')) {
        relation = '引用技能'
      } else if (rawPath.includes('/knowledges/')) {
        relation = '引用知识'
      }

      links.push({
        targetName,
        relation,
        position: match.index,
      })
    }
  }

  return links
}

/**
 * 从链接路径中提取知识名称（支持子目录路径）
 * @param linkPath 链接路径，如 `./知识A.md`、`.claude/knowledges/知识A.md` 或 `backend/api.md`
 * @returns 知识名称（含子目录路径，如 "backend/api" 或 "知识A"）
 */
export function extractKnowledgeName(linkPath: string): string {
  const cleanedPath = cleanBackticks(linkPath)
  return extractTargetName(cleanedPath)
}