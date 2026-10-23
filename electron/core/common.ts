// core 层公共契约入口：聚合各领域（task、resource、agent 等）的统一操作与类型。
// 统一契约：原子操作返回 { success: true, ...data } | { success: false, error }，
// 业务校验失败不抛异常；适配层（source/cli、source/desktop）从这里取契约，
// 各自转换为 CLI 异常语义（exit 1/2）或 IPC 透传语义。

export {
  TASK_STATUSES,
  listTasks,
  readTaskDetail,
  createTask,
  updateTask,
  searchTasks,
  saveTaskContext,
} from './task/operate'
export type {
  TaskSummary,
  TaskTraceEvent,
  TaskContextItem,
  TaskDetail,
  TaskWritePayload,
  TaskContextPayload,
  TaskSearchMatch,
  TaskSearchResult,
  TaskSearchOpts,
} from './task/operate'

export {
  saveResourceFile,
  readResourceFile,
  deleteResourceFile,
  listResourceFiles,
  listResources,
  readResource,
  createResource,
  updateResource,
  delResource,
} from './resource/operate'
export type { ResourceWriteOpts } from './resource/operate'

export {
  saveAgentFile,
  readAgentFile,
  deleteAgentFile,
  listAgentFiles,
  listAgents,
  readAgent,
  createAgent,
  updateAgent,
  delAgent,
} from './agent/operate'
export type { AgentWriteOpts } from './agent/operate'

export {
  createSkillDirectory,
  saveSkillFile,
  readSkillFile,
  deleteSkillDirectory,
  listSkillDirectories,
  saveSkillResource,
  readSkillResource,
  deleteSkillResource,
  listSkillResourceFiles,
  saveSkillTemplateFile,
  readSkillTemplateFile,
  listSkills,
  readSkill,
  createSkill,
  updateSkill,
  delSkill,
} from './skill/operate'
export type { SkillDirectoryInput } from './skill/operate'

export {
  saveKnowledgeFile,
  readKnowledgeFile,
  deleteKnowledgeFile,
  listKnowledgeFiles,
  listKnowledgeFolders,
  getKnowledgeGitStatus,
  initKnowledgeGit,
  getKnowledgeGitLog,
  showKnowledgeGitRevision,
  commitKnowledgeGit,
  rollbackKnowledgeGit,
  readKnowledgeGitConfig,
  writeKnowledgeGitConfig,
  getKnowledgeBaseline,
  readKnowledgeGraphConfig,
  writeKnowledgeGraphConfig,
  saveKnowledgeTemplateFile,
  readKnowledgeTemplateFile,
  listKnowledges,
  readKnowledge,
  createKnowledge,
  updateKnowledge,
  delKnowledge,
  createKnowledgeDomain,
  listKnowledgeDomainTree,
  listKnowledgeDomainSubtree,
  searchKnowledgeDomains,
  updateKnowledgeDomain,
  searchKnowledges,
} from './knowledge/operate'
export type {
  KnowledgeWriteOpts,
  DomainInfo,
  DomainNode,
  KnowledgeFolder,
  KnowledgeGitCommitInfo,
  KnowledgeSearchMatch,
  KnowledgeSearchResult,
  KnowledgeSearchOpts,
} from './knowledge/operate'

export {
  saveNodeFile,
  readNodeFile,
  deleteNodeFile,
  listNodeFiles,
  saveLocalNode,
  readLocalNode,
  deleteLocalNode,
  listLocalNodes,
  listNodes,
  readNode,
  createNode,
  updateNode,
  delNode,
} from './node/operate'
export type { NodeWriteOpts } from './node/operate'

export {
  saveWorkflowFile,
  readWorkflowFile,
  deleteWorkflowFile,
  listWorkflowFiles,
  createWorkflowFolder,
  readWorkflowMdFile,
  saveWorkflowMdFile,
  readWorkflowFlowJson,
  saveWorkflowFlowJson,
  listWorkflowFolders,
  deleteWorkflowFolder,
  renameWorkflowFolder,
  listWorkflowInstances,
  readInstanceFile,
  readInstanceDetail,
  watchInstanceDetail,
  createWorkflow,
  deleteWorkflow,
  renameWorkflow,
  readWorkflowMd,
  readWorkflowFlow,
  addWorkflowNode,
  connectWorkflowNodes,
  addWorkflowBranch,
  removeWorkflowNode,
  disconnectWorkflowNodes,
  listWorkflowNodes,
  listWorkflowEdges,
  generateWorkflow,
  doctorWorkflow,
  listWorkflowLocalNodes,
  readWorkflowLocalNode,
  createWorkflowLocalNode,
  deleteWorkflowLocalNode,
} from './workflow/operate'
export type {
  WorkflowNodeAddOpts,
  InstanceWatcherHandle,
  InstanceDetailDelta,
} from './workflow/operate'
