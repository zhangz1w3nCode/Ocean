/**
 * 知识编译核心（P3）：单源 → L2 结构化知识卡。
 * 时序与失败语义对齐 llm_wiki autoIngestImpl（复制件 + 注入式编排）：
 *   读源 → SHA-256 缓存门 → Step1 分析 → Step2 生成（FILE 块协议）→
 *   parseFileBlocks → sanitize → frontmatter 契约拼装（强制 pending）→
 *   旧卡并集合并 → 写入 → 截断修复 → source 摘要兜底 → 完整性门 → 写缓存
 *
 * 服务注入（模块不依赖 launch.cjs，单测可注入假实现）：
 *   ctx.services = { streamLLM, readSource, listCards, loadCard, saveCard, readState, writeState, fileExists }
 */

const crypto = require('node:crypto')
const { parseFileBlocks } = require('./knowledge-ingest/card-blocks.cjs')
const { sanitizeIngestedFileContent } = require('./knowledge-ingest/sanitize.cjs')
const { buildKnowledgeCard, parseKnowledgeCard, mergeUnionArrays, COMPILE_CARD_TYPES, RELATION_VOCABULARY } =
  require('./knowledge-frontmatter.cjs')

const CACHE_STATE_FILE = 'knowledge-compile-cache.json'
const WARNINGS_LOG_FILE = 'knowledge-compile-warnings.log'

// 卡型 → 默认 domain（对应 .knowledges/ 下目录；LLM 输出 wiki/<type>/x.md，落盘剥前缀）
const CARD_TYPE_DIRS = { source: 'sources', entity: 'entities', concept: 'concepts', synthesis: 'synthesis' }

const ANALYSIS_MAX_TOKENS = 4096

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf-8').digest('hex')
}

// FILE 块路径 → .knowledges 相对卡路径（无 .md、无 wiki/ 前缀）
function fileBlockPathToCardPath(blockPath) {
  let p = String(blockPath).replace(/\\/g, '/').trim()
  if (p.toLowerCase().startsWith('wiki/')) p = p.slice(5)
  if (p.toLowerCase().endsWith('.md')) p = p.slice(0, -3)
  return p
}

// ── Prompts（结构复制自 llm_wiki buildAnalysisPrompt/buildGenerationPrompt，契约换 Ocean） ──

function buildCardIndexSection(cards) {
  if (!Array.isArray(cards) || cards.length === 0) {
    return '## 既有知识卡索引\n（当前知识库为空，所有卡均为新建）'
  }
  const lines = cards.slice(0, 400).map((c) => {
    const type = c.cardType ? ` [${c.cardType}]` : ''
    const summary = c.summary ? ` — ${String(c.summary).slice(0, 60)}` : ''
    return `- ${c.relPath || c.name}${type}${summary}`
  })
  return ['## 既有知识卡索引（判断"是否已存在"的依据）', ...lines].join('\n')
}

function buildAnalysisPrompt(cardIndex, sourceName) {
  return [
    '你是资深研究分析员。阅读源文档并产出结构化分析（简体中文；专有名词/技术术语/代码标识符保留原文）。',
    '不要输出思维链、隐藏推理或前言；只输出精炼的最终分析。',
    '',
    '分析必须覆盖以下小节：',
    '',
    '## 关键实体',
    '人物/组织/产品/工具等。每项：名称与类型、在源中的角色（核心/外围）、是否可能已存在于既有知识卡（对照索引）。',
    '',
    '## 关键概念',
    '理论/方法/技术/现象。每项：名称与简短定义、为何重要、是否可能已存在。',
    '',
    '## 主要论点与发现',
    '核心主张、支撑证据、证据强度；每条主张标注其所属主体（不得把一个主体的评价转嫁给另一主体）。',
    '源中的结构化数据（SQL DDL、表结构、API 签名、配置、表格）原样保留在围栏代码块或 Markdown 表格中，禁止改写成散文。',
    '',
    '## 与既有知识卡的关联',
    '涉及哪些既有卡：强化、质疑还是延伸？',
    '',
    '## 矛盾与张力',
    '与既有卡内容冲突之处；源内部的张力与限制条件。',
    '',
    '## 建议',
    '应新建/更新哪些卡（给出卡型与卡名建议）；应强调与弱化什么；值得用户复核的开放问题。',
    '卡型只能取：source | entity | concept | synthesis。',
    '',
    '分析要全面但精炼，聚焦真正重要的内容。',
    '',
    buildCardIndexSection(cardIndex),
    '',
    `## 源文件\n${sourceName}`,
  ].join('\n')
}

function buildGenerationPrompt(cardIndex, sourceName) {
  return [
    '你是知识库维护者。基于第一阶段的分析生成知识卡。语言：简体中文（专有名词/术语/代码标识符/URL/文件名保留原文）。',
    '不要输出思维链、解释性前言；只输出下述 FILE 块。',
    '',
    '## 重要：源文件',
    `本源文件为 **${sourceName}**。所有生成卡的 frontmatter sources 字段必须包含它。`,
    '',
    '## 生成内容',
    `1. 一张 source 卡：路径必须为 **wiki/sources/${sourceName.replace(/\.[^.]+$/, '')}.md**（源摘要卡）`,
    '2. 每个关键实体一张 entity 卡：wiki/entities/<卡名>.md',
    '3. 每个关键概念一张 concept 卡：wiki/concepts/<卡名>.md',
    '4. 跨实体/概念的综合分析（若分析建议）一张 synthesis 卡：wiki/synthesis/<卡名>.md',
    '5. 与既有卡相关的新内容：不要重写既有卡（系统会自动合并），新卡通过 relations 字段声明与既有卡的关系。',
    '',
    '## Frontmatter 规则（解析器严格，违反即丢卡）',
    '',
    '1. 文件第一行必须是 `---`（三个连字符，别包代码围栏，别加 frontmatter: 前缀）。',
    '2. 每行一个 `key: value`；以另一行 `---` 结束；其后是正文。',
    '3. 数组用 YAML 行内式 `[a, b]`（仅 tags 用行内式）。',
    '',
    '字段与类型：',
    '- name — 卡名（与文件名一致，不含 .md）',
    `- type — 卡型：${COMPILE_CARD_TYPES.join(' | ')}`,
    '- summary — 一句话摘要（含冒号时用双引号包裹整个值）',
    '- tags — 字符串数组：`tags: [a, b]`',
    '- domain — 该卡所在 domain 路径（sources/entities/concepts/synthesis 之一，与文件路径一致）',
    '- sources — 数组，每项一行块式：',
    '    sources:',
    `      - path: .knowledges/.raw/${sourceName}`,
    "      anchor: ''",
    `      kind: ${sourceName.includes('.') ? sourceName.split('.').pop().toLowerCase() : 'text'}`,
    '- relations — 数组（可省略），每项 `to` 为目标卡名、`rel` 只能取封闭词表：',
    `    ${RELATION_VOCABULARY.join(' | ')}`,
    '- 不要输出 status / created / updated 字段（由系统强制写入）。',
    '',
    '## 正文规则',
    '- 正文使用 `[[卡名]]` wikilink 做交叉引用（卡名不含路径与 .md）',
    '- 结构化数据（DDL/表结构/API 签名/表格）原样进围栏代码块，字段名、类型、约束不得丢失',
    '- 主张、评价、限制条件保持主体边界：不得因关键词相同把一个主体的结论并入另一主体',
    '- 文件名：拉丁字符用 kebab-case；中日韩标题保留原字符；专名（OpenAI、GPT、Transformer 等）保留原文',
    '',
    buildCardIndexSection(cardIndex),
    '',
    '## 输出格式（必须严格遵守——解析器按此读取）',
    '',
    '全部输出由 FILE 块构成，不允许其他内容。FILE 块模板：',
    '```',
    '---FILE: wiki/path/to/card.md---',
    '（完整文件内容，含 YAML frontmatter）',
    '---END FILE---',
    '```',
    '',
    '## 输出要求（严格——违反将解析失败）',
    '',
    '1. 响应的第一个字符必须是 `-`（即 `---FILE:` 的开头）。',
    '2. 禁止任何前言（如"以下是生成的文件"）或结尾评论。',
    '3. 块之间只允许空行，不允许散文。',
    '4. 不要复述分析内容（那是第一阶段的产物）。',
    '5. 代码围栏内的 `---END FILE---` 不会被视为块结束（围栏感知），文档型内容可放心引用协议格式。',
    '',
    '不以 `---FILE:` 开头的响应将被整体丢弃。',
  ].join('\n')
}

function buildTruncatedRepairPrompt(sourceName, requestedPaths) {
  return [
    '你在修复此前被截断的知识卡 FILE 块。为每个请求路径各返回一个完整 FILE 块，不要输出其他文件。',
    '每个块必须以 `---END FILE---` 收尾。不要输出前言、其他卡或结尾评论。语言：简体中文。',
    'frontmatter 的 sources 字段必须包含本源文件。',
    '',
    '## 请求路径',
    ...requestedPaths.map((p) => `- ${p}`),
    '',
    `## 源文件\n${sourceName}`,
  ].join('\n')
}

function buildFallbackSourceCard(sourceName, analysis) {
  const base = sourceName.replace(/\.[^.]+$/, '')
  const body = [
    `# ${base}`,
    '',
    `> 源摘要兜底卡（LLM 未生成源摘要卡时由系统确定性生成）。源文件：\`.knowledges/.raw/${sourceName}\``,
    '',
    '## 第一阶段分析全文',
    '',
    String(analysis || '').trim(),
  ].join('\n')
  return {
    relPath: `sources/${base}`,
    content: buildKnowledgeCard({
      name: base,
      summary: `源 ${sourceName} 的摘要（兜底）`,
      type: 'source',
      tags: ['source'],
      sources: [{ path: `.knowledges/.raw/${sourceName}`, anchor: '', kind: sourceName.includes('.') ? sourceName.split('.').pop().toLowerCase() : 'text' }],
      domain: 'sources',
      body,
    }),
  }
}

// ── 缓存门（照抄 llm_wiki ingest-cache：命中要求产出卡都还在，防幽灵条目） ──

function readCacheEntries(services) {
  try {
    const raw = services.readState(CACHE_STATE_FILE)
    if (!raw) return {}
    const data = JSON.parse(raw)
    return data && typeof data.entries === 'object' ? data.entries : {}
  } catch {
    return {}
  }
}

function checkCache(services, sourceName, sourceContent) {
  const entries = readCacheEntries(services)
  const entry = entries[sourceName]
  if (!entry) return null
  if (entry.hash !== sha256(sourceContent)) return null
  for (const cardPath of entry.cards || []) {
    if (!services.fileExists(`${cardPath}.md`)) return null
  }
  return entry.cards
}

function saveCache(services, sourceName, sourceContent, cards) {
  const entries = readCacheEntries(services)
  entries[sourceName] = { hash: sha256(sourceContent), timestamp: Date.now(), cards }
  services.writeState(CACHE_STATE_FILE, JSON.stringify({ entries }, null, 2))
}

function appendWarnings(services, sourceName, warnings) {
  if (!Array.isArray(warnings) || warnings.length === 0) return
  const stamp = new Date().toISOString()
  const block = warnings.map((w) => `[${stamp}] ${sourceName}: ${w}`).join('\n') + '\n'
  services.writeState(WARNINGS_LOG_FILE, (services.readState(WARNINGS_LOG_FILE) || '') + block)
}

// ── 落盘：块 → 契约卡（合并语义：单源独占替换正文，多源共享并集） ──

function isOwnedOnlyBySource(frontmatter, sourceName) {
  const sources = Array.isArray(frontmatter && frontmatter.sources) ? frontmatter.sources : []
  if (sources.length === 0) return false
  return sources.every((s) => typeof s === 'object' && String(s.path || '').endsWith(`/${sourceName}`))
}

function writeCardBlock(services, block, sourceName) {
  const relPath = fileBlockPathToCardPath(block.path)
  const sanitized = sanitizeIngestedFileContent(block.content)
  const parsed = parseKnowledgeCard(sanitized)
  const incomingFm = parsed.frontmatter || {}
  if (!incomingFm.name) {
    incomingFm.name = relPath.split('/').pop()
  }

  const existing = services.loadCard(relPath)
  let content
  if (existing === null || existing === undefined) {
    content = buildKnowledgeCard({
      name: incomingFm.name,
      summary: incomingFm.summary,
      tags: Array.isArray(incomingFm.tags) ? incomingFm.tags : undefined,
      type: incomingFm.type,
      sources: Array.isArray(incomingFm.sources) ? incomingFm.sources : undefined,
      relations: Array.isArray(incomingFm.relations) ? incomingFm.relations : undefined,
      domain: incomingFm.domain,
      body: parsed.body,
    })
  } else {
    const existingParsed = parseKnowledgeCard(existing)
    const oldFm = existingParsed.frontmatter || {}
    const mergedSources = mergeUnionArrays(
      Array.isArray(oldFm.sources) ? oldFm.sources : [],
      Array.isArray(incomingFm.sources) ? incomingFm.sources : [],
    )
    const mergedRelations = mergeUnionArrays(
      Array.isArray(oldFm.relations) ? oldFm.relations : [],
      Array.isArray(incomingFm.relations) ? incomingFm.relations : [],
    )
    const mergedTags = mergeUnionArrays(
      Array.isArray(oldFm.tags) ? oldFm.tags : [],
      Array.isArray(incomingFm.tags) ? incomingFm.tags : [],
    )
    // 单源独占卡：重编译替换正文（合并会永久续命已撤回措辞——llm_wiki 语义）
    const replaceBody = isOwnedOnlyBySource(oldFm, sourceName) || !oldFm.sources
    content = buildKnowledgeCard({
      name: oldFm.name || incomingFm.name,
      summary: incomingFm.summary || oldFm.summary,
      tags: mergedTags,
      type: incomingFm.type || oldFm.type,
      sources: mergedSources.length > 0 ? mergedSources : [{ path: `.knowledges/.raw/${sourceName}`, anchor: '', kind: sourceName.includes('.') ? sourceName.split('.').pop().toLowerCase() : 'text' }],
      relations: mergedRelations,
      domain: incomingFm.domain || oldFm.domain,
      raw: { ...oldFm, status: 'pending' },
      body: replaceBody ? parsed.body : `${existingParsed.body}\n\n<!-- 编译追加（${sourceName}） -->\n\n${parsed.body}`,
    })
  }
  services.saveCard(relPath, content)
  return relPath
}

/**
 * 编译单个源。
 * ctx = { sourceName, services, llm, signal?, onProgress?(phase, detail) }
 * 返回 { cards: string[], skipped?: boolean, warnings: string[] }。
 * 失败抛 Error（队列据此重试；llm_wiki：静默 return 会被当成功）。
 */
async function compileSource(ctx) {
  const { sourceName, services, llm, signal, onProgress } = ctx
  const progress = (phase, detail) => {
    try { onProgress && onProgress(phase, detail) } catch { /* 进度回调失败不影响编译 */ }
  }

  progress('reading', '读取源文件…')
  const source = await services.readSource(sourceName)
  const sourceContent = source.content
  if (!sourceContent || !sourceContent.trim()) {
    throw new Error('源文件内容为空（或解析失败）')
  }

  progress('cache-check', '检查编译缓存…')
  const cached = checkCache(services, sourceName, sourceContent)
  if (cached) {
    progress('done', `缓存命中，跳过（${cached.length} 张卡）`)
    return { cards: cached, skipped: true, warnings: [] }
  }

  const cardIndex = services.listCards()

  // ── Step 1: 分析 ──
  progress('analyzing', '第 1/2 步：分析源文档…')
  const analysisRes = await services.streamLLM(
    llm,
    [
      { role: 'system', content: buildAnalysisPrompt(cardIndex, sourceName) },
      { role: 'user', content: `分析该源文档：\n\n${sourceContent}` },
    ],
    { temperature: 0.1, maxTokens: ANALYSIS_MAX_TOKENS },
    { signal },
  )
  if (!analysisRes.success || !analysisRes.content || !analysisRes.content.trim()) {
    throw new Error(`分析阶段失败: ${analysisRes.error || '空输出'}`)
  }

  // ── Step 2: 生成 ──
  progress('generating', '第 2/2 步：生成知识卡…')
  const generationRes = await services.streamLLM(
    llm,
    [
      { role: 'system', content: buildGenerationPrompt(cardIndex, sourceName) },
      {
        role: 'user',
        content: [
          `待加工源文件：**${sourceName}**`,
          '',
          '第一阶段分析如下（作为上下文，不要复述其表格/要点）：',
          '',
          analysisRes.content,
          '',
          '## 源文档全文',
          '',
          sourceContent,
          '',
          '现在输出 FILE 块（第一个字符必须是 `-`）。',
        ].join('\n'),
      },
    ],
    { temperature: 0.1, maxTokens: 16384 },
    { signal },
  )
  if (!generationRes.success) {
    throw new Error(`生成阶段失败: ${generationRes.error}`)
  }

  // ── 落盘 ──
  progress('writing', '解析 FILE 块并写入知识库…')
  let parsed = parseFileBlocks(generationRes.content)
  const warnings = [...parsed.warnings]
  const cards = []
  const hardFailures = []

  for (const block of parsed.blocks) {
    try {
      cards.push(writeCardBlock(services, block, sourceName))
    } catch (err) {
      const msg = `写卡失败 "${block.path}": ${err instanceof Error ? err.message : String(err)}`
      warnings.push(msg)
      hardFailures.push(block.path)
    }
  }

  // ── 截断修复（llm_wiki 闭环：只点名被截断路径，生成档 max_tokens） ──
  let unrecovered = parsed.truncatedPaths.filter(
    (p) => !cards.includes(fileBlockPathToCardPath(p)),
  )
  if (unrecovered.length > 0 && !(signal && signal.aborted)) {
    progress('repairing', `修复被截断的卡：${unrecovered.join(', ')}`)
    const repairRes = await services.streamLLM(
      llm,
      [
        { role: 'system', content: buildTruncatedRepairPrompt(sourceName, unrecovered) },
        { role: 'user', content: '现在输出被请求的完整 FILE 块（以 `---FILE:` 开头）。' },
      ],
      { temperature: 0.1, maxTokens: 16384 },
      { signal },
    )
    if (repairRes.success && repairRes.content) {
      const repairParsed = parseFileBlocks(repairRes.content)
      warnings.push(...repairParsed.warnings)
      for (const block of repairParsed.blocks) {
        if (!unrecovered.includes(block.path)) continue // 只接受被请求的路径
        try {
          cards.push(writeCardBlock(services, block, sourceName))
        } catch (err) {
          warnings.push(`修复写卡失败 "${block.path}": ${err instanceof Error ? err.message : String(err)}`)
          hardFailures.push(block.path)
        }
      }
      unrecovered = unrecovered.filter(
        (p) => !cards.includes(fileBlockPathToCardPath(p)),
      )
    }
  }

  // ── source 摘要卡兜底（LLM 漏了也必须有——llm_wiki 语义） ──
  const hasSourceCard = cards.some((c) => c.startsWith('sources/'))
  if (!hasSourceCard && !(signal && signal.aborted)) {
    const fallback = buildFallbackSourceCard(sourceName, analysisRes.content)
    try {
      services.saveCard(fallback.relPath, fallback.content)
      cards.push(fallback.relPath)
      warnings.push('LLM 未生成源摘要卡，已写入确定性兜底卡')
    } catch (err) {
      hardFailures.push(fallback.relPath)
      warnings.push(`兜底摘要卡写入失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (cards.length === 0) {
    throw new Error('编译未产出任何知识卡（生成输出解析失败或全部被拒）')
  }

  appendWarnings(services, sourceName, warnings)

  // ── 完整性门：硬失败/未修复截断 → 不进缓存并抛错（任务留在队列重试） ──
  if (hardFailures.length > 0 || unrecovered.length > 0) {
    const reasons = [
      hardFailures.length > 0 ? `${hardFailures.length} 张卡写入失败` : '',
      unrecovered.length > 0 ? `${unrecovered.length} 张截断卡未能修复: ${unrecovered.join(', ')}` : '',
    ].filter(Boolean)
    throw new Error(`编译不完整: ${reasons.join('；')}`)
  }

  progress('saving-cache', '记录编译缓存…')
  saveCache(services, sourceName, sourceContent, cards)
  progress('done', `完成：${cards.length} 张卡`)
  return { cards, warnings }
}

module.exports = {
  compileSource,
  buildAnalysisPrompt,
  buildGenerationPrompt,
  buildTruncatedRepairPrompt,
  buildFallbackSourceCard,
  fileBlockPathToCardPath,
  checkCache,
  saveCache,
  CARD_TYPE_DIRS,
  CACHE_STATE_FILE,
}
