// 知识域统一实现 —— CLI（ocean knowledge）与桌面端/网页端共用的唯一事实源。
// 由 core/knowledge.ts 迁移而来（CLI 语义组）+ launch.cjs 知识库内联实现（GUI 语义组），
// 行为零变更：两组语义并存，底层共享同一份文件操作与 git 工具链。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由调用方决定包装方式
// （desktop 包成 { success:false }，CLI 转成错误输出）。
//
// 数据格式（{root}/.knowledges，跨资产来源共享，不随 assetRoot 变化）：
//   {root}/.knowledges/{relPath}.md — YAML frontmatter（name/domain/summary/tags/status）+ 正文。
//   GUI 链路由前端组装完整 Markdown（generateKnowledgeMarkdown：yaml 库 + rawFrontmatter
//   未知字段保留 + status 默认 pending；审核链路写 validated）后整文件写入；
//   CLI create 由 core 组装 frontmatter（含 domain 字段、frontmatter 后空行、尾换行），
//   update 以原 frontmatter 为基底增量重建（status 回退 pending、description→summary 迁移、
//   domain 与文件位置同步）。双端解析互相兼容（已实测跨端 search 命中）。
//
// git 托管：.knowledges 作为独立 git 仓库，固定本地分支 ocean-knowledge（审核全链路使用，
// 不随外部 checkout 漂移）；提交身份优先读全局 git 配置，缺失回退 ocean@local / Ocean。
//
// 项目级配置（不随 assetRoot）：{root}/.ocean/knowledge-git.json、
//   {root}/.ocean/knowledge-graph-config.json、{root}/.ocean/template/knowledge/{type}.json。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as child_process from 'node:child_process'

// CLI create / update 的可选元信息
export interface KnowledgeWriteOpts {
  summary?: string
  tags?: string[]
}

export interface DomainInfo {
  domain: string // 相对 .knowledges 的目录路径
  count: number // 直接位于该目录的知识数
}

export interface DomainNode {
  domain: string // 相对 .knowledges 的目录路径
  knowledges: string[] // 直接位于该目录的知识（相对 .knowledges 完整路径）
  subdomains: DomainNode[] // 子 domain 节点（递归）
}

export interface KnowledgeFolder {
  name: string
  path: string
  children: KnowledgeFolder[]
}

export interface KnowledgeGitCommitInfo {
  hash: string
  author: string
  date: string
  subject: string
}

export interface KnowledgeSearchMatch {
  line: number // 命中行号（正文内，1 起）
  text: string // 命中行原文
  before: string[] // 上下文前 N 行
  after: string[] // 上下文后 N 行
}

export interface KnowledgeSearchResult {
  path: string // 相对 .knowledges 的路径（含 .md）
  name: string // 文档标题
  metadata: Record<string, string> // yaml 元数据（frontmatter 全字段）
  summary: string // 摘要
  matches: KnowledgeSearchMatch[] // 命中上下文
}

export interface KnowledgeSearchOpts {
  top?: number
  context?: number
}

type Failed = { success: false; error: string }

const EXCLUDED_DIRS = new Set(['.git', '.svn', '.hg', '.DS_Store', 'node_modules'])
const KNOWLEDGE_GIT_BRANCH = 'ocean-knowledge'

// ---------------------------------------------------------------------------
// 内部辅助：路径 / frontmatter / 扫描
// ---------------------------------------------------------------------------

function knowledgesDir(root: string): string {
  return path.join(root, '.knowledges')
}

// GUI 原语义：launch.cjs getKnowledgesDir() 读取目录时同步创建（load/delete/list 也触发该副作用）
function ensureKnowledgesDir(root: string): string {
  const dir = knowledgesDir(root)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function knowledgeFilePath(root: string, relPath: string): string {
  return path.join(knowledgesDir(root), relPath.endsWith('.md') ? relPath : `${relPath}.md`)
}

function scanDirRecursive(dir: string, baseDir: string = dir, result: string[] = []): string[] {
  if (!fs.existsSync(dir)) return result
  const items = fs.readdirSync(dir)
  for (const item of items) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(dir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      scanDirRecursive(fullPath, baseDir, result)
    } else if (item.endsWith('.md')) {
      const relativePath = path.relative(baseDir, fullPath)
      result.push(relativePath)
    }
  }
  return result
}

// 解析 YAML frontmatter（简单 key: value 行，自 core/knowledge.ts 原样迁移）
function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { fields: {}, body: raw }
  const block = match[1]
  const body = match[2] || ''
  const fields: Record<string, string> = {}
  for (const line of block.split('\n')) {
    const idx = line.indexOf(':')
    if (idx > 0) {
      const key = line.substring(0, idx).trim()
      const val = line.substring(idx + 1).trim()
      if (key) fields[key] = val
    }
  }
  return { fields, body }
}

// 序列化 YAML frontmatter（字段顺序 = 对象插入序，与原实现一致；frontmatter 后空行 + 尾换行）
function buildFrontmatter(fields: Record<string, string>, body: string): string {
  let fm = '---\n'
  for (const [key, val] of Object.entries(fields)) {
    fm += `${key}: ${val}\n`
  }
  fm += `---\n\n${body}\n`
  return fm
}

// ---------------------------------------------------------------------------
// 内部辅助：git 工具链（launch.cjs 知识库 git 段原样迁移）
// ---------------------------------------------------------------------------

// 归一化知识相对路径：去掉 .md 后缀，拒绝绝对路径/反斜杠/空段/./..
function normalizeKnowledgeRel(name: string): string | null {
  const normalized = String(name == null ? '' : name).replace(/\.md$/, '')
  if (
    !normalized ||
    normalized.startsWith('/') ||
    normalized.includes('\\') ||
    normalized.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')
  ) {
    return null
  }
  return normalized
}

// 在 .knowledges 独立仓库内执行 git 命令
function runGitInKnowledges(root: string, args: string[], opts?: { [k: string]: unknown }) {
  const dir = knowledgesDir(root)
  return child_process.spawnSync('git', ['-C', dir, ...args], {
    encoding: 'utf-8',
    ...(opts || {}),
  })
}

// 解析真实路径（消除 macOS /tmp -> /private/tmp 之类的符号链接差异）
function realPath(p: string): string {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

// .knowledges 自身是否为 git 仓库根（而非父仓库的子目录）
function isKnowledgesGitManaged(root: string): boolean {
  try {
    const dir = knowledgesDir(root)
    if (!fs.existsSync(path.join(dir, '.git'))) return false
    const result = runGitInKnowledges(root, ['rev-parse', '--show-toplevel'])
    if (result.status !== 0 || typeof result.stdout !== 'string') return false
    return realPath(result.stdout.trim()) === realPath(dir)
  } catch {
    return false
  }
}

// 提交身份：优先读取全局 git 配置，缺失时回退到内置身份
function knowledgeGitIdentityArgs(): string[] {
  const args: string[] = []
  try {
    const email = child_process.spawnSync('git', ['config', 'user.email'], { encoding: 'utf-8' })
    if (!email.stdout || !String(email.stdout).trim()) {
      args.push('-c', 'user.email=ocean@local')
    }
    const name = child_process.spawnSync('git', ['config', 'user.name'], { encoding: 'utf-8' })
    if (!name.stdout || !String(name.stdout).trim()) {
      args.push('-c', 'user.name=Ocean')
    }
  } catch {
    args.push('-c', 'user.email=ocean@local', '-c', 'user.name=Ocean')
  }
  return args
}

// 本地时间戳：YYYYMMDDHHmmss
function knowledgeTimestamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function defaultKnowledgeCommitMessage(): string {
  return `chore(knowledge): ${knowledgeTimestamp()} knowledge card is updated`
}

// 固定分支上是否已产生提交（可作为 diff 基线与回滚目标）
function knowledgeHasCommits(root: string): boolean {
  const result = runGitInKnowledges(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${KNOWLEDGE_GIT_BRANCH}`])
  return result.status === 0
}

// 固定分支是否已存在
function knowledgeBranchExists(root: string): boolean {
  return runGitInKnowledges(root, ['show-ref', '--verify', '--quiet', `refs/heads/${KNOWLEDGE_GIT_BRANCH}`]).status === 0
}

// 保证工作区 HEAD 落在固定分支：分支不存在则从当前 HEAD 切出（完整保留历史），已存在则切回
// 失败时必须交调用方中止，禁止降级为按 HEAD 操作
function ensureKnowledgeBranch(root: string): { ok: boolean; changed?: boolean; error?: string } {
  try {
    const current = runGitInKnowledges(root, ['symbolic-ref', '--short', '-q', 'HEAD'])
    if (current.status === 0 && typeof current.stdout === 'string' && current.stdout.trim() === KNOWLEDGE_GIT_BRANCH) {
      return { ok: true, changed: false }
    }
    const checkout = knowledgeBranchExists(root)
      ? runGitInKnowledges(root, ['checkout', KNOWLEDGE_GIT_BRANCH])
      : runGitInKnowledges(root, ['checkout', '-b', KNOWLEDGE_GIT_BRANCH])
    if (checkout.status !== 0) {
      const out = `${checkout.stderr || ''}${checkout.stdout || ''}`.trim()
      return { ok: false, error: out || `切换到 ${KNOWLEDGE_GIT_BRANCH} 分支失败` }
    }
    return { ok: true, changed: true }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

// ---------------------------------------------------------------------------
// GUI 语义组（launch.cjs knowledge IPC 契约复刻；desktop 壳原样透传）
// ---------------------------------------------------------------------------

// save-knowledge-file：无条件覆写（upsert），name 支持子目录路径（自动创建中间目录），
// content 为前端组装的完整 Markdown，原样哑写
export function saveKnowledgeFile(root: string, name: string, content: string): { success: true } | Failed {
  const filePath = knowledgeFilePath(root, name)
  const dirPath = path.dirname(filePath)
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  return { success: true }
}

// load-knowledge-file：文件不存在返回 content:null（不是失败）
export function readKnowledgeFile(root: string, name: string): { success: true; content: string | null; mtime: string | null } | ({ success: false; error: string } & { content: null; mtime: null }) {
  const filePath = knowledgeFilePath(root, name)
  if (!fs.existsSync(filePath)) {
    return { success: true, content: null, mtime: null }
  }
  const content = fs.readFileSync(filePath, 'utf-8')
  const stats = fs.statSync(filePath)
  return { success: true, content, mtime: stats.mtime.toISOString() }
}

// delete-knowledge-file：文件不存在静默成功（只删单文件，不删目录）
export function deleteKnowledgeFile(root: string, name: string): { success: true } | Failed {
  const filePath = knowledgeFilePath(root, name)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return { success: true }
}

// load-all-knowledge-files：递归 .md 相对路径（含 index.md，前端自行过滤；跳过隐藏目录）
export function listKnowledgeFiles(root: string): { success: true; files: string[] } | Failed {
  const dir = ensureKnowledgesDir(root)
  const files = scanDirRecursive(dir)
  return { success: true, files }
}

// list-knowledge-folders：递归目录树（跳过隐藏目录）
export function listKnowledgeFolders(root: string): { success: true; folders: KnowledgeFolder[] } | Failed {
  const dir = ensureKnowledgesDir(root)

  const scanFolders = (d: string, basePath: string = ''): KnowledgeFolder[] => {
    const folders: KnowledgeFolder[] = []
    if (!fs.existsSync(d)) return folders
    const items = fs.readdirSync(d)
    for (const item of items) {
      if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
      const fullPath = path.join(d, item)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        const folderPath = basePath ? `${basePath}/${item}` : item
        folders.push({
          name: item,
          path: folderPath,
          children: scanFolders(fullPath, folderPath),
        })
      }
    }
    return folders
  }

  const folders = scanFolders(dir)
  return { success: true, folders }
}

// knowledge-git-status：查询托管状态（已托管时顺带把分支拉回固定分支）
export function getKnowledgeGitStatus(root: string): { success: true; managed: boolean; branch: string | null; hasCommits: boolean; branchError?: string } | ({ success: false; error: string } & { managed: false; branch: null; hasCommits: false }) {
  const managed = isKnowledgesGitManaged(root)
  if (!managed) {
    return { success: true, managed: false, branch: null, hasCommits: false }
  }
  const ensured = ensureKnowledgeBranch(root)
  if (!ensured.ok) {
    const branchResult = runGitInKnowledges(root, ['symbolic-ref', '--short', '-q', 'HEAD'])
    const branch = branchResult.status === 0 && branchResult.stdout ? branchResult.stdout.trim() : null
    return {
      success: true,
      managed: true,
      branch,
      hasCommits: knowledgeHasCommits(root),
      branchError: `知识库当前在 ${branch || '未知'} 分支，无法自动切换到 ${KNOWLEDGE_GIT_BRANCH}：${ensured.error}`,
    }
  }
  return { success: true, managed: true, branch: KNOWLEDGE_GIT_BRANCH, hasCommits: knowledgeHasCommits(root) }
}

// knowledge-git-init：开启托管（git init 固定分支 + .gitignore + 全量基线提交）
export function initKnowledgeGit(root: string): { success: true; branch?: string; hasCommits: boolean; alreadyManaged?: boolean } | Failed {
  // 旧实现 getKnowledgesDir() 无条件建目录后再 init：空项目可成功开启 git 托管
  // （审查回归修复：恢复该副作用，保持与迁移前行为一致）
  const dir = ensureKnowledgesDir(root)
  if (isKnowledgesGitManaged(root)) {
    const ensured = ensureKnowledgeBranch(root)
    if (!ensured.ok) return { success: false, error: ensured.error || '' }
    return { success: true, alreadyManaged: true, branch: KNOWLEDGE_GIT_BRANCH, hasCommits: knowledgeHasCommits(root) }
  }
  let init = child_process.spawnSync('git', ['-C', dir, 'init', '-b', KNOWLEDGE_GIT_BRANCH], { encoding: 'utf-8' })
  if (init.status !== 0) {
    init = child_process.spawnSync('git', ['-C', dir, 'init'], { encoding: 'utf-8' })
    if (init.status !== 0) {
      return { success: false, error: init.stderr ? String(init.stderr) : 'git init 失败' }
    }
    child_process.spawnSync('git', ['-C', dir, 'symbolic-ref', 'HEAD', `refs/heads/${KNOWLEDGE_GIT_BRANCH}`], { encoding: 'utf-8' })
  }
  // 排除索引等二进制产物
  const ignorePath = path.join(dir, '.gitignore')
  if (!fs.existsSync(ignorePath)) {
    fs.writeFileSync(ignorePath, '*.sqlite\n.trash-box/\n', 'utf-8')
  }
  const add = runGitInKnowledges(root, ['add', '-A'])
  if (add.status !== 0) {
    return { success: false, error: add.stderr ? String(add.stderr) : 'git add 失败' }
  }
  const identity = knowledgeGitIdentityArgs()
  const commit = runGitInKnowledges(root, [...identity, 'commit', '-m', 'chore(knowledge): initialize knowledge base as baseline'])
  if (commit.status !== 0) {
    const out = `${commit.stdout || ''}${commit.stderr || ''}`
    if (/nothing to commit|no changes added/i.test(out)) {
      return { success: true, branch: KNOWLEDGE_GIT_BRANCH, hasCommits: false }
    }
    return { success: false, error: out || 'git commit 失败' }
  }
  return { success: true, branch: KNOWLEDGE_GIT_BRANCH, hasCommits: true }
}

// knowledge-git-log：知识文件提交历史（仅取固定分支）
export function getKnowledgeGitLog(root: string, name: string): { success: true; commits: KnowledgeGitCommitInfo[] } | ({ success: false; error: string } & { commits: [] }) {
  const normalized = normalizeKnowledgeRel(name)
  if (!normalized) return { success: false, error: '非法的知识路径', commits: [] }
  if (!isKnowledgesGitManaged(root)) return { success: true, commits: [] }
  const relPath = `${normalized}.md`
  const result = runGitInKnowledges(root, ['log', '--format=%H%x1f%an%x1f%aI%x1f%s', KNOWLEDGE_GIT_BRANCH, '--', relPath])
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { success: true, commits: [] }
  }
  const commits = result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, author, date, subject] = line.split('\x1f')
      return { hash, author, date, subject }
    })
  return { success: true, commits }
}

// knowledge-git-show：读取知识文件在指定历史版本中的原文（rev 校验 [0-9a-fA-F]{4,40}）
export function showKnowledgeGitRevision(root: string, name: string, rev: string): { success: true; content: string | null } | ({ success: false; error: string } & { content: null }) {
  const normalized = normalizeKnowledgeRel(name)
  if (!normalized) return { success: false, error: '非法的知识路径', content: null }
  const sha = String(rev == null ? '' : rev)
  if (!/^[0-9a-fA-F]{4,40}$/.test(sha)) {
    return { success: false, error: '非法的版本号', content: null }
  }
  if (!isKnowledgesGitManaged(root)) return { success: true, content: null }
  const relPath = `${normalized}.md`
  const result = runGitInKnowledges(root, ['show', `${sha}:${relPath}`])
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { success: true, content: null }
  }
  return { success: true, content: result.stdout }
}

// knowledge-git-commit：提交知识文件到固定分支（审核通过）；消息空则默认时间戳消息
export function commitKnowledgeGit(root: string, name: string, message: string): { success: true; hash?: string | null; message?: string; noChanges?: boolean } | Failed {
  const normalized = normalizeKnowledgeRel(name)
  if (!normalized) return { success: false, error: '非法的知识路径' }
  if (!isKnowledgesGitManaged(root)) return { success: false, error: '知识库尚未开启 git 托管' }
  const ensured = ensureKnowledgeBranch(root)
  if (!ensured.ok) return { success: false, error: ensured.error || '' }
  const relPath = `${normalized}.md`
  const filePath = path.join(knowledgesDir(root), relPath)
  if (!fs.existsSync(filePath)) return { success: false, error: '知识文件不存在' }
  const rawMessage = String(message == null ? '' : message).replace(/\r\n/g, '\n').trim()
  const msg = rawMessage || defaultKnowledgeCommitMessage()
  const add = runGitInKnowledges(root, ['add', '--', relPath])
  if (add.status !== 0) {
    return { success: false, error: add.stderr ? String(add.stderr) : 'git add 失败' }
  }
  const identity = knowledgeGitIdentityArgs()
  const commit = runGitInKnowledges(root, [...identity, 'commit', '-m', msg, '--', relPath])
  if (commit.status !== 0) {
    const out = `${commit.stdout || ''}${commit.stderr || ''}`
    if (/nothing to commit|no changes added|nothing added to commit/i.test(out)) {
      return { success: true, noChanges: true, message: msg }
    }
    return { success: false, error: out || 'git commit 失败' }
  }
  const rev = runGitInKnowledges(root, ['rev-parse', KNOWLEDGE_GIT_BRANCH])
  return { success: true, hash: rev.status === 0 && rev.stdout ? rev.stdout.trim() : null, message: msg }
}

// knowledge-git-rollback：回滚到固定分支最近提交（审核不通过）；无基线时删除文件
export function rollbackKnowledgeGit(root: string, name: string): { success: true; action: 'restored' | 'deleted' } | Failed {
  const normalized = normalizeKnowledgeRel(name)
  if (!normalized) return { success: false, error: '非法的知识路径' }
  if (!isKnowledgesGitManaged(root)) return { success: false, error: '知识库尚未开启 git 托管' }
  const ensured = ensureKnowledgeBranch(root)
  if (!ensured.ok) return { success: false, error: ensured.error || '' }
  const relPath = `${normalized}.md`
  const filePath = path.join(knowledgesDir(root), relPath)
  const hasBaseline = knowledgeHasCommits(root) &&
    runGitInKnowledges(root, ['cat-file', '-e', `${KNOWLEDGE_GIT_BRANCH}:${relPath}`]).status === 0
  if (hasBaseline) {
    const checkout = runGitInKnowledges(root, ['checkout', KNOWLEDGE_GIT_BRANCH, '--', relPath])
    if (checkout.status !== 0) {
      return { success: false, error: checkout.stderr ? String(checkout.stderr) : 'git checkout 失败' }
    }
    return { success: true, action: 'restored' }
  }
  runGitInKnowledges(root, ['rm', '--cached', '--ignore-unmatch', '--', relPath])
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  return { success: true, action: 'deleted' }
}

// load-knowledge-git-config：{root}/.ocean/knowledge-git.json（缺失 config:null）
export function readKnowledgeGitConfig(root: string): { success: true; config: unknown } | ({ success: false; error: string } & { config: null }) {
  const configPath = path.join(root, '.ocean', 'knowledge-git.json')
  if (!fs.existsSync(configPath)) {
    return { success: true, config: null }
  }
  const content = fs.readFileSync(configPath, 'utf-8')
  return { success: true, config: JSON.parse(content) }
}

// save-knowledge-git-config：JSON 2 空格缩进
export function writeKnowledgeGitConfig(root: string, config: unknown): { success: true } | Failed {
  const dir = path.join(root, '.ocean')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const configPath = path.join(dir, 'knowledge-git.json')
  fs.writeFileSync(configPath, JSON.stringify(config || {}, null, 2), 'utf-8')
  return { success: true }
}

// get-knowledge-baseline：固定分支最新提交中的基线原文（审核页 diff 用；无基线返回 null）
export function getKnowledgeBaseline(root: string, name: string): { success: true; content: string | null } | ({ success: false; error: string } & { content: null }) {
  const normalized = normalizeKnowledgeRel(name)
  if (!normalized) {
    return { success: false, error: '非法的知识路径', content: null }
  }
  if (!isKnowledgesGitManaged(root)) {
    return { success: true, content: null }
  }
  const relPath = `${normalized}.md`
  const result = runGitInKnowledges(root, ['show', `${KNOWLEDGE_GIT_BRANCH}:${relPath}`])
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return { success: true, content: null }
  }
  return { success: true, content: result.stdout }
}

// load-knowledge-graph-config：{root}/.ocean/knowledge-graph-config.json（缺失 config:null 表示用默认）
export function readKnowledgeGraphConfig(root: string): { success: true; config: unknown } | ({ success: false; error: string } & { config: null }) {
  const configPath = path.join(root, '.ocean', 'knowledge-graph-config.json')
  if (!fs.existsSync(configPath)) {
    return { success: true, config: null }
  }
  const content = fs.readFileSync(configPath, 'utf-8')
  return { success: true, config: JSON.parse(content) }
}

// save-knowledge-graph-config：确保 .ocean 存在，JSON 2 空格缩进
export function writeKnowledgeGraphConfig(root: string, config: unknown): { success: true } | Failed {
  const oceanDir = path.join(root, '.ocean')
  if (!fs.existsSync(oceanDir)) {
    fs.mkdirSync(oceanDir, { recursive: true })
  }
  const configPath = path.join(oceanDir, 'knowledge-graph-config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return { success: true }
}

// save-knowledge-template-file：{root}/.ocean/template/knowledge/{type}.json
export function saveKnowledgeTemplateFile(root: string, templateType: string, content: string): { success: true } | Failed {
  const templateDir = path.join(root, '.ocean', 'template', 'knowledge')
  if (!fs.existsSync(templateDir)) {
    fs.mkdirSync(templateDir, { recursive: true })
  }
  const filePath = path.join(templateDir, `${templateType}.json`)
  const templateData = {
    content,
    updatedAt: new Date().toISOString()
  }
  fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2), 'utf-8')
  return { success: true }
}

// load-knowledge-template-file：不存在返回 { success:false, content:null }（missing = 失败语义，
// 与 skill 模板一致——launch.cjs 既有行为逐字复刻）；JSON 解析失败向上抛（壳 catch 包 error.message）
export function readKnowledgeTemplateFile(root: string, templateType: string): { success: true; content: string } | { success: false; content: null; error?: string } {
  const filePath = path.join(root, '.ocean', 'template', 'knowledge', `${templateType}.json`)
  if (!fs.existsSync(filePath)) {
    return { success: false, content: null }
  }
  const fileContent = fs.readFileSync(filePath, 'utf-8')
  const templateData = JSON.parse(fileContent)
  return { success: true, content: templateData.content }
}

// ---------------------------------------------------------------------------
// CLI 语义组（core/knowledge.ts 原样迁移；CLI 壳 unwrap 转异常 exit 1）
// ---------------------------------------------------------------------------

// 递归 .md 相对路径，sort 排序；目录不存在返回空（不建目录，与 GUI 组副作用区分）
// （内部私有版本：search / rewriteExternalLinks 直接消费字符串数组）
function listFiles(root: string): string[] {
  const d = knowledgesDir(root)
  if (!fs.existsSync(d)) return []
  const result: string[] = []
  scanDirRecursive(d, d, result)
  return result.sort()
}

export function listKnowledges(root: string): { success: true; files: string[] } | Failed {
  return { success: true, files: listFiles(root) }
}

// 读取原文（含 frontmatter）；文件不存在时保留系统错误原文（ENOENT）
export function readKnowledge(root: string, relPath: string): { success: true; content: string } | Failed {
  try {
    const content = fs.readFileSync(knowledgeFilePath(root, relPath), 'utf-8')
    return { success: true, content }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

// create-only（重名报错）；frontmatter 组装：name + domain（子目录时）+ summary/tags 可选 +
// status:pending（新建默认待审核）；frontmatter 后空行 + 尾换行
export function createKnowledge(root: string, relPath: string, content: string, opts?: KnowledgeWriteOpts): { success: true } | Failed {
  const d = knowledgesDir(root)
  const filePath = path.join(d, relPath.endsWith('.md') ? relPath : `${relPath}.md`)
  if (fs.existsSync(filePath)) return { success: false, error: `知识已存在: ${relPath}` }
  const name = path.basename(filePath, '.md')
  const domain = path.dirname(path.relative(d, filePath))
  let fm = `---\nname: ${name}\n`
  // domain = 知识所在文件夹（相对 .knowledges），根目录下的知识无 domain
  if (domain !== '.') fm += `domain: ${domain}\n`
  if (opts?.summary) fm += `summary: ${opts.summary}\n`
  if (opts?.tags && opts.tags.length > 0) {
    fm += `tags: [${opts.tags.join(', ')}]\n`
  }
  // 新建知识默认待审核
  fm += `status: pending\n`
  fm += `---\n\n${content}\n`
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, fm, 'utf-8')
  return { success: true }
}

// 前置存在检查 + 以原 frontmatter 为基底增量更新（未知字段与字段顺序保留）；
// status 强制回退 pending（更新即视为新内容）；description 历史字段迁移为 summary；
// domain 字段与文件实际位置同步
export function updateKnowledge(root: string, relPath: string, content: string, opts?: KnowledgeWriteOpts): { success: true } | Failed {
  const filePath = knowledgeFilePath(root, relPath)
  if (!fs.existsSync(filePath)) return { success: false, error: `知识不存在: ${relPath}` }
  const raw = fs.readFileSync(filePath, 'utf-8')
  const { fields } = parseFrontmatter(raw)
  if (opts?.summary !== undefined) {
    if (opts.summary) {
      fields.summary = opts.summary
    } else {
      delete fields.summary
    }
    // 历史 description 字段统一迁移为 summary
    delete fields.description
  }
  if (opts?.tags !== undefined) {
    if (opts.tags.length > 0) {
      fields.tags = `[${opts.tags.join(', ')}]`
    } else {
      delete fields.tags
    }
  }
  // 更新后回退为待审核
  fields.status = 'pending'
  // domain 字段与文件实际位置保持一致（兼容无 domain 字段的历史知识）
  const fileDomain = path.dirname(path.relative(knowledgesDir(root), filePath))
  if (fileDomain !== '.') {
    fields.domain = fileDomain
  } else {
    delete fields.domain
  }
  const updated = buildFrontmatter(fields, content)
  fs.writeFileSync(filePath, updated, 'utf-8')
  return { success: true }
}

// 文件不存在静默成功（无 ensureDir 副作用）
export function delKnowledge(root: string, relPath: string): { success: true } | Failed {
  const filePath = knowledgeFilePath(root, relPath)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  return { success: true }
}

// --- domain 管理（domain 即 .knowledges 下的文件夹）---

function resolveDomainDir(root: string, name: string): string {
  const d = path.resolve(knowledgesDir(root))
  const target = path.resolve(d, name)
  if (target === d || !target.startsWith(d + path.sep)) {
    throw new Error(`非法的 domain 路径: ${name}`)
  }
  return target
}

export function createKnowledgeDomain(root: string, name: string): { success: true } | Failed {
  const target = resolveDomainDir(root, name)
  if (fs.existsSync(target)) return { success: false, error: `domain 已存在: ${name}` }
  fs.mkdirSync(target, { recursive: true })
  return { success: true }
}

function listDomains(root: string): DomainInfo[] {
  const d = knowledgesDir(root)
  if (!fs.existsSync(d)) return []
  const result: DomainInfo[] = []
  scanDomains(d, d, result)
  return result.sort((a, b) => a.domain.localeCompare(b.domain))
}

function scanDomains(dir: string, baseDir: string, result: DomainInfo[]): void {
  for (const item of fs.readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(dir, item)
    if (!fs.statSync(fullPath).isDirectory()) continue
    const rel = path.relative(baseDir, fullPath)
    let count = 0
    for (const f of fs.readdirSync(fullPath)) {
      if (f.endsWith('.md')) count++
    }
    result.push({ domain: rel, count })
    scanDomains(fullPath, baseDir, result)
  }
}

export function searchKnowledgeDomains(root: string, keyword: string): { success: true; results: DomainInfo[] } | Failed {
  if (!keyword || keyword.trim() === '') return { success: true, results: [] }
  const kw = keyword.trim().toLowerCase()
  return { success: true, results: listDomains(root).filter(d => d.domain.toLowerCase().includes(kw)) }
}

function buildDomainNode(baseDir: string, domainDir: string): DomainNode {
  const knowledges: string[] = []
  const subdomains: DomainNode[] = []
  for (const item of fs.readdirSync(domainDir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(domainDir, item)
    if (fs.statSync(fullPath).isDirectory()) {
      subdomains.push(buildDomainNode(baseDir, fullPath))
    } else if (item.endsWith('.md')) {
      knowledges.push(path.relative(baseDir, fullPath))
    }
  }
  knowledges.sort()
  subdomains.sort((a, b) => a.domain.localeCompare(b.domain))
  return { domain: path.relative(baseDir, domainDir), knowledges, subdomains }
}

export function listKnowledgeDomainTree(root: string): { success: true; nodes: DomainNode[] } | Failed {
  const d = path.resolve(knowledgesDir(root))
  if (!fs.existsSync(d)) return { success: true, nodes: [] }
  const nodes: DomainNode[] = []
  for (const item of fs.readdirSync(d)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(d, item)
    if (!fs.statSync(fullPath).isDirectory()) continue
    nodes.push(buildDomainNode(d, fullPath))
  }
  return { success: true, nodes: nodes.sort((a, b) => a.domain.localeCompare(b.domain)) }
}

export function listKnowledgeDomainSubtree(root: string, name: string): { success: true; node: DomainNode } | Failed {
  const d = path.resolve(knowledgesDir(root))
  const target = resolveDomainDir(root, name)
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    return { success: false, error: `domain 不存在: ${name}` }
  }
  return { success: true, node: buildDomainNode(d, target) }
}

export function updateKnowledgeDomain(root: string, oldName: string, newName: string): { success: true } | Failed {
  const d = path.resolve(knowledgesDir(root))
  const oldDir = resolveDomainDir(root, oldName)
  const newDir = resolveDomainDir(root, newName)
  if (!fs.existsSync(oldDir)) return { success: false, error: `domain 不存在: ${oldName}` }
  if (fs.existsSync(newDir)) return { success: false, error: `domain 已存在: ${newName}` }
  if (newDir.startsWith(oldDir + path.sep)) return { success: false, error: '新 domain 不能是旧 domain 的子路径' }
  if (oldDir.startsWith(newDir + path.sep)) return { success: false, error: '新 domain 不能是旧 domain 的父路径' }
  fs.mkdirSync(path.dirname(newDir), { recursive: true })
  fs.renameSync(oldDir, newDir)
  // 刷新受影响知识的 domain 字段与子树内部 wikilink（含子目录）
  refreshDomainFields(d, newDir, oldName, newName)
  // 重写子树外其他知识中指向旧 domain 的 wikilink
  rewriteExternalLinks(root, d, newDir, oldName, newName)
  return { success: true }
}

function refreshDomainFields(baseDir: string, targetDir: string, oldName: string, newName: string): void {
  for (const item of fs.readdirSync(targetDir)) {
    if (EXCLUDED_DIRS.has(item) || item.startsWith('.')) continue
    const fullPath = path.join(targetDir, item)
    const stat = fs.statSync(fullPath)
    if (stat.isDirectory()) {
      refreshDomainFields(baseDir, fullPath, oldName, newName)
    } else if (item.endsWith('.md')) {
      const raw = fs.readFileSync(fullPath, 'utf-8')
      // 仅改写带合法 frontmatter 的知识文件，非知识 .md 保持原样
      if (!/^---\n[\s\S]*?\n---\n?/.test(raw)) continue
      const fileDomain = path.dirname(path.relative(baseDir, fullPath))
      const { fields, body } = parseFrontmatter(raw)
      fields.domain = fileDomain
      const newBody = rewriteDomainLinks(body, oldName, newName)
      fs.writeFileSync(fullPath, buildFrontmatter(fields, newBody), 'utf-8')
    }
  }
}

// 重写正文中 wikilink 指向旧 domain 的路径前缀（纯文件名引用不受影响）
function rewriteDomainLinks(body: string, oldName: string, newName: string): string {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const prefixRe = new RegExp(`(^|\\/)${esc(oldName)}\\/`)
  return body.replace(/\[\[([^\]|]+?)(\.(?:md|mdx))?(\|[^\]]+)?\]\]/g, (m, rawTarget: string, ext: string, alias: string) => {
    const tick = rawTarget.includes('`')
    const t = rawTarget.trim().replace(/^`+|`+$/g, '')
    if (!prefixRe.test(t)) return m
    const replaced = t.replace(prefixRe, (_mm: string, p1: string) => `${p1}${newName}/`)
    return `[[${tick ? '`' + replaced + '`' : replaced}${ext || ''}${alias || ''}]]`
  })
}

// 重写移动子树之外其他知识中指向旧 domain 的 wikilink
function rewriteExternalLinks(root: string, baseDir: string, movedDir: string, oldName: string, newName: string): void {
  const movedRel = path.relative(baseDir, movedDir)
  for (const relPath of listFiles(root)) {
    if (relPath.startsWith(movedRel + path.sep)) continue
    const filePath = path.join(baseDir, relPath)
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    if (!/^---\n[\s\S]*?\n---\n?/.test(raw)) continue
    const { fields, body } = parseFrontmatter(raw)
    const newBody = rewriteDomainLinks(body, oldName, newName)
    if (newBody === body) continue
    fs.writeFileSync(filePath, buildFrontmatter(fields, newBody), 'utf-8')
  }
}

// --- 知识检索 ---

// 全文检索已审核通过（status=validated）的知识，返回标题/元数据/摘要/命中上下文，不返回文档原文。
export function searchKnowledges(root: string, keyword: string, opts?: KnowledgeSearchOpts): { success: true; results: KnowledgeSearchResult[] } | Failed {
  if (!keyword || keyword.trim() === '') return { success: true, results: [] }
  const top = typeof opts?.top === 'number' && opts.top >= 0 ? opts.top : 5
  const context = typeof opts?.context === 'number' && opts.context >= 0 ? opts.context : 2
  const d = knowledgesDir(root)
  const kw = keyword.toLowerCase()
  const results: KnowledgeSearchResult[] = []

  for (const relPath of listFiles(root)) {
    if (path.basename(relPath).toLowerCase() === 'index.md') continue
    const filePath = path.join(d, relPath)
    let raw: string
    try {
      raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
      continue
    }
    const { fields, body } = parseFrontmatter(raw)
    if ((fields.status || '').trim() !== 'validated') continue

    const lines = body.split('\n')
    const matches: KnowledgeSearchMatch[] = []
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(kw)) {
        matches.push({
          line: i + 1,
          text: lines[i],
          before: lines.slice(Math.max(0, i - context), i),
          after: lines.slice(i + 1, i + 1 + context),
        })
      }
    }
    if (matches.length === 0) continue

    results.push({
      path: relPath,
      name: fields.name || path.basename(relPath, '.md'),
      metadata: fields,
      summary: fields.summary || fields.description || '',
      matches,
    })
  }

  results.sort((a, b) => b.matches.length - a.matches.length || a.path.localeCompare(b.path))
  return { success: true, results: results.slice(0, top) }
}
