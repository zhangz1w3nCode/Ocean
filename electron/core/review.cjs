// 资产审核共享模块（暂存队列模型：CLI `ocean review` 与主进程 IPC 共用，避免两处漂移）
// 核心不变量（G3/G7）：正式位置 .ocean/<typeDir>/ 只保存最近过审版本；草稿全部进
// .ocean/reviewQueue/<typeDir>/<nameKey>/<ts>/；只有 approve 会写正式位置。
// CJS 形态：launch.cjs 直接 require；bin/ocean.ts 经 esbuild 打包引入
const fs = require('node:fs')
const path = require('node:path')
const child_process = require('node:child_process')

// ---------- 类型映射（CLI 名称 → .ocean 子目录） ----------
// task 与 codebase 不参与审核队列与版本化：直接读写正式位置，不在本表登记
// （审核队列枚举、直改收编的扫描目录、review 命令可用的类型都由本表派生）
const TYPE_TO_DIR = {
  skill: 'skills', agent: 'agents', node: 'nodes', resource: 'resources',
  workflow: 'workflows', knowledge: 'knowledges',
}
const DIR_TO_TYPE = Object.fromEntries(Object.entries(TYPE_TO_DIR).map(([k, v]) => [v, k]))
// 目录型资产（正式位置是目录，主文件固定名）；其余为单文件资产（主文件 = <basename>.md）
const MAIN_FILE = { skills: 'SKILL.md', workflows: 'WORKFLOW.md' }
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
  return { refPath: `${dir}/${cleanName}.md`, type, name: cleanName }
}

function typeLabel(type) {
  return { skill: '技能', agent: '智能体', node: '节点', resource: '资源', workflow: '工作流', knowledge: '知识' }[type] || type
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
// 当前 HEAD sha（H1 基准记录用）；未托管/无提交 → null
function headSha(root) {
  try {
    if (!isGitManaged(root)) return null
    const r = runGitInOcean(root, ['rev-parse', 'HEAD'])
    if (r.status !== 0 || typeof r.stdout !== 'string') return null
    const sha = r.stdout.trim()
    return /^[0-9a-f]{40}$/.test(sha) ? sha : null
  } catch { return null }
}
// 目标文件在 <baseSha>..HEAD 之间是否变化（H2）：'unchanged' | 'changed' | 'unknown'（未知按有变化处理）
function fileChangedSince(root, refPath, sha) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return 'unknown'
  const s = String(sha == null ? '' : sha)
  if (!/^[0-9a-fA-F]{4,40}$/.test(s)) return 'unknown'
  if (!isGitManaged(root) || !hasCommits(root)) return 'unknown'
  if (runGitInOcean(root, ['cat-file', '-e', s]).status !== 0) return 'unknown' // sha 不存在
  const d = runGitInOcean(root, ['diff', '--quiet', s, 'HEAD', '--', rel])
  if (d.status === 0) return 'unchanged'
  if (d.status === 1) return 'changed'
  return 'unknown'
}
// 提取原始 frontmatter 块（含首尾 --- 与换行）；无 frontmatter 返回 ''
function rawFmBlock(text) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(String(text))
  return m ? m[0] : ''
}
// 三方合并（H4）：**仅合并正文**（frontmatter 是系统管理字段——正式侧 validated/version，草稿侧 pending/baseCommit，
// 整文件合并会在头部产生系统性伪冲突）；base 取自 git show；git merge-file -p 逐行合并正文，
// 结果 = 草稿（theirs）的 frontmatter 块（缺失时依次回退 ours/base）+ 合并后的正文，调用方负责重设系统字段
function threeWayMerge(root, refPath, baseSha, oursText, theirsText) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { ok: false, text: String(theirsText), conflicts: -1, error: '非法的资产路径' }
  // base = 基准提交中的内容（路径不存在 → 空字符串）
  let baseText = ''
  const show = runGitInOcean(root, ['show', `${String(baseSha)}:${rel}`])
  if (show.status === 0 && typeof show.stdout === 'string') baseText = show.stdout
  const os = require('node:os')
  const tag = `ocean-merge-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const tmpOurs = path.join(os.tmpdir(), `${tag}.ours`)
  const tmpBase = path.join(os.tmpdir(), `${tag}.base`)
  const tmpTheirs = path.join(os.tmpdir(), `${tag}.theirs`)
  try {
    // 尾换行归一（git show 的内容带尾换行、调用方输入可能不带；差一个换行即被 merge-file 视为同行不同版本）
    const nl = (s) => (s === '' ? s : (s.endsWith('\n') ? s : s + '\n'))
    fs.writeFileSync(tmpOurs, nl(stripFrontmatter(oursText)), 'utf-8')
    fs.writeFileSync(tmpBase, nl(stripFrontmatter(baseText)), 'utf-8')
    fs.writeFileSync(tmpTheirs, nl(stripFrontmatter(theirsText)), 'utf-8')
    const r = child_process.spawnSync('git', [
      'merge-file', '-p',
      '-L', '已通过版本', '-L', '基准', '-L', '草稿',
      tmpOurs, tmpBase, tmpTheirs,
    ], { encoding: 'utf-8' })
    const fm = rawFmBlock(theirsText) || rawFmBlock(oursText) || rawFmBlock(baseText)
    if (r.error) return { ok: false, text: String(theirsText), conflicts: -1, error: String(r.error) }
    const status = r.status
    if (status === 0) return { ok: true, text: fm + String(r.stdout || ''), conflicts: 0 }
    if (status > 0 && r.stdout) return { ok: false, text: fm + String(r.stdout), conflicts: status } // 输出含冲突标记
    return { ok: false, text: String(theirsText), conflicts: -1, error: r.stderr ? String(r.stderr) : 'git merge-file 失败' }
  } finally {
    for (const f of [tmpOurs, tmpBase, tmpTheirs]) { try { fs.unlinkSync(f) } catch {} }
  }
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
// 每份快照解析：status / baseCommit（H1）/ conflicted（H5）/ autoMerged（H6）
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
    const text = fs.readFileSync(mainFile, 'utf-8')
    out.push({
      dir, ts: e.name,
      status: parseReviewStatus(text),
      baseCommit: parseFmField(text, 'baseCommit') || null,
      conflicted: parseFmField(text, 'mergeConflict') === 'true',
      autoMerged: parseFmField(text, 'autoMerged') === 'true',
      mainFile, mainRel,
    })
  }
  out.sort((a, b) => a.ts.localeCompare(b.ts))
  return out
}
function latestDraft(root, type, name) {
  const all = listSnapshots(root, type, name)
  return all.length ? all[all.length - 1] : null
}
function oldestPending(root, type, name, opts) {
  return listSnapshots(root, type, name).find((s) => s.status === 'pending' && !(opts && opts.skipConflicted && s.conflicted)) || null
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
      const baseSha = parseFmField(mainText, 'baseCommit')
      const hasBase = !!baseSha
      const baseStale = formalExists && hasBase && fileChangedSince(root, ref.refPath, baseSha) !== 'unchanged'
      items.push({
        type, name, ts: chosen.ts,
        reviewStatus: chosen.status,
        rejectReason: parseFmField(mainText, 'rejectReason') || undefined,
        description: parseFmField(mainText, 'description') || parseFmField(mainText, 'summary') || '',
        baseVersion: formalExists ? parseVersion(fs.readFileSync(formalPath, 'utf-8')) : null,
        pendingCount: pending.length,
        isNew: !formalExists,
        mergeConflict: parseFmField(mainText, 'mergeConflict') === 'true',
        autoMerged: parseFmField(mainText, 'autoMerged') === 'true',
        hasBase,
        baseStale,
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
  const dirBased = r.type === 'skill' || r.type === 'workflow'

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
  // 单文件资产：覆写主文件
  fs.mkdirSync(formalDir, { recursive: true })
  fs.copyFileSync(snap.mainFile, formalMain)
}

// 审核通过（G5 + H3）：
//  未托管报错；取最早非冲突 pending 快照；
//  基准漂移（草稿 baseCommit 后正式变过）→ 三方合并：冲突→写回标记不提升；成功→写回草稿标 autoMerged 并返回 needReReview；
//  无需合并 → 提升（覆写正式、validated、version+1、提交、删快照、skill/agent 物化）；
//  提交后对剩余 pending 快照逐个重定基（不删除、不阻断）。
function approveAsset(root, type, name, message) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  // 未托管必须先报错（不改动任何文件）
  if (!isGitManaged(root)) {
    return { success: false, error: '审核通过需先开启 .ocean git 托管（ocean review init 或桌面端审核-设置页开启）' }
  }
  const anyPending = oldestPending(root, r.type, r.name)
  if (!anyPending) return { success: false, error: `${typeLabel(r.type)} ${r.name} 无待审核快照` }
  const snap = oldestPending(root, r.type, r.name, { skipConflicted: true })
  if (!snap) {
    return { success: false, conflict: true, type: r.type, name: r.name,
      error: `${typeLabel(r.type)} ${r.name} 待审核快照均存在合并冲突，请先处理（review discard 丢弃，或手动编辑冲突标记后重审）` }
  }

  const formalMain = path.join(oceanDir(root), r.refPath)
  const formalExists = fs.existsSync(formalMain)

  // H3 步骤 3/4：基准漂移 → 三方合并
  if (formalExists && snap.baseCommit) {
    if (fileChangedSince(root, r.refPath, snap.baseCommit) !== 'unchanged') {
      const draftText = fs.readFileSync(snap.mainFile, 'utf-8')
      const formalText = fs.readFileSync(formalMain, 'utf-8')
      const merge = threeWayMerge(root, r.refPath, snap.baseCommit, formalText, draftText)
      if (!merge.ok && merge.conflicts >= 0) {
        // 冲突：合并产物（含标记）写回草稿并标记；正式位置不动
        let t = setFmField(merge.text, 'reviewStatus', 'pending')
        t = setFmField(t, 'mergeConflict', 'true')
        t = setFmField(t, 'autoMerged', null)
        t = setFmField(t, 'baseCommit', headSha(root))
        fs.writeFileSync(snap.mainFile, t, 'utf-8')
        return { success: false, conflict: true, type: r.type, name: r.name, ts: snap.ts,
          error: `${typeLabel(r.type)} ${r.name} 与已通过版本存在合并冲突（${merge.conflicts} 处），已写回冲突标记；请手动编辑解决后重审，或 review discard 丢弃草稿` }
      }
      if (!merge.ok) {
        return { success: false, type: r.type, name: r.name, ts: snap.ts, error: `三方合并失败：${merge.error || '未知错误'}` }
      }
      // 自动合并成功：写回草稿，标 autoMerged，更新基准，需重新审核（H6 标记不拦截，下次点通过即提升）
      let t = setFmField(merge.text, 'reviewStatus', 'pending')
      t = setFmField(t, 'autoMerged', 'true')
      t = setFmField(t, 'mergeConflict', null)
      t = setFmField(t, 'baseCommit', headSha(root))
      fs.writeFileSync(snap.mainFile, t, 'utf-8')
      return { success: false, needReReview: true, autoMerged: true, type: r.type, name: r.name, ts: snap.ts,
        message: `基线已变化，草稿已自动合并入最新版本改动，请重新确认后再次审核通过` }
    }
  }

  const baseVersion = formalExists ? parseVersion(fs.readFileSync(formalMain, 'utf-8')) : null
  const newVersion = (baseVersion ?? 0) + 1

  promoteSnapshot(root, r, snap)

  // 正式主文件 frontmatter：validated + 新版本号；清理草稿期字段（理由/冲突/合并标记/基准）
  let formalText = fs.readFileSync(formalMain, 'utf-8')
  formalText = setFmField(formalText, 'reviewStatus', 'validated')
  formalText = setFmField(formalText, 'version', String(newVersion))
  formalText = setFmField(formalText, 'rejectReason', null)
  formalText = setFmField(formalText, 'mergeConflict', null)
  formalText = setFmField(formalText, 'autoMerged', null)
  formalText = setFmField(formalText, 'baseCommit', null)
  fs.writeFileSync(formalMain, formalText, 'utf-8')

  // 提交正式路径：目录型资产提交其目录，单文件提交主文件
  const dirBased = r.type === 'skill' || r.type === 'workflow'
  const commitRel = dirBased ? `${TYPE_TO_DIR[r.type]}/${r.name}` : r.refPath
  const commit = gitCommit(root, commitRel, message)

  // 删除该快照目录
  fs.rmSync(snap.dir, { recursive: true, force: true })

  let sync = null
  if (r.type === 'skill' || r.type === 'agent') sync = syncApprovedAssets(root, { type: r.type, name: r.name })

  // H3 步骤 5：对剩余 pending 快照重定基（不删除、不阻断；已冲突的等人工处理）
  rebasePendingSnapshots(root, r)

  return { success: true, type: r.type, name: r.name, version: newVersion, commit, sync }
}

// 提交后重定基：对剩余 pending 快照，基准漂移的尝试三方合并；冲突的写回标记（H3 步骤 5）
function rebasePendingSnapshots(root, r) {
  const formalMain = path.join(oceanDir(root), r.refPath)
  if (!fs.existsSync(formalMain)) return
  const formalText = fs.readFileSync(formalMain, 'utf-8')
  for (const s of listSnapshots(root, r.type, r.name)) {
    if (s.status !== 'pending') continue
    if (s.conflicted) continue // 已标冲突的等人工解决，不重复合并
    if (!s.baseCommit) continue
    if (fileChangedSince(root, r.refPath, s.baseCommit) === 'unchanged') continue
    const draftText = fs.readFileSync(s.mainFile, 'utf-8')
    const merge = threeWayMerge(root, r.refPath, s.baseCommit, formalText, draftText)
    let t
    if (merge.ok) {
      t = setFmField(merge.text, 'reviewStatus', 'pending')
      t = setFmField(t, 'autoMerged', 'true')
      t = setFmField(t, 'mergeConflict', null)
      t = setFmField(t, 'baseCommit', headSha(root))
    } else if (merge.conflicts >= 0) {
      t = setFmField(merge.text, 'reviewStatus', 'pending')
      t = setFmField(t, 'mergeConflict', 'true')
      t = setFmField(t, 'autoMerged', null)
      t = setFmField(t, 'baseCommit', headSha(root))
    } else {
      continue // 合并器故障：保留原样，不动
    }
    fs.writeFileSync(s.mainFile, t, 'utf-8')
  }
}

// ---------- 读取 / 编辑目标解析 ----------
// 读取一律走正式位置（G7）：返回绝对路径，内容由调用方自行读取
function resolveReadPath(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) throw new Error('非法的资产路径')
  return path.join(oceanDir(root), rel)
}
// 时间戳 → 本地时间（YYYYMMDDHHmmssSSS，可带 -NNNN 冲突后缀）
function tsToDate(ts) {
  const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})/)
  if (!m) return null
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +m[7])
}
// 编辑目标（G3）：有快照读/改最新一份（继续改），否则新建快照。
// 用于：编辑读取、子文件写入（skill 资源 / 工作流局部节点）、CLI 工作流图编辑命令的连续修改。
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

// 主文件保存目标（G3）：每次"保存"产生新快照，不覆盖既有快照。
// 同一次保存会话内的多次主文件写入（如工作流编辑器一次保存写 WORKFLOW.md + flow.json）应落到同一快照：
// 最新快照若在 reuseWindowMs（默认 3000ms）内刚创建则复用，否则新建。
function resolveSaveTarget(root, type, name, opts) {
  const r = resolveRef(root, type, name)
  if (r.error) return { error: r.error }
  const formalMain = path.join(oceanDir(root), r.refPath)
  const formalExists = fs.existsSync(formalMain)
  const windowMs = opts && typeof opts.reuseWindowMs === 'number' ? opts.reuseWindowMs : 3000
  const latest = latestDraft(root, r.type, r.name)
  if (latest) {
    const createdAt = tsToDate(latest.ts)
    if (createdAt && (Date.now() - createdAt.getTime()) <= windowMs) {
      return { dir: latest.dir, ts: latest.ts, mainFile: latest.mainFile, mainRel: latest.mainRel, isNewSnapshot: false, reusedInSession: true, formalExists }
    }
  }
  const s = newSnapshotDir(root, r.type, r.name)
  if (s.error) return { error: s.error }
  return { dir: s.dir, ts: s.ts, mainFile: path.join(s.dir, snapshotMainRel(r.type, r.name)), mainRel: snapshotMainRel(r.type, r.name), isNewSnapshot: true, formalExists }
}

// ---------- 删除（G8） ----------
// 丢弃最早 pending 快照（H5 冲突草稿的「丢弃此草稿」；conflicted 或否都取最早 pending）
function discardOldestPending(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  const snap = oldestPending(root, r.type, r.name)
  if (!snap) return { success: false, error: `${typeLabel(r.type)} ${r.name} 无待审核快照` }
  fs.rmSync(snap.dir, { recursive: true, force: true })
  return { success: true, type: r.type, name: r.name, ts: snap.ts }
}
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
  const hasBase = !!snap.baseCommit
  const baseStale = formalExists && hasBase && fileChangedSince(root, r.refPath, snap.baseCommit) !== 'unchanged'
  const mergeState = { mergeConflict: snap.conflicted, autoMerged: snap.autoMerged, hasBase, baseStale }
  if (!formalExists) {
    return { success: true, type: r.type, name: r.name, isNew: true, hasBaseline: false,
      reviewStatus: 'pending', version: null, content: draftText, ...mergeState,
      note: '新建资产（正式位置尚无过审版本），以下为快照全文' }
  }
  const formalText = fs.readFileSync(formalMain, 'utf-8')
  const diff = buildUnifiedDiff(stripFrontmatter(formalText), stripFrontmatter(draftText), '已审核通过版本', '待审核快照')
  const changed = diff.split('\n').some((l) => l.startsWith('+ ') || l.startsWith('- '))
  return { success: true, type: r.type, name: r.name, isNew: false, hasBaseline: true,
    reviewStatus: 'pending', version: parseVersion(formalText), changed, diff, ...mergeState }
}

// ---------- 直改收编与带基准草稿（H1/H7） ----------
// 草稿 frontmatter 规范化：pending + baseCommit=HEAD，清除 version/理由/冲突/合并标记
function normalizeDraftFm(text, root, opts) {
  let t = String(text)
  t = setFmField(t, 'reviewStatus', 'pending')
  t = setFmField(t, 'version', null)
  t = setFmField(t, 'rejectReason', null)
  t = setFmField(t, 'mergeConflict', null)
  if (!(opts && opts.keepAutoMerged)) t = setFmField(t, 'autoMerged', null)
  t = setFmField(t, 'baseCommit', headSha(root) || null)
  return t
}
// 新建快照并写入规范化主文件（直改收编用；单文件资产）
function writeDraftWithBase(root, type, name, text, opts) {
  const s = newSnapshotDir(root, type, name)
  if (s.error) return { error: s.error }
  const mainRel = snapshotMainRel(type, name)
  const mainFile = path.join(s.dir, mainRel)
  fs.mkdirSync(path.dirname(mainFile), { recursive: true })
  fs.writeFileSync(mainFile, normalizeDraftFm(text, root, opts), 'utf-8')
  return { dir: s.dir, ts: s.ts, mainFile, mainRel }
}
// 供 GUI/CLI 拼接 frontmatter 的调用方使用：返回 'baseCommit: <sha>' 行或空串（未托管）
function baseCommitField(root) {
  const sha = headSha(root)
  return sha ? `baseCommit: ${sha}` : ''
}
// 递归复制目录（可带 filter，参数为 src 绝对路径；跳过 .DS_Store）
function copyTreeInto(srcDir, dstDir, filter) {
  for (const e of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue
    const s = path.join(srcDir, e.name)
    if (filter && !filter(s)) continue
    const d = path.join(dstDir, e.name)
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); copyTreeInto(s, d, filter) }
    else { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d) }
  }
}
// 相对 .ocean 的路径 → 资产（type/name/是否目录型）；无法映射/非资产路径 → null
function mapAssetPath(relPath) {
  if (!relPath || relPath.startsWith('reviewQueue/')) return null
  const segs = String(relPath).split('/')
  const dir = segs[0]
  const type = DIR_TO_TYPE[dir]
  if (!type) return null
  if (dir === 'skills' || dir === 'workflows') {
    if (segs.length < 2) return null
    return { type, name: segs[1], dirBased: true }
  }
  // agents/nodes/resources/knowledges：单文件（knowledge 允许 domain 子目录）
  const fileName = segs[segs.length - 1]
  if (!fileName.endsWith('.md')) return null
  const nameSegs = segs.slice(1, -1).concat(fileName.replace(/\.md$/, ''))
  if (!nameSegs.length || nameSegs.some((s) => !s)) return null
  return { type, name: nameSegs.join('/'), dirBased: false }
}
// 目录型资产的正式位置是否含主文件（未跟踪收编的有效性判定）
function dirMainExists(root, m) {
  const ref = resolveRef(root, m.type, m.name)
  if (ref.error) return false
  return fs.existsSync(path.join(oceanDir(root), ref.refPath))
}
// 正式位置是否已存在该资产（主文件在 HEAD 中已跟踪）——未跟踪的新子文件若属于已存在资产，应归为「修改」
function formalAssetExists(root, m) {
  const ref = resolveRef(root, m.type, m.name)
  if (ref.error) return false
  if (!fs.existsSync(path.join(oceanDir(root), ref.refPath))) return false
  return runGitInOcean(root, ['ls-files', '--error-unmatch', '--', ref.refPath]).status === 0
}
// 目录型资产快照：newSnapshotDir 基底（skill/workflow 从当前工作区复制）+ 工作区覆盖（codebase/task）+ 主文件规范化
function adoptAssetTree(root, m) {
  const ref = resolveRef(root, m.type, m.name)
  if (ref.error) return { error: ref.error }
  const s = newSnapshotDir(root, m.type, m.name)
  if (s.error) return s
  const formalDir = path.dirname(path.join(oceanDir(root), ref.refPath))
  if (fs.existsSync(formalDir)) {
    copyTreeInto(formalDir, s.dir, m.type === 'workflow' ? (src) => path.basename(src) !== 'instance' : null)
  }
  const mainFile = path.join(s.dir, ref.refPath.split('/').slice(-1)[0])
  // 目录型主文件固定名（MAIN_FILE）；knowledge 不在此列
  if (!fs.existsSync(mainFile)) return { error: '主文件不存在' }
  fs.writeFileSync(mainFile, normalizeDraftFm(fs.readFileSync(mainFile, 'utf-8'), root), 'utf-8')
  return s
}
// 直改收编（H7）：工作区偏离 HEAD 的资产改动 → 新快照入队，正式位置还原/删除；删除→仅还原不入队
// 触发点（H8）：仅审核页加载时（本模块不主动触发，由 IPC 层调用）
function adoptStrayEdits(root) {
  const empty = { adopted: [], restoredDeletions: [] }
  if (!isGitManaged(root)) {
    return { success: false, error: '直改编排需 .ocean 开启 git 托管（ocean review init）后才生效', ...empty }
  }
  const scanDirs = Object.values(TYPE_TO_DIR)
  const st = runGitInOcean(root, ['-c', 'core.quotePath=false', 'status', '--porcelain', '-uall', '--', ...scanDirs])
  if (st.status !== 0 || typeof st.stdout !== 'string') {
    return { success: false, error: st.stderr ? String(st.stderr) : 'git status 失败', ...empty }
  }

  const unquote = (s) => {
    if (s && s.startsWith('"') && s.endsWith('"')) {
      try { return JSON.parse(s) } catch { return s.slice(1, -1) }
    }
    return s
  }
  const modAssets = new Map()  // `${type}/${name}` → { type, name, dirBased }
  const addAssets = new Map()  // 同上（未跟踪新增 / 重命名新路径）
  const delPaths = []          // 删除/重命名旧路径 → 还原
  const renameNew = []         // 重命名新路径（staged，移除时用 git rm -f）

  for (const raw of st.stdout.split('\n')) {
    if (!raw) continue
    const x = raw[0], y = raw[1]
    const rest = raw.slice(3)
    let p = rest, orig = null
    const arrow = rest.indexOf(' -> ')
    if (arrow >= 0) { p = rest.slice(0, arrow); orig = rest.slice(arrow + 4) }
    p = unquote(p); if (orig) orig = unquote(orig)
    if (!p || p.startsWith('reviewQueue/')) continue

    if (x === 'R' && orig) {
      // 重命名（实测 porcelain v1：`R  old -> new`；按存在性判定更稳）
      const newPath = fs.existsSync(path.join(oceanDir(root), p)) ? p : orig
      const oldPath = newPath === p ? orig : p
      if (oldPath) delPaths.push(oldPath)
      if (newPath) renameNew.push(newPath)
      continue
    }
    if (x === 'D' || y === 'D') { delPaths.push(p); continue }
    if (x === '?') {
      const m = mapAssetPath(p)
      if (!m) continue
      // 有效主文件才收编（目录型要求正式位置存在主文件）
      if (m.dirBased ? !dirMainExists(root, m) : !p.endsWith('.md')) continue
      // 正式位置已有该资产（如 skill 新增了一个子文件）→ 属于「修改」而非「新增」，
      // 否则会走新增分支把整个正式目录删掉
      if (formalAssetExists(root, m)) { modAssets.set(`${m.type}/${m.name}`, m); continue }
      addAssets.set(`${m.type}/${m.name}`, m)
      continue
    }
    // 其余（M/A/C 等）→ 修改（单文件：路径即主文件；目录型：主文件缺失时由 adoptAssetTree 跳过）
    const m = mapAssetPath(p)
    if (!m) continue
    modAssets.set(`${m.type}/${m.name}`, m)
  }

  const adopted = []
  const restoredDeletions = []

  // 1) 删除/重命名旧路径 → 还原
  for (const rel of delPaths) {
    const co = runGitInOcean(root, ['checkout', 'HEAD', '--', rel])
    if (co.status === 0) restoredDeletions.push(rel)
  }
  // 2) 重命名新路径 → 按「新增」收编（staged 内容入队后 git rm -f 移除）；正式已有则归入修改
  for (const np of renameNew) {
    const m = mapAssetPath(np)
    if (m && (m.dirBased ? dirMainExists(root, m) : np.endsWith('.md'))) {
      if (formalAssetExists(root, m)) { modAssets.set(`${m.type}/${m.name}`, m); continue }
      addAssets.set(`${m.type}/${m.name}`, { ...m, staged: true, path: np })
    }
  }

  // 3) 修改（按资产聚合，一份快照）→ 还原
  for (const [key, m] of [...modAssets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ref = resolveRef(root, m.type, m.name)
    if (ref.error) continue
    const snap = m.dirBased ? adoptAssetTree(root, m) : (() => {
      const mainAbs = path.join(oceanDir(root), ref.refPath)
      if (!fs.existsSync(mainAbs)) return { error: '文件不存在' }
      return writeDraftWithBase(root, m.type, m.name, fs.readFileSync(mainAbs, 'utf-8'))
    })()
    if (snap.error) continue
    const relDir = m.dirBased ? `${TYPE_TO_DIR[m.type]}/${m.name}` : ref.refPath
    runGitInOcean(root, ['checkout', 'HEAD', '--', relDir])
    // 目录型资产：工作区里未跟踪的新子文件（如 skill 新增 scripts/x.sh）已被快照收录，
    // 但 git checkout 不会删除未跟踪文件 → 需清理，否则正式位置残留未过审内容
    if (m.dirBased) runGitInOcean(root, ['clean', '-fq', '--', relDir])
    adopted.push({ type: m.type, name: m.name, kind: 'modified' })
  }

  // 4) 未跟踪/重命名新增 → 入队 + 正式位置删除
  const removeAndClean = (absFile, stopAbs) => {
    fs.rmSync(absFile, { force: true })
    let dir = path.dirname(absFile)
    while (dir.length > stopAbs.length && fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir)
      dir = path.dirname(dir)
    }
  }
  for (const [key, m] of [...addAssets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ref = resolveRef(root, m.type, m.name)
    if (ref.error) continue
    const formalMainAbs = path.join(oceanDir(root), ref.refPath)
    const typeDirAbs = path.join(oceanDir(root), TYPE_TO_DIR[m.type])
    if (m.dirBased) {
      const snap = adoptAssetTree(root, m)
      if (snap.error) continue
      fs.rmSync(path.dirname(formalMainAbs), { recursive: true, force: true })
    } else {
      if (!fs.existsSync(formalMainAbs)) continue
      const snap = writeDraftWithBase(root, m.type, m.name, fs.readFileSync(formalMainAbs, 'utf-8'))
      if (snap.error) continue
      if (m.staged) {
        runGitInOcean(root, ['rm', '-f', '--', ref.refPath])
        if (fs.existsSync(formalMainAbs)) fs.rmSync(formalMainAbs, { force: true })
      } else {
        removeAndClean(formalMainAbs, typeDirAbs)
      }
    }
    adopted.push({ type: m.type, name: m.name, kind: 'added' })
  }

  return { success: true, adopted, restoredDeletions }
}

// ---------- 物化同步（skill/agent → {assetDir}/skills|agents，签名不变） ----------
function runtimeAssetDir(root) {
  try {
    const cfg = path.join(root, '.ocean', 'asset-root.json')
    if (fs.existsSync(cfg) && JSON.parse(fs.readFileSync(cfg, 'utf-8')).assetRoot === 'pi') return '.pi'
  } catch {}
  return '.claude'
}
// 同步语义（2026-11-27 用户口径）：只做新增 / 覆盖。运行时目录里不在同步范围内的资产（非 Ocean 管理、未过审、已删除资产的遗留副本）一律保持原样。
// only: {type, name} 仅同步该资产；省略则全量
function syncApprovedAssets(root, only) {
  const base = oceanDir(root)
  const runtimeBase = path.join(root, runtimeAssetDir(root))
  // removed / trashed 仅为兼容旧调用方保留，始终为空（同步不再删除任何运行时资产）
  const report = { added: [], updated: [], removed: [], skippedPending: [], trashed: [] }
  const rs = (p) => { try { return parseReviewStatus(fs.readFileSync(p, 'utf-8')) } catch { return 'pending' } }

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
  return { success: true, report }
}

module.exports = {
  TYPE_TO_DIR, oceanDir, normalizeAssetRel, resolveRef, typeLabel,
  parseReviewStatus, parseFmField, parseVersion, stripFrontmatter,
  isGitManaged, gitStatus, gitInit, gitLog, gitShow, gitBaseline, gitCommit, gitRollback,
  // 基准/合并（H1–H4）
  headSha, fileChangedSince, threeWayMerge,
  // 队列
  queueDir, snapshotMainRel, newSnapshotDir, latestDraft, oldestPending, oldestRejected,
  listQueue, listReviewAssets: listQueue,
  // 审核
  approveAsset, rejectAsset, restoreAsset, diffAsset, readSnapshot, discardOldestPending,
  // 读取/编辑目标
  resolveReadPath, resolveEditTarget, resolveSaveTarget,
  // 带基准草稿（H1/H7）
  writeDraftWithBase, baseCommitField, adoptStrayEdits,
  // 删除
  commitFormalDeletion, discardSnapshots,
  // 同步
  syncApprovedAssets,
  buildUnifiedDiff,
}
