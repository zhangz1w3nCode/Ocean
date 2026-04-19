# LLM 集成设计文档

> 本文档描述项目中 LLM 能力的集成设计，包括配置管理、调用服务和智能创建功能。

---

## 版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-03-10 | 初始版本，支持 LLM 配置管理和智能创建功能 |
| 2.0 | 2026-03-12 | 集成 pi-mono SDK，统一 LLM API 接口 |
| 2.1 | 2026-03-13 | 修复 JSON 解析器，支持嵌套 Markdown 代码块 |
| 2.2 | 2026-03-17 | 添加模型参数配置功能，支持自定义温度、max tokens 等参数 |
| 2.3 | 2026-03-17 | 修正 temperature 参数范围为 0-1，兼容 MiniMax 等模型 |

---

## 一、设计目标

### 1.1 核心目标

- 提供统一的 LLM 调用能力，支持多种提供商
- 配置持久化到本地文件，重启后保持配置
- 通过 Electron 主进程绑过 CORS 限制
- 为智能创建等功能提供基础设施

### 1.2 设计原则

- **统一接口**: 不同 LLM 提供商使用统一的调用接口
- **本地优先**: 配置存储在本地文件，不依赖云端
- **增量更新**: 配置文件支持增量读写，避免全量覆盖
- **可扩展**: 便于后续添加新的 LLM 提供商

### 1.3 pi-mono SDK 集成

从版本 2.0 开始，项目使用 **pi-mono SDK** (`@mariozechner/pi-ai`) 作为底层 LLM 调用库：

- **统一 API**: pi-mono 封装了 20+ LLM 提供商的差异
- **类型安全**: 完整的 TypeScript 类型支持
- **成本跟踪**: 内置 Token 使用和成本计算
- **可扩展**: 支持未来集成 pi-agent-core 实现工具调用

---

## 二、配置管理设计

### 2.1 配置文件位置

```
.ocean/
├── llm-config.json     # LLM 提供商配置列表
└── ...
```

### 2.2 配置文件格式

```json
{
  "providers": [
    {
      "id": "provider-xxx",
      "name": "OpenAI GPT-4",
      "type": "openai",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-...",
      "defaultModel": "gpt-4",
      "availableModels": ["gpt-4", "gpt-3.5-turbo"],
      "modelParams": {
        "temperature": 0.7,
        "maxTokens": 4096,
        "topP": 0.9,
        "frequencyPenalty": 0.5,
        "presencePenalty": 0.3
      },
      "isEnabled": true,
      "createdAt": "2026-03-10T10:00:00Z",
      "updatedAt": "2026-03-17T10:00:00Z"
    }
  ]
}
```

### 2.3 提供商字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 唯一标识 |
| name | string | 是 | 提供商名称 |
| type | enum | 是 | openai / anthropic / azure / custom |
| baseUrl | string | 是 | API 基础 URL |
| apiKey | string | 是 | API 密钥 |
| defaultModel | string | 否 | 默认模型 |
| availableModels | string[] | 否 | 可用模型列表 |
| modelParams | object | 否 | 模型参数配置（v2.2 新增） |
| isEnabled | boolean | 是 | 是否启用 |
| createdAt | string | 是 | 创建时间 |
| updatedAt | string | 是 | 更新时间 |

### 2.4 模型参数配置 (v2.2)

#### 2.4.1 modelParams 字段说明

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| temperature | number | 0-1 | 0.7 | 控制输出随机性，值越高输出越随机。注意：为保证兼容性，范围限制为 0-1 |
| maxTokens | number | 1-1000000 | 4096 | 最大输出 token 数量 |
| topP | number | 0-1 | - | 核采样参数，建议与 temperature 二选一 |
| topK | number | 1-∞ | - | Top-k 采样参数 |
| frequencyPenalty | number | 0-2 | 0 | 降低重复相同内容的概率 |
| presencePenalty | number | 0-2 | 0 | 降低重复谈论相同主题的概率 |
| stopSequences | string[] | - | - | 停止生成的序列 |

> **重要说明 (v2.3)**: 虽然 OpenAI 等 API 文档标称 temperature 支持 0-2，但 MiniMax、国产大模型等多数模型只支持 0-1 范围。为避免 `SocketError: other side closed` 错误，UI 层限制 temperature 范围为 0-1。

#### 2.4.2 参数应用策略

不同提供商支持的参数有所不同：

| 提供商 | temperature | maxTokens | topP | frequencyPenalty | presencePenalty |
|--------|-------------|-----------|------|------------------|-----------------|
| OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anthropic | ❌ | ✅ (max_tokens) | ❌ | ❌ | ❌ |
| Azure | ✅ | ✅ | ✅ | ✅ | ✅ |
| Custom | ✅ | ✅ | ✅ | ✅ | ✅ |

**注意**: Anthropic 格式只支持 `max_tokens` 参数，不支持其他可选参数。

### 2.4 增量更新策略

| 操作 | 策略 |
|------|------|
| 添加 | 读取现有配置 → 追加新提供商 → 写入文件 |
| 更新 | 读取现有配置 → 更新对应提供商 → 写入文件 |
| 删除 | 读取现有配置 → 删除对应提供商 → 写入文件 |
| 设为默认 | 更新旧默认 → 更新新默认 |

---

## 三、LLM 调用服务设计

### 3.1 服务架构 (v2.0 - pi-mono)

```
┌─────────────────────────────────────────────────────┐
│                    前端组件                          │
│         (AbilityModal, LLMSettings 等)              │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              llmService.ts (调用服务)                │
│  - generateWithLLM(): 使用 pi-mono 生成内容          │
│  - parseAbilityJSON(): 解析JSON响应                  │
│  - testLLMConnection(): 测试连接                     │
│  - getSupportedProviders(): 获取支持的提供商         │
└─────────────────────┬───────────────────────────────┘
                      │
        ┌─────────────┴─────────────┐
        │                           │
        ▼                           ▼
┌──────────────────┐      ┌──────────────────────────────┐
│ 浏览器环境        │      │ Electron 环境                │
│ 直接使用 pi-mono │      │ IPC 通信绕过 CORS            │
│ SDK 调用         │      │ call-llm-api /               │
│                  │      │ test-llm-connection          │
└──────────────────┘      └──────────────┬───────────────┘
                                         │
                                         ▼
                            ┌────────────────────────────┐
                            │ Electron 主进程 (main.ts)  │
                            │ - getModel(): 获取模型实例 │
                            │ - complete(): 调用 pi-mono │
                            │ - 统一错误处理              │
                            └────────────────────────────┘
```

### 3.2 pi-mono SDK 集成

#### 3.2.1 核心 API

```typescript
import { getModel, complete, type Context } from '@mariozechner/pi-ai'

// 获取模型实例
const model = getModel(provider, modelId)

// 构建上下文
const context: Context = {
  messages: [
    { role: 'user', content: prompt, timestamp: Date.now() }
  ]
}

// 调用 LLM
const response = await complete(model, context, {
  apiKey,
  temperature: 0.7,
})
```

#### 3.2.2 提供商映射

| Ocean 类型 | pi-mono 提供商 | 说明 |
|-----------|---------------|------|
| openai | openai | OpenAI API |
| anthropic | anthropic | Anthropic Claude |
| azure | azure-openai | Azure OpenAI |
| google | google | Google Gemini |
| groq | groq | Groq 推理平台 |
| xai | xai | xAI Grok |
| mistral | mistral | Mistral AI |
| openrouter | openrouter | OpenRouter 聚合 |
| custom | openai-compatible | 自定义兼容接口 |

#### 3.2.3 响应格式

```typescript
interface LLMResponse {
  success: boolean
  content?: string      // LLM 生成的文本内容
  usage?: Usage         // Token 使用情况
  error?: string        // 错误信息
}

interface Usage {
  input: number         // 输入 Token 数
  output: number        // 输出 Token 数
  cacheRead?: number    // 缓存读取 Token 数
  cacheWrite?: number   // 缓存写入 Token 数
  totalTokens: number   // 总 Token 数
  cost: {
    input: number       // 输入成本
    output: number      // 输出成本
    cacheRead?: number  // 缓存读取成本
    cacheWrite?: number // 缓存写入成本
    total: number       // 总成本
  }
}
```

### 3.3 旧版 API 格式 (v1.0 - 已弃用)

以下格式在 v1.0 版本中使用，v2.0 版本已迁移到 pi-mono SDK：

#### OpenAI 兼容格式

```typescript
{
  model: "gpt-4",
  messages: [{ role: "user", content: "..." }],
  temperature: 0.7,
  max_tokens: 262144
}
```

#### Anthropic 格式

```typescript
{
  model: "claude-3-haiku-20240307",
  max_tokens: 262144,
  messages: [{ role: "user", content: "..." }]
}
```

### 3.4 请求头设置 (v1.0)

| 提供商类型 | 认证头 |
|-----------|--------|
| OpenAI | `Authorization: Bearer {apiKey}` |
| Anthropic | `x-api-key: {apiKey}` |
| Azure | `api-key: {apiKey}` |
| Custom | `Authorization: Bearer {apiKey}` |

---

## 四、智能创建功能设计

### 4.1 功能流程

```
┌──────────────────────────────────────────────────────────┐
│  用户选择"智能创建"                                        │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  用户输入能力描述                                          │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  从配置文件读取默认LLM提供商                                │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  构建提示词 (模板 + 用户描述)                               │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  调用 LLM API                                             │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  解析 JSON 响应 (支持代码块嵌套)                           │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  填充表单，切换到手动编辑模式                               │
└─────────────────────┬────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────┐
│  用户二次编辑，确认保存                                     │
└──────────────────────────────────────────────────────────┘
```

### 4.2 JSON 解析策略

#### 4.2.1 解析流程

1. 优先匹配 ` ```json ... ``` ` 格式
2. 使用字符级解析处理嵌套的 Markdown 代码块
3. 追踪字符串状态和代码块深度，确保正确匹配外层代码块结束位置
4. 备选：直接匹配 JSON 对象 `{...}`

#### 4.2.2 嵌套代码块处理

LLM 返回的 JSON 中 `content` 字段可能包含嵌套的 Markdown 代码块（如 ` ```markdown `），简单的正则表达式无法正确处理。解决方案：

```typescript
const extractJSONFromCodeBlock = (content: string): string | null => {
  // 查找 ```json 或 ``` 开头的位置
  const startMatch = content.match(/```(?:json)?\s*/i)
  if (!startMatch) return null

  const afterStart = startMatch.index! + startMatch[0].length

  // 字符级解析，处理嵌套代码块
  let depth = 1
  let pos = afterStart
  let inString = false
  let escapeNext = false

  while (pos < content.length && depth > 0) {
    const char = content[pos]

    if (escapeNext) {
      escapeNext = false
      pos++
      continue
    }

    if (char === '\\') {
      escapeNext = true
      pos++
      continue
    }

    if (char === '"' && !inString) {
      inString = true
    } else if (char === '"' && inString) {
      inString = false
    }

    // 只在字符串外部检查 ```
    if (!inString) {
      if (content.substring(pos, pos + 3) === '```') {
        depth--
        if (depth === 0) {
          return content.substring(afterStart, pos).trim()
        }
        pos += 3
        continue
      }
    }

    pos++
  }

  return content.substring(afterStart).trim()
}
```

#### 4.2.3 关键设计点

| 问题 | 解决方案 |
|------|----------|
| 正则无法处理嵌套 | 使用字符级解析，状态机追踪 |
| 字符串内的 `"` | 正确处理转义字符 |
| 嵌套代码块深度 | 计数器追踪，匹配到外层闭合 |
| 性能 | 单次遍历，O(n) 时间复杂度 |

### 4.3 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 无默认提供商 | Toast 提示"请先配置默认 LLM 提供商" |
| API 调用失败 | Toast 显示具体错误信息 |
| JSON 解析失败 | Toast 提示"无法解析 LLM 返回的内容" |

---

## 五、IPC 通道设计

### 5.1 通道列表

| 通道名 | 方向 | 说明 |
|--------|------|------|
| `call-llm-api` | 渲染进程 → 主进程 | 调用 LLM API |
| `save-llm-config` | 渲染进程 → 主进程 | 保存配置文件 |
| `load-llm-config` | 渲染进程 → 主进程 | 加载配置文件 |

### 5.2 call-llm-api 参数 (v2.0)

```typescript
{
  provider: LLMProvider,  // 提供商配置
  prompt: string,         // 提示词
  model?: string          // 可选，覆盖默认模型
}
```

### 5.3 返回格式 (v2.0)

```typescript
{
  success: boolean,
  content?: string,  // LLM 响应内容
  usage?: Usage,     // Token 使用情况 (pi-mono 格式)
  error?: string     // 错误信息
}
```

### 5.4 Electron 主进程实现 (v2.0)

```typescript
// main.ts
import { getModel, complete } from '@mariozechner/pi-ai'

ipcMain.handle('call-llm-api', async (event, provider, prompt, modelId) => {
  const piProvider = PI_MONO_PROVIDER_MAP[provider.type]
  const model = getModel(piProvider, modelId || provider.defaultModel)

  const context = {
    messages: [{ role: 'user', content: prompt, timestamp: Date.now() }]
  }

  const response = await complete(model, context, {
    apiKey: provider.apiKey,
    temperature: 0.7,
  })

  return {
    success: true,
    content: extractTextContent(response),
    usage: response.usage
  }
})
```

---

## 六、扩展设计

### 6.1 支持更多提供商

可通过扩展 `type` 枚举添加新提供商:

```typescript
type LLMProviderType = 'openai' | 'anthropic' | 'azure' | 'custom' | 'new-provider'
```

### 6.2 智能创建模板扩展

可根据不同业务场景配置不同的提示词模板:

- 能力创建模板
- 节点创建模板
- 智能体创建模板

### 6.3 流式输出

后续可添加流式输出支持，实现打字机效果:

```typescript
ipcMain.handle('call-llm-api-stream', ...)
```

### 6.4 pi-agent-core 集成计划 (v3.0)

未来版本计划集成 `@mariozechner/pi-agent-core` 实现 Agent 能力:

#### 6.4.1 工具调用支持

```typescript
import { Agent, type Tool } from '@mariozechner/pi-agent-core'

const tools: Tool[] = [
  {
    name: 'read_file',
    description: '读取本地文件内容',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' }
      },
      required: ['path']
    },
    execute: async ({ path }) => {
      return fs.readFileSync(path, 'utf-8')
    }
  },
  {
    name: 'bash',
    description: '执行终端命令',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '命令' },
        workingDir: { type: 'string', description: '工作目录' }
      },
      required: ['command']
    },
    execute: async ({ command, workingDir }) => {
      return execSync(command, { cwd: workingDir })
    }
  }
]
```

#### 6.4.2 Agent 执行循环

```
┌─────────────────────────────────────────────┐
│              Agent 执行循环                  │
├─────────────────────────────────────────────┤
│ 1. 接收用户输入                              │
│ 2. 调用 LLM 生成响应                         │
│ 3. 检测工具调用请求                          │
│ 4. 执行工具                                  │
│ 5. 将工具结果返回给 LLM                      │
│ 6. 生成最终响应                              │
│ 7. 循环直到完成                              │
└─────────────────────────────────────────────┘
```

#### 6.4.3 事件驱动架构

| 事件 | 说明 |
|------|------|
| `agent_start` | Agent 开始执行 |
| `turn_start` | 新一轮对话开始 |
| `message_update` | LLM 生成内容更新 |
| `tool_execution` | 工具执行中 |
| `tool_result` | 工具执行完成 |
| `agent_end` | Agent 执行结束 |

---

## 七、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-03-10 | 初始版本，支持 LLM 配置管理和智能创建功能 |
| 2.0 | 2026-03-12 | 集成 pi-mono SDK，统一 LLM API 接口，支持 20+ 提供商 |
| 2.1 | 2026-03-13 | 修复 JSON 解析器，支持嵌套 Markdown 代码块（智能创建功能）|

---

*本文档持续更新中，如有新的设计规范请及时补充。*