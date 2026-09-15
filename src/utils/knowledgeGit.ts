/**
 * 知识库 git 提交信息工具
 *
 * - buildUnifiedDiff：用简化的 LCS 行级算法产出「旧版本 → 新版本」的统一 diff 文本
 * - generateKnowledgeCommitMessage：在 LLM 开关开启时，用配置好的提示词调用默认 LLM 生成提交信息
 */
import type { LLMProvider } from '../types'
import { generateWithLLM } from '../services/llmService'

// 简化的行级 LCS diff，输出 unified diff 风格的文本（仅用于喂给 LLM）
export const buildUnifiedDiff = (
  oldText: string,
  newText: string,
  oldLabel = 'git baseline',
  newLabel = 'current',
): string => {
  const a = oldText.length ? oldText.split('\n') : []
  const b = newText.length ? newText.split('\n') : []
  const n = a.length
  const m = b.length

  // 最长公共子序列长度表
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const lines: string[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push(`  ${a[i]}`)
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push(`- ${a[i]}`)
      i++
    } else {
      lines.push(`+ ${b[j]}`)
      j++
    }
  }
  while (i < n) {
    lines.push(`- ${a[i]}`)
    i++
  }
  while (j < m) {
    lines.push(`+ ${b[j]}`)
    j++
  }

  return `--- ${oldLabel}\n+++ ${newLabel}\n${lines.join('\n')}`
}

// 剥离 YAML 头，仅对正文做 diff（与审核弹窗保持一致）
const stripFrontmatter = (raw: string): string => {
  const match = /^---\n[\s\S]*?\n---\n?/.exec(raw)
  return match ? raw.slice(match[0].length) : raw
}

/**
 * 用 LLM 生成知识卡片的提交信息（Angular 规范）。
 * 失败时返回 null，由调用方回退到默认提交信息。
 */
export const generateKnowledgeCommitMessage = async (
  provider: LLMProvider,
  model: string,
  promptTemplate: string,
  baselineRaw: string | null,
  currentRaw: string,
): Promise<string | null> => {
  try {
    const oldBody = stripFrontmatter(baselineRaw ?? '')
    const newBody = stripFrontmatter(currentRaw)
    const diffText = buildUnifiedDiff(oldBody, newBody)

    const prompt = promptTemplate.includes('{{diff}}')
      ? promptTemplate.replace('{{diff}}', diffText)
      : `${promptTemplate}\n\n${diffText}`

    // 指定模型：覆盖 provider.defaultModel（generateWithLLM 内部以 defaultModel 调 API）
    const effectiveProvider: LLMProvider = model ? { ...provider, defaultModel: model } : provider

    console.log('\n========== [知识审核] 调用 LLM 生成提交信息 ==========')
    console.log('模型提供商:', effectiveProvider.name, `(${effectiveProvider.type})`)
    console.log('模型名称:', effectiveProvider.defaultModel)
    console.log('知识卡片 diff:\n' + diffText)
    console.log('实际发送给 LLM 的提示词:\n' + prompt)

    const result = await generateWithLLM(effectiveProvider, prompt, diffText)

    console.log('LLM 调用结果 success:', result.success)
    console.log('LLM 响应内容:', result.content)
    if (!result.success) console.log('LLM 错误:', result.error)
    console.log('====================================================\n')
    if (!result.success || !result.content) return null

    // 只取第一行非空内容，去除可能包裹的代码块标记
    const cleaned = result.content
      .replace(/^```[a-zA-Z]*\n?/, '')
      .replace(/```\s*$/, '')
      .trim()
    const firstLine = cleaned.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
    return firstLine || null
  } catch (error) {
    console.error('生成知识提交信息失败:', error)
    return null
  }
}
