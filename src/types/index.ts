// 导航菜单项
export interface NavItem {
  id: string
  label: string
  icon: string
}

// 项目定义
export interface Project {
  id: string                    // 唯一标识（路径 hash）
  name: string                  // 项目名称（文件夹名）
  path: string                  // 项目绝对路径
  lastOpenedAt: string          // 最后打开时间
}

// 知识图谱配置
export interface KnowledgeGraphConfig {
  nodeSize: number           // 节点大小 (3-10)
  linkDistance: number       // 连线长度
  linkWidth: number          // 连线粗细 (0.30-1.0)
  labelSize: number          // 节点标签大小 (4-10)
  relationLabelSize: number  // 关系标签大小 (3-7)
  showRelationLabel: boolean // 是否展示节点关系标签
  centerForce: number        // 向心力 (0-0.1)
  linkStrength: number       // 相连节点吸引力 (0-1)
  chargeStrength: number     // 节点互斥力 (0-200)
}

// 应用配置
export interface AppConfig {
  recentProjects: Project[]     // 最近打开的项目列表
  lastProjectPath: string | null  // 上次打开的项目路径
  maxRecentProjects: number     // 最大最近项目数
  sidebarNavOrder?: string[]    // 侧边栏导航项顺序（存储 PageType 的 id）
  knowledgeGraphConfig?: KnowledgeGraphConfig  // 知识图谱配置
}

// 导入 React Flow 类型用于 Workflow
import type { ReactFlowNode, ReactFlowEdge } from './flow'

// 工作流
export interface Workflow {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  nodes: ReactFlowNode[]
  edges: ReactFlowEdge[]
  nodeCount?: number
  thumbnail?: string
  // 新增字段：支持文件夹结构
  folderPath?: string // 工作流文件夹路径（相对于.claude/workflows/）
  hasMetadata?: boolean // 是否有meta-data目录
  inputs?: string[] // 输入物料
  outputs?: string[] // 输出产物
  requiredActions?: string[] // 强制同时必须要做的事
  forbiddenActions?: string[] // 禁止同时严禁不能做的事
  customFields?: CustomField[] // 自定义字段
}

// 流程图画板节点 (旧类型，保留兼容)
export interface FlowNode {
  id: string
  type: 'start' | 'process' | 'decision' | 'end' | 'business'
  position: { x: number; y: number }
  data: NodeData
}

// 流程图画板连线 (旧类型，保留兼容)
export interface FlowEdge {
  id: string
  source: string
  target: string
  label?: string
  type?: 'default' | 'smoothstep' | 'straight' | 'bezier' | 'step'
}

// 节点数据
export interface NodeData {
  label: string
  description?: string
  // 业务节点特有配置
  businessType?: string
  config?: Record<string, any>
  inputs?: string[]
  outputs?: string[]
}

// 自定义字段
export interface CustomField {
  id: string
  name: string
  value: string
}

// 分支配置
export interface Branch {
  id: string
  name: string
  description?: string
}

// 工作流流程数据 (存储在 flow.json)
export interface FlowData {
  nodes: ReactFlowNode[] // 节点数据
  edges: ReactFlowEdge[] // 边数据
  viewport?: {
    // 视口数据
    x: number
    y: number
    zoom: number
  }
}

// 资源文件类型
export type ResourceFileType = 'rule' | 'reference' | 'tool'

// 资源文件定义
export interface ResourceFile {
  id: string
  name: string
  type: ResourceFileType
  description?: string
  content?: string
  createdAt: string
  updatedAt: string
}

// 节点文件类型
export type NodeFileType = 'process' | 'business'

// 节点文件定义（与其他业务模块保持一致：名称、类型、描述、内容）
export interface NodeDefinition {
  id: string
  name: string // 从 frontmatter 的 name 字段读取
  type: NodeFileType // 从 frontmatter 的 type 字段读取
  description: string // 从 frontmatter 的 description 字段读取
  content: string // frontmatter 后的内容
  createdAt: string
  updatedAt: string // 从文件系统获取
}

// 智能体文件类型
export type AgentFileType = 'sub-agent' | 'mcp'

// 智能体文件定义
export interface AgentFile {
  id: string
  name: string // 从 frontmatter 的 name 字段读取
  type: AgentFileType // 固定为 'sub-agent'
  description: string // 从 frontmatter 的 description 字段读取
  model: string // 从 frontmatter 的 model 字段读取
  color: string // 从 frontmatter 的 color 字段读取
  content: string // frontmatter 后的内容
  createdAt: string
  updatedAt: string // 从文件系统获取
}

// 命令文件类型
export type CommandFileType = 'command'

// 命令文件定义
export interface CommandFile {
  id: string
  name: string // 从 frontmatter 的 name 字段读取
  type: CommandFileType // 固定为 'command'
  description: string // 从 frontmatter 的 description 字段读取
  content: string // frontmatter 后的内容
  createdAt: string
  updatedAt: string // 从文件系统获取
}

// 能力文件类型
export type AbilityFileType = 'ability'

// 能力文件定义
export interface AbilityFile {
  id: string
  name: string // 从 frontmatter 的 name 字段读取
  type: AbilityFileType // 固定为 'ability'
  description: string // 从 frontmatter 的 description 字段读取
  content: string // frontmatter 后的内容
  createdAt: string
  updatedAt: string // 从文件系统获取
}

// 知识库文件类型
export type KnowledgeFileType = 'knowledge'

// 知识库文件定义
export interface KnowledgeFile {
  id: string
  name: string // 从 frontmatter 的 name 字段读取
  type: KnowledgeFileType // 固定为 'knowledge'
  description: string // 从 frontmatter 的 description 字段读取
  content: string // frontmatter 后的内容
  tags: string[] // 标签数组
  category?: string // 分类路径（如 "backend" 或 "backend/v2"），对应子目录结构
  filepath?: string // 完整文件相对路径（如 "backend/api"），用于文件系统操作
  createdAt: string
  updatedAt: string // 从文件系统获取
}

// 引用分类类型
export type ReferenceCategory = 'agents' | 'nodes' | 'workflows' | 'resources' | 'commands' | 'abilities' | 'knowledges' | 'skills'

// 引用项定义
export interface ReferenceItem {
  id: string
  name: string
  category: ReferenceCategory
  path: string  // 相对路径，如 ".claude/agents/智能体名.md" 或 ".claude/agents/"
  description?: string
  isLibrary?: boolean  // 是否引用整个库
}

// ========== 设置模块类型定义 ==========

// Token 使用情况（pi-mono 格式）
export interface Usage {
  input: number
  output: number
  cacheRead?: number
  cacheWrite?: number
  totalTokens: number
  cost: {
    input: number
    output: number
    cacheRead?: number
    cacheWrite?: number
    total: number
  }
}

// LLM 提供商类型
export type LLMProviderType = 'openai' | 'anthropic' | 'azure' | 'custom'

// LLM 提供商配置
// LLM 模型参数配置
export interface LLMModelParams {
  temperature?: number           // 温度 (0-2),默认 0.7
  maxTokens?: number             // 最大输出 token 数,默认 4096
  topP?: number                  // Top-p 采样 (0-1)
  topK?: number                  // Top-k 采样
  frequencyPenalty?: number      // 频率惩罚 (0-2)
  presencePenalty?: number       // 存在惩罚 (0-2)
  stopSequences?: string[]       // 停止序列
}

export interface LLMProvider {
  id: string                     // 唯一标识
  name: string                   // 提供商名称
  type: LLMProviderType          // 提供商类型
  baseUrl: string                // Base URL
  apiKey: string                 // API Key
  defaultModel: string           // 默认模型
  availableModels: string[]      // 可用模型列表
  modelParams?: LLMModelParams   // 模型参数配置
  isEnabled: boolean             // 是否启用
  createdAt: string              // 创建时间
  updatedAt: string              // 更新时间
  lastTestedAt?: string          // 最后测试时间
  testStatus?: 'success' | 'failed' | 'testing'  // 测试状态
}

// CLI Agent 类型
export type CLIAgentType = 'claude-cli' | 'cursor-cli' | 'custom'

// CLI Agent 配置
export interface CLIAgent {
  id: string                     // 唯一标识
  name: string                   // Agent 名称
  type: CLIAgentType             // Agent 类型
  executablePath: string         // 可执行文件路径
  description: string            // 描述
  isDefault: boolean             // 是否默认
  isEnabled: boolean             // 是否启用
  createdAt: string              // 创建时间
  updatedAt: string              // 更新时间
  lastTestedAt?: string          // 最后测试时间
  testStatus?: 'success' | 'failed' | 'testing'  // 测试状态
}

// 设置分类
export type SettingsCategory = 'llm' | 'agentic' | 'ability' | 'skill' | 'knowledge' | 'agent' | 'command' | 'node' | 'resource' | 'workflow'

// 设置项接口
export interface SettingsItem {
  id: SettingsCategory
  label: string
  icon: string  // Lucide 图标名称
  description: string
}

// ========== 能力配置类型定义 ==========

// 能力配置(LLM创建提示词模板)
export interface AbilityConfig {
  promptTemplate: string        // 能力LLM创建的提示词模板
  optimizePromptTemplate: string // 能力优化的提示词模板
  updatedAt: string             // 更新时间
}

// ========== Agentic 配置类型定义 ==========

// Agentic 工具类型 - 使用 @mariozechner/pi-coding-agent 提供的工具
export type AgenticToolType =
  | 'file-read'      // 读取文件内容
  | 'file-write'     // 写入文件
  | 'file-edit'      // 编辑文件（查找替换）
  | 'file-ls'        // 列出目录内容
  | 'file-grep'      // 搜索文件内容
  | 'file-find'      // 查找文件
  | 'bash-execute'   // 执行终端命令

// Agentic 工具配置
export interface AgenticToolConfig {
  type: AgenticToolType
  enabled: boolean
  description: string
}

// Agentic 模式配置
export interface AgenticConfig {
  enabled: boolean           // 是否启用 Agentic 模式
  providerId?: string        // 指定使用的 LLM 提供商 ID（可选，默认使用启用的第一个）
  modelId?: string           // 指定使用的模型 ID（可选，默认使用提供商的默认模型）
  tools: AgenticToolConfig[] // 启用的工具列表
  maxIterations: number      // 最大迭代次数
  timeout: number            // 超时时间（秒）
  updatedAt: string          // 更新时间
}

// ========== Agent Loop 类型定义 ==========

// Agent Loop 事件类型
export type AgentLoopEventType =
  | 'agent_start'      // Agent 开始执行
  | 'agent_end'        // Agent 执行结束
  | 'turn_start'       // 单轮开始
  | 'turn_end'         // 单轮结束
  | 'thinking'         // LLM 正在思考
  | 'tool_call'        // 工具调用
  | 'tool_result'      // 工具执行结果
  | 'message'          // LLM 消息
  | 'error'            // 错误

// Agent Loop 事件
export interface AgentLoopEvent {
  type: AgentLoopEventType
  timestamp: string
  data: {
    // agent_start / agent_end
    task?: string
    success?: boolean
    result?: string
    totalTurns?: number
    totalToolCalls?: number
    duration?: number
    // turn_start / turn_end
    turnNumber?: number
    // thinking
    content?: string
    // tool_call
    toolName?: string
    toolArgs?: Record<string, unknown>
    // tool_result
    toolOutput?: string
    toolSuccess?: boolean
    // error
    error?: string
  }
}

// Agent Loop 配置
export interface AgentLoopConfig {
  provider: LLMProvider      // LLM 提供商配置
  model: string              // 模型 ID
  tools: AgenticToolConfig[] // 启用的工具列表
  maxIterations: number      // 最大迭代次数
  timeout: number            // 超时时间（秒）
  projectPath: string        // 项目路径
  task: string               // 用户任务
}

// ========== 技能模块类型定义 ==========

// 技能文件类型
export type SkillFileType = 'skill'

// 技能资源文件
export interface SkillResource {
  name: string          // 文件名
  path: string          // 相对路径
  type: 'scripts' | 'references' | 'examples'
  content?: string      // 文件内容（编辑时使用）
}

// 技能文件定义
export interface SkillFile {
  id: string
  name: string              // 从 frontmatter 的 name 字段读取
  type: SkillFileType       // 固定为 'skill'
  description: string       // 从 frontmatter 的 description 字段读取
  content: string           // SKILL.md frontmatter 后的内容
  scripts: string[]         // scripts 目录下的文件列表
  references: string[]      // references 目录下的文件列表
  examples: string[]        // examples 目录下的文件列表
  createdAt: string
  updatedAt: string         // 从文件系统获取
}

// 创建技能时的输入数据
export interface CreateSkillInput {
  name: string
  description?: string
  content: string
  scripts?: { name: string; content: string }[]
  references?: { name: string; content: string }[]
  examples?: { name: string; content: string }[]
}

// ========== Claude Code 类型定义 ==========

// Claude Code 流式事件类型
export type ClaudeCodeEventType =
  | 'thinking'      // 思考内容
  | 'text'          // 输出文本
  | 'tool_use'      // 工具调用
  | 'tool_result'   // 工具结果
  | 'system'        // 系统信息（包含 session_id）
  | 'stop'          // 停止信号
  | 'error'         // 错误

// Claude Code 流式事件（IPC 传输）
export interface ClaudeCodeEvent {
  type: ClaudeCodeEventType
  timestamp: string
  data: {
    content?: string
    toolName?: string
    toolInput?: Record<string, unknown>
    toolOutput?: string
    sessionId?: string
    stopReason?: string
    error?: string
  }
}

// Claude Code 执行配置
export interface ClaudeCodeExecuteConfig {
  prompt: string              // 用户提示词
  projectPath: string         // 项目路径
  sessionId?: string          // 可选：恢复会话ID
  maxTurns?: number           // 最大轮次
  permissionMode?: string     // 权限模式
}

// Claude Code 执行结果
export interface ClaudeCodeExecuteResult {
  success: boolean
  result: string              // 最终结果内容
  sessionId?: string          // 会话ID（用于后续恢复）
  error?: string              // 错误信息
}

// Claude Code 执行步骤（前端展示）
export interface ClaudeCodeStep {
  id: string
  type: ClaudeCodeEventType
  title: string
  content?: string
  timestamp: Date
  details?: {
    toolName?: string
    toolInput?: Record<string, unknown>
    toolOutput?: string
  }
}