// Electron启动脚本（开发模式）
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const child_process = require('child_process')
const os = require('os')
// 网页端宿主：自己注册 web-server-* IPC handler；在网页端子进程内自动禁用
require('./server/webServerHost.cjs')

let mainWindow = null
let currentProjectPath = null  // 当前项目路径

// 应用配置文件路径（存储在用户目录）
const getAppConfigPath = () => {
  const userDir = app.getPath('userData')
  return path.join(userDir, 'flow-editor-config.json')
}

// 获取资产加载来源（从项目级 .ocean/asset-root.json 读取，默认 claude）
const getAssetRoot = () => {
  try {
    const projectRoot = getProjectRoot()
    const configPath = path.join(projectRoot, '.ocean', 'asset-root.json')
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8')
      const config = JSON.parse(content)
      if (config.assetRoot === 'pi') return 'pi'
    }
  } catch (error) {
    console.error('读取资产加载来源失败:', error)
  }
  return 'claude'
}

// 获取资产根目录名（.claude 或 .pi）
const getAssetDir = () => {
  return getAssetRoot() === 'pi' ? '.pi' : '.claude'
}

// 生成路径 hash 作为项目 ID
const generateProjectId = (projectPath) => {
  return crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 16)
}

// 数据迁移：.workflow-maker -> 当前资产根目录(.claude/.pi)
const migrateDataDir = (projectPath) => {
  const oldDir = path.join(projectPath, '.workflow-maker')
  const newDir = path.join(projectPath, getAssetDir())

  if (fs.existsSync(oldDir) && !fs.existsSync(newDir)) {
    try {
      fs.renameSync(oldDir, newDir)
      console.log('数据迁移成功:', oldDir, '->', newDir)
    } catch (error) {
      console.error('数据迁移失败:', error)
    }
  }
}

// 获取当前项目路径
const getProjectRoot = () => {
  if (currentProjectPath) {
    return currentProjectPath
  }
  // 开发环境默认使用上级目录
  return path.join(__dirname, '..')
}

// 设置项目路径
const setProjectPath = (projectPath) => {
  currentProjectPath = projectPath
  // 网页端按目标项目的通用设置自动启停/跟随
  try { require('./server/webServerHost.cjs').syncProject(projectPath) } catch {}
  // 同步更新 CLI 默认 root 配置，wrapper 脚本会读取
  try {
    const cliRootDir = path.join(os.homedir(), '.ocean')
    fs.mkdirSync(cliRootDir, { recursive: true })
    fs.writeFileSync(path.join(cliRootDir, 'cli-root'), projectPath)
  } catch {
    // 忽略写入失败
  }
  // 迁移数据
  migrateDataDir(projectPath)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.dev.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // 判断是开发环境还是生产环境
  const devServerURL = process.env.VITE_DEV_SERVER_URL

  if (devServerURL) {
    // 开发环境：加载 Vite 开发服务器
    console.log('Loading from dev server:', devServerURL)
    mainWindow.loadURL(devServerURL)

    // 开发环境自动打开开发者工具
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境：加载打包后的 index.html
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    console.log('Loading from production build:', indexPath)
    mainWindow.loadFile(indexPath)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// ===== IPC 通信 =====

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// ===== 项目相关 IPC =====

// 打开文件夹选择对话框
ipcMain.handle('open-folder-dialog', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory', 'createDirectory'],
      title: '选择项目文件夹',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, path: null }
    }

    return { success: true, path: result.filePaths[0] }
  } catch (error) {
    console.error('打开文件夹对话框失败:', error)
    return { success: false, error: String(error), path: null }
  }
})

// 加载应用配置
ipcMain.handle('load-app-config', () => {
  try {
    const configPath = getAppConfigPath()
    if (!fs.existsSync(configPath)) {
      // 返回默认配置
      return {
        success: true,
        config: {
          recentProjects: [],
          lastProjectPath: null,
          maxRecentProjects: 10,
        }
      }
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    return { success: true, config }
  } catch (error) {
    console.error('加载应用配置失败:', error)
    return {
      success: false,
      error: String(error),
      config: {
        recentProjects: [],
        lastProjectPath: null,
        maxRecentProjects: 10,
      }
    }
  }
})

// 保存应用配置
ipcMain.handle('save-app-config', (_, config) => {
  try {
    const configPath = getAppConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存应用配置失败:', error)
    return { success: false, error: String(error) }
  }
})

// ===== 通用设置（项目级，存储在 <项目>/.ocean/setting/general.json）=====

// 加载通用设置（文件不存在时返回空对象，不创建文件）
ipcMain.handle('load-general-settings', () => {
  try {
    if (!currentProjectPath) {
      return { success: false, error: '未设置项目路径', settings: null }
    }
    const filePath = path.join(currentProjectPath, '.ocean', 'setting', 'general.json')
    if (!fs.existsSync(filePath)) {
      return { success: true, settings: {} }
    }
    const settings = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return { success: true, settings }
  } catch (error) {
    console.error('加载通用设置失败:', error)
    return { success: false, error: String(error), settings: null }
  }
})

// 保存通用设置（目录/文件不存在则创建）
ipcMain.handle('save-general-settings', (_, settings) => {
  try {
    if (!currentProjectPath) {
      return { success: false, error: '未设置项目路径' }
    }
    const settingDir = path.join(currentProjectPath, '.ocean', 'setting')
    if (!fs.existsSync(settingDir)) {
      fs.mkdirSync(settingDir, { recursive: true })
    }
    const filePath = path.join(settingDir, 'general.json')
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存通用设置失败:', error)
    return { success: false, error: String(error) }
  }
})

// 初始化项目目录
ipcMain.handle('init-project-dir', (_, projectPath) => {
  try {
    // 设置项目路径
    setProjectPath(projectPath)

    // 创建必要的子目录
    const assetDir = path.join(projectPath, getAssetDir())
    const subDirs = ['agents']
    for (const subDir of subDirs) {
      const dirPath = path.join(assetDir, subDir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
    }

    // 知识库为跨资产来源共享资产，存储在项目根 .knowledges 目录
    const knowledgesDir = path.join(projectPath, '.knowledges')
    if (!fs.existsSync(knowledgesDir)) {
      fs.mkdirSync(knowledgesDir, { recursive: true })
    }

    // 资源文件为跨资产来源共享资产，存储在项目根 .resources 目录
    const resourcesDir = path.join(projectPath, '.resources')
    if (!fs.existsSync(resourcesDir)) {
      fs.mkdirSync(resourcesDir, { recursive: true })
    }

    // 节点文件为跨资产来源共享资产，存储在项目根 .nodes 目录
    const nodesDir = path.join(projectPath, '.nodes')
    if (!fs.existsSync(nodesDir)) {
      fs.mkdirSync(nodesDir, { recursive: true })
    }

    // 工作流为跨资产来源共享资产，存储在项目根 .workflows 目录
    const workflowsDir = path.join(projectPath, '.workflows')
    if (!fs.existsSync(workflowsDir)) {
      fs.mkdirSync(workflowsDir, { recursive: true })
    }

    // 创建 .ocean 目录用于存放项目级配置
    const oceanDir = path.join(projectPath, '.ocean')
    if (!fs.existsSync(oceanDir)) {
      fs.mkdirSync(oceanDir, { recursive: true })
    }

    return {
      success: true,
      projectId: generateProjectId(projectPath),
      projectName: path.basename(projectPath)
    }
  } catch (error) {
    console.error('初始化项目目录失败:', error)
    return { success: false, error: String(error) }
  }
})

// 设置项目路径（用于切换项目）
ipcMain.handle('set-project-path', (_, projectPath) => {
  try {
    setProjectPath(projectPath)
    return {
      success: true,
      projectId: generateProjectId(projectPath),
      projectName: path.basename(projectPath)
    }
  } catch (error) {
    console.error('设置项目路径失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载资产加载来源（项目级）
ipcMain.handle('load-asset-root', () => {
  try {
    if (!currentProjectPath) {
      return { success: true, assetRoot: 'claude' }
    }
    const configPath = path.join(currentProjectPath, '.ocean', 'asset-root.json')
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
})

// 保存资产加载来源（项目级）
ipcMain.handle('save-asset-root', (_, assetRoot) => {
  try {
    if (!currentProjectPath) {
      return { success: false, error: '未设置项目路径' }
    }
    const oceanDir = path.join(currentProjectPath, '.ocean')
    if (!fs.existsSync(oceanDir)) {
      fs.mkdirSync(oceanDir, { recursive: true })
    }
    const configPath = path.join(oceanDir, 'asset-root.json')
    fs.writeFileSync(configPath, JSON.stringify({ assetRoot }, null, 2), 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存资产加载来源失败:', error)
    return { success: false, error: String(error) }
  }
})

// ===== 设置模块 IPC =====

/**
 * 测试 LLM 连接
 */
ipcMain.handle('test-llm-connection', async (_, provider) => {
  console.log('\n=== Electron 主进程: LLM 连接测试 ===')
  console.log('提供商:', provider.name)
  console.log('类型:', provider.type)
  console.log('测试端点:', provider.baseUrl)

  const https = require('https')
  const http = require('http')

  try {
    // 构建测试 URL
    const testUrl = provider.baseUrl.endsWith('/')
      ? `${provider.baseUrl}models`
      : `${provider.baseUrl}/models`

    // 构建请求头
    const headers = {
      'Content-Type': 'application/json',
    }

    // 根据类型设置认证头
    if (provider.type === 'openai' || provider.type === 'custom') {
      headers['Authorization'] = `Bearer ${provider.apiKey}`
    } else if (provider.type === 'anthropic') {
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else if (provider.type === 'azure') {
      headers['api-key'] = provider.apiKey
    }

    console.log('请求 URL:', testUrl)

    // 使用 fetch 或 http 模块发送请求
    const response = await fetch(testUrl, {
      method: 'GET',
      headers,
    })

    console.log('响应状态:', response.status, response.statusText)

    // 读取响应体
    const responseText = await response.text()
    console.log('响应体:', responseText.substring(0, 500))

    let responseJson = null
    try {
      responseJson = JSON.parse(responseText)
      console.log('响应 JSON:', responseJson)
    } catch {
      console.log('响应不是 JSON 格式')
    }

    console.log('✅ 测试完成\n')

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: responseText,
      json: responseJson,
    }
  } catch (error) {
    console.error('❌ 测试失败:', error)
    return {
      success: false,
      error: error.message || String(error),
    }
  }
})

/**
 * 测试可执行文件路径
 */
ipcMain.handle('test-executable-path', async (_, filePath) => {
  console.log('测试可执行文件路径:', filePath)

  try {
    // 检查文件是否存在
    const exists = fs.existsSync(filePath)

    if (!exists) {
      return {
        success: false,
        error: '文件不存在',
      }
    }

    // 检查是否可执行
    const stats = fs.statSync(filePath)
    const isExecutable = (stats.mode & 0o111) !== 0

    return {
      success: true,
      exists: true,
      isExecutable,
      path: filePath,
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || String(error),
    }
  }
})

/**
 * 检查 workflow-cli 是否已安装
 */
ipcMain.handle('check-cli-installed', async () => {
  const homeDir = os.homedir()

  // 从 PATH 与已知安装位置找 ocean wrapper
  // GUI 启动的 Electron App PATH 不含 /opt/homebrew/bin，不能只靠 command -v
  const candidatePaths = [
    path.join(homeDir, '.ocean', 'bin', 'ocean'),
    '/usr/local/bin/ocean',
    '/opt/homebrew/bin/ocean',
  ]

  let commandPath = null
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

  // 用找到的绝对路径验证可运行，不依赖 App 的 PATH
  let working = false
  let version = null
  if (commandPath) {
    try {
      const out = child_process.execSync(`"${commandPath}" --version --json`, { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
      // 解析 JSON 版本号，有 version 字段即认为 CLI 可用
      const versionInfo = JSON.parse(out)
      working = !!versionInfo.version
      version = versionInfo.version || null
    } catch (e) {
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
})

/**
 * 安装 ocean-cli wrapper 脚本到 ~/.ocean/bin/ocean
 */
ipcMain.handle('install-cli', async () => {
  const homeDir = os.homedir()
  // 打包后 CLI 由 extraResources 复制到 Contents/Resources/cli/，系统 Node 读不到 asar 内路径
  const oceanJsPath = app.isPackaged
    ? path.join(process.resourcesPath, 'cli', 'bin', 'ocean.js')
    : path.join(__dirname, 'dist', 'bin', 'ocean.js')
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
  if (currentProjectPath) {
    try {
      fs.mkdirSync(path.join(homeDir, '.ocean'), { recursive: true })
      fs.writeFileSync(path.join(homeDir, '.ocean', 'cli-root'), currentProjectPath)
    } catch {
      // 忽略
    }
  }

  const wrapperContent = `#!/bin/sh\nexec "${nodePath}" "${oceanJsPath}" "$@"\n`

  // 1. 尝试 /usr/local/bin（macOS 默认在 PATH 上）
  const globalBin = '/usr/local/bin'
  if (fs.existsSync(globalBin)) {
    try {
      fs.writeFileSync(path.join(globalBin, 'ocean'), wrapperContent)
      fs.chmodSync(path.join(globalBin, 'ocean'), 0o755)
      return { success: true, path: path.join(globalBin, 'ocean'), note: '已全局安装，可直接使用 ocean 命令' }
    } catch {
      // 权限不足，尝试下一个
    }
  }

  // 2. 尝试 /opt/homebrew/bin（Apple Silicon Homebrew）
  const homebrewBin = '/opt/homebrew/bin'
  if (fs.existsSync(homebrewBin)) {
    try {
      fs.writeFileSync(path.join(homebrewBin, 'ocean'), wrapperContent)
      fs.chmodSync(path.join(homebrewBin, 'ocean'), 0o755)
      return { success: true, path: path.join(homebrewBin, 'ocean'), note: '已全局安装，可直接使用 ocean 命令' }
    } catch {
      // 权限不足，尝试下一个
    }
  }

  // 3. 回退到 ~/.ocean/bin 并自动写入 .zshrc / .bashrc
  const binDir = path.join(homeDir, '.ocean', 'bin')
  const wrapperPath = path.join(binDir, 'ocean')
  try {
    fs.mkdirSync(binDir, { recursive: true })
    fs.writeFileSync(wrapperPath, wrapperContent)
    fs.chmodSync(wrapperPath, 0o755)

    // 自动添加 PATH 到 shell 配置
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

    // 如果没有 .zshrc 也没有 .bashrc，创建 .zshrc
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
  } catch (error) {
    return { success: false, error: error.message || String(error) }
  }
})

/**
 * 调用 LLM API (使用原生 fetch)
 */
ipcMain.handle('call-llm-api', async (_, { provider, prompt, model }) => {
  console.log('\n=== Electron 主进程: 使用原生 fetch 调用 LLM ===')
  console.log('提供商:', provider.name)
  console.log('类型:', provider.type)
  console.log('模型:', model || provider.defaultModel)

  try {
    const modelId = model || provider.defaultModel || 'gpt-4o-mini'

    // 构建 endpoint
    const endpoint = provider.baseUrl.endsWith('/')
      ? `${provider.baseUrl}chat/completions`
      : `${provider.baseUrl}/chat/completions`

    // 构建 headers
    const headers = {
      'Content-Type': 'application/json',
    }

    if (provider.type === 'anthropic') {
      headers['x-api-key'] = provider.apiKey
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${provider.apiKey}`
    }

    // 构建请求体
    let requestBody

    console.log('\n========== LLM 请求参数 ==========')
    console.log('提供商:', provider.name)
    console.log('类型:', provider.type)
    console.log('模型:', modelId)
    console.log('模型参数配置:', JSON.stringify(provider.modelParams, null, 2))

    if (provider.type === 'anthropic') {
      // Anthropic 格式
      requestBody = {
        model: modelId,
        max_tokens: provider.modelParams?.maxTokens || 4096,
        messages: [{ role: 'user', content: prompt }],
      }
      console.log('Anthropic 请求体:', JSON.stringify(requestBody, null, 2))
    } else {
      // OpenAI 兼容格式
      requestBody = {
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: provider.modelParams?.temperature ?? 0.7,
        max_tokens: provider.modelParams?.maxTokens || 4096,
      }

      // 添加可选参数
      if (provider.modelParams?.topP !== undefined) {
        requestBody.top_p = provider.modelParams.topP
      }
      if (provider.modelParams?.frequencyPenalty !== undefined) {
        requestBody.frequency_penalty = provider.modelParams.frequencyPenalty
      }
      if (provider.modelParams?.presencePenalty !== undefined) {
        requestBody.presence_penalty = provider.modelParams.presencePenalty
      }
      console.log('OpenAI 请求体:', JSON.stringify(requestBody, null, 2))
    }
    console.log('===================================\n')

    console.log('请求 endpoint:', endpoint)
    console.log('请求模型:', modelId)

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`)
    }

    const data = await response.json()

    // 解析响应
    let content = ''
    let usage = null

    if (provider.type === 'anthropic') {
      // Anthropic 格式
      const contentArray = data.content || []
      for (const item of contentArray) {
        if (item.type === 'text' && item.text) {
          content += item.text
        }
      }
      usage = data.usage
    } else {
      // OpenAI 兼容格式
      const message = data.choices?.[0]?.message || {}
      content = message.content || ''
      usage = data.usage
    }

    // 过滤思考标签（某些模型如 MiniMax 会输出思考内容）
    content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    console.log('LLM 调用成功')
    console.log('Token 使用:', usage)

    return {
      success: true,
      content,
      usage
    }

  } catch (error) {
    console.error('LLM 调用失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
/**
 * 获取 LLM 配置文件路径
 */
const getLLMConfigPath = () => {
  const oceanDir = path.join(getProjectRoot(), '.ocean')
  if (!fs.existsSync(oceanDir)) {
    fs.mkdirSync(oceanDir, { recursive: true })
  }
  return path.join(oceanDir, 'llm-config.json')
}

/**
 * 保存 LLM 配置到文件
 */
ipcMain.handle('save-llm-config', async (_, config) => {
  try {
    const configPath = getLLMConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('✅ LLM 配置已保存到:', configPath)
    return { success: true }
  } catch (error) {
    console.error('❌ 保存 LLM 配置失败:', error)
    return { success: false, error: error.message || String(error) }
  }
})

/**
 * 加载 LLM 配置文件
 */
ipcMain.handle('load-llm-config', async () => {
  try {
    const configPath = getLLMConfigPath()
    if (!fs.existsSync(configPath)) {
      console.log('LLM 配置文件不存在,返回空配置')
      return { success: true, config: null }
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    console.log('✅ LLM 配置已加载')
    return { success: true, config }
  } catch (error) {
    console.error('❌ 加载 LLM 配置失败:', error)
    return { success: false, error: error.message || String(error), config: null }
  }
})

// ===== Agentic 配置文件 IPC =====

/**
 * 获取 Agentic 配置文件路径
 */
const getAgenticConfigPath = () => {
  try {
    const projectRoot = getProjectRoot()
    if (!projectRoot) {
      throw new Error('项目路径未设置')
    }
    const oceanDir = path.join(projectRoot, '.ocean')
    if (!fs.existsSync(oceanDir)) {
      fs.mkdirSync(oceanDir, { recursive: true })
    }
    return path.join(oceanDir, 'agentic-config.json')
  } catch (error) {
    console.error('获取 Agentic 配置路径失败:', error)
    throw error
  }
}

/**
 * 保存 Agentic 配置到文件
 */
ipcMain.handle('save-agentic-config', async (_, config) => {
  try {
    const configPath = getAgenticConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('✅ Agentic 配置已保存到:', configPath)
    return { success: true }
  } catch (error) {
    console.error('❌ 保存 Agentic 配置失败:', error)
    return { success: false, error: error.message || String(error) }
  }
})

/**
 * 加载 Agentic 配置文件
 */
ipcMain.handle('load-agentic-config', async () => {
  try {
    const configPath = getAgenticConfigPath()
    if (!fs.existsSync(configPath)) {
      console.log('Agentic 配置文件不存在,返回空配置')
      return { success: true, config: null }
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    console.log('✅ Agentic 配置已加载')
    return { success: true, config }
  } catch (error) {
    console.error('❌ 加载 Agentic 配置失败:', error)
    return { success: false, error: error.message || String(error), config: null }
  }
})

// ===== LLM 智能审核产物配置文件 IPC =====

/**
 * 获取 LLM 智能审核配置文件路径
 */
const getLlmReviewConfigPath = () => {
  try {
    const projectRoot = getProjectRoot()
    if (!projectRoot) {
      throw new Error('项目路径未设置')
    }
    const oceanDir = path.join(projectRoot, '.ocean')
    if (!fs.existsSync(oceanDir)) {
      fs.mkdirSync(oceanDir, { recursive: true })
    }
    return path.join(oceanDir, 'cli-workflow-llm-judge-artifacts.json')
  } catch (error) {
    console.error('获取 LLM 智能审核配置路径失败:', error)
    throw error
  }
}

/**
 * 保存 LLM 智能审核配置到文件
 */
ipcMain.handle('save-llm-review-config', async (_, config) => {
  try {
    const configPath = getLlmReviewConfigPath()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log('✅ LLM 智能审核配置已保存到:', configPath)
    return { success: true }
  } catch (error) {
    console.error('❌ 保存 LLM 智能审核配置失败:', error)
    return { success: false, error: error.message || String(error) }
  }
})

/**
 * 加载 LLM 智能审核配置文件
 */
ipcMain.handle('load-llm-review-config', async () => {
  try {
    const configPath = getLlmReviewConfigPath()
    if (!fs.existsSync(configPath)) {
      console.log('LLM 智能审核配置文件不存在,返回空配置')
      return { success: true, config: null }
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)
    console.log('✅ LLM 智能审核配置已加载')
    return { success: true, config }
  } catch (error) {
    console.error('❌ 加载 LLM 智能审核配置失败:', error)
    return { success: false, error: error.message || String(error), config: null }
  }
})

// ========== Agentic 工具执行 ==========

// 自研工具加载
let piCodingAgentTools = null

async function loadPiCodingAgentTools() {
  if (!piCodingAgentTools) {
    piCodingAgentTools = {
      createReadTool: require('./tools/readTool.cjs'),
      createWriteTool: require('./tools/writeTool.cjs'),
      createEditTool: require('./tools/editTool.cjs'),
      createBashTool: require('./tools/bashTool.cjs'),
    }
    console.log('✅ 自研工具加载成功')
  }
  return piCodingAgentTools
}

// 工具实例缓存
const toolInstanceCache = new Map()

/**
 * 执行 Agentic 工具
 * 使用自研工具实现
 */
ipcMain.handle('execute-agentic-tool', async (_, params) => {
  const { type, ...args } = params
  const cwd = args.cwd || getProjectRoot()

  if (!cwd) {
    return { success: false, error: '项目路径未设置' }
  }

  try {
    // 加载自研工具
    const tools = await loadPiCodingAgentTools()

    // 获取或创建工具实例
    const cacheKey = `${type}:${cwd}`
    let tool = toolInstanceCache.get(cacheKey)

    if (!tool) {
      switch (type) {
        case 'read':
          tool = tools.createReadTool(cwd)
          break
        case 'write':
          tool = tools.createWriteTool(cwd)
          break
        case 'edit':
          tool = tools.createEditTool(cwd)
          break
        case 'bash':
          tool = tools.createBashTool(cwd)
          break
        default:
          return { success: false, error: `未知的工具类型: ${type}` }
      }

      if (tool) {
        toolInstanceCache.set(cacheKey, tool)
      }
    }

    if (!tool) {
      return { success: false, error: `无法创建工具: ${type}` }
    }

    // 构建工具参数
    let toolArgs = {}

    switch (type) {
      case 'read':
        toolArgs = {
          path: args.path,
          offset: args.offset,
          limit: args.limit
        }
        break
      case 'write':
        toolArgs = {
          path: args.path,
          content: args.content
        }
        break
      case 'edit':
        toolArgs = {
          path: args.path,
          oldText: args.oldText,
          newText: args.newText
        }
        break
      case 'bash':
        toolArgs = {
          command: args.command,
          timeout: args.timeout
        }
        break
    }

    console.log(`✅ [${type}] 执行工具`, toolArgs)

    // 执行工具
    const result = await tool.execute(
      `tool-call-${Date.now()}`, // toolCallId
      toolArgs,
      undefined // signal
    )

    // 解析结果 - 工具返回 { content: [...], details: ... }
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter(part => part.type === 'text')
        .map(part => part.text)

      const output = textParts.join('\n')

      console.log(`✅ [${type}] 工具执行成功，输出长度: ${output.length}`)

      return {
        success: true,
        output
      }
    }

    // 其他格式的结果
    return {
      success: true,
      output: JSON.stringify(result, null, 2)
    }

  } catch (error) {
    console.error(`❌ [${type}] 工具执行失败:`, error)
    return { success: false, error: error.message || String(error) }
  }
})

// ========== Agent Loop 实现（真正的 LLM 驱动工具调用） ==========

// Agent Loop 中止控制器
let agentLoopAbortController = null

/**
 * 发送 Agent Loop 事件到渲染进程
 */
const sendAgentLoopEvent = (event) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent-loop-event', {
      ...event,
      timestamp: new Date().toISOString()
    })
  }
}

/**
 * 工具名称映射
 */
const toolNameMap = {
  'file-read': 'read',
  'file-write': 'write',
  'file-edit': 'edit',
  'bash-execute': 'bash'
}

/**
 * 构建 LLM 可用的工具定义
 */
const buildToolsDefinition = (enabledTools) => {
  const tools = []

  for (const tool of enabledTools) {
    const toolName = toolNameMap[tool.type]
    if (!toolName) continue

    const toolDef = {
      type: 'function',
      function: {
        name: toolName,
        description: tool.description
      }
    }

    // 添加参数定义
    switch (tool.type) {
      case 'file-read':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的相对路径或绝对路径' },
            offset: { type: 'number', description: '开始读取的行号（可选）' },
            limit: { type: 'number', description: '读取的行数限制（可选）' }
          },
          required: ['path']
        }
        break
      case 'file-write':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的相对路径或绝对路径' },
            content: { type: 'string', description: '要写入的文件内容' }
          },
          required: ['path', 'content']
        }
        break
      case 'file-edit':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '文件的相对路径或绝对路径' },
            oldText: { type: 'string', description: '要查找的文本' },
            newText: { type: 'string', description: '替换后的文本' }
          },
          required: ['path', 'oldText', 'newText']
        }
        break
      case 'bash-execute':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            command: { type: 'string', description: '要执行的终端命令' },
            timeout: { type: 'number', description: '命令超时时间（毫秒）' }
          },
          required: ['command']
        }
        break
    }

    tools.push(toolDef)
  }

  return tools
}

/**
 * 执行工具调用
 */
const executeToolCall = async (toolName, toolArgs, cwd) => {
  try {
    const tools = await loadPiCodingAgentTools()

    // 获取或创建工具实例
    const cacheKey = `${toolName}:${cwd}`
    let tool = toolInstanceCache.get(cacheKey)

    if (!tool) {
      switch (toolName) {
        case 'read':
          tool = tools.createReadTool(cwd)
          break
        case 'write':
          tool = tools.createWriteTool(cwd)
          break
        case 'edit':
          tool = tools.createEditTool(cwd)
          break
        case 'bash':
          tool = tools.createBashTool(cwd)
          break
      }
      if (tool) {
        toolInstanceCache.set(cacheKey, tool)
      }
    }

    if (!tool) {
      return { success: false, output: `未知工具: ${toolName}` }
    }

    console.log(`  [Agent Loop] 执行工具 ${toolName}:`, toolArgs)

    // 执行工具
    const result = await tool.execute(
      `tool-call-${Date.now()}`,
      toolArgs,
      undefined
    )

    // 解析结果
    if (result.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter(part => part.type === 'text')
        .map(part => part.text)
      const output = textParts.join('\n')
      return { success: true, output }
    }

    return { success: true, output: JSON.stringify(result, null, 2) }

  } catch (error) {
    console.error(`  [Agent Loop] 工具执行失败:`, error)
    return { success: false, output: error.message || String(error) }
  }
}

/**
 * 调用 LLM API（支持工具调用）
 */
const callLLMWithTools = async (provider, messages, tools, model) => {
  const endpoint = provider.baseUrl.endsWith('/')
    ? `${provider.baseUrl}chat/completions`
    : `${provider.baseUrl}/chat/completions`

  const headers = {
    'Content-Type': 'application/json',
  }

  if (provider.type === 'anthropic') {
    headers['x-api-key'] = provider.apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['Authorization'] = `Bearer ${provider.apiKey}`
  }

  let requestBody

  if (provider.type === 'anthropic') {
    // Anthropic 格式：分离 system 和 messages
    const systemMessage = messages.find(m => m.role === 'system')
    const otherMessages = messages.filter(m => m.role !== 'system')

    requestBody = {
      model: model || provider.defaultModel || 'claude-3-haiku-20240307',
      max_tokens: 4096,
      system: systemMessage?.content || '',
      messages: otherMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })),
      tools: tools.length > 0 ? tools : undefined
    }
  } else {
    // OpenAI 格式
    requestBody = {
      model: model || provider.defaultModel || 'gpt-4o',
      messages,
      temperature: 0.2,
      max_tokens: 4096,
      tools: tools.length > 0 ? tools : undefined
    }
  }

  console.log('  [Agent Loop] 调用 LLM, 消息数:', messages.length, '工具数:', tools.length)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`API 请求失败: ${response.status} ${response.statusText}\n${errorText}`)
  }

  const data = await response.json()

  // 解析响应
  if (provider.type === 'anthropic') {
    // Anthropic 格式
    const content = data.content || []
    const textContent = content.find(c => c.type === 'text')
    const toolUseContent = content.filter(c => c.type === 'tool_use')

    return {
      content: textContent?.text || '',
      toolCalls: toolUseContent.map(tc => ({
        id: tc.id,
        name: tc.name,
        arguments: tc.input
      })),
      stopReason: data.stop_reason
    }
  } else {
    // OpenAI 格式
    const message = data.choices?.[0]?.message || {}
    return {
      content: message.content || '',
      toolCalls: message.tool_calls?.map(tc => ({
        id: tc.id,
        name: tc.function?.name,
        arguments: JSON.parse(tc.function?.arguments || '{}')
      })) || [],
      stopReason: data.choices?.[0]?.finish_reason
    }
  }
}

/**
 * 运行 Agent Loop
 * 核心循环：LLM 思考 -> 工具调用 -> 结果反馈 -> 继续思考或结束
 */
ipcMain.handle('run-agent-loop', async (_, config) => {
  const { provider, model, tools, maxIterations, timeout, projectPath, task } = config

  console.log('\n' + '='.repeat(60))
  console.log('[Agent Loop] 开始执行')
  console.log('[Agent Loop] 提供商:', provider.name)
  console.log('[Agent Loop] 模型:', model)
  console.log('[Agent Loop] 任务:', task)
  console.log('[Agent Loop] 最大迭代:', maxIterations)
  console.log('[Agent Loop] 超时:', timeout, '秒')
  console.log('='.repeat(60))

  // 创建中止控制器
  agentLoopAbortController = new AbortController()
  const startTime = Date.now()
  const timeoutMs = timeout * 1000

  // 统计信息
  let totalTurns = 0
  let totalToolCalls = 0

  try {
    // 发送开始事件
    sendAgentLoopEvent({
      type: 'agent_start',
      data: { task }
    })

    // 过滤启用的工具
    const enabledTools = tools.filter(t => t.enabled)
    const toolDefinitions = buildToolsDefinition(enabledTools)

    // 构建系统提示词
    const systemPrompt = `你是一个 AI Agent，可以使用工具与本地文件系统交互来完成任务。

## 可用工具
${enabledTools.map(t => `- ${toolNameMap[t.type]}: ${t.description}`).join('\n')}

## 行为规则
1. 分析用户任务，制定执行计划
2. 使用工具逐步完成任务
3. 每次工具调用后，根据结果决定下一步行动
4. 任务完成后，总结执行结果
5. 如果遇到问题无法解决，明确说明原因

## 输出格式
- 在调用工具前，简要说明你的思考过程
- 不要编造任何信息，只基于工具返回的实际结果回答
- 完成任务后，提供简洁的总结`

    // 初始化消息历史
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请完成以下任务：\n\n${task}` }
    ]

    // Agent 循环
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // 检查超时
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('执行超时')
      }

      // 检查是否中止
      if (agentLoopAbortController.signal.aborted) {
        throw new Error('用户中止')
      }

      totalTurns++
      console.log(`\n[Agent Loop] ===== 第 ${totalTurns} 轮 =====`)

      // 发送轮次开始事件
      sendAgentLoopEvent({
        type: 'turn_start',
        data: { turnNumber: totalTurns }
      })

      // 调用 LLM
      const llmResponse = await callLLMWithTools(provider, messages, toolDefinitions, model)

      // 发送思考内容事件
      if (llmResponse.content) {
        console.log(`  [Agent Loop] LLM 思考: ${llmResponse.content.substring(0, 200)}...`)
        sendAgentLoopEvent({
          type: 'thinking',
          data: { content: llmResponse.content }
        })

        // 将助手回复添加到历史
        messages.push({
          role: 'assistant',
          content: llmResponse.content
        })
      }

      // 检查是否有工具调用
      if (llmResponse.toolCalls && llmResponse.toolCalls.length > 0) {
        // 构建工具调用消息
        const toolCallMessage = {
          role: 'assistant',
          content: llmResponse.content || null,
          tool_calls: llmResponse.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments)
            }
          }))
        }

        // 替换最后一条消息（如果有 content，则追加工具调用信息）
        if (!llmResponse.content) {
          messages[messages.length - 1] = toolCallMessage
        } else {
          // 更新最后一条助手消息
          messages[messages.length - 1] = toolCallMessage
        }

        // 执行每个工具调用
        for (const toolCall of llmResponse.toolCalls) {
          totalToolCalls++

          console.log(`  [Agent Loop] 工具调用: ${toolCall.name}`)
          console.log(`  [Agent Loop] 参数:`, toolCall.arguments)

          // 发送工具调用事件
          sendAgentLoopEvent({
            type: 'tool_call',
            data: {
              toolName: toolCall.name,
              toolArgs: toolCall.arguments
            }
          })

          // 执行工具
          const toolResult = await executeToolCall(
            toolCall.name,
            toolCall.arguments,
            projectPath
          )

          console.log(`  [Agent Loop] 工具结果: ${toolResult.output?.substring(0, 200)}...`)

          // 发送工具结果事件
          sendAgentLoopEvent({
            type: 'tool_result',
            data: {
              toolOutput: toolResult.output,
              toolSuccess: toolResult.success
            }
          })

          // 将工具结果添加到消息历史
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolResult.output
          })
        }
      } else {
        // 没有工具调用，检查是否完成任务
        if (llmResponse.stopReason === 'end_turn' ||
            llmResponse.stopReason === 'stop' ||
            llmResponse.content) {
          // Agent 认为任务完成
          console.log('[Agent Loop] 任务完成')
          break
        }
      }

      // 发送轮次结束事件
      sendAgentLoopEvent({
        type: 'turn_end',
        data: { turnNumber: totalTurns }
      })
    }

    // 获取最终结果
    const lastMessage = messages[messages.length - 1]
    let finalResult = lastMessage.role === 'assistant'
      ? (typeof lastMessage.content === 'string' ? lastMessage.content : lastMessage.content?.toString() || '')
      : '任务执行完成'

    // 过滤掉 <think>...</think> 标签（某些模型如 MiniMax 会输出思考内容）
    finalResult = finalResult.replace(/<think>[\s\S]*?<\/think>/g, '').trim()

    const duration = Date.now() - startTime

    // 发送结束事件
    sendAgentLoopEvent({
      type: 'agent_end',
      data: {
        success: true,
        result: finalResult,
        totalTurns,
        totalToolCalls,
        duration
      }
    })

    console.log('\n' + '='.repeat(60))
    console.log('[Agent Loop] 执行成功')
    console.log('[Agent Loop] 总轮次:', totalTurns)
    console.log('[Agent Loop] 总工具调用:', totalToolCalls)
    console.log('[Agent Loop] 耗时:', duration, 'ms')
    console.log('='.repeat(60) + '\n')

    return {
      success: true,
      result: finalResult,
      totalTurns,
      totalToolCalls,
      duration
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error.message || String(error)

    console.error('\n[Agent Loop] 执行失败:', errorMessage)

    // 发送错误事件
    sendAgentLoopEvent({
      type: 'error',
      data: { error: errorMessage }
    })

    // 发送结束事件
    sendAgentLoopEvent({
      type: 'agent_end',
      data: {
        success: false,
        result: errorMessage,
        totalTurns,
        totalToolCalls,
        duration
      }
    })

    return {
      success: false,
      error: errorMessage,
      totalTurns,
      totalToolCalls,
      duration
    }
  } finally {
    agentLoopAbortController = null
  }
})

/**
 * 中止 Agent Loop
 */
ipcMain.handle('abort-agent-loop', async () => {
  if (agentLoopAbortController) {
    agentLoopAbortController.abort()
    console.log('[Agent Loop] 用户中止执行')
    return { success: true, message: '已发送中止信号' }
  }
  return { success: false, message: '没有正在执行的 Agent Loop' }
})

// ==================== 任务 / 资源 / 智能体 / 技能 / 知识 / 节点 ====================
// 实现在 electron/core/{task,resource,agent,skill,knowledge,node}（TS），IPC 壳在
// source/desktop/{task,resource,agent,skill,knowledge,node}.ts（编译产物），两端与 CLI 共用同一份 core 源码。
// knowledge 壳额外拿到 getRawProjectPath（复刻 graph-config 的「未设置项目返回错误」契约）。
require('./dist/source/desktop/task.js').registerTaskHandlers({ getProjectRoot })
require('./dist/source/desktop/resource.js').registerResourceHandlers({ getProjectRoot })
require('./dist/source/desktop/agent.js').registerAgentHandlers({ getProjectRoot })
require('./dist/source/desktop/skill.js').registerSkillHandlers({ getProjectRoot })
require('./dist/source/desktop/knowledge.js').registerKnowledgeHandlers({ getProjectRoot, getRawProjectPath: () => currentProjectPath })
require('./dist/source/desktop/node.js').registerNodeHandlers({ getProjectRoot })
require('./dist/source/desktop/workflow.js').registerWorkflowHandlers({
  getProjectRoot,
  // 实例 watcher 增量推送：真实 Electron 即 mainWindow.webContents.send；
  // stub（网页端）环境经 pushEmitter → http.cjs SSE（与原内联实现同一推送路径）
  sendToRenderer: (channel, payload) => mainWindow?.webContents?.send(channel, payload),
})
