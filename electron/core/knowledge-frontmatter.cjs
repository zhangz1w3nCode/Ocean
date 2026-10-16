/**
 * Ocean 知识编译 frontmatter 契约层（薄适配，构建在 llm_wiki 复制件之上）：
 * - buildKnowledgeCard：拼装完整知识卡（frontmatter + 正文）
 *     强制 status: pending（编译产物一律进审核门，与 core/knowledge.ts 的 create/update 语义一致）
 *     type（卡型）/ sources（对象数组出处）/ relations（封闭词表关系）
 *     未识别字段从 raw 原样保留（对齐渲染层 generateKnowledgeMarkdown 的保留语义）
 * - parseKnowledgeCard：解析复用 ./knowledge-ingest/frontmatter.cjs（js-yaml，对象数组保真）
 * - mergeCardUnionFields：重编译时数组字段并集（复用 ./knowledge-ingest/sources-merge.cjs）
 * - RELATION_VOCABULARY：M0 封闭关系词表（issue #88）
 */

const yaml = require('js-yaml')
const { parseFrontmatter } = require('./knowledge-ingest/frontmatter.cjs')
const { mergeArrayFieldsIntoContent } = require('./knowledge-ingest/sources-merge.cjs')

// M0 封闭关系词表：编译产物 relations.rel 只允许这些取值
const RELATION_VOCABULARY = ['上级领域', '所属领域', '依赖', '佐证', '矛盾', '取代', '示例', '待复核']

// 编译产物允许的卡型（issue #88 M0 的六型中，index/contract 不由编译器生成）
const COMPILE_CARD_TYPES = ['source', 'entity', 'concept', 'synthesis']

/**
 * 校验 relations 数组：[{to, rel}]，rel 必须来自封闭词表。
 * 返回 {valid, errors}。
 */
function validateRelations(relations) {
  if (!Array.isArray(relations)) return { valid: true, errors: [] }
  const errors = []
  for (const r of relations) {
    if (!r || typeof r !== 'object') {
      errors.push(`relation 项必须是对象: ${JSON.stringify(r)}`)
      continue
    }
    if (!r.to || typeof r.to !== 'string') errors.push(`relation.to 缺失或非字符串: ${JSON.stringify(r)}`)
    if (!r.rel || !RELATION_VOCABULARY.includes(r.rel)) {
      errors.push(`relation.rel "${r.rel}" 不在封闭词表 [${RELATION_VOCABULARY.join('/')}] 内`)
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 单行标量序列化：含冒号+空格、#、前后空格等 YAML 特殊字符时加引号。
 */
function formatScalarLine(key, value) {
  if (value === null || value === undefined) return `${key}: ''`
  const str = String(value)
  if (/[:#{}[\],&*?|>'"%@`]/.test(str) || str !== str.trim() || str === '') {
    return `${key}: ${JSON.stringify(str)}`
  }
  return `${key}: ${str}`
}

/**
 * 数组字段序列化：
 * - tags（字符串数组）用 flow style 单行（对齐渲染层 FLOW_STYLE_FIELDS 契约）
 * - sources/relations（对象数组）用块式（可读且与 frontmatter.cjs 解析兼容）
 */
function formatArrayLines(key, value) {
  if (key === 'tags' && Array.isArray(value) && value.every((v) => typeof v === 'string')) {
    const items = value.map((v) => (/[,#[\]{}]/.test(v) || v !== v.trim() ? JSON.stringify(v) : v))
    return items.length === 0 ? `${key}: []` : `${key}: [${items.join(', ')}]`
  }
  // 对象数组 / 混合数组：交给 js-yaml 块式输出（无行宽换行）
  const dumped = yaml.dump({ [key]: value }, { lineWidth: -1, noRefs: true }).trimEnd()
  return dumped
}

/**
 * 拼装完整知识卡文本。
 * opts:
 *   name      卡名（frontmatter.name；缺省从 raw 取）
 *   summary   摘要
 *   tags      字符串数组
 *   type      卡型（COMPILE_CARD_TYPES；非法值抛错）
 *   sources   [{path, anchor, kind}] 对象数组（编译产物必填，由调用方保证）
 *   relations [{to, rel}]（词表校验，非法项抛错——LLM 输出不可信，宁可失败重试）
 *   domain    所属 domain（frontmatter.domain；与落盘目录一致由调用方维护）
 *   raw       既有卡 frontmatter 对象（未知字段保留；同名键被本次显式字段覆盖）
 *   body      正文（不含 frontmatter）
 * status 恒为 pending（强制，不接受参数覆盖）。
 */
function buildKnowledgeCard(opts) {
  const { name, summary, tags, type, sources, relations, domain, raw, body } = opts || {}
  if (type && !COMPILE_CARD_TYPES.includes(type)) {
    throw new Error(`非法卡型 "${type}"（允许: ${COMPILE_CARD_TYPES.join(' | ')}）`)
  }
  const relCheck = validateRelations(relations)
  if (!relCheck.valid) {
    throw new Error(`relations 校验失败: ${relCheck.errors.join('; ')}`)
  }

  const fields = { ...(raw && typeof raw === 'object' ? raw : {}) }
  if (name !== undefined && name !== null) fields.name = name
  if (summary !== undefined && summary !== null) fields.summary = summary
  if (tags !== undefined) fields.tags = tags
  if (type !== undefined) fields.type = type
  if (sources !== undefined) fields.sources = sources
  if (relations !== undefined) fields.relations = relations
  if (domain !== undefined && domain !== null && domain !== '') fields.domain = domain
  else if (domain === '') delete fields.domain
  if (fields.name === undefined) throw new Error('知识卡缺少 name')

  // 强制审核门：编译产物一律 pending，显式传入的 status 一律忽略
  fields.status = 'pending'

  const lines = ['---']
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue
    if (Array.isArray(value) || (value !== null && typeof value === 'object')) {
      lines.push(formatArrayLines(key, value))
    } else {
      lines.push(formatScalarLine(key, value))
    }
  }
  lines.push('---', '')
  lines.push(body === undefined || body === null ? '' : String(body))
  return lines.join('\n')
}

/**
 * 解析知识卡：{frontmatter, body}。frontmatter 结构化（对象数组保真，复制件能力）。
 */
function parseKnowledgeCard(content) {
  const r = parseFrontmatter(String(content || ''))
  return { frontmatter: r.frontmatter, body: r.body }
}

/**
 * 重编译/合并场景：新旧卡数组字段（sources/tags/relations）并集。
 * 复制件 mergeArrayFieldsIntoContent 针对字符串数组（大小写不敏感去重）；
 * 对象数组（sources/relations）按 JSON 序列化等价去重。
 */
function mergeUnionArrays(oldValue, newValue) {
  if (!Array.isArray(oldValue)) return Array.isArray(newValue) ? [...newValue] : newValue
  if (!Array.isArray(newValue)) return [...oldValue]
  const seen = new Set()
  const out = []
  for (const item of [...oldValue, ...newValue]) {
    const key = item !== null && typeof item === 'object' ? JSON.stringify(canonicalKeyOrder(item)) : String(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function canonicalKeyOrder(item) {
  const keys = Object.keys(item).sort()
  const o = {}
  for (const k of keys) o[k] = item[k]
  return o
}

module.exports = {
  RELATION_VOCABULARY,
  COMPILE_CARD_TYPES,
  validateRelations,
  buildKnowledgeCard,
  parseKnowledgeCard,
  mergeUnionArrays,
  formatScalarLine,
  formatArrayLines,
}
