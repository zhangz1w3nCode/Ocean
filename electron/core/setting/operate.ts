// 设置域统一实现 —— 桌面端/网页端共用的唯一事实源（GUI 专属基础设施，无 CLI 对应物）。
// 由 launch.cjs 设置模块内联实现迁移而来（零行为变更）：可执行文件检查、CLI 安装 wrapper。
// 自 electron/core/llm/operate.ts 拆分（PR #108 后按域收敛），三端统一架构下与 LLM 域解耦。
//
// 契约：原子操作返回 { success: true; ...data } | { success: false; error }；
// 子进程失败按原实现返回失败契约（不抛异常）。未预期的系统异常由 desktop 壳包装。
//
// Electron API 边界：install-cli 的 oceanJsPath 计算依赖 app.isPackaged / process.resourcesPath，
// 由壳层计算后传入；其余（fs/child_process/os）无 Electron 依赖，本模块自包含。

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as child_process from 'node:child_process'

type Failed = { success: false; error: string }

// ---------------------------------------------------------------------------
// 可执行文件检查 / CLI 安装
// ---------------------------------------------------------------------------

// test-executable-path：存在性 + 执行权限位检查
export function testExecutablePath(filePath: string): { success: true; exists: true; isExecutable: boolean; path: string } | { success: false; error: string } {
  try {
    const exists = fs.existsSync(filePath)

    if (!exists) {
      return {
        success: false,
        error: '文件不存在',
      }
    }

    const stats = fs.statSync(filePath)
    const isExecutable = (stats.mode & 0o111) !== 0

    return {
      success: true,
      exists: true,
      isExecutable,
      path: filePath,
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || String(error),
    }
  }
}

// check-cli-installed：从 PATH 与已知安装位置找 ocean wrapper，并用绝对路径验证可运行
// （GUI 启动的 Electron App PATH 不含 /opt/homebrew/bin，不能只靠 command -v）
export function checkCliInstalled(): { installed: boolean; working: boolean; version: string | null; commandPath: string | null; wrapperPath: string | null } {
  const homeDir = os.homedir()

  const candidatePaths = [
    path.join(homeDir, '.ocean', 'bin', 'ocean'),
    '/usr/local/bin/ocean',
    '/opt/homebrew/bin/ocean',
  ]

  let commandPath: string | null = null
  try {
    commandPath = child_process.execSync('command -v ocean', { encoding: 'utf-8' }).trim()
  } catch {
    // 不在 App 的 PATH 中，回退到已知安装位置
  }
  if (!commandPath) {
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        commandPath = p
        break
      }
    }
  }

  let working = false
  let version: string | null = null
  if (commandPath) {
    try {
      const out = child_process.execSync(`"${commandPath}" --version --json`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
      const versionInfo = JSON.parse(out)
      working = !!versionInfo.version
      version = versionInfo.version || null
    } catch (e: any) {
      // 有 stderr 输出说明 wrapper 已启动，暂视为可运行
      working = e?.stderr?.length > 0
    }
  }

  return {
    installed: !!commandPath,
    working,
    version,
    commandPath,
    wrapperPath: commandPath,
  }
}

export interface InstallCliOpts {
  // 测试注入：覆盖 HOME 与全局 bin 候选目录（默认值与原实现一致，不影响生产行为）
  homeDir?: string
  globalBins?: string[]
}

// install-cli：安装 ocean-cli wrapper 脚本；oceanJsPath 由壳层计算（app.isPackaged 分支），
// projectPath 为当前项目（写入 cli-root 作为 CLI 默认 root，未设置时跳过）
export function installCli(oceanJsPath: string, projectPath: string | null, opts?: InstallCliOpts): { success: true; path: string; note: string } | Failed {
  const homeDir = opts?.homeDir ?? os.homedir()
  const globalBins = opts?.globalBins ?? ['/usr/local/bin', '/opt/homebrew/bin']

  if (!fs.existsSync(oceanJsPath)) {
    return { success: false, error: `ocean.js 未找到: ${oceanJsPath}，请先编译 (tsc -p electron/tsconfig.json)` }
  }

  // 解析 node 绝对路径（NVM 安装的 node 不在 Electron 默认 PATH 中）
  let nodePath = 'node'
  try {
    nodePath = child_process.execSync('which node', { encoding: 'utf-8' }).trim()
  } catch {
    // fallback: 尝试 nvm 默认路径
    const nvmNode = path.join(homeDir, '.nvm', 'versions', 'node')
    if (fs.existsSync(nvmNode)) {
      const versions = fs.readdirSync(nvmNode)
      if (versions.length > 0) {
        nodePath = path.join(nvmNode, versions[0], 'bin', 'node')
      }
    }
  }

  // 写入当前项目路径作为 CLI 默认 root
  if (projectPath) {
    try {
      fs.mkdirSync(path.join(homeDir, '.ocean'), { recursive: true })
      fs.writeFileSync(path.join(homeDir, '.ocean', 'cli-root'), projectPath)
    } catch {
      // 忽略
    }
  }

  const wrapperContent = `#!/bin/sh\nexec "${nodePath}" "${oceanJsPath}" "$@"\n`

  // 1. 尝试全局 bin（macOS 默认 /usr/local/bin；Apple Silicon /opt/homebrew/bin）
  for (const globalBin of globalBins) {
    if (fs.existsSync(globalBin)) {
      try {
        fs.writeFileSync(path.join(globalBin, 'ocean'), wrapperContent)
        fs.chmodSync(path.join(globalBin, 'ocean'), 0o755)
        return { success: true, path: path.join(globalBin, 'ocean'), note: '已全局安装，可直接使用 ocean 命令' }
      } catch {
        // 权限不足，尝试下一个
      }
    }
  }

  // 2. 回退到 ~/.ocean/bin 并自动写入 .zshrc / .bashrc
  const binDir = path.join(homeDir, '.ocean', 'bin')
  const wrapperPath = path.join(binDir, 'ocean')
  try {
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(wrapperPath, wrapperContent)
    fs.chmodSync(wrapperPath, 0o755)

    const zshrc = path.join(homeDir, '.zshrc')
    const bashrc = path.join(homeDir, '.bashrc')
    const exportLine = 'export PATH="$HOME/.ocean/bin:$PATH"'
    let addedToShell = false

    for (const rcFile of [zshrc, bashrc]) {
      if (fs.existsSync(rcFile)) {
        const content = fs.readFileSync(rcFile, 'utf-8')
        if (!content.includes('.ocean/bin')) {
          fs.appendFileSync(rcFile, `\n# Ocean ocean-cli\n${exportLine}\n`)
          addedToShell = true
        } else {
          addedToShell = true // 已存在
        }
        break
      }
    }

    if (!addedToShell) {
      fs.writeFileSync(zshrc, `# Ocean ocean-cli\n${exportLine}\n`)
      addedToShell = true
    }

    return {
      success: true,
      path: wrapperPath,
      note: addedToShell
        ? '已安装并自动配置 PATH，请重新打开终端后使用 ocean 命令'
        : '已安装，请将 ~/.ocean/bin 添加到 PATH',
    }
  } catch (error: any) {
    return { success: false, error: error.message || String(error) }
  }
}
