// 资产审核共享模块（暂存队列模型：CLI `ocean review` 与主进程 IPC 共用，避免两处漂移）
// 核心不变量（G3/G7）：正式位置 .ocean/<typeDir>/ 只保存最近过审版本；草稿全部进
// .ocean/reviewQueue/<typeDir>/<nameKey>/<ts>/；只有 approve 会写正式位置。
// CJS 形态：launch.cjs 直接 require；bin/ocean.ts 经 esbuild 打包引入
const fs = require('node:fs')
const path = require('node:path')
const child_process = require('node:child_process')

// ---------- 类型映射（CLI 名称 → .ocean 子目录） ----------
const TYPE_TO_DIR = {
  skill: 'skills', agent: 'agents', node: 'nodes', resource: 'resources',
  workflow: 'workflows', task: 'tasks', knowledge: 'knowledges', codebase: 'codebases',
}
const DIR_TO_TYPE = Object.fromEntries(Object.entries(TYPE_TO_DIR).map(([k, v]) => [v, k]))
// 目录型资产（正式位置是目录，主文件固定名）；其余为单文件资产（主文件 = <basename>.md）
const MAIN_FILE = { skills: 'SKILL.md', workflows: 'WORKFLOW.md', tasks: 'TASK.md', codebases: 'README.md' }
// 快照目录名：毫秒时间戳（G2），同毫秒冲突追加零填充序号（-0001），字典序即时间序
const TS_RE = /^\d{17}(-\d{4})?$/

function oceanDir(root) {
  const d = path.join(root, '.ocean')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}

// 归一化 .ocean 相对路径：拒绝绝对路径/反斜杠/空段/./..（防目录穿越）
function normalizeAssetRel(refPath) {
  const normalized = String(refPath == null ? '' : refPath).replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return null
  }
  return normalized
}

// ---------- 按类型+名称定位资产（CLI 不暴露磁盘路径） ----------
// knowledge 名称可带 domain 子目录（如 "ocean/功能设计"）；其余类型名称唯一
function resolveRef(root, type, name) {
  const dir = TYPE_TO_DIR[String(type || '').trim()]
  if (!dir) return { error: `未知的资产类型: ${type}（可选 ${Object.keys(TYPE_TO_DIR).join(' / ')}）` }
  const cleanName = String(name == null ? '' : name).trim().replace(/\.md$/i, '').replace(/^\/+|\/+$/g, '')
  if (!cleanName || cleanName.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return { error: '非法的资产名称' }
  }
  if (dir === 'skills') return { refPath: `skills/${cleanName}/SKILL.md`, type, name: cleanName }
  if (dir === 'workflows') return { refPath: `workflows/${cleanName}/WORKFLOW.md`, type, name: cleanName }
  if (dir === 'tasks') return { refPath: `tasks/${cleanName}/TASK.md`, type, name: cleanName }
  if (dir === 'codebases') return { refPath: `codebases/${cleanName}/README.md`, type, name: cleanName }
  return { refPath: `${dir}/${cleanName}.md`, type, name: cleanName }
}

function typeLabel(type) {
  return { skill: '技能', agent: '智能体', node: '节点', resource: '资源', workflow: '工作流', task: '任务', knowledge: '知识', codebase: '代码库' }[type] || type
}

// ---------- frontmatter 解析 ----------
function parseReviewStatus(text, allowLegacyStatus = false) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---/)
  if (!m) return 'pending'
  const fm = m[1]
  const rs = fm.match(/^reviewStatus:\s*(\S+)/m)
  if (rs) return rs[1] === 'validated' ? 'validated' : rs[1] === 'rejected' ? 'rejected' : 'pending'
  if (allowLegacyStatus) {
    const ls = fm.match(/^status:\s*(\S+)/m)
    if (ls && ls[1] === 'validated') return 'validated'
  }
  return 'pending'
}
function parseFmField(text, key) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---/)
  if (!m) return ''
  const r = m[1].match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return r ? r[1].trim() : ''
}
function parseVersion(text) {
  const v = parseFmField(text, 'version')
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}
function stripFrontmatter(raw) {
  const m = /^---\n[\s\S]*?\n---\n?/.exec(String(raw))
  return m ? String(raw).slice(m[0].length) : String(raw)
}
// 写 frontmatter 字段：设置/替换 key（value 非空），或删除（value 为 null）；无 frontmatter 时新建头部
function setFmField(text, key, value) {
  if (value == null || value === '') {
    return text
      .replace(/^(---\n)([\s\S]*?)(\n---)/, (w, open, fm, close) => open + fm.replace(new RegExp(`^${key}:.*$\\n?`, 'm'), '') + close)
      .replace(/^---\n\n+---/, '---\n---')
  }
  const line = `${key}: ${value}`
  if (/^---\n/.test(text)) {
    return text.replace(/^(---\n)([\s\S]*?)(\n---)/, (w, open, fm, close) =>
      new RegExp(`^${key}:`, 'm').test(fm)
        ? open + fm.replace(new RegExp(`^${key}:.*$`, 'm'), line) + close
        : open + fm + '\n' + line + close)
  }
  return `---\n${line}\n---\n${text}`
}

// ---------- git helpers（.ocean 仓库） ----------
function realPath(p) {
  try { return fs.realpathSync(p) } catch { return path.resolve(p) }
}
function runGitInOcean(root, args, opts) {
  return child_process.spawnSync('git', ['-C', oceanDir(root), ...args], { encoding: 'utf-8', ...(opts || {}) })
}
function isGitManaged(root) {
  try {
    const d = oceanDir(root)
    if (!fs.existsSync(path.join(d, '.git'))) return false
    const r = runGitInOcean(root, ['rev-parse', '--show-toplevel'])
    if (r.status !== 0 || typeof r.stdout !== 'string') return false
    return realPath(r.stdout.trim()) === realPath(d)
  } catch { return false }
}
function gitIdentityArgs() {
  const args = []
  try {
    const email = child_process.spawnSync('git', ['config', 'user.email'], { encoding: 'utf-8' })
    if (!email.stdout || !String(email.stdout).trim()) args.push('-c', 'user.email=ocean@local')
    const name = child_process.spawnSync('git', ['config', 'user.name'], { encoding: 'utf-8' })
    if (!name.stdout || !String(name.stdout).trim()) args.push('-c', 'user.name=Ocean')
  } catch { args.push('-c', 'user.email=ocean@local', '-c', 'user.name=Ocean') }
  return args
}
function timestamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}
function hasCommits(root) {
  return runGitInOcean(root, ['rev-parse', '--verify', '--quiet', 'HEAD']).status === 0
}
// 黑名单 .gitignore：排除运行态、机器绑定配置（含明文 apiKey）与审核队列草稿（G9：HEAD == 正式位置）
const ASSET_GITIGNORE = [
  '.DS_Store', 'llm-config.json', 'agentic-config.json', 'knowledge-git.json', 'asset-git.json',
  'knowledge-graph-config.json', 'cli-workflow-llm-judge-artifacts.json', 'setting/', 'tmp/',
  'knowledge-jobs/', 'agent-review-sessions/', 'knowledge-compile-*', '.trashbox/',
  'reviewQueue/', 'workflows/*/instance/', 'tasks/*/trace/', '',
].join('\n')

function gitStatus(root) {
  if (!isGitManaged(root)) return { success: true, managed: false, branch: null, hasCommits: false }
  const b = runGitInOcean(root, ['symbolic-ref', '--short', '-q', 'HEAD'])
  return { success: true, managed: true, branch: b.status === 0 && b.stdout ? b.stdout.trim() : null, hasCommits: hasCommits(root) }
}
function gitInit(root) {
  const d = oceanDir(root)
  if (!isGitManaged(root)) {
    let init = runGitInOcean(root, ['init', '-b', 'main'])
    if (init.status !== 0) {
      init = runGitInOcean(root, ['init'])
      if (init.status !== 0) return { success: false, error: init.stderr ? String(init.stderr) : 'git init 失败' }
    }
    fs.writeFileSync(path.join(d, '.gitignore'), ASSET_GITIGNORE, 'utf-8')
  }
  const add = runGitInOcean(root, ['add', '-A'])
  if (add.status !== 0) return { success: false, error: add.stderr ? String(add.stderr) : 'git add 失败' }
  const commit = runGitInOcean(root, [...gitIdentityArgs(), 'commit', '-m', 'chore(assets): initialize .ocean asset repository as baseline'])
  if (commit.status !== 0) {
    const out = `${commit.stdout || ''}${commit.stderr || ''}`
    if (!/nothing to commit|no changes added/i.test(out)) return { success: false, error: out || 'git commit 失败' }
  }
  return { success: true, branch: 'main', hasCommits: hasCommits(root) }
}
function gitLog(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径', commits: [] }
  if (!isGitManaged(root)) return { success: true, commits: [] }
  const r = runGitInOcean(root, ['log', '--format=%H%x1f%an%x1f%aI%x1f%s', '--', rel])
  if (r.status !== 0 || typeof r.stdout !== 'string') return { success: true, commits: [] }
  const commits = r.stdout.split('\n').filter(Boolean).map((line) => {
    const [hash, author, date, subject] = line.split('\x1f')
    return { hash, author, date, subject }
  })
  return { success: true, commits }
}
function gitShow(root, refPath, rev) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径', content: null }
  const sha = String(rev == null ? '' : rev)
  if (!/^[0-9a-fA-F]{4,40}$/.test(sha)) return { success: false, error: '非法的版本号', content: null }
  if (!isGitManaged(root)) return { success: true, content: null }
  const r = runGitInOcean(root, ['show', `${sha}:${rel}`])
  return { success: true, content: r.status === 0 && typeof r.stdout === 'string' ? r.stdout : null }
}
// HEAD 基线内容（上次审核通过并提交的版本；GUI 历史版本查看仍用）
function gitBaseline(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径', content: null }
  if (!isGitManaged(root) || !hasCommits(root)) return { success: true, content: null }
  const r = runGitInOcean(root, ['show', `HEAD:${rel}`])
  return { success: true, content: r.status === 0 && typeof r.stdout === 'string' ? r.stdout : null }
}
// 提交指定正式路径（支持字符串或字符串数组——approve 一次落盘的路径集合）；路径可以是文件或目录
function gitCommit(root, refPath, message) {
  const rels = (Array.isArray(refPath) ? refPath : [refPath]).map(normalizeAssetRel)
  if (rels.some((r) => !r)) return { success: false, error: '非法的资产路径' }
  if (!isGitManaged(root)) return { success: false, error: '.ocean 尚未开启 git 托管' }
  if (rels.some((rel) => !fs.existsSync(path.join(oceanDir(root), rel)))) return { success: false, error: '资产文件不存在' }
  const msg = String(message == null ? '' : message).replace(/\r\n/g, '\n').trim() || `chore(assets): ${timestamp()} asset is updated`
  const add = runGitInOcean(root, ['add', '--', ...rels])
  if (add.status !== 0) return { success: false, error: add.stderr ? String(add.stderr) : 'git add 失败' }
  const commit = runGitInOcean(root, [...gitIdentityArgs(), 'commit', '-m', msg, '--', ...rels])
  if (commit.status !== 0) {
    const out = `${commit.stdout || ''}${commit.stderr || ''}`
    if (/nothing to commit|no changes added|nothing added to commit/i.test(out)) return { success: true, noChanges: true, message: msg }
    return { success: false, error: out || 'git commit 失败' }
  }
  const rev = runGitInOcean(root, ['rev-parse', 'HEAD'])
  return { success: true, hash: rev.status === 0 && rev.stdout ? rev.stdout.trim() : null, message: msg }
}
function gitRollback(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径' }
  if (!isGitManaged(root)) return { success: false, error: '.ocean 尚未开启 git 托管' }
  const fp = path.join(oceanDir(root), rel)
  const hasBaseline = hasCommits(root) && runGitInOcean(root, ['cat-file', '-e', `HEAD:${rel}`]).status === 0
  if (hasBaseline) {
    const co = runGitInOcean(root, ['checkout', 'HEAD', '--', rel])
    return co.status === 0 ? { success: true, action: 'restored' } : { success: false, error: co.stderr ? String(co.stderr) : 'git checkout 失败' }
  }
  runGitInOcean(root, ['rm', '-r', '--cached', '--ignore-unmatch', '--', rel])
  if (fs.existsSync(fp)) fs.rmSync(fp, { recursive: true, force: true })
  return { success: true, action: 'deleted' }
}

// ---------- 暂存队列 ----------
function queueDir(root) {
  const d = path.join(oceanDir(root), 'reviewQueue')
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true })
  return d
}
// 快照主文件相对路径：目录型资产取固定主文件名；单文件型取名称末段（knowledge 允许 domain 子目录）
function snapshotMainRel(type, name) {
  const dir = TYPE_TO_DIR[String(type || '').trim()]
  if (!dir) return `${String(name || '').split('/').pop()}.md`
  if (MAIN_FILE[dir]) return MAIN_FILE[dir]
  return `${String(name || '').split('/').pop()}.md`
}
// 生成新的快照时间戳（G2）：YYYYMMDDHHmmssSSS，同毫秒冲突追加 -0001 序号，保证唯一且字典序即时间序
function nextTs(baseDir) {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  const ms = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}${p(d.getMilliseconds(), 3)}`
  if (!fs.existsSync(path.join(baseDir, ms))) return ms
  for (let i = 1; i <= 9999; i++) {
    const cand = `${ms}-${p(i, 4)}`
    if (!fs.existsSync(path.join(baseDir, cand))) return cand
  }
  throw new Error('快照时间戳冲突无法消解（同一毫秒内超过 9999 个快照）')
}
// 资产在队列中的基目录：reviewQueue/<typeDir>/<nameKey>/（nameKey 允许含 '/'，如 knowledge 的 domain 路径）
function assetQueueBase(root, type, nameKey) {
  return path.join(queueDir(root), TYPE_TO_DIR[type], nameKey)
}
// 新建快照目录（G1/G3）：skill/workflow 以正式目录整树为基底（workflow 排除 instance/）
function newSnapshotDir(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { error: r.error }
  const base = assetQueueBase(root, r.type, r.name)
  fs.mkdirSync(base, { recursive: true })
  const ts = nextTs(base)
  const dir = path.join(base, ts)
  fs.mkdirSync(dir, { recursive: true })
  const formalDir = path.join(oceanDir(root), TYPE_TO_DIR[r.type], r.name)
  if (fs.existsSync(formalDir) && (r.type === 'skill' || r.type === 'workflow')) {
    fs.cpSync(formalDir, dir, { recursive: true, filter: (src) => path.basename(src) !== 'instance' })
  }
  return { dir, ts }
}
// 该资产全部快照（按 ts 升序）；跳过主文件缺失/不可读的无效快照
function listSnapshots(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return []
  const base = assetQueueBase(root, r.type, r.name)
  if (!fs.existsSync(base)) return []
  const out = []
  for (const e of fs.readdirSync(base, { withFileTypes: true })) {
    if (!e.isDirectory() || !TS_RE.test(e.name)) continue
    const dir = path.join(base, e.name)
    const mainRel = snapshotMainRel(r.type, r.name)
    const mainFile = path.join(dir, mainRel)
    if (!fs.existsSync(mainFile)) continue
    out.push({ dir, ts: e.name, status: parseReviewStatus(fs.readFileSync(mainFile, 'utf-8')), mainFile, mainRel })
  }
  out.sort((a, b) => a.ts.localeCompare(b.ts))
  return out
}
function latestDraft(root, type, name) {
  const all = listSnapshots(root, type, name)
  return all.length ? all[all.length - 1] : null
}
function oldestPending(root, type, name) {
  return listSnapshots(root, type, name).find((s) => s.status === 'pending') || null
}
function oldestRejected(root, type, name) {
  return listSnapshots(root, type, name).find((s) => s.status === 'rejected') || null
}
// 队列扫描（G1：nameKey 允许多级目录——knowledge domain）：快照目录即 ts 模式目录，其父路径即资产 nameKey（去重）
function findQueueAssets(typeDirAbs, prefix, out) {
  if (!fs.existsSync(typeDirAbs)) return
  for (const e of fs.readdirSync(typeDirAbs, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === '.DS_Store') continue
    if (TS_RE.test(e.name)) { if (!out.includes(prefix)) out.push(prefix); continue }
    findQueueAssets(path.join(typeDirAbs, e.name), prefix ? `${prefix}/${e.name}` : e.name, out)
  }
}
function listQueue(root, statusFilter) {
  const base = oceanDir(root)
  const items = []
  for (const [type, dirName] of Object.entries(TYPE_TO_DIR)) {
    const typeDir = path.join(queueDir(root), dirName)
    const names = []
    findQueueAssets(typeDir, '', names)
    for (const name of names) {
      const snaps = listSnapshots(root, type, name)
      const pending = snaps.filter((s) => s.status === 'pending')
      const chosen = statusFilter === 'rejected'
        ? snaps.find((s) => s.status === 'rejected')
        : pending[0]
      if (!chosen) continue
      const mainText = fs.readFileSync(chosen.mainFile, 'utf-8')
      const ref = resolveRef(root, type, name)
      const formalPath = path.join(base, ref.refPath)
      const formalExists = fs.existsSync(formalPath)
      items.push({
        type, name, ts: chosen.ts,
        reviewStatus: chosen.status,
        rejectReason: parseFmField(mainText, 'rejectReason') || undefined,
        description: parseFmField(mainText, 'description') || parseFmField(mainText, 'summary') || '',
        baseVersion: formalExists ? parseVersion(fs.readFileSync(formalPath, 'utf-8')) : null,
        pendingCount: pending.length,
        isNew: !formalExists,
      })
    }
  }
  items.sort((a, b) => a.ts.localeCompare(b.ts)) // 审核顺序：最早进入的排最前（FIFO）
  return { success: true, items }
}

// ---------- 审核动作 ----------
// 审核不通过（G6）：理由必填，写入最早 pending 快照主文件；正式位置不动
function rejectAsset(root, type, name, reason) {
  const reasonLine = String(reason == null ? '' : reason).replace(/[\r\n]+/g, ' ').trim()
  if (!reasonLine) return { success: false, error: '审核不通过必须填写理由' }
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  const snap = oldestPending(root, r.type, r.name)
  if (!snap) return { success: false, error: `${typeLabel(r.type)} ${r.name} 无待审核快照` }
  let text = fs.readFileSync(snap.mainFile, 'utf-8')
  text = setFmField(text, 'reviewStatus', 'rejected')
  text = setFmField(text, 'rejectReason', reasonLine)
  fs.writeFileSync(snap.mainFile, text, 'utf-8')
  return { success: true, type: r.type, name: r.name, ts: snap.ts }
}
// 恢复待审（G6）：最早 rejected 快照回 pending 并删除理由
function restoreAsset(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  const snap = oldestRejected(root, r.type, r.name)
  if (!snap) return { success: false, error: `${typeLabel(r.type)} ${r.name} 无已驳回快照` }
  let text = fs.readFileSync(snap.mainFile, 'utf-8')
  text = setFmField(text, 'reviewStatus', 'pending')
  text = setFmField(text, 'rejectReason', null)
  fs.writeFileSync(snap.mainFile, text, 'utf-8')
  return { success: true, type: r.type, name: r.name, ts: snap.ts }
}
// 快照全文（review show 用）：最早 pending 快照主文件（含 frontmatter）
function readSnapshot(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error, content: null }
  const snap = oldestPending(root, r.type, r.name)
  if (!snap) return { success: true, content: null }
  return { success: true, content: fs.readFileSync(snap.mainFile, 'utf-8') }
}

// 把快照提升到正式位置（approveAsset 内部使用）
// 单文件资产：覆写主文件；skill/workflow：整树替换正式目录（workflow 保留 instance/）；codebase：覆写快照内存在的文件（无正式目录则整树搬运）
function promoteSnapshot(root, r, snap) {
  const base = oceanDir(root)
  const formalMain = path.join(base, r.refPath)
  const formalDir = path.dirname(formalMain)
  const dirBased = r.type === 'skill' || r.type === 'workflow' || r.type === 'codebase'

  if (r.type === 'workflow') {
    // 保留正式 instance/：先移开，替换后移回
    const instSrc = path.join(formalDir, 'instance')
    const instTmp = path.join(path.dirname(formalDir), `.${path.basename(formalDir)}.instance.tmp`)
    let moved = false
    if (fs.existsSync(instSrc)) { fs.renameSync(instSrc, instTmp); moved = true }
    try {
      if (fs.existsSync(formalDir)) fs.rmSync(formalDir, { recursive: true, force: true })
      fs.cpSync(snap.dir, formalDir, { recursive: true })
    } finally {
      if (moved) {
        fs.mkdirSync(formalDir, { recursive: true })
        fs.renameSync(instTmp, path.join(formalDir, 'instance'))
      }
    }
    return
  }
  if (r.type === 'skill') {
    if (fs.existsSync(formalDir)) fs.rmSync(formalDir, { recursive: true, force: true })
    fs.cpSync(snap.dir, formalDir, { recursive: true })
    return
  }
  if (r.type === 'codebase') {
    if (!fs.existsSync(formalDir)) {
      // 新 codebase：整树搬运
      fs.mkdirSync(path.dirname(formalDir), { recursive: true })
      fs.renameSync(snap.dir, formalDir)
      fs.mkdirSync(snap.dir, { recursive: true }) // 保持调用方「删快照」语义一致（目录已搬空）
      return
    }
    // 已有正式：仅覆写快照内存在的文件
    const copyTree = (srcDir, dstDir) => {
      for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
        const s = path.join(srcDir, e.name)
        const d = path.join(dstDir, e.name)
        if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyTree(s, d) }
        else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d) }
      }
    }
    copyTree(snap.dir, formalDir)
    return
  }
  // 单文件资产：覆写主文件
  fs.mkdirSync(formalDir, { recursive: true })
  fs.copyFileSync(snap.mainFile, formalMain)
}

// 审核通过（G5）：正式落盘 + version 递增 + git 提交 + 删该快照 + skill/agent 自动单项物化
function approveAsset(root, type, name, message) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  // 未托管必须先报错（不改动任何文件）
  if (!isGitManaged(root)) {
    return { success: false, error: '审核通过需先开启 .ocean git 托管（ocean review init 或桌面端审核-设置页开启）' }
  }
  const snap = oldestPending(root, r.type, r.name)
  if (!snap) return { success: false, error: `${typeLabel(r.type)} ${r.name} 无待审核快照` }

  const formalMain = path.join(oceanDir(root), r.refPath)
  const baseVersion = fs.existsSync(formalMain) ? parseVersion(fs.readFileSync(formalMain, 'utf-8')) : null
  const newVersion = (baseVersion ?? 0) + 1

  promoteSnapshot(root, r, snap)

  // 正式主文件 frontmatter：validated + 新版本号；清理草稿期可能残留的驳回理由
  let formalText = fs.readFileSync(formalMain, 'utf-8')
  formalText = setFmField(formalText, 'reviewStatus', 'validated')
  formalText = setFmField(formalText, 'version', String(newVersion))
  formalText = setFmField(formalText, 'rejectReason', null)
  fs.writeFileSync(formalMain, formalText, 'utf-8')

  // 提交正式路径：目录型资产提交其目录，单文件提交主文件
  const dirBased = r.type === 'skill' || r.type === 'workflow' || r.type === 'codebase'
  const commitRel = dirBased ? `${TYPE_TO_DIR[r.type]}/${r.name}` : r.refPath
  const commit = gitCommit(root, commitRel, message)

  // 删除该快照目录（codebase 整树搬运后 snap.dir 已为空目录，同样删除）
  fs.rmSync(snap.dir, { recursive: true, force: true })

  let sync = null
  if (r.type === 'skill' || r.type === 'agent') sync = syncApprovedAssets(root, { type: r.type, name: r.name })
  return { success: true, type: r.type, name: r.name, version: newVersion, commit, sync }
}

// ---------- 读取 / 编辑目标解析 ----------
// 读取一律走正式位置（G7）：返回绝对路径，内容由调用方自行读取
function resolveReadPath(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) throw new Error('非法的资产路径')
  return path.join(oceanDir(root), rel)
}
// 编辑目标（G3）：有快照读最新一份（继续改），否则新建快照
function resolveEditTarget(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { error: r.error }
  const formalMain = path.join(oceanDir(root), r.refPath)
  const formalExists = fs.existsSync(formalMain)
  const latest = latestDraft(root, r.type, r.name)
  if (latest) {
    return { dir: latest.dir, ts: latest.ts, mainFile: latest.mainFile, mainRel: latest.mainRel, isNewSnapshot: false, formalExists }
  }
  const s = newSnapshotDir(root, r.type, r.name)
  if (s.error) return { error: s.error }
  return { dir: s.dir, ts: s.ts, mainFile: path.join(s.dir, snapshotMainRel(r.type, r.name)), mainRel: snapshotMainRel(r.type, r.name), isNewSnapshot: true, formalExists }
}

// ---------- 删除（G8） ----------
// 提交正式路径的删除（调用方先删文件/目录）；未托管直接 success（不提交）
function commitFormalDeletion(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径' }
  if (!isGitManaged(root)) return { success: true }
  // 路径在工作区与 HEAD 都不存在 → 无删除可提交（如从未入库的路径），视为成功空操作
  const inWorktree = fs.existsSync(path.join(oceanDir(root), rel))
  const inHead = hasCommits(root) && runGitInOcean(root, ['cat-file', '-e', `HEAD:${rel}`]).status === 0
  if (!inWorktree && !inHead) return { success: true, noChanges: true }
  const msg = `chore(assets): ${timestamp()} asset is deleted`
  const add = runGitInOcean(root, ['add', '-A', '--', rel])
  if (add.status !== 0) return { success: false, error: add.stderr ? String(add.stderr) : 'git add 失败' }
  const commit = runGitInOcean(root, [...gitIdentityArgs(), 'commit', '-m', msg, '--', rel])
  if (commit.status !== 0) {
    const out = `${commit.stdout || ''}${commit.stderr || ''}`
    if (/nothing to commit|no changes added|nothing added to commit/i.test(out)) return { success: true, noChanges: true }
    return { success: false, error: out || 'git commit 失败' }
  }
  const rev = runGitInOcean(root, ['rev-parse', 'HEAD'])
  return { success: true, hash: rev.status === 0 && rev.stdout ? rev.stdout.trim() : null }
}
// 丢弃该资产的全部快照（删除正式资产时一并清理队列草稿）
function discardSnapshots(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return
  const base = assetQueueBase(root, r.type, r.name)
  if (fs.existsSync(base)) fs.rmSync(base, { recursive: true, force: true })
}

// ---------- diff（G4：正式 vs 最早 pending） ----------
function buildUnifiedDiff(oldText, newText, oldLabel, newLabel) {
  const a = oldText.split('\n'), b = newText.split('\n')
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) {
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const lines = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { lines.push(`  ${a[i]}`); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { lines.push(`- ${a[i]}`); i++ }
    else { lines.push(`+ ${b[j]}`); j++ }
  }
  while (i < n) lines.push(`- ${a[i++]}`)
  while (j < m) lines.push(`+ ${b[j++]}`)
  return `--- ${oldLabel}\n+++ ${newLabel}\n${lines.join('\n')}`
}
function diffAsset(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  const snap = oldestPending(root, r.type, r.name)
  if (!snap) return { success: false, error: `${typeLabel(r.type)} ${r.name} 无待审核快照` }
  const formalMain = path.join(oceanDir(root), r.refPath)
  const formalExists = fs.existsSync(formalMain)
  const draftText = fs.readFileSync(snap.mainFile, 'utf-8')
  if (!formalExists) {
    return { success: true, type: r.type, name: r.name, isNew: true, hasBaseline: false,
      reviewStatus: 'pending', version: null, content: draftText,
      note: '新建资产（正式位置尚无过审版本），以下为快照全文' }
  }
  const formalText = fs.readFileSync(formalMain, 'utf-8')
  const diff = buildUnifiedDiff(stripFrontmatter(formalText), stripFrontmatter(draftText), '已审核通过版本', '待审核快照')
  const changed = diff.split('\n').some((l) => l.startsWith('+ ') || l.startsWith('- '))
  return { success: true, type: r.type, name: r.name, isNew: false, hasBaseline: true,
    reviewStatus: 'pending', version: parseVersion(formalText), changed, diff }
}

// ---------- 物化同步（skill/agent → {assetDir}/skills|agents，签名不变） ----------
function runtimeAssetDir(root) {
  try {
    const cfg = path.join(root, '.ocean', 'asset-root.json')
    if (fs.existsSync(cfg) && JSON.parse(fs.readFileSync(cfg, 'utf-8')).assetRoot === 'pi') return '.pi'
  } catch {}
  return '.claude'
}
// only: {type, name} 仅物化该资产（新增/覆盖，不做删除对齐）；省略则全量幂等对齐
function syncApprovedAssets(root, only) {
  const base = oceanDir(root)
  const runtimeBase = path.join(root, runtimeAssetDir(root))
  const report = { added: [], updated: [], removed: [], skippedPending: [], trashed: [] }
  const rs = (p) => { try { return parseReviewStatus(fs.readFileSync(p, 'utf-8')) } catch { return 'pending' } }
  const trashDir = path.join(base, '.trashbox', 'sync', timestamp())

  const syncOne = (kind, name) => {
    if (kind === 'skill') {
      const src = path.join(base, 'skills', name)
      if (!fs.existsSync(path.join(src, 'SKILL.md'))) return { success: false, error: `技能不存在: ${name}` }
      if (rs(path.join(src, 'SKILL.md')) !== 'validated') return { success: false, error: `技能 ${name} 未审核通过，不可同步` }
      const dst = path.join(runtimeBase, 'skills', name)
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      const existed = fs.existsSync(dst)
      if (existed) fs.rmSync(dst, { recursive: true, force: true })
      fs.cpSync(src, dst, { recursive: true })
      report[existed ? 'updated' : 'added'].push(`skills/${name}`)
      return { success: true }
    }
    const src = path.join(base, 'agents', `${name}.md`)
    if (!fs.existsSync(src)) return { success: false, error: `智能体不存在: ${name}` }
    if (rs(src) !== 'validated') return { success: false, error: `智能体 ${name} 未审核通过，不可同步` }
    const dst = path.join(runtimeBase, 'agents', `${name}.md`)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    const existed = fs.existsSync(dst)
    if (existed && fs.readFileSync(dst, 'utf-8') === fs.readFileSync(src, 'utf-8')) return { success: true }
    fs.copyFileSync(src, dst)
    report[existed ? 'updated' : 'added'].push(`agents/${name}.md`)
    return { success: true }
  }

  if (only && only.type) {
    if (only.type !== 'skill' && only.type !== 'agent') {
      return { success: false, error: `类型 ${only.type} 无运行时物化目标，仅 skill/agent 可同步` }
    }
    const r = syncOne(only.type, only.name)
    return { success: r.success, error: r.error, report }
  }

  // ---- 全量 ----
  const dstSkills = path.join(runtimeBase, 'skills')
  fs.mkdirSync(dstSkills, { recursive: true })
  const validatedSkills = new Set()
  const srcSkills = path.join(base, 'skills')
  if (fs.existsSync(srcSkills)) {
    for (const e of fs.readdirSync(srcSkills, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === '.DS_Store') continue
      if (!fs.existsSync(path.join(srcSkills, e.name, 'SKILL.md'))) continue
      if (rs(path.join(srcSkills, e.name, 'SKILL.md')) !== 'validated') { report.skippedPending.push(`skills/${e.name}`); continue }
      validatedSkills.add(e.name)
      syncOne('skill', e.name)
    }
  }
  for (const e of fs.readdirSync(dstSkills, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === '.DS_Store') continue
    if (!validatedSkills.has(e.name)) {
      fs.mkdirSync(trashDir, { recursive: true })
      fs.renameSync(path.join(dstSkills, e.name), path.join(trashDir, e.name))
      report.removed.push(`skills/${e.name}`)
      report.trashed.push(path.relative(root, path.join(trashDir, e.name)))
    }
  }
  const dstAgents = path.join(runtimeBase, 'agents')
  fs.mkdirSync(dstAgents, { recursive: true })
  const validatedAgents = new Set()
  const srcAgents = path.join(base, 'agents')
  if (fs.existsSync(srcAgents)) {
    for (const e of fs.readdirSync(srcAgents, { withFileTypes: true })) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue
      if (rs(path.join(srcAgents, e.name)) !== 'validated') { report.skippedPending.push(`agents/${e.name}`); continue }
      validatedAgents.add(e.name)
      syncOne('agent', e.name.replace(/\.md$/, ''))
    }
  }
  for (const e of fs.readdirSync(dstAgents, { withFileTypes: true })) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue
    if (!validatedAgents.has(e.name)) {
      fs.mkdirSync(trashDir, { recursive: true })
      fs.renameSync(path.join(dstAgents, e.name), path.join(trashDir, e.name))
      report.removed.push(`agents/${e.name}`)
      report.trashed.push(path.relative(root, path.join(trashDir, e.name)))
    }
  }
  return { success: true, report }
}

module.exports = {
  TYPE_TO_DIR, oceanDir, normalizeAssetRel, resolveRef, typeLabel,
  parseReviewStatus, parseFmField, parseVersion, stripFrontmatter,
  isGitManaged, gitStatus, gitInit, gitLog, gitShow, gitBaseline, gitCommit, gitRollback,
  // 队列
  queueDir, snapshotMainRel, newSnapshotDir, latestDraft, oldestPending, oldestRejected,
  listQueue, listReviewAssets: listQueue,
  // 审核
  approveAsset, rejectAsset, restoreAsset, diffAsset, readSnapshot,
  // 读取/编辑目标
  resolveReadPath, resolveEditTarget,
  // 删除
  commitFormalDeletion, discardSnapshots,
  // 同步
  syncApprovedAssets,
  buildUnifiedDiff,
}
