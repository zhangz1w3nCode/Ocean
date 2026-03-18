import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的API
contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // 工作流文件数据持久化（Markdown 格式，以名称命名文件）
  saveWorkflowFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-workflow-file', name, content),
  loadWorkflowFile: (name: string) => ipcRenderer.invoke('load-workflow-file', name),
  deleteWorkflowFile: (name: string) => ipcRenderer.invoke('delete-workflow-file', name),
  loadAllWorkflowFiles: () => ipcRenderer.invoke('load-all-workflow-files'),
  // 工作流文件夹操作 API（新版文件夹结构）
  createWorkflowFolder: (name: string) => ipcRenderer.invoke('create-workflow-folder', name),
  loadWorkflowMd: (name: string) => ipcRenderer.invoke('load-workflow-md', name),
  saveWorkflowMd: (name: string, content: string) =>
    ipcRenderer.invoke('save-workflow-md', name, content),
  loadWorkflowFlowJson: (name: string) => ipcRenderer.invoke('load-workflow-flow-json', name),
  saveWorkflowFlowJson: (name: string, content: string) =>
    ipcRenderer.invoke('save-workflow-flow-json', name, content),
  loadAllWorkflowFolders: () => ipcRenderer.invoke('load-all-workflow-folders'),
  deleteWorkflowFolder: (name: string) => ipcRenderer.invoke('delete-workflow-folder', name),
  renameWorkflowFolder: (oldName: string, newName: string) =>
    ipcRenderer.invoke('rename-workflow-folder', oldName, newName),
  // 节点文件数据持久化（Markdown 格式，以名称命名文件）
  saveNodeFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-node-file', name, content),
  loadNodeFile: (name: string) => ipcRenderer.invoke('load-node-file', name),
  deleteNodeFile: (name: string) => ipcRenderer.invoke('delete-node-file', name),
  loadAllNodeFiles: () => ipcRenderer.invoke('load-all-node-files'),
  // 局部节点文件数据持久化（存储在工作流的nodes目录下）
  saveLocalNode: (workflowName: string, nodeName: string, content: string) =>
    ipcRenderer.invoke('save-local-node', workflowName, nodeName, content),
  loadLocalNode: (workflowName: string, nodeName: string) =>
    ipcRenderer.invoke('load-local-node', workflowName, nodeName),
  loadAllLocalNodes: (workflowName: string) =>
    ipcRenderer.invoke('load-all-local-nodes', workflowName),
  deleteLocalNode: (workflowName: string, nodeName: string) =>
    ipcRenderer.invoke('delete-local-node', workflowName, nodeName),
  // 资源文件数据持久化（Markdown 格式，以名称命名文件）
  saveResourceFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-resource-file', name, content),
  loadResourceFile: (name: string) => ipcRenderer.invoke('load-resource-file', name),
  deleteResourceFile: (name: string) => ipcRenderer.invoke('delete-resource-file', name),
  loadAllResourceFiles: () => ipcRenderer.invoke('load-all-resource-files'),
  // 智能体文件数据持久化（Markdown 格式，存储在 agents 目录）
  saveAgentFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-agent-file', name, content),
  loadAgentFile: (name: string) => ipcRenderer.invoke('load-agent-file', name),
  deleteAgentFile: (name: string) => ipcRenderer.invoke('delete-agent-file', name),
  loadAllAgentFiles: () => ipcRenderer.invoke('load-all-agent-files'),
  // 命令文件数据持久化（Markdown 格式，存储在 commands 目录）
  saveCommandFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-command-file', name, content),
  loadCommandFile: (name: string) => ipcRenderer.invoke('load-command-file', name),
  deleteCommandFile: (name: string) => ipcRenderer.invoke('delete-command-file', name),
  loadAllCommandFiles: () => ipcRenderer.invoke('load-all-command-files'),
  // 能力文件数据持久化（Markdown 格式，存储在 abilities 目录）
  saveAbilityFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-ability-file', name, content),
  loadAbilityFile: (name: string) => ipcRenderer.invoke('load-ability-file', name),
  deleteAbilityFile: (name: string) => ipcRenderer.invoke('delete-ability-file', name),
  loadAllAbilityFiles: () => ipcRenderer.invoke('load-all-ability-files'),
  // 知识库文件数据持久化（Markdown 格式，存储在 knowledges 目录）
  saveKnowledgeFile: (name: string, content: string) =>
    ipcRenderer.invoke('save-knowledge-file', name, content),
  loadKnowledgeFile: (name: string) => ipcRenderer.invoke('load-knowledge-file', name),
  deleteKnowledgeFile: (name: string) => ipcRenderer.invoke('delete-knowledge-file', name),
  loadAllKnowledgeFiles: () => ipcRenderer.invoke('load-all-knowledge-files'),
  // 项目相关 API
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  loadAppConfig: () => ipcRenderer.invoke('load-app-config'),
  saveAppConfig: (config: any) => ipcRenderer.invoke('save-app-config', config),
  initProjectDir: (projectPath: string) => ipcRenderer.invoke('init-project-dir', projectPath),
  setProjectPath: (projectPath: string) => ipcRenderer.invoke('set-project-path', projectPath),
  // 知识图谱配置 API（存储在 .ocean 目录）
  loadKnowledgeGraphConfig: () => ipcRenderer.invoke('load-knowledge-graph-config'),
  saveKnowledgeGraphConfig: (config: any) => ipcRenderer.invoke('save-knowledge-graph-config', config),
  // 设置模块 API
  testLLMConnection: (provider: any) => ipcRenderer.invoke('test-llm-connection', provider),
  testExecutablePath: (filePath: string) => ipcRenderer.invoke('test-executable-path', filePath),
  // LLM 调用 API (绑过 CORS)
  callLLMApi: (provider: any, prompt: string, model?: string) => ipcRenderer.invoke('call-llm-api', { provider, prompt, model }),
  // LLM 配置文件 API
  saveLLMConfig: (config: any) => ipcRenderer.invoke('save-llm-config', config),
  loadLLMConfig: () => ipcRenderer.invoke('load-llm-config'),
  // Agentic 配置文件 API
  saveAgenticConfig: (config: any) => ipcRenderer.invoke('save-agentic-config', config),
  loadAgenticConfig: () => ipcRenderer.invoke('load-agentic-config'),
  // Agentic 工具执行 API
  executeAgenticTool: (params: any) => ipcRenderer.invoke('execute-agentic-tool', params),
  // Agent Loop API（真正的 LLM 驱动工具调用）
  runAgentLoop: (config: any) => ipcRenderer.invoke('run-agent-loop', config),
  abortAgentLoop: () => ipcRenderer.invoke('abort-agent-loop'),
  // Agent Loop 事件监听
  onAgentLoopEvent: (callback: (event: any) => void) => {
    const listener = (_event: any, data: any) => callback(data)
    ipcRenderer.on('agent-loop-event', listener)
    return () => ipcRenderer.removeListener('agent-loop-event', listener)
  },
  // 能力模块模板文件 API
  saveAbilityTemplateFile: (templateType: 'llm-create' | 'llm-optimize' | 'agentic-create' | 'agentic-optimize', content: string) =>
    ipcRenderer.invoke('save-ability-template-file', templateType, content),
  loadAbilityTemplateFile: (templateType: 'llm-create' | 'llm-optimize' | 'agentic-create' | 'agentic-optimize') =>
    ipcRenderer.invoke('load-ability-template-file', templateType)
})