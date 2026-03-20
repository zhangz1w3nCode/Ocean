// 开发模式 preload 脚本
const { ipcRenderer } = require('electron')

// 暴露 API 到渲染进程
const electronAPI = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 工作流文件数据持久化（Markdown 格式，以名称命名文件）
  saveWorkflowFile: (name, content) => ipcRenderer.invoke('save-workflow-file', name, content),
  loadWorkflowFile: (name) => ipcRenderer.invoke('load-workflow-file', name),
  deleteWorkflowFile: (name) => ipcRenderer.invoke('delete-workflow-file', name),
  loadAllWorkflowFiles: () => ipcRenderer.invoke('load-all-workflow-files'),

  // 工作流文件夹操作 API（新版文件夹结构）
  createWorkflowFolder: (name) => ipcRenderer.invoke('create-workflow-folder', name),
  loadWorkflowMd: (name) => ipcRenderer.invoke('load-workflow-md', name),
  saveWorkflowMd: (name, content) => ipcRenderer.invoke('save-workflow-md', name, content),
  loadWorkflowFlowJson: (name) => ipcRenderer.invoke('load-workflow-flow-json', name),
  saveWorkflowFlowJson: (name, content) => ipcRenderer.invoke('save-workflow-flow-json', name, content),
  loadAllWorkflowFolders: () => ipcRenderer.invoke('load-all-workflow-folders'),
  deleteWorkflowFolder: (name) => ipcRenderer.invoke('delete-workflow-folder', name),
  renameWorkflowFolder: (oldName, newName) => ipcRenderer.invoke('rename-workflow-folder', oldName, newName),

  // 节点文件数据持久化（Markdown 格式，以名称命名文件）
  saveNodeFile: (name, content) => ipcRenderer.invoke('save-node-file', name, content),
  loadNodeFile: (name) => ipcRenderer.invoke('load-node-file', name),
  deleteNodeFile: (name) => ipcRenderer.invoke('delete-node-file', name),
  loadAllNodeFiles: () => ipcRenderer.invoke('load-all-node-files'),

  // 局部节点文件数据持久化（存储在工作流的nodes目录下）
  saveLocalNode: (workflowName, nodeName, content) => ipcRenderer.invoke('save-local-node', workflowName, nodeName, content),
  loadLocalNode: (workflowName, nodeName) => ipcRenderer.invoke('load-local-node', workflowName, nodeName),
  loadAllLocalNodes: (workflowName) => ipcRenderer.invoke('load-all-local-nodes', workflowName),
  deleteLocalNode: (workflowName, nodeName) => ipcRenderer.invoke('delete-local-node', workflowName, nodeName),

  // 资源文件数据持久化（Markdown 格式，以名称命名文件）
  saveResourceFile: (name, content) => ipcRenderer.invoke('save-resource-file', name, content),
  loadResourceFile: (name) => ipcRenderer.invoke('load-resource-file', name),
  deleteResourceFile: (name) => ipcRenderer.invoke('delete-resource-file', name),
  loadAllResourceFiles: () => ipcRenderer.invoke('load-all-resource-files'),

  // 智能体文件数据持久化（Markdown 格式，存储在 agents 目录）
  saveAgentFile: (name, content) => ipcRenderer.invoke('save-agent-file', name, content),
  loadAgentFile: (name) => ipcRenderer.invoke('load-agent-file', name),
  deleteAgentFile: (name) => ipcRenderer.invoke('delete-agent-file', name),
  loadAllAgentFiles: () => ipcRenderer.invoke('load-all-agent-files'),

  // 命令文件数据持久化（Markdown 格式，存储在 commands 目录）
  saveCommandFile: (name, content) => ipcRenderer.invoke('save-command-file', name, content),
  loadCommandFile: (name) => ipcRenderer.invoke('load-command-file', name),
  deleteCommandFile: (name) => ipcRenderer.invoke('delete-command-file', name),
  loadAllCommandFiles: () => ipcRenderer.invoke('load-all-command-files'),

  // 能力文件数据持久化（Markdown 格式，存储在 abilities 目录）
  saveAbilityFile: (name, content) => ipcRenderer.invoke('save-ability-file', name, content),
  loadAbilityFile: (name) => ipcRenderer.invoke('load-ability-file', name),
  deleteAbilityFile: (name) => ipcRenderer.invoke('delete-ability-file', name),
  loadAllAbilityFiles: () => ipcRenderer.invoke('load-all-ability-files'),

  // 知识库文件数据持久化（Markdown 格式，存储在 knowledges 目录）
  saveKnowledgeFile: (name, content) => ipcRenderer.invoke('save-knowledge-file', name, content),
  loadKnowledgeFile: (name) => ipcRenderer.invoke('load-knowledge-file', name),
  deleteKnowledgeFile: (name) => ipcRenderer.invoke('delete-knowledge-file', name),
  loadAllKnowledgeFiles: () => ipcRenderer.invoke('load-all-knowledge-files'),

  // 技能文件数据持久化（目录结构，存储在 skills 目录）
  createSkillDirectory: (name, input) => ipcRenderer.invoke('create-skill-directory', name, input),
  saveSkillFile: (name, content) => ipcRenderer.invoke('save-skill-file', name, content),
  loadSkillFile: (name) => ipcRenderer.invoke('load-skill-file', name),
  deleteSkillDirectory: (name) => ipcRenderer.invoke('delete-skill-directory', name),
  loadAllSkillDirectories: () => ipcRenderer.invoke('load-all-skill-directories'),
  // 技能资源文件操作
  saveSkillResource: (skillName, resourceType, fileName, content) =>
    ipcRenderer.invoke('save-skill-resource', skillName, resourceType, fileName, content),
  loadSkillResource: (skillName, resourceType, fileName) =>
    ipcRenderer.invoke('load-skill-resource', skillName, resourceType, fileName),
  deleteSkillResource: (skillName, resourceType, fileName) =>
    ipcRenderer.invoke('delete-skill-resource', skillName, resourceType, fileName),
  listSkillResources: (skillName, resourceType) =>
    ipcRenderer.invoke('list-skill-resources', skillName, resourceType),

  // 项目相关 API
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  loadAppConfig: () => ipcRenderer.invoke('load-app-config'),
  saveAppConfig: (config) => ipcRenderer.invoke('save-app-config', config),
  initProjectDir: (projectPath) => ipcRenderer.invoke('init-project-dir', projectPath),
  setProjectPath: (projectPath) => ipcRenderer.invoke('set-project-path', projectPath),

  // 知识图谱配置 API（存储在 .ocean 目录）
  loadKnowledgeGraphConfig: () => ipcRenderer.invoke('load-knowledge-graph-config'),
  saveKnowledgeGraphConfig: (config) => ipcRenderer.invoke('save-knowledge-graph-config', config),

  // 设置模块 API
  testLLMConnection: (provider) => ipcRenderer.invoke('test-llm-connection', provider),
  testExecutablePath: (filePath) => ipcRenderer.invoke('test-executable-path', filePath),

  // LLM 调用 API (绑过 CORS)
  callLLMApi: (provider, prompt, model) => ipcRenderer.invoke('call-llm-api', { provider, prompt, model }),
  // LLM 配置文件 API
  saveLLMConfig: (config) => ipcRenderer.invoke('save-llm-config', config),
  loadLLMConfig: () => ipcRenderer.invoke('load-llm-config'),
  // Agentic 配置文件 API
  saveAgenticConfig: (config) => ipcRenderer.invoke('save-agentic-config', config),
  loadAgenticConfig: () => ipcRenderer.invoke('load-agentic-config'),
  // Agentic 工具执行 API
  executeAgenticTool: (params) => ipcRenderer.invoke('execute-agentic-tool', params),
  // Agent Loop API（真正的 LLM 驱动工具调用）
  runAgentLoop: (config) => ipcRenderer.invoke('run-agent-loop', config),
  abortAgentLoop: () => ipcRenderer.invoke('abort-agent-loop'),
  // Agent Loop 事件监听
  onAgentLoopEvent: (callback) => {
    const listener = (_event, data) => callback(data)
    ipcRenderer.on('agent-loop-event', listener)
    return () => ipcRenderer.removeListener('agent-loop-event', listener)
  },

  // 能力模块模板文件 API
  saveAbilityTemplateFile: (templateType, content) =>
    ipcRenderer.invoke('save-ability-template-file', templateType, content),
  loadAbilityTemplateFile: (templateType) =>
    ipcRenderer.invoke('load-ability-template-file', templateType)
}

// 通过 window 暴露
window.electronAPI = electronAPI