// 桌面端设置域 IPC 薄壳：把 IPC 参数转换为 core/setting 的调用，
// core 返回的 { success, ...data } 契约原样透传（前端零改动）。
// 自 desktop/llm.ts 拆分（CLI 安装 / 可执行文件检查与 LLM 域解耦），行为零变更：
// test-executable-path / check-cli-installed / install-cli。
//
// Electron API 边界：install-cli 的 oceanJsPath 计算依赖 app.isPackaged /
// process.resourcesPath（打包后 CLI 由 extraResources 复制到 Contents/Resources/cli/），
// 留在本壳层；其余逻辑（child_process / fs）全部在 core。
//
// 本模块由两个环境共同加载（真实 Electron 主进程 / 网页端 stub registry），同 app.ts。

import { ipcMain, app } from 'electron'
import * as path from 'node:path'
import {
  testExecutablePath,
  checkCliInstalled,
  installCli,
} from '../../core/common'
import type { DesktopCtx } from './common'

export function registerSettingHandlers(ctx: DesktopCtx): void {
  // 测试可执行文件路径
  ipcMain.handle('test-executable-path', async (_, filePath: string) => {
    return testExecutablePath(filePath)
  })

  // 检查 workflow-cli 是否已安装
  ipcMain.handle('check-cli-installed', async () => {
    return checkCliInstalled()
  })

  // 安装 ocean-cli wrapper 脚本（oceanJsPath 按打包态分支计算，资源路径依赖留壳层；
  // 开发态产物在 dist/source/desktop/，上两级即 dist/bin）
  ipcMain.handle('install-cli', async () => {
    const oceanJsPath = app.isPackaged
      ? path.join(process.resourcesPath, 'cli', 'bin', 'ocean.js')
      : path.join(__dirname, '..', '..', 'bin', 'ocean.js')
    return installCli(oceanJsPath, ctx.getRawProjectPath?.() ?? null)
  })
}