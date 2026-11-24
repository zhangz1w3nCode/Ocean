// 资产审核共享模块（CLI `ocean review` 与主进程 IPC 共用同一份实现，避免两处漂移）
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
const MAIN_FILE = { skills: 'SKILL.md', workflows: 'WORKFLOW.md', tasks: 'TASK.md', codebases: 'README.md' }

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
// 黑名单 .gitignore：只排除运行态与机器绑定配置（含明文 apiKey 的 llm-config.json）
const ASSET_GITIGNORE = [
  '.DS_Store', 'llm-config.json', 'agentic-config.json', 'knowledge-git.json', 'asset-git.json',
  'knowledge-graph-config.json', 'cli-workflow-llm-judge-artifacts.json', 'setting/', 'tmp/',
  'knowledge-jobs/', 'agent-review-sessions/', 'knowledge-compile-*', '.trashbox/',
  'workflows/*/instance/', 'tasks/*/trace/', '',
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
// HEAD 基线内容（上次审核通过并提交的版本）
function gitBaseline(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径', content: null }
  if (!isGitManaged(root) || !hasCommits(root)) return { success: true, content: null }
  const r = runGitInOcean(root, ['show', `HEAD:${rel}`])
  return { success: true, content: r.status === 0 && typeof r.stdout === 'string' ? r.stdout : null }
}
function gitCommit(root, refPath, message) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径' }
  if (!isGitManaged(root)) return { success: false, error: '.ocean 尚未开启 git 托管' }
  if (!fs.existsSync(path.join(oceanDir(root), rel))) return { success: false, error: '资产文件不存在' }
  const msg = String(message == null ? '' : message).replace(/\r\n/g, '\n').trim() || `chore(assets): ${timestamp()} asset is updated`
  const add = runGitInOcean(root, ['add', '--', rel])
  if (add.status !== 0) return { success: false, error: add.stderr ? String(add.stderr) : 'git add 失败' }
  const commit = runGitInOcean(root, [...gitIdentityArgs(), 'commit', '-m', msg, '--', rel])
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
  runGitInOcean(root, ['rm', '--cached', '--ignore-unmatch', '--', rel])
  if (fs.existsSync(fp)) fs.unlinkSync(fp)
  return { success: true, action: 'deleted' }
}

// ---------- 审核列表 ----------
function listReviewAssets(root, statusFilter) {
  const items = []
  const base = oceanDir(root)
  const scan = (dirName, mainFile) => {
    const baseDir = path.join(base, dirName)
    if (!fs.existsSync(baseDir)) return
    const walk = (dir, rel) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['.git', '.DS_Store', 'instance', 'trace', 'context', 'scripts', 'references', 'examples', 'nodes'].includes(e.name)) continue
        const full = path.join(dir, e.name)
        const relPath = rel ? `${rel}/${e.name}` : e.name
        if (e.isDirectory()) { walk(full, relPath); continue }
        if (!e.name.endsWith('.md') || (mainFile && e.name !== mainFile)) continue
        const text = fs.readFileSync(full, 'utf-8')
        const rs = parseReviewStatus(text, dirName === 'knowledges')
        if (rs === 'validated') continue
        if (statusFilter && rs !== statusFilter) continue
        const type = DIR_TO_TYPE[dirName]
        const name = mainFile ? (relPath.split('/').slice(-2)[0] || e.name.replace(/\.md$/, '')) : e.name.replace(/\.md$/, '')
        items.push({
          type, name,
          refPath: `${dirName}/${relPath}`,
          description: parseFmField(text, 'description') || parseFmField(text, 'summary'),
          reviewStatus: rs,
          rejectReason: parseFmField(text, 'rejectReason'),
          version: parseVersion(text),
          mtime: fs.statSync(full).mtime.toISOString(),
        })
      }
    }
    walk(baseDir, '')
  }
  scan('skills', 'SKILL.md'); scan('agents'); scan('nodes'); scan('resources')
  scan('workflows', 'WORKFLOW.md'); scan('tasks', 'TASK.md'); scan('knowledges'); scan('codebases', 'README.md')
  items.sort((a, b) => (b.mtime || '').localeCompare(a.mtime || ''))
  return { success: true, items }
}

function readAssetRaw(root, refPath) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径', content: null }
  const fp = path.join(oceanDir(root), rel)
  if (!fs.existsSync(fp)) return { success: true, content: null }
  return { success: true, content: fs.readFileSync(fp, 'utf-8') }
}

// ---------- 状态写入（validated +1 version / rejected 必填理由 / pending 清理由） ----------
function setReviewStatus(root, refPath, reviewStatus, versionBump, reason) {
  const rel = normalizeAssetRel(refPath)
  if (!rel) return { success: false, error: '非法的资产路径' }
  if (!['validated', 'pending', 'rejected'].includes(reviewStatus)) return { success: false, error: '非法的审核状态' }
  if (reviewStatus === 'rejected' && (!reason || !String(reason).trim())) return { success: false, error: '审核不通过必须填写理由' }
  const reasonLine = String(reason || '').replace(/[\r\n]+/g, ' ').trim()
  const fp = path.join(oceanDir(root), rel)
  if (!fs.existsSync(fp)) return { success: false, error: '资产文件不存在' }
  const text = fs.readFileSync(fp, 'utf-8')
  let out
  if (/^---\n/.test(text)) {
    out = text.replace(/^(---\n)([\s\S]*?)(\n---)/, (whole, open, fm, close) => {
      let next = fm
      next = /^reviewStatus:.*$/m.test(next)
        ? next.replace(/^reviewStatus:.*$/m, `reviewStatus: ${reviewStatus}`)
        : `${next}\nreviewStatus: ${reviewStatus}`
      if (reviewStatus === 'rejected') {
        next = /^rejectReason:.*$/m.test(next)
          ? next.replace(/^rejectReason:.*$/m, `rejectReason: ${reasonLine}`)
          : `${next}\nrejectReason: ${reasonLine}`
      } else {
        next = next.replace(/^rejectReason:.*$\n?/m, '')
      }
      if (versionBump) {
        const vm = next.match(/^version:\s*(\d+)/m)
        next = vm
          ? next.replace(/^version:\s*\d+.*$/m, `version: ${parseInt(vm[1], 10) + 1}`)
          : `${next}\nversion: 1`
      }
      return open + next + close
    })
  } else {
    out = `---\nreviewStatus: ${reviewStatus}${reviewStatus === 'rejected' ? `\nrejectReason: ${reasonLine}` : ''}${versionBump ? '\nversion: 1' : ''}\n---\n${text}`
  }
  fs.writeFileSync(fp, out, 'utf-8')
  return { success: true }
}

// ---------- 物化同步（skill/agent → {assetDir}/skills|agents） ----------
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

// ---------- 审核通过：validated + version+1 → 托管时提交 → skill/agent 自动单项物化 ----------
function approveAsset(root, type, name, message) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  const fp = path.join(oceanDir(root), r.refPath)
  if (!fs.existsSync(fp)) return { success: false, error: `${typeLabel(type)} ${name} 不存在` }
  const before = parseReviewStatus(fs.readFileSync(fp, 'utf-8'), type === 'knowledge')
  if (before !== 'pending') {
    return { success: false, error: before === 'rejected'
      ? `${typeLabel(type)} ${name} 处于已驳回状态，请先恢复待审（review restore）再审核通过`
      : `${typeLabel(type)} ${name} 已是审核通过状态` }
  }
  const set = setReviewStatus(root, r.refPath, 'validated', true)
  if (!set.success) return set
  const version = parseVersion(fs.readFileSync(fp, 'utf-8'))
  let commit = null
  if (isGitManaged(root)) commit = gitCommit(root, r.refPath, message)
  let sync = null
  if (type === 'skill' || type === 'agent') sync = syncApprovedAssets(root, { type, name: r.name })
  return { success: true, type, name: r.name, version, commit, sync }
}

function typeLabel(type) {
  return { skill: '技能', agent: '智能体', node: '节点', resource: '资源', workflow: '工作流', task: '任务', knowledge: '知识', codebase: '代码库' }[type] || type
}

// ---------- diff：待审工作区版本 vs .ocean git HEAD（上次审核通过版本）；剥离 frontmatter 只比正文 ----------
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
function diffAgainstHead(root, type, name) {
  const r = resolveRef(root, type, name)
  if (r.error) return { success: false, error: r.error }
  const fp = path.join(oceanDir(root), r.refPath)
  if (!fs.existsSync(fp)) return { success: false, error: `${typeLabel(type)} ${name} 不存在` }
  const current = fs.readFileSync(fp, 'utf-8')
  const status = parseReviewStatus(current, type === 'knowledge')
  const version = parseVersion(current)
  const base = gitBaseline(root, r.refPath)
  if (!base.success) return { success: false, error: base.error }
  if (base.content == null) {
    return { success: true, type, name: r.name, reviewStatus: status, version, hasBaseline: false,
      note: isGitManaged(root) ? '无基线：该资产从未审核通过（首次审核）' : '无基线：.ocean 未开启 git 托管（review init 可开启）',
      content: current }
  }
  const diff = buildUnifiedDiff(stripFrontmatter(base.content), stripFrontmatter(current), '上次审核通过版本', '待审核版本')
  return { success: true, type, name: r.name, reviewStatus: status, version, hasBaseline: true, changed: diff.trim().split('\n').length > 2, diff }
}

module.exports = {
  TYPE_TO_DIR, oceanDir, normalizeAssetRel, resolveRef, typeLabel,
  parseReviewStatus, parseFmField, parseVersion, stripFrontmatter,
  isGitManaged, gitStatus, gitInit, gitLog, gitShow, gitBaseline, gitCommit, gitRollback,
  listReviewAssets, readAssetRaw, setReviewStatus, syncApprovedAssets, approveAsset,
  buildUnifiedDiff, diffAgainstHead,
}
