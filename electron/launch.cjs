// Electron启动脚本（开发模式）
const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

let mainWindow = null
let currentProjectPath = null  // 当前项目路径

// 应用配置文件路径（存储在用户目录）
const getAppConfigPath = () => {
  const userDir = app.getPath('userData')
  return path.join(userDir, 'flow-editor-config.json')
}

// 生成路径 hash 作为项目 ID
const generateProjectId = (projectPath) => {
  return crypto.createHash('md5').update(projectPath).digest('hex').slice(0, 16)
}

// 数据迁移：.workflow-maker -> .claude
const migrateDataDir = (projectPath) => {
  const oldDir = path.join(projectPath, '.workflow-maker')
  const newDir = path.join(projectPath, '.claude')

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
  // 迁移数据
  migrateDataDir(projectPath)
}

// 工作流数据存储目录
const getWorkflowsDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'workflows')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 节点数据存储目录
const getNodesDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'nodes')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 资源文件存储目录
const getResourcesDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'resources')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 工具文件存储目录（agents）
const getAgentsDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'agents')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 命令文件存储目录（commands）
const getCommandsDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'commands')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 能力文件存储目录（abilities）
const getAbilitiesDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'abilities')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 知识库文件存储目录（knowledges）
const getKnowledgesDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'knowledges')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 技能文件存储目录（skills）
const getSkillsDir = () => {
  const dataDir = path.join(getProjectRoot(), '.claude', 'skills')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

// 获取技能子目录路径
const getSkillSubDir = (skillName, subDir) => {
  const skillDir = path.join(getSkillsDir(), skillName)
  const subDirPath = path.join(skillDir, subDir)
  if (!fs.existsSync(subDirPath)) {
    fs.mkdirSync(subDirPath, { recursive: true })
  }
  return subDirPath
}

// 获取工作流文件路径（详情）
const getWorkflowFilePath = (id) => {
  return path.join(getWorkflowsDir(), `${id}.json`)
}

// 获取所有工作流列表文件路径
const getAllWorkflowsFilePath = () => {
  return path.join(getWorkflowsDir(), 'workflows.json')
}

// 获取节点定义文件路径
const getNodeDefinitionsFilePath = () => {
  return path.join(getNodesDir(), 'definitions.json')
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

// ===== 工作流文件相关 IPC（Markdown 格式）=====

// 保存工作流文件（Markdown格式，以名称命名）
ipcMain.handle('save-workflow-file', (_, name, content) => {
  try {
    const workflowsDir = getWorkflowsDir()
    const fileName = `${name}.md`
    const filePath = path.join(workflowsDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存工作流文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个工作流文件内容
ipcMain.handle('load-workflow-file', (_, name) => {
  try {
    const workflowsDir = getWorkflowsDir()
    const filePath = path.join(workflowsDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载工作流文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个工作流文件
ipcMain.handle('delete-workflow-file', (_, name) => {
  try {
    const workflowsDir = getWorkflowsDir()
    const filePath = path.join(workflowsDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除工作流文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有工作流文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-workflow-files', () => {
  try {
    const workflowsDir = getWorkflowsDir()
    if (!fs.existsSync(workflowsDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(workflowsDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载工作流文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// ===== 工作流文件夹操作 IPC（新版文件夹结构）=====

// 获取工作流文件夹路径
const getWorkflowFolderPath = (name) => {
  return path.join(getWorkflowsDir(), name)
}

// 获取工作流meta-data目录路径
const getWorkflowMetaDataPath = (name) => {
  return path.join(getWorkflowFolderPath(name), 'meta-data')
}

// 创建工作流文件夹
ipcMain.handle('create-workflow-folder', (_, name) => {
  try {
    const folderPath = getWorkflowFolderPath(name)
    const metaDataPath = getWorkflowMetaDataPath(name)

    // 创建工作流文件夹
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }

    // 创建meta-data目录
    if (!fs.existsSync(metaDataPath)) {
      fs.mkdirSync(metaDataPath, { recursive: true })
    }

    return { success: true, folderPath }
  } catch (error) {
    console.error('创建工作流文件夹失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载工作流文件夹的WORKFLOW.md内容
ipcMain.handle('load-workflow-md', (_, name) => {
  try {
    const filePath = path.join(getWorkflowFolderPath(name), 'WORKFLOW.md')
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载WORKFLOW.md失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 保存工作流文件夹的WORKFLOW.md内容
ipcMain.handle('save-workflow-md', (_, name, content) => {
  try {
    const folderPath = getWorkflowFolderPath(name)
    // 确保文件夹存在
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true })
    }
    const filePath = path.join(folderPath, 'WORKFLOW.md')
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存WORKFLOW.md失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载工作流的flow.json
ipcMain.handle('load-workflow-flow-json', (_, name) => {
  try {
    const filePath = path.join(getWorkflowMetaDataPath(name), 'flow.json')
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载flow.json失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 保存工作流的flow.json
ipcMain.handle('save-workflow-flow-json', (_, name, content) => {
  try {
    const metaDataPath = getWorkflowMetaDataPath(name)
    // 确保meta-data文件夹存在
    if (!fs.existsSync(metaDataPath)) {
      fs.mkdirSync(metaDataPath, { recursive: true })
    }
    const filePath = path.join(metaDataPath, 'flow.json')
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存flow.json失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有工作流文件夹列表（返回所有文件夹名）
ipcMain.handle('load-all-workflow-folders', () => {
  try {
    const workflowsDir = getWorkflowsDir()
    if (!fs.existsSync(workflowsDir)) {
      return { success: true, folders: [] }
    }
    const folders = fs.readdirSync(workflowsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name)
    return { success: true, folders }
  } catch (error) {
    console.error('加载工作流文件夹列表失败:', error)
    return { success: false, error: String(error), folders: [] }
  }
})

// 删除工作流文件夹
ipcMain.handle('delete-workflow-folder', (_, name) => {
  try {
    const folderPath = getWorkflowFolderPath(name)
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true })
    }
    return { success: true }
  } catch (error) {
    console.error('删除工作流文件夹失败:', error)
    return { success: false, error: String(error) }
  }
})

// 重命名工作流文件夹
ipcMain.handle('rename-workflow-folder', (_, oldName, newName) => {
  try {
    const oldPath = getWorkflowFolderPath(oldName)
    const newPath = getWorkflowFolderPath(newName)
    if (fs.existsSync(oldPath)) {
      fs.renameSync(oldPath, newPath)
    }
    return { success: true }
  } catch (error) {
    console.error('重命名工作流文件夹失败:', error)
    return { success: false, error: String(error) }
  }
})

// ===== 节点文件相关 IPC（Markdown 格式）=====

// 保存节点文件（Markdown格式，以名称命名）
ipcMain.handle('save-node-file', (_, name, content) => {
  try {
    const nodesDir = getNodesDir()
    const fileName = `${name}.md`
    const filePath = path.join(nodesDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存节点文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个节点文件内容
ipcMain.handle('load-node-file', (_, name) => {
  try {
    const nodesDir = getNodesDir()
    const filePath = path.join(nodesDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载节点文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个节点文件
ipcMain.handle('delete-node-file', (_, name) => {
  try {
    const nodesDir = getNodesDir()
    const filePath = path.join(nodesDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除节点文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有节点文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-node-files', () => {
  try {
    const nodesDir = getNodesDir()
    if (!fs.existsSync(nodesDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(nodesDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载节点文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// ===== 局部节点文件相关 IPC（存储在工作流的nodes目录下）=====

// 获取工作流局部节点目录路径
const getWorkflowLocalNodesPath = (workflowName) => {
  return path.join(getWorkflowFolderPath(workflowName), 'nodes')
}

// 保存局部节点文件
ipcMain.handle('save-local-node', (_, workflowName, nodeName, content) => {
  try {
    const nodesDir = getWorkflowLocalNodesPath(workflowName)
    // 确保nodes目录存在
    if (!fs.existsSync(nodesDir)) {
      fs.mkdirSync(nodesDir, { recursive: true })
    }
    const fileName = `${nodeName}.md`
    const filePath = path.join(nodesDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存局部节点文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载局部节点文件
ipcMain.handle('load-local-node', (_, workflowName, nodeName) => {
  try {
    const nodesDir = getWorkflowLocalNodesPath(workflowName)
    const filePath = path.join(nodesDir, `${nodeName}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载局部节点文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 加载所有局部节点文件列表
ipcMain.handle('load-all-local-nodes', (_, workflowName) => {
  try {
    const nodesDir = getWorkflowLocalNodesPath(workflowName)
    if (!fs.existsSync(nodesDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(nodesDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载局部节点文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// 删除局部节点文件
ipcMain.handle('delete-local-node', (_, workflowName, nodeName) => {
  try {
    const nodesDir = getWorkflowLocalNodesPath(workflowName)
    const filePath = path.join(nodesDir, `${nodeName}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除局部节点文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// ===== 资源文件相关 IPC =====

// 保存资源文件（Markdown格式，以名称命名）
ipcMain.handle('save-resource-file', (_, name, content) => {
  try {
    const resourcesDir = getResourcesDir()
    // 文件名使用 名称.md 格式
    const fileName = `${name}.md`
    const filePath = path.join(resourcesDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存资源文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个资源文件内容
ipcMain.handle('load-resource-file', (_, name) => {
  try {
    const resourcesDir = getResourcesDir()
    const filePath = path.join(resourcesDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载资源文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个资源文件
ipcMain.handle('delete-resource-file', (_, name) => {
  try {
    const resourcesDir = getResourcesDir()
    const filePath = path.join(resourcesDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除资源文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有资源文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-resource-files', () => {
  try {
    const resourcesDir = getResourcesDir()
    if (!fs.existsSync(resourcesDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(resourcesDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file) // 返回完整文件名，如 "节点命名规范.md"
    return { success: true, files }
  } catch (error) {
    console.error('加载资源文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// ===== 智能体文件相关 IPC =====

// 保存智能体文件（Markdown格式，以名称命名）
ipcMain.handle('save-agent-file', (_, name, content) => {
  try {
    const agentsDir = getAgentsDir()
    const fileName = `${name}.md`
    const filePath = path.join(agentsDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存智能体文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个智能体文件内容
ipcMain.handle('load-agent-file', (_, name) => {
  try {
    const agentsDir = getAgentsDir()
    const filePath = path.join(agentsDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载智能体文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个智能体文件
ipcMain.handle('delete-agent-file', (_, name) => {
  try {
    const agentsDir = getAgentsDir()
    const filePath = path.join(agentsDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除智能体文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有智能体文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-agent-files', () => {
  try {
    const agentsDir = getAgentsDir()
    if (!fs.existsSync(agentsDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(agentsDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载智能体文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// ===== 命令文件相关 IPC =====

// 保存命令文件（Markdown格式，以名称命名）
ipcMain.handle('save-command-file', (_, name, content) => {
  try {
    const commandsDir = getCommandsDir()
    const fileName = `${name}.md`
    const filePath = path.join(commandsDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存命令文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个命令文件内容
ipcMain.handle('load-command-file', (_, name) => {
  try {
    const commandsDir = getCommandsDir()
    const filePath = path.join(commandsDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载命令文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个命令文件
ipcMain.handle('delete-command-file', (_, name) => {
  try {
    const commandsDir = getCommandsDir()
    const filePath = path.join(commandsDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除命令文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有命令文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-command-files', () => {
  try {
    const commandsDir = getCommandsDir()
    if (!fs.existsSync(commandsDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(commandsDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载命令文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// ===== 能力文件相关 IPC =====

// 保存能力文件（Markdown格式，以名称命名）
ipcMain.handle('save-ability-file', (_, name, content) => {
  try {
    const abilitiesDir = getAbilitiesDir()
    const fileName = `${name}.md`
    const filePath = path.join(abilitiesDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存能力文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个能力文件内容
ipcMain.handle('load-ability-file', (_, name) => {
  try {
    const abilitiesDir = getAbilitiesDir()
    const filePath = path.join(abilitiesDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载能力文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个能力文件
ipcMain.handle('delete-ability-file', (_, name) => {
  try {
    const abilitiesDir = getAbilitiesDir()
    const filePath = path.join(abilitiesDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除能力文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有能力文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-ability-files', () => {
  try {
    const abilitiesDir = getAbilitiesDir()
    if (!fs.existsSync(abilitiesDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(abilitiesDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载能力文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})

// ===== 知识库文件相关 IPC =====

// 保存知识库文件（Markdown格式，以名称命名）
ipcMain.handle('save-knowledge-file', (_, name, content) => {
  try {
    const knowledgesDir = getKnowledgesDir()
    const fileName = `${name}.md`
    const filePath = path.join(knowledgesDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存知识库文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载单个知识库文件内容
ipcMain.handle('load-knowledge-file', (_, name) => {
  try {
    const knowledgesDir = getKnowledgesDir()
    const filePath = path.join(knowledgesDir, `${name}.md`)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载知识库文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除单个知识库文件
ipcMain.handle('delete-knowledge-file', (_, name) => {
  try {
    const knowledgesDir = getKnowledgesDir()
    const filePath = path.join(knowledgesDir, `${name}.md`)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除知识库文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有知识库文件列表（返回所有 .md 文件名）
ipcMain.handle('load-all-knowledge-files', () => {
  try {
    const knowledgesDir = getKnowledgesDir()
    if (!fs.existsSync(knowledgesDir)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(knowledgesDir)
      .filter(file => file.endsWith('.md'))
      .map(file => file)
    return { success: true, files }
  } catch (error) {
    console.error('加载知识库文件列表失败:', error)
    return { success: false, error: String(error), files: [] }
  }
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

// 初始化项目目录
ipcMain.handle('init-project-dir', (_, projectPath) => {
  try {
    // 设置项目路径
    setProjectPath(projectPath)

    // 创建必要的子目录
    const claudeDir = path.join(projectPath, '.claude')
    const subDirs = ['workflows', 'nodes', 'resources', 'agents', 'commands', 'abilities', 'knowledges']

    for (const subDir of subDirs) {
      const dirPath = path.join(claudeDir, subDir)
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true })
      }
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

// 加载知识图谱配置
ipcMain.handle('load-knowledge-graph-config', () => {
  try {
    if (!currentProjectPath) {
      return {
        success: false,
        error: '未设置项目路径',
        config: null
      }
    }

    const configPath = path.join(currentProjectPath, '.ocean', 'knowledge-graph-config.json')

    if (!fs.existsSync(configPath)) {
      // 返回 null 表示使用默认配置
      return { success: true, config: null }
    }

    const content = fs.readFileSync(configPath, 'utf-8')
    const config = JSON.parse(content)

    return { success: true, config }
  } catch (error) {
    console.error('加载知识图谱配置失败:', error)
    return { success: false, error: String(error), config: null }
  }
})

// 保存知识图谱配置
ipcMain.handle('save-knowledge-graph-config', (_, config) => {
  try {
    if (!currentProjectPath) {
      return { success: false, error: '未设置项目路径' }
    }

    // 确保 .ocean 目录存在
    const oceanDir = path.join(currentProjectPath, '.ocean')
    if (!fs.existsSync(oceanDir)) {
      fs.mkdirSync(oceanDir, { recursive: true })
    }

    const configPath = path.join(oceanDir, 'knowledge-graph-config.json')
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')

    return { success: true }
  } catch (error) {
    console.error('保存知识图谱配置失败:', error)
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

// ========== Agentic 工具执行（使用 @mariozechner/pi-coding-agent） ==========

// 动态导入 pi-coding-agent 工具（ESM 模块）
let piCodingAgentTools = null

async function loadPiCodingAgentTools() {
  if (!piCodingAgentTools) {
    const module = await import('@mariozechner/pi-coding-agent')
    piCodingAgentTools = {
      createReadTool: module.createReadTool,
      createWriteTool: module.createWriteTool,
      createEditTool: module.createEditTool,
      createLsTool: module.createLsTool,
      createGrepTool: module.createGrepTool,
      createFindTool: module.createFindTool,
      createBashTool: module.createBashTool,
    }
    console.log('✅ pi-coding-agent 工具加载成功')
  }
  return piCodingAgentTools
}

// 工具实例缓存
const toolInstanceCache = new Map()

/**
 * 执行 Agentic 工具
 * 使用 @mariozechner/pi-coding-agent 提供的工具实现
 */
ipcMain.handle('execute-agentic-tool', async (_, params) => {
  const { type, ...args } = params
  const cwd = args.cwd || getProjectRoot()

  if (!cwd) {
    return { success: false, error: '项目路径未设置' }
  }

  try {
    // 加载 pi-coding-agent 工具
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
        case 'ls':
          tool = tools.createLsTool(cwd)
          break
        case 'grep':
          tool = tools.createGrepTool(cwd)
          break
        case 'find':
          tool = tools.createFindTool(cwd)
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
      case 'ls':
        toolArgs = {
          path: args.path,
          limit: args.limit
        }
        break
      case 'grep':
        toolArgs = {
          pattern: args.pattern,
          path: args.path,
          glob: args.glob,
          ignoreCase: args.ignoreCase,
          limit: args.limit
        }
        break
      case 'find':
        toolArgs = {
          pattern: args.pattern,
          path: args.path,
          limit: args.limit
        }
        break
      case 'bash':
        toolArgs = {
          command: args.command,
          timeout: args.timeout
        }
        break
    }

    console.log(`✅ [${type}] 使用 pi-coding-agent 执行工具`, toolArgs)

    // 执行工具
    const result = await tool.execute(
      `tool-call-${Date.now()}`, // toolCallId
      toolArgs,
      undefined // signal
    )

    // 解析结果 - pi-coding-agent 返回 { content: [...], details: ... }
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
  'file-ls': 'ls',
  'file-grep': 'grep',
  'file-find': 'find',
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
      case 'file-ls':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            path: { type: 'string', description: '目录路径，默认为当前目录' }
          }
        }
        break
      case 'file-grep':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '搜索的正则表达式模式' },
            path: { type: 'string', description: '搜索路径，默认为当前目录' },
            glob: { type: 'string', description: '文件匹配模式（如 *.ts）' },
            ignoreCase: { type: 'boolean', description: '是否忽略大小写' }
          },
          required: ['pattern']
        }
        break
      case 'file-find':
        toolDef.function.parameters = {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: '文件名匹配模式' },
            path: { type: 'string', description: '搜索路径，默认为当前目录' }
          },
          required: ['pattern']
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
        case 'ls':
          tool = tools.createLsTool(cwd)
          break
        case 'grep':
          tool = tools.createGrepTool(cwd)
          break
        case 'find':
          tool = tools.createFindTool(cwd)
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

// ===== 能力模块模板文件 IPC 通道 =====

/**
 * 保存能力模板文件
 * @param templateType 模板类型: 'smart-create' | 'optimize'
 * @param content 模板内容
 */
ipcMain.handle('save-ability-template-file', async (_, templateType, content) => {
  try {
    const projectRoot = getProjectRoot()
    const templateDir = path.join(projectRoot, '.ocean', 'template', 'ability')

    // 确保目录存在
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true })
    }

    const fileName = `${templateType}.json`
    const filePath = path.join(templateDir, fileName)

    // 保存为 JSON 文件
    const templateData = {
      content,
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2), 'utf-8')

    console.log('保存能力模板文件成功:', filePath)
    return { success: true }
  } catch (error) {
    console.error('保存能力模板文件失败:', error)
    return { success: false, error: error.message }
  }
})

/**
 * 加载能力模板文件
 * @param templateType 模板类型: 'smart-create' | 'optimize'
 */
ipcMain.handle('load-ability-template-file', async (_, templateType) => {
  try {
    const projectRoot = getProjectRoot()
    const fileName = `${templateType}.json`
    const filePath = path.join(projectRoot, '.ocean', 'template', 'ability', fileName)

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.log('能力模板文件不存在:', filePath)
      return { success: false, content: null }
    }

    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const templateData = JSON.parse(fileContent)

    console.log('加载能力模板文件成功:', filePath)
    return { success: true, content: templateData.content }
  } catch (error) {
    console.error('加载能力模板文件失败:', error)
    return { success: false, error: error.message, content: null }
  }
})

// ===== 技能模板文件相关 IPC =====

/**
 * 保存技能模板文件
 * @param templateType 模板类型: 'llm-create' | 'agentic-create'
 */
ipcMain.handle('save-skill-template-file', async (_, templateType, content) => {
  try {
    const projectRoot = getProjectRoot()
    const templateDir = path.join(projectRoot, '.ocean', 'template', 'skill')

    // 确保目录存在
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true })
    }

    const fileName = `${templateType}.json`
    const filePath = path.join(templateDir, fileName)

    // 保存为 JSON 文件
    const templateData = {
      content,
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(filePath, JSON.stringify(templateData, null, 2), 'utf-8')

    console.log('保存技能模板文件成功:', filePath)
    return { success: true }
  } catch (error) {
    console.error('保存技能模板文件失败:', error)
    return { success: false, error: error.message }
  }
})

/**
 * 加载技能模板文件
 * @param templateType 模板类型: 'llm-create' | 'agentic-create'
 */
ipcMain.handle('load-skill-template-file', async (_, templateType) => {
  try {
    const projectRoot = getProjectRoot()
    const fileName = `${templateType}.json`
    const filePath = path.join(projectRoot, '.ocean', 'template', 'skill', fileName)

    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      console.log('技能模板文件不存在:', filePath)
      return { success: false, content: null }
    }

    // 读取文件内容
    const fileContent = fs.readFileSync(filePath, 'utf-8')
    const templateData = JSON.parse(fileContent)

    console.log('加载技能模板文件成功:', filePath)
    return { success: true, content: templateData.content }
  } catch (error) {
    console.error('加载技能模板文件失败:', error)
    return { success: false, error: error.message, content: null }
  }
})

// ===== 技能文件相关 IPC =====

// 创建技能目录结构
ipcMain.handle('create-skill-directory', (_, name, input) => {
  try {
    const skillsDir = getSkillsDir()
    const skillDir = path.join(skillsDir, name)

    if (fs.existsSync(skillDir)) {
      return { success: false, error: '技能目录已存在' }
    }

    // 创建目录结构
    fs.mkdirSync(skillDir, { recursive: true })

    // 创建子目录
    const subDirs = ['scripts', 'references', 'examples']
    for (const subDir of subDirs) {
      fs.mkdirSync(path.join(skillDir, subDir), { recursive: true })
    }

    // 创建 SKILL.md 文件
    const skillMdContent = `---
name: ${name}
description: ${input.description || ''}
---
${input.content || ''}`
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), skillMdContent, 'utf-8')

    // 创建资源文件
    if (input.scripts) {
      for (const script of input.scripts) {
        fs.writeFileSync(path.join(skillDir, 'scripts', script.name), script.content, 'utf-8')
      }
    }
    if (input.references) {
      for (const ref of input.references) {
        fs.writeFileSync(path.join(skillDir, 'references', ref.name), ref.content, 'utf-8')
      }
    }
    if (input.examples) {
      for (const ex of input.examples) {
        fs.writeFileSync(path.join(skillDir, 'examples', ex.name), ex.content, 'utf-8')
      }
    }

    return { success: true }
  } catch (error) {
    console.error('创建技能目录失败:', error)
    return { success: false, error: String(error) }
  }
})

// 保存技能 SKILL.md 文件
ipcMain.handle('save-skill-file', (_, name, content) => {
  try {
    const skillsDir = getSkillsDir()
    const skillDir = path.join(skillsDir, name)
    if (!fs.existsSync(skillDir)) {
      fs.mkdirSync(skillDir, { recursive: true })
    }
    const filePath = path.join(skillDir, 'SKILL.md')
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存技能文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载技能 SKILL.md 文件
ipcMain.handle('load-skill-file', (_, name) => {
  try {
    const skillsDir = getSkillsDir()
    const filePath = path.join(skillsDir, name, 'SKILL.md')
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null, mtime: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const stats = fs.statSync(filePath)
    return { success: true, content, mtime: stats.mtime.toISOString() }
  } catch (error) {
    console.error('加载技能文件失败:', error)
    return { success: false, error: String(error), content: null, mtime: null }
  }
})

// 删除技能目录
ipcMain.handle('delete-skill-directory', (_, name) => {
  try {
    const skillsDir = getSkillsDir()
    const skillDir = path.join(skillsDir, name)
    if (fs.existsSync(skillDir)) {
      fs.rmSync(skillDir, { recursive: true, force: true })
    }
    return { success: true }
  } catch (error) {
    console.error('删除技能目录失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载所有技能目录列表
ipcMain.handle('load-all-skill-directories', () => {
  try {
    const skillsDir = getSkillsDir()
    if (!fs.existsSync(skillsDir)) {
      return { success: true, directories: [] }
    }
    const directories = fs.readdirSync(skillsDir)
      .filter(file => {
        const filePath = path.join(skillsDir, file)
        return fs.statSync(filePath).isDirectory()
      })
    return { success: true, directories }
  } catch (error) {
    console.error('加载技能目录列表失败:', error)
    return { success: false, error: String(error), directories: [] }
  }
})

// 保存技能资源文件
ipcMain.handle('save-skill-resource', (_, skillName, resourceType, fileName, content) => {
  try {
    const subDir = getSkillSubDir(skillName, resourceType)
    const filePath = path.join(subDir, fileName)
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    console.error('保存技能资源文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 加载技能资源文件
ipcMain.handle('load-skill-resource', (_, skillName, resourceType, fileName) => {
  try {
    const skillsDir = getSkillsDir()
    const filePath = path.join(skillsDir, skillName, resourceType, fileName)
    if (!fs.existsSync(filePath)) {
      return { success: true, content: null }
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    console.error('加载技能资源文件失败:', error)
    return { success: false, error: String(error), content: null }
  }
})

// 删除技能资源文件
ipcMain.handle('delete-skill-resource', (_, skillName, resourceType, fileName) => {
  try {
    const skillsDir = getSkillsDir()
    const filePath = path.join(skillsDir, skillName, resourceType, fileName)
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
    return { success: true }
  } catch (error) {
    console.error('删除技能资源文件失败:', error)
    return { success: false, error: String(error) }
  }
})

// 列出技能资源文件
ipcMain.handle('list-skill-resources', (_, skillName, resourceType) => {
  try {
    const skillsDir = getSkillsDir()
    const subDirPath = path.join(skillsDir, skillName, resourceType)
    if (!fs.existsSync(subDirPath)) {
      return { success: true, files: [] }
    }
    const files = fs.readdirSync(subDirPath)
    return { success: true, files }
  } catch (error) {
    console.error('列出技能资源文件失败:', error)
    return { success: false, error: String(error), files: [] }
  }
})