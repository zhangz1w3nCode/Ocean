#!/usr/bin/env node
// 资产迁移脚本：把项目根的资产目录迁入 .ocean/ 资产源区，并改写数据文件中的旧路径引用。
// 用法：
//   node scripts/migrate-assets-to-ocean.mjs [--root <项目根>] [--write] [--backfill] [--adopt]
// 默认 dry-run（只打印将要执行的动作，不落盘）；加 --write 才真正执行。脚本幂等，可重复运行。
//
// 动作清单：
//   1. move   .nodes/.resources/.workflows/.tasks/.codebases -> .ocean/<同名>（目标已存在则跳过并报告）
//   2. move   .knowledges/*（除 .git）-> .ocean/knowledges/；旧 .knowledges/.git 原地保留不删（历史按决策丢弃，由用户自行清理）
//   3. copy   .pi/skills/* -> .ocean/skills/、.pi/agents/*.md -> .ocean/agents/（运行时目录保留，等首次同步对齐；同名冲突以源区为准跳过）
//   4. rewrite 所有 flow.json（含实例快照）的 nodeRefPath：.nodes/ .workflows/ 前缀 -> .ocean/...
//   5. rewrite md 文件（WORKFLOW.md 表格 / wiki-link / 反引号路径）中 .nodes/ .workflows/ .resources/ .knowledges/ 前缀 -> .ocean/...
//   6. --backfill 存量回填：全部资产补 reviewStatus: validated + version: 1（知识按存量 status 映射）
//   7. --adopt  审核队列收编：把正式位置中 reviewStatus 为 pending/rejected 的资产搬入
//             .ocean/reviewQueue/<type>/<nameKey>/<ts>/ 快照目录（G1/G2）；正式位置仅保留过审版本。
//             skill/workflow/codebase 整目录搬迁；task 仅搬 TASK.md（context/trace 留原处）；
//             其余单文件搬迁（knowledge 含 domain 子目录，搬迁后清理空父目录）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const write = argv.includes('--write')
const backfill = argv.includes('--backfill')
const adopt = argv.includes('--adopt')
const rootIdx = argv.indexOf('--root')
const root = path.resolve(rootIdx >= 0 ? argv[rootIdx + 1] : process.cwd())

const actions = [] // {op, from, to, note?}
const rewrites = { flowJson: [], markdown: [] }

const exists = (p) => fs.existsSync(p)
const log = (msg) => console.log(msg)

function planMove(from, to, note) {
  if (!exists(from)) return
  if (exists(to)) {
    actions.push({ op: 'skip', from, to, note: note || '目标已存在' })
    return
  }
  actions.push({ op: 'move', from, to })
}

function planCopyTree(from, to) {
  if (!exists(from)) return
  const entries = fs.readdirSync(from, { withFileTypes: true })
  for (const e of entries) {
    if (e.name === '.DS_Store' || e.name === '.git') continue
    const src = path.join(from, e.name)
    const dst = path.join(to, e.name)
    if (exists(dst)) {
      actions.push({ op: 'skip', from: src, to: dst, note: '目标已存在（源区优先）' })
      continue
    }
    actions.push({ op: 'copy', from: src, to: dst })
  }
}

// --- 1/2: 项目根资产目录 -> .ocean/ ---
const moveDirs = ['nodes', 'resources', 'workflows', 'tasks', 'codebases']
for (const d of moveDirs) {
  planMove(path.join(root, `.${d}`), path.join(root, '.ocean', d))
}
// .knowledges：内容逐项 move，.git 留守
if (exists(path.join(root, '.knowledges'))) {
  for (const e of fs.readdirSync(path.join(root, '.knowledges'))) {
    if (e === '.git' || e === '.DS_Store') continue
    const src = path.join(root, '.knowledges', e)
    const dst = path.join(root, '.ocean', 'knowledges', e)
    if (exists(dst)) {
      actions.push({ op: 'skip', from: src, to: dst, note: '目标已存在' })
      continue
    }
    actions.push({ op: 'move', from: src, to: dst })
  }
  if (exists(path.join(root, '.knowledges', '.git'))) {
    actions.push({ op: 'keep', from: path.join(root, '.knowledges', '.git'), to: null, note: '旧知识库 git 历史原地保留（按决策丢弃，不迁移不删除，可手动清理）' })
  }
}

// --- 3: 运行时技能/智能体 -> 源区（copy，运行时保留） ---
planCopyTree(path.join(root, '.pi', 'skills'), path.join(root, '.ocean', 'skills'))
planCopyTree(path.join(root, '.pi', 'agents'), path.join(root, '.ocean', 'agents'))

// --- 4/5: 内容改写扫描（兼容迁移前后两种位置：dry-run 时资产还在旧位置，按旧位置计算；已迁移则扫 .ocean） ---
const mdPrefixPairs = [
  ['`.nodes/', '`.ocean/nodes/'],
  ['`.workflows/', '`.ocean/workflows/'],
  ['`.resources/', '`.ocean/resources/'],
  ['`.knowledges/', '`.ocean/knowledges/'],
]

function effectiveScanDir(name) {
  const target = path.join(root, '.ocean', name)
  if (exists(target)) return target
  // skills/agents 迁移前在运行时目录 .pi/ 下（dry-run 时用它们预演改写范围）
  if (name === 'skills' || name === 'agents') {
    const runtime = path.join(root, '.pi', name)
    if (exists(runtime)) return runtime
  }
  const legacy = path.join(root, `.${name}`)
  if (exists(legacy)) return legacy
  return target
}

function scanDirForRewrite(dir, relBase) {
  if (!exists(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === '.DS_Store' || e.name === 'node_modules') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      scanDirForRewrite(full, relBase)
    } else if (e.name.endsWith('.json') && e.name === 'flow.json') {
      rewrites.flowJson.push(full)
    } else if (e.name.endsWith('.md')) {
      rewrites.markdown.push(full)
    }
  }
}

const sourceDirs = ['workflows', 'nodes', 'resources', 'knowledges', 'tasks', 'skills', 'agents']
function runScan() {
  rewrites.flowJson.length = 0
  rewrites.markdown.length = 0
  for (const d of sourceDirs) scanDirForRewrite(effectiveScanDir(d), d)
}
runScan() // dry-run 时（尚未移动）扫旧位置；write 模式下移动后会重新扫描

function rewriteFlowJsonText(text) {
  let changed = false
  let out = text.replace(/"nodeRefPath"\s*:\s*"(\.nodes\/[^"]+)"/g, (m, p) => { changed = true; return `"nodeRefPath": ".ocean/${p.slice(1)}"` })
  out = out.replace(/"nodeRefPath"\s*:\s*"(\.workflows\/[^"]+)"/g, (m, p) => { changed = true; return `"nodeRefPath": ".ocean/${p.slice(1)}"` })
  return { out, changed }
}

function rewriteMarkdownText(text) {
  let changed = false
  let out = text
  for (const [oldP, newP] of mdPrefixPairs) {
    if (out.includes(oldP)) {
      out = out.split(oldP).join(newP)
      changed = true
    }
  }
  return { out, changed }
}

// --- 6: --backfill 存量回填：全部资产补 reviewStatus: validated + version: 1（知识按存量 status 映射） ---
function insertFrontmatterKeys(text, inserts) {
  // inserts: {key: value}；已有键则跳过；无 frontmatter 则新建头部
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) {
    const lines = Object.entries(inserts).map(([k, v]) => `${k}: ${v}`)
    return `---\n${lines.join('\n')}\n---\n${text}`
  }
  let fm = m[1]
  const added = []
  for (const [k, v] of Object.entries(inserts)) {
    if (!new RegExp(`^${k}:`, 'm').test(fm)) {
      fm += `\n${k}: ${v}`
      added.push(k)
    }
  }
  if (!added.length) return null // 无变化
  return `---\n${fm.replace(/^\n+/, '')}\n---\n${m[2].replace(/^\n+/, '')}`
}

function collectFiles(dir, filter, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === '.DS_Store' || e.name === 'node_modules') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) collectFiles(full, filter, out)
    else if (filter(full)) out.push(full)
  }
  return out
}

let backfilled = 0
if (backfill) {
  const targets = []
  collectFiles(path.join(root, '.ocean', 'skills'), (f) => f.endsWith('SKILL.md'), targets)
  collectFiles(path.join(root, '.ocean', 'agents'), (f) => f.endsWith('.md'), targets)
  collectFiles(path.join(root, '.ocean', 'nodes'), (f) => f.endsWith('.md'), targets)
  collectFiles(path.join(root, '.ocean', 'resources'), (f) => f.endsWith('.md'), targets)
  collectFiles(path.join(root, '.ocean', 'workflows'), (f) => path.basename(f) === 'WORKFLOW.md', targets)
  collectFiles(path.join(root, '.ocean', 'tasks'), (f) => path.basename(f) === 'TASK.md', targets)
  collectFiles(path.join(root, '.ocean', 'knowledges'), (f) => f.endsWith('.md'), targets)
  collectFiles(path.join(root, '.ocean', 'codebases'), (f) => path.basename(f) === 'README.md', targets)

  for (const f of targets) {
    const text = fs.readFileSync(f, 'utf-8')
    const inserts = { reviewStatus: 'validated', version: 1 }
    // 知识卡按存量 status 映射（保留待审状态，不一律 validated）
    const sm = text.match(/^---\n([\s\S]*?)\n---/)
    const legacy = sm ? sm[1].match(/^status:\s*(\S+)/m) : null
    if (legacy && legacy[1] === 'pending') inserts.reviewStatus = 'pending'
    const out = insertFrontmatterKeys(text, inserts)
    if (out == null) continue
    log(`[BACKFILL] ${path.relative(root, f)}`)
    backfilled++
    if (write) fs.writeFileSync(f, out, 'utf-8')
  }
}

// --- 7: --adopt 审核队列收编（G1/G2）：正式位置 pending/rejected 资产 → reviewQueue 快照 ---

const ADOPT_TYPE_DIRS = ['skills', 'agents', 'nodes', 'resources', 'workflows', 'tasks', 'knowledges', 'codebases']
const ADOPT_MAIN_FILE = { skills: 'SKILL.md', workflows: 'WORKFLOW.md', tasks: 'TASK.md', codebases: 'README.md' }
// 整目录搬迁的类型；tasks 仅搬 TASK.md（G10 例外：context/trace 留原处）；其余单文件
const ADOPT_DIR_MOVE = new Set(['skills', 'workflows', 'codebases'])

function parseFmReviewStatus(text) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---/)
  if (!m) return null
  const rs = m[1].match(/^reviewStatus:\s*(\S+)/m)
  if (!rs) return null
  const v = rs[1].replace(/^['"]|['"]$/g, '')
  return (v === 'pending' || v === 'rejected' || v === 'validated') ? v : null
}

// 时间戳（G2）：YYYYMMDDHHmmssSSS，同毫秒冲突追加零填充序号，保证唯一且字典序即时间序
function adoptNextTs(baseDir) {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const ms = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
  if (!exists(path.join(baseDir, ms))) return ms
  for (let i = 1; i <= 9999; i++) {
    const cand = `${ms}-${p(i, 4)}`
    if (!exists(path.join(baseDir, cand))) return cand
  }
  throw new Error('adopt 时间戳冲突无法消解（同一毫秒内超过 9999 个快照）')
}

function removeEmptyDirsUpTo(dir, stopDir) {
  // 从 dir 向上删除空目录，直到 stopDir（不含）或遇到非空目录
  let cur = dir
  while (cur && cur !== stopDir && cur.length > stopDir.length) {
    try {
      const entries = fs.readdirSync(cur)
      if (entries.length > 0) break
      fs.rmdirSync(cur)
    } catch { break }
    cur = path.dirname(cur)
  }
}

// 扫描正式位置，收集待 adopt 的资产
function collectAdoptPlan() {
  const plan = []
  const oceanBase = path.join(root, '.ocean')

  for (const typeDir of ADOPT_TYPE_DIRS) {
    const base = path.join(oceanBase, typeDir)
    if (!exists(base)) continue
    const mainFile = ADOPT_MAIN_FILE[typeDir]

    if (typeDir === 'knowledges') {
      // 递归扫描（nameKey 允许含 '/'，如 ocean/功能设计）
      const walk = (dir, rel) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name === '.DS_Store' || e.name === '.git') continue
          const full = path.join(dir, e.name)
          const relPath = rel ? `${rel}/${e.name}` : e.name
          if (e.isDirectory()) { walk(full, relPath); continue }
          if (!e.name.endsWith('.md')) continue
          const status = parseFmReviewStatus(fs.readFileSync(full, 'utf-8'))
          if (status !== 'pending' && status !== 'rejected') continue
          plan.push({ typeDir, nameKey: relPath.replace(/\.md$/, ''), status, srcAbs: full, srcDir: path.dirname(full) })
        }
      }
      walk(base, '')
    } else if (mainFile) {
      // 目录型资产（skills/workflows/tasks/codebases）
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name === '.DS_Store' || e.name === '.git') continue
        const mainAbs = path.join(base, e.name, mainFile)
        if (!exists(mainAbs)) continue
        const status = parseFmReviewStatus(fs.readFileSync(mainAbs, 'utf-8'))
        if (status !== 'pending' && status !== 'rejected') continue
        plan.push({ typeDir, nameKey: e.name, status, srcAbs: mainAbs, srcDir: path.join(base, e.name) })
      }
    } else {
      // 单文件型资产（agents/nodes/resources）
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (!e.isFile() || !e.name.endsWith('.md') || e.name === '.DS_Store') continue
        const full = path.join(base, e.name)
        const status = parseFmReviewStatus(fs.readFileSync(full, 'utf-8'))
        if (status !== 'pending' && status !== 'rejected') continue
        plan.push({ typeDir, nameKey: e.name.replace(/\.md$/, ''), status, srcAbs: full, srcDir: base })
      }
    }
  }
  return plan
}

let adopted = 0
let adoptPlan = []
if (adopt) {
  adoptPlan = collectAdoptPlan()
}

// --- 执行 ---
log(`root: ${root}`)
log(`mode: ${write ? 'WRITE（落盘）' : 'DRY-RUN（只打印，不落盘；加 --write 执行）'}${backfill ? ' + BACKFILL（回填 reviewStatus/version）' : ''}${adopt ? ' + ADOPT（收编 pending/rejected 资产入审核队列）' : ''}`)
log('')

let moved = 0, copied = 0, skipped = 0, kept = 0
for (const a of actions) {
  const tag = { move: 'MOVE', copy: 'COPY', skip: 'SKIP', keep: 'KEEP' }[a.op]
  log(`[${tag}] ${path.relative(root, a.from)}${a.to ? ' -> ' + path.relative(root, a.to) : ''}${a.note ? `  (${a.note})` : ''}`)
  if (!write) continue
  if (a.op === 'move') {
    fs.mkdirSync(path.dirname(a.to), { recursive: true })
    fs.renameSync(a.from, a.to)
    moved++
  } else if (a.op === 'copy') {
    fs.mkdirSync(path.dirname(a.to), { recursive: true })
    fs.cpSync(a.from, a.to, { recursive: true })
    copied++
  }
  if (a.op === 'skip') skipped++
  if (a.op === 'keep') kept++
}

// write 模式：目录已移动/复制到位，重新按新位置扫描改写目标
if (write) runScan()

let flowChanged = 0, mdChanged = 0
for (const f of rewrites.flowJson) {
  const text = fs.readFileSync(f, 'utf-8')
  const { out, changed } = rewriteFlowJsonText(text)
  if (!changed) continue
  log(`[REWRITE flow.json] ${path.relative(root, f)}`)
  if (write) {
    fs.writeFileSync(f, out, 'utf-8')
    flowChanged++
  } else {
    flowChanged++
  }
}
for (const f of rewrites.markdown) {
  const text = fs.readFileSync(f, 'utf-8')
  const { out, changed } = rewriteMarkdownText(text)
  if (!changed) continue
  log(`[REWRITE md] ${path.relative(root, f)}`)
  if (write) {
    fs.writeFileSync(f, out, 'utf-8')
    mdChanged++
  } else {
    mdChanged++
  }
}

// --- adopt 执行（在迁移/回填/改写之后：操作对象是已在 .ocean/ 内的文件） ---
for (const item of adoptPlan) {
  const queueBase = path.join(root, '.ocean', 'reviewQueue', item.typeDir, item.nameKey)
  const ts = adoptNextTs(queueBase)
  const snapDir = path.join(queueBase, ts)
  const isDirMove = ADOPT_DIR_MOVE.has(item.typeDir)
  const dstDisplay = `.ocean/reviewQueue/${item.typeDir}/${item.nameKey}/${ts}`
  log(`[ADOPT] ${item.typeDir}/${item.nameKey} (${item.status}) -> ${dstDisplay}`)
  if (!write) { adopted++; continue }

  fs.mkdirSync(queueBase, { recursive: true })
  if (isDirMove) {
    // skill/workflow/codebase：整目录搬迁
    fs.renameSync(item.srcDir, snapDir)
  } else if (item.typeDir === 'tasks') {
    // task（G10 例外）：仅搬 TASK.md，context/trace 留原处，不删任务目录
    fs.mkdirSync(snapDir, { recursive: true })
    fs.renameSync(item.srcAbs, path.join(snapDir, 'TASK.md'))
  } else {
    // 单文件资产（agents/nodes/resources/knowledges）
    fs.mkdirSync(snapDir, { recursive: true })
    const fileName = path.basename(item.srcAbs)
    fs.renameSync(item.srcAbs, path.join(snapDir, fileName))
    // knowledge 含 domain 子目录：搬迁后清理空父目录
    if (item.typeDir === 'knowledges') {
      removeEmptyDirsUpTo(path.dirname(item.srcAbs), path.join(root, '.ocean', 'knowledges'))
    }
  }
  adopted++
}

log('')
log(`摘要: 待执行动作 ${actions.length} 条（move/copy/skip/keep），flow.json 改写 ${flowChanged} 个，md 改写 ${mdChanged} 个${backfill ? `，回填 ${backfilled} 个` : ''}${adopt ? `，收编 ${adopted} 个` : ''}`)
if (write) {
  log(`落盘: moved=${moved} copied=${copied} skipped=${skipped} kept=${kept}, flowJson 写回 ${flowChanged}, md 写回 ${mdChanged}`)
} else {
  log('（dry-run 未落盘）')
}

// 提醒：.agents/skills 影子目录（pi 会扫描，与物化目录同名时产生冲突诊断）
if (exists(path.join(root, '.agents', 'skills'))) {
  log('')
  log(`提醒: 检测到 ${path.join(root, '.agents', 'skills')}（pi 运行时会扫描该目录，与 .pi/skills 同名技能会冲突）。本脚本不处理，请自行裁决保留或清理。`)
}
