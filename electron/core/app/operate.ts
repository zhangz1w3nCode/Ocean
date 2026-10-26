// 应用与项目状态域统一实现 —— 桌面端/网页端共用的唯一事实源（GUI 专属基础设施，无 CLI 对应物）。
// 由 launch.cjs 应用配置/通用设置/项目初始化/资产来源内联实现迁移而来（零行为变更）。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }，
// 业务校验失败不抛异常；未预期的系统异常向上抛出，由 desktop 壳包装为失败契约。
//
// Electron API 边界：app.getPath('userData')（load/save-app-config）、dialog（open-folder-dialog）、
// app.getVersion、主进程 setProjectPath 状态桥均留在 desktop 壳层；本模块只承接纯 fs/计算逻辑。
// 参数语义：projectRoot 为 raw 值（未设置项目时为 null，与原 currentProjectPath 判空契约一致）；
// userDataDir 由壳层传入（stub 环境 OCEAN_USER_DATA 语义由 launch.cjs 桥保留）。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as crypto from 'node:crypto'

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 内部辅助
// ---------------------------------------------------------------------------

// 生成路径 hash 作为项目 ID（原 launch.cjs generateProjectId）
function projectIdOf(projectPath: string): string {
  return crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 16)
}

// 解析资产根目录名（.claude / .pi；读项目级 .ocean/asset-root.json，默认 claude）
function resolveAssetDirName(projectPath: string): string {
  try {
    const configPath = path.join(projectPath, '.ocean', 'asset-root.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      if (config.assetRoot === 'pi') return '.pi'
    }
  } catch (error) {
    console.error('读取资产加载来源失败:', error)
  }
  return '.claude'
}

// ---------------------------------------------------------------------------
// 应用配置（userData/flow-editor-config.json，路径由壳层传入）
// ---------------------------------------------------------------------------

export function readAppConfig(userDataDir: string): { success: true; config: unknown } | ({ success: false; error: string } & { config: unknown }) {
  const configPath = path.join(userDataDir, 'flow-editor-config.json')
  if (!fs.existsSync(configPath)) {
    return { success: true, config: defaultAppConfig() }
  }
  const content = fs.readFileSync(configPath, 'utf-8')
  const config = JSON.parse(content)
  return { success: true, config }
}

export function writeAppConfig(userDataDir: string, config: unknown): { success: true } | Failed {
  const configPath = path.join(userDataDir, 'flow-editor-config.json')
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
  return { success: true }
}

function defaultAppConfig() {
  return {
    recentProjects: [] as string[],
    lastProjectPath: null,
    maxRecentProjects: 10,
  }
}

// ---------------------------------------------------------------------------
// 通用设置（项目级 <项目>/.ocean/setting/general.json）
// ---------------------------------------------------------------------------

// 文件不存在返回空对象（不创建文件）；未设置项目失败（raw 判空契约）
export function readGeneralSettings(projectRoot: string | null): { success: true; settings: Record<string, unknown> } | ({ success: false; error: string } & { settings: null }) {
  if (!projectRoot) {
    return { success: false, error: '未设置项目路径', settings: null }
  }
  const filePath = path.join(projectRoot, '.ocean', 'setting', 'general.json')
  if (!fs.existsSync(filePath)) {
    return { success: true, settings: {} }
  }
  const settings = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  return { success: true, settings }
}

// 目录/文件不存在则创建；未设置项目失败
export function writeGeneralSettings(projectRoot: string | null, settings: Record<string, unknown>): { success: true } | Failed {
  if (!projectRoot) {
    return { success: false, error: '未设置项目路径' }
  }
  const settingDir = path.join(projectRoot, '.ocean', 'setting')
  if (!fs.existsSync(settingDir)) {
    fs.mkdirSync(settingDir, { recursive: true })
  }
  const filePath = path.join(settingDir, 'general.json')
  fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
  return { success: true }
}

// ---------------------------------------------------------------------------
// 项目初始化与切换（主进程状态更新由壳层 ctx.setProjectPath 桥承接，本模块只做 fs 与计算）
// ---------------------------------------------------------------------------

// init-project-dir 的建目录部分：{assetDir}/agents + 五个共享域目录 + .ocean
export function initProjectDirs(projectPath: string): { success: true; projectId: string; projectName: string } | Failed {
  const assetDir = path.join(projectPath, resolveAssetDirName(projectPath))
  const subDirs = ['agents']
  for (const subDir of subDirs) {
    const dirPath = path.join(assetDir, subDir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  // 知识库/资源文件/节点/工作流为跨资产来源共享资产，存储在项目根对应目录
  for (const sharedDir of ['.knowledges', '.resources', '.nodes', '.workflows']) {
    const dirPath = path.join(projectPath, sharedDir)
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  const oceanDir = path.join(projectPath, '.ocean')
  if (!fs.existsSync(oceanDir)) {
    fs.mkdirSync(oceanDir, { recursive: true })
  }

  return {
    success: true,
    projectId: projectIdOf(projectPath),
    projectName: path.basename(projectPath),
  }
}

// set-project-path 的计算部分
export function projectIdentity(projectPath: string): { success: true; projectId: string; projectName: string } {
  return {
    success: true,
    projectId: projectIdOf(projectPath),
    projectName: path.basename(projectPath),
  }
}

// setProjectPath 的纯 fs 副作用：写 ~/.ocean/cli-root（wrapper 脚本读取的 CLI 默认 root）
// + 数据迁移（.workflow-maker -> 当前资产根目录）
export function syncProjectState(projectPath: string): void {
  try {
    const cliRootDir = path.join(os.homedir(), '.ocean')
    fs.mkdirSync(cliRootDir, { recursive: true })
    fs.writeFileSync(path.join(cliRootDir, 'cli-root'), projectPath)
  } catch {
    // 忽略写入失败
  }
  migrateDataDir(projectPath)
}

// 数据迁移：.workflow-maker -> 当前资产根目录(.claude/.pi)
function migrateDataDir(projectPath: string): void {
  const oldDir = path.join(projectPath, '.workflow-maker')
  const newDir = path.join(projectPath, resolveAssetDirName(projectPath))

  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    try {
      fs.renameSync(oldDir, newDir)
    } catch (error) {
      console.error('数据迁移失败:', error)
    }
  }
}

// ---------------------------------------------------------------------------
// 资产加载来源（项目级 .ocean/asset-root.json）
// ---------------------------------------------------------------------------

// 特例契约：未设置项目 / 文件缺失 / 坏 JSON 均返回 success:true + claude 默认（错误不算失败）
export function readAssetRoot(projectRoot: string | null): { success: true; assetRoot: string } {
  try {
    if (!projectRoot) {
      return { success: true, assetRoot: 'claude' }
    }
    const configPath = path.join(projectRoot, '.ocean', 'asset-root.json')
    if (!fs.existsSync(configPath)) {
      return { success: true, assetRoot: 'claude' }
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    return { success: true, assetRoot: config.assetRoot || 'claude' }
  } catch (error) {
    console.error('加载资产加载来源失败:', error)
    return { success: true, assetRoot: 'claude' }
  }
}

// 未设置项目失败；保存时建 .ocean 目录
export function writeAssetRoot(projectRoot: string | null, assetRoot: string): { success: true } | Failed {
  if (!projectRoot) {
    return { success: false, error: '未设置项目路径' }
  }
  const oceanDir = path.join(projectRoot, '.ocean')
  if (!fs.existsSync(oceanDir)) {
    fs.mkdirSync(oceanDir, { recursive: true })
  }
  const configPath = path.join(oceanDir, 'asset-root.json')
  fs.writeFileSync(configPath, JSON.stringify({ assetRoot }, null, 2), 'utf-8')
  return { success: true }
}
