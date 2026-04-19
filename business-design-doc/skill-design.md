# 技能模块前端设计规范

> 本文档总结了技能模块的前端UI设计、交互效果和视觉规范，参考命令模块设计规范编写。

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：与节点模块、资源文件模块、智能体模块、命令模块保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 颜色点缀仅用于图标标识
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、模块定位

### 2.1 技能模块概念

技能是一个**可复用的能力包**，包含一个主技能定义文件（SKILL.md）以及相关的脚本、参考文档和示例。与命令模块相比，技能模块支持更丰富的内容组织形式。

### 2.2 与命令模块的差异

| 特性 | 命令模块 | 技能模块 |
|------|----------|----------|
| 存储结构 | 单个 `.md` 文件 | 目录结构 |
| 元数据 | name + description | name + description |
| 脚本支持 | 无 | `scripts/` 子目录 |
| 参考文档 | 无 | `references/` 子目录 |
| 示例文档 | 无 | `examples/` 子目录 |
| 文件引用 | 不支持 | 支持 `@` 引用语法 |

### 2.3 使用场景

技能模块适用于需要以下能力的场景：
- 需要执行 Python 脚本的自动化任务
- 需要参考多个文档的复杂操作
- 需要提供操作示例的指导性任务
- 需要组合多种资源的复杂能力

---

## 三、数据持久化设计

### 3.1 存储格式

技能模块采用**目录结构持久化**，每个技能是一个独立的目录：

```
.claude/skills/
└── {skill-name}/                    # 技能目录，名称作为唯一标识
    ├── SKILL.md                     # 主技能定义文件（必需）
    ├── scripts/                     # 脚本目录（可选）
    │   ├── main.py                  # Python 脚本示例
    │   ├── utils.js                 # JavaScript 脚本示例
    │   └── ...
    ├── references/                  # 参考文档目录（可选）
    │   ├── api-docs.md              # API 参考文档
    │   ├── best-practices.md        # 最佳实践
    │   └── ...
    └── examples/                    # 示例文档目录（可选）
        ├── example-1.md             # 示例1
        ├── example-2.md             # 示例2
        └── ...
```

### 3.2 SKILL.md 文件格式

```markdown
---
name: code-analyzer
description: 分析代码质量并生成报告
---
# 技能内容

这是一个代码分析技能，可以：

## 执行步骤

1. 运行 `scripts/main.py` 进行代码分析
2. 参考 `references/analysis-rules.md` 了解分析规则
3. 查看 `examples/sample-output.md` 了解输出格式

## 引用资源

- 脚本：`scripts/main.py`
- 参考：`references/analysis-rules.md`
- 示例：`examples/sample-output.md`
```

### 3.3 Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 技能名称，作为目录名 |
| description | string | 否 | 技能描述 |

**与命令模块的差异**：
- 存储从单文件变为目录结构
- 支持通过相对路径引用子目录中的文件

### 3.4 子目录规范

#### scripts/ 目录

用于存放脚本文件，支持的文件类型：
- `.py` - Python 脚本
- `.js` - JavaScript 脚本
- `.sh` - Shell 脚本
- `.ts` - TypeScript 脚本

#### references/ 目录

用于存放参考文档，Markdown 格式：
- 技术文档
- API 说明
- 最佳实践
- 规则说明

#### examples/ 目录

用于存放示例文档，Markdown 格式：
- 使用示例
- 输出示例
- 案例说明

---

## 四、颜色体系

### 4.1 主色调

```
灰色系（主要使用）：
- 深灰（文字）：#1F2937 / text-gray-800
- 中灰（次要文字）：#6B7280 / text-gray-500
- 浅灰（边框）：#E5E7EB / border-gray-200
- 超浅灰（背景）：#F3F4F6 / bg-gray-100
- 纯白：#FFFFFF
```

### 4.2 技能图标颜色（统一使用紫罗兰色）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 紫罗兰 | #7C3AED | #EDE9FE |

技能模块使用紫罗兰色作为标识颜色，使用魔法棒图标（Wand2），体现技能的"魔法能力"特性。

---

## 五、组件设计

### 5.1 技能卡片 (SkillCard)

#### 整体布局

```
┌─────────────────────────────────────┐
│  [🪄] 技能名称              [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 技能说明 - 分析代码...     │   │  <- 内容预览区 (bg-gray-50)
│  │ - 第一步：检查...           │   │
│  │  📁 scripts/  📄 references/│   │  <- 资源统计标签
│  └─────────────────────────────┘   │
│                                     │
└─────────────────────────────────────┘
```

#### 设计规范

```tsx
<Card className="group relative p-0 cursor-pointer h-full flex flex-col">
  {/* 头部区域 */}
  <div className="px-4 pb-0 pt-4">
    <div className="flex items-start justify-between mb-2">
      {/* 左侧：Wand2（魔法棒）图标 + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-100">
          <Wand2 size={18} className="text-violet-600" strokeWidth={1.5} />
        </div>
        <h3 className="font-bold text-[17px] text-gray-900">
          {skill.name}
        </h3>
      </div>

      {/* 右侧：操作按钮（悬浮显示） */}
      <div className="flex items-center gap-1">
        <button className="opacity-0 group-hover:opacity-100">
          <Edit3 size={14} />
        </button>
        <button className="opacity-0 group-hover:opacity-100">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  </div>

  {/* 内容预览区 - 浅灰色背景 */}
  <div className="flex-1 mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
    <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
      {contentPreview}
    </p>
    {/* 资源统计 */}
    <div className="flex items-center gap-2 mt-2">
      {skill.hasScripts && (
        <span className="px-2 py-0.5 rounded text-xs bg-violet-50 text-violet-600">
          scripts
        </span>
      )}
      {skill.hasReferences && (
        <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
          references
        </span>
      )}
      {skill.hasExamples && (
        <span className="px-2 py-0.5 rounded text-xs bg-green-50 text-green-600">
          examples
        </span>
      )}
    </div>
  </div>
</Card>
```

#### 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | `p-0` | 移除默认 padding，内部自定义布局 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| Wand2 图标 | 32x32 圆角方形 | `bg-violet-100` 背景，`text-violet-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色，比之前更大 |
| 操作按钮 | 右上角，悬浮显示 | 编辑和删除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 圆角 `rounded-lg`，内边距 `p-4` |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字，最多显示 3 行 |
| 资源标签 | 彩色标签 | 显示包含的子目录类型 |

#### 资源统计标签

| 目录 | 标签样式 | 颜色 |
|------|----------|------|
| scripts | `bg-violet-50 text-violet-600` | 紫罗兰 |
| references | `bg-blue-50 text-blue-600` | 蓝色 |
| examples | `bg-green-50 text-green-600` | 绿色 |

#### 交互状态

| 状态 | 效果 |
|------|------|
| 默认 | 卡片无边框阴影，操作按钮隐藏 |
| 悬浮 | 卡片上浮 2px + 阴影，操作按钮显示 |
| 点击 | 触发 `onClick`，打开详情弹窗 |

---

## 六、创建/编辑弹窗设计

### 6.1 弹窗结构

```
┌─────────────────────────────────────────────────────────────┐
│  编辑技能                                             × 关闭 │  <- 头部区域
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  技能名称 *                                                 │
│  [________________________________________________________] │
│                                                             │
│  技能描述                                                   │
│  [________________________________________________________] │
│  [________________________________________________________] │
│  [________________________________________________________] │
│  [________________________________________________________] │
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │  <- 标签页切换
│  │ 技能内容 │ │  脚本    │ │ 参考文档 │ │  示例    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  技能内容 *                                           编辑│预览│
│  [________________________________________________________] │
│  [________________________________________________________] │
│  [________________________________________________________] │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                           取消        保存    │  <- 底部按钮区域
└─────────────────────────────────────────────────────────────┘
```

### 6.2 表单字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 技能名称 | Input | 是 | 唯一标识，编辑时不可修改 |
| 技能描述 | Textarea | 否 | 4行高度，简要描述技能用途 |
| 技能内容 | MarkdownEditor | 是 | 支持 Markdown 格式，支持编辑/预览切换 |

### 6.3 标签页切换设计

编辑模式下通过标签页切换管理不同内容：

```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│ 🪄 技能内容 │ │ 📜 脚本    │ │ 📄 参考文档 │ │ 📁 示例    │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
   选中状态        未选中        未选中        未选中
   白色背景       灰色背景      灰色背景      灰色背景
```

#### 标签页样式规范

```tsx
<div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1.5">
  {tabs.map((tab) => (
    <button
      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex-1 justify-center ${
        isActive
          ? 'bg-white text-gray-800 shadow-sm'
          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
      }`}
    >
      <Icon size={16} />
      {label}
    </button>
  ))}
</div>
```

### 6.4 资源文件管理

在编辑模式下，切换到"脚本"、"参考文档"、"示例"标签页可管理对应资源文件：

#### 文件列表展示

```
┌─────────────────────────────────────────────────────────────┐
│  📜 scripts/                                                │
├─────────────────────────────────────────────────────────────┤
│  📄 main.py                              [编辑] [🗑]        │
│  📄 utils.py                             [编辑] [🗑]        │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              + 添加文件                              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

#### 新建/编辑文件

点击"添加文件"或"编辑"按钮，在列表内展开编辑区域：

```
┌─────────────────────────────────────────────────────────────┐
│  新建文件                                              × 关闭 │
├─────────────────────────────────────────────────────────────┤
│  文件名                                                     │
│  [main.py_____________________________________________]     │
│                                                             │
│  文件内容                                                   │
│  [________________________________________________________] │
│  [________________________________________________________] │
│  [________________________________________________________] │
│                                                             │
│                                    取消        保存         │
└─────────────────────────────────────────────────────────────┘
```
│                                              关闭            │
└─────────────────────────────────────────────────────────────┘
```

---

## 七、详情弹窗设计

> **v1.1 更新**：详情页仅用于查看，资源管理功能已迁移至编辑页标签页。

### 7.1 弹窗结构

```
┌─────────────────────────────────────────────────────────────┐
│  [🪄] 技能名称         [skill]     更新于 2026-03-20        │  <- 头部固定区域
├─────────────────────────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）                            │
│                                                             │
│  技能描述                                                   │
│  [描述内容...]                                              │
│                                                             │
│  技能内容                                                   │
│  [Markdown 渲染内容...]                                     │
│                                                             │
│  包含资源:  scripts (2)  references (1)  examples (1)       │  <- 资源统计标签
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  关闭                                             [编辑]     │  <- 底部按钮区域
└─────────────────────────────────────────────────────────────┘
```

### 7.2 资源统计标签

详情页仅显示资源数量统计，不提供管理功能：

```tsx
{/* 资源文件统计 */}
{(skill.scripts?.length || 0) > 0 || ... ? (
  <div className="flex items-center gap-3 pt-2">
    <span className="text-xs text-macos-text-tertiary">包含资源:</span>
    {skill.scripts && skill.scripts.length > 0 && (
      <span className="px-2 py-0.5 rounded text-xs bg-violet-50 text-violet-600">
        scripts ({skill.scripts.length})
      </span>
    )}
    {skill.references && skill.references.length > 0 && (
      <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
        references ({skill.references.length})
      </span>
    )}
    {skill.examples && skill.examples.length > 0 && (
      <span className="px-2 py-0.5 rounded text-xs bg-green-50 text-green-600">
        examples ({skill.examples.length})
      </span>
    )}
  </div>
) : null}
```

---

## 八、页面布局设计

### 8.1 页面容器

```css
/* 页面外层容器 */
.page-wrapper {
  height: 100%;
  padding: 1rem;
}

/* 白色卡片容器 */
.page-card {
  height: 100%;
  background-color: white;
  border-radius: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

### 8.2 头部区域

```css
.page-header {
  height: 4rem;
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 不使用 border-bottom，保持简洁 */
}
```

### 8.3 内容区域

```css
.page-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}
```

---

## 九、类型定义

### 9.1 Skill 类型

```typescript
// 技能文件类型
export type SkillFileType = 'skill'

// 技能资源文件
export interface SkillResource {
  name: string          // 文件名
  path: string          // 相对路径
  type: 'script' | 'reference' | 'example'
  size?: number         // 文件大小（字节）
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
```

---

## 十、存储层接口设计

### 10.1 IPC 接口定义

```typescript
// 技能相关操作
interface SkillAPI {
  // 创建技能目录结构
  createSkill: (name: string, skillData: CreateSkillInput) => Promise<{ success: boolean; error?: string }>

  // 保存技能主文件
  saveSkillFile: (name: string, content: string) => Promise<{ success: boolean; error?: string }>

  // 加载技能主文件
  loadSkillFile: (name: string) => Promise<{ success: boolean; content: string | null; mtime: string | null; error?: string }>

  // 删除技能目录（包含所有子文件）
  deleteSkill: (name: string) => Promise<{ success: boolean; error?: string }>

  // 加载所有技能列表
  loadAllSkills: () => Promise<{ success: boolean; skills?: SkillFile[]; error?: string }>

  // 资源文件操作
  saveSkillResource: (skillName: string, resourceType: 'scripts' | 'references' | 'examples', fileName: string, content: string) => Promise<{ success: boolean; error?: string }>
  loadSkillResource: (skillName: string, resourceType: 'scripts' | 'references' | 'examples', fileName: string) => Promise<{ success: boolean; content: string | null; error?: string }>
  deleteSkillResource: (skillName: string, resourceType: 'scripts' | 'references' | 'examples', fileName: string) => Promise<{ success: boolean; error?: string }>
  listSkillResources: (skillName: string, resourceType: 'scripts' | 'references' | 'examples') => Promise<{ success: boolean; files?: string[]; error?: string }>
}
```

### 10.2 存储层变换

```typescript
// 解析技能 SKILL.md
const parseSkillFrontmatter = (content: string): { metadata: Record<string, any>; body: string } => {
  // 与命令模块相同的解析逻辑
}

// 生成技能 SKILL.md
const generateSkillMarkdown = (
  metadata: { name: string; description: string },
  content: string
): string => {
  return `---
name: ${metadata.name}
description: ${metadata.description}
---
${content}`
}

// 加载技能目录
const loadSkillDirectory = async (skillName: string): Promise<SkillFile> => {
  // 1. 读取 SKILL.md
  // 2. 解析 frontmatter
  // 3. 扫描子目录获取文件列表
  // 4. 组装 SkillFile 对象
}
```

---

## 十一、表单验证设计

### 11.1 验证规则

| 字段 | 规则 |
|------|------|
| 技能名称 | 必填，创建时检查唯一性，只能包含字母、数字、中划线、下划线 |
| 技能内容 | 必填 |

### 11.2 验证反馈方式

```tsx
// 1. Toast 提示
addToast('请输入技能名称', 'warning')

// 2. 输入框高亮
setInvalidFields(new Set(['name']))

// 3. 输入框恢复
setTimeout(() => setInvalidFields(new Set()), 3000)
```

### 11.3 未保存退出确认

```tsx
// 检测是否有修改
const hasChanges = () => {
  return getSnapshot() !== initialSnapshot.current
}

// 关闭时确认
const handleClose = (skipConfirm = false) => {
  if (!skipConfirm && hasChanges()) {
    setShowConfirm(true)
    return
  }
  onClose()
}
```

---

## 十二、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `src/types/index.ts` | 修改 | 添加 SkillFile、SkillFileType、SkillResource 类型 |
| `src/stores/skillStore.ts` | 新建 | 技能状态管理 |
| `src/utils/storage.ts` | 修改 | 添加技能文件存储方法和 IPC 类型定义 |
| `electron/main.ts` | 修改 | 添加技能文件 IPC 通道和 getSkillsDir |
| `electron/preload.ts` | 修改 | 暴露技能文件 API |
| `electron/launch.cjs` | 修改 | 开发环境 IPC |
| `electron/preload.dev.cjs` | 修改 | 开发环境 API |
| `src/components/skill/SkillCard.tsx` | 新建 | 技能卡片组件 |
| `src/components/skill/SkillModal.tsx` | 新建 | 创建/编辑弹窗组件 |
| `src/components/skill/SkillDetailModal.tsx` | 新建 | 详情查看弹窗组件 |
| `src/components/skill/SkillResourceManager.tsx` | 新建 | 资源文件管理组件 |
| `src/components/skill/index.ts` | 新建 | 统一导出 |
| `src/pages/SkillsPage.tsx` | 新建 | 技能页面组件 |
| `src/stores/appStore.ts` | 修改 | 添加 'skills' 到 PageType |
| `src/components/layout/Sidebar.tsx` | 修改 | 添加技能导航项 |
| `src/components/layout/MainContent.tsx` | 修改 | 添加技能页面路由 |

---

## 十三、设计检查清单

在开发技能模块时，请检查以下项目：

- [ ] 输入框默认边框是否为 `border-gray-200`
- [ ] 输入框悬浮边框是否为 `border-gray-300`
- [ ] 输入框聚焦边框是否为 `border-gray-400`
- [ ] 按钮是否使用灰色主题
- [ ] 按钮是否移除了蓝色聚焦环
- [ ] 弹窗是否移除了分隔线
- [ ] Toast 是否居中显示
- [ ] 卡片悬浮是否有上浮+阴影效果
- [ ] 技能图标是否统一使用紫罗兰色（魔法棒 Wand2）
- [ ] 资源标签是否按类型显示不同颜色

---

## 十五、创建模式设计（v1.2 新增）

### 15.1 创建模式选择界面

创建技能时，首先展示三种创建模式选择界面，无标题，保持简洁：

```
┌───────────────────────────────────────────────────────┐
│                                                       │
│     ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│     │    ✏️    │  │    🧠    │  │    🤖    │        │
│     │ 手动创建 │  │ LLM创建  │  │Agentic创 │        │
│     └──────────┘  └──────────┘  └──────────┘        │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 15.2 三种创建模式设计规范

| 模式 | 图标 | 图标颜色 | 背景色 | 说明 |
|------|------|----------|--------|------|
| 手动创建 | PenLine | `text-yellow-500` (#EAB308) | `bg-yellow-50` (#FEF9C3) | 用户手动填写表单 |
| LLM创建 | Brain | `text-pink-400` (#F472B6) | `bg-pink-50` (#FDF2F8) | 单次LLM调用生成 |
| Agentic创建 | Bot | `text-blue-500` (#3B82F6) | `bg-blue-50` (#EFF6FF) | Agent自主循环执行 |

### 15.3 创建模式按钮实现

```tsx
// 手动创建 - 黄色
<button className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl">
  <div className="w-12 h-12 rounded-full bg-yellow-50 flex items-center justify-center">
    <PenLine size={24} className="text-yellow-500" />
  </div>
  <span className="text-sm font-medium text-gray-700">手动创建</span>
</button>

// LLM创建 - 粉肉色
<button className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl">
  <div className="w-12 h-12 rounded-full bg-pink-50 flex items-center justify-center">
    <Brain size={24} className="text-pink-400" />
  </div>
  <span className="text-sm font-medium text-gray-700">LLM创建</span>
</button>

// Agentic创建 - 蓝色
<button className="flex flex-col items-center gap-3 p-6 w-36 border border-gray-200 rounded-xl">
  <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center">
    <Bot size={24} className="text-blue-500" />
  </div>
  <span className="text-sm font-medium text-gray-700">Agentic创建</span>
</button>
```

### 15.4 弹窗标题规范

| 模式 | 标题 | 说明 |
|------|------|------|
| 创建模式 | 无标题 | 保持简洁，直接展示创建模式选择 |
| 编辑模式 | "编辑技能" | 明确标识编辑功能 |

### 15.5 LLM 创建界面

#### 界面布局

```
┌─────────────────────────────────────────────────────┐
│  💬 描述你想要创建的技能                              │
│  ┌─────────────────────────────────────────────────┐│
│  │ 例如：帮我创建一个代码分析技能，可以检查代码...   ││
│  │                                                 ││
│  │                                                 ││
│  │                                                 ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│                          [返回选择]  [🪄 开始生成]   │
└─────────────────────────────────────────────────────┘
```

### 15.6 Agentic 创建界面

#### 界面布局

```
┌─────────────────────────────────────────────────────┐
│  🤖 描述你想要创建的技能                              │
│  ┌─────────────────────────────────────────────────┐│
│  │ 例如：帮我创建一个代码分析技能...                 ││
│  │                                                 ││
│  │ Agentic 模式会：                                ││
│  │ 1. 首先查看 .claude/skills/ 目录下已有的技能文档││
│  │ 2. 参考已有文档的格式和风格                     ││
│  │ 3. 根据你的描述创建新的技能文档                 ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  [Agent 执行日志区域 - AgentLoopLogger]             │
│                                                     │
│                          [返回选择]  [🪄 开始生成]   │
└─────────────────────────────────────────────────────┘
```

### 15.7 模板配置

技能模块支持自定义 LLM 创建和 Agentic 创建的提示词模板，存储在 `.ocean/template/skill/` 目录：

| 模板类型 | 文件名 | 说明 |
|---------|--------|------|
| LLM 创建 | `llm-create.json` | 单次 LLM 调用生成技能内容 |
| LLM 优化 | `llm-optimize.json` | 单次 LLM 调用优化技能内容 |
| Agentic 创建 | `agentic-create.json` | Agent 循环执行生成技能内容 |

#### 默认 LLM 创建模板

```
## 角色
你是一个专业的技能设计助手。请根据用户提供的描述，生成高质量的技能内容。

## 工作流程
1. 深入理解用户的需求描述
2. 详细设计和构思技能内容
3. 直接输出技能详情

## 技能说明
技能是一个可复用的能力包，可能包含脚本、参考文档、示例等资源。技能内容应清晰描述技能用途、执行步骤、注意事项等。

## 注意事项
- 输出的技能内容必须详细、具体，不可泛泛而谈
- 内容结构要清晰，使用 Markdown 格式
- 包含具体的使用场景和执行步骤
- 如涉及脚本执行，应说明脚本的调用方式

## 输出要求
请直接输出技能的详细内容（Markdown格式），不需要包含名称和描述字段。

用户描述：{{userDescription}}
```

### 15.8 返回确认机制

各创建模式下，点击"返回选择"时需确认：

| 模式 | 确认条件 |
|------|----------|
| LLM 创建 | 用户描述不为空 |
| Agentic 创建 | 用户描述不为空 或 执行日志不为空 |
| 手动创建 | 名称、描述或内容任一字段不为空 |

---

## 十六、技能内容优化功能

### 16.1 功能概述

技能模块支持通过 LLM 优化技能内容。用户在编辑技能时，可以点击优化按钮，输入优化目标后由 LLM 自动优化技能内容。该功能与能力模块保持一致的用户体验。

### 16.2 优化按钮设计

在技能内容区域的标签旁边，添加渐变色优化按钮：

```
┌─────────────────────────────────────────────────────────────┐
│  🪄 技能内容 *                                    [✨] 编辑│预览│
│                                                ↑ 优化按钮   │
└─────────────────────────────────────────────────────────────┘
```

#### 按钮样式规范

```tsx
<button
  className="flex items-center justify-center w-7 h-7 rounded-md
    bg-gradient-to-r from-rose-400 via-fuchsia-500 to-indigo-500
    text-white hover:from-rose-500 hover:via-fuchsia-600 hover:to-indigo-600
    transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
>
  <Wand2 size={14} />
</button>
```

#### 显示条件

| 模式 | 是否显示 |
|------|----------|
| 编辑模式 | 显示 |
| 手动创建模式 | 显示 |
| LLM 创建模式 | 不显示 |
| Agentic 创建模式 | 不显示 |
| 选择模式 | 不显示 |

#### 按钮状态

- **默认**：渐变色背景，白色图标
- **悬浮**：渐变色加深
- **禁用**：内容为空时禁用，`opacity-50`

### 16.3 优化弹窗

使用通用 `OptimizeModal` 组件，配置 `templateType="skill-optimize"`。

#### 优化目标输入

```
┌─────────────────────────────────────────────────────┐
│  优化目标                                            │
│  ┌─────────────────────────────────────────────────┐│
│  │ 例如：优化内容结构，使其更加清晰易读              ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  [优化结果区域 - 预览/编辑切换]                       │
│                                                     │
│              [对比] [清除结果]    [取消] [优化] [确认使用] │
└─────────────────────────────────────────────────────┘
```

### 16.4 默认优化模板

```
你是一个专业的AI技能优化助手。请根据用户提供的优化目标，对现有的技能内容进行优化改进。

## 现有技能内容
{{currentContent}}

## 优化目标
{{optimizeTarget}}

## 输出要求
请直接输出优化后的技能内容（Markdown格式），不需要包含名称和描述字段。

## 优化原则
1. 保持原有核心功能和价值
2. 根据优化目标有针对性地改进
3. 结构清晰，表述准确
4. 如有必要，可补充使用场景或注意事项
5. 如涉及脚本执行，说明脚本的调用方式

请直接输出优化后的Markdown内容，不要包含代码块标记。
```

### 16.5 设置页面模板配置

在设置页面的技能模块中，添加了 "LLM优化模板" Tab：

```
┌─────────────────────────────────────────────────────────────┐
│  [LLM创建模板]  [LLM优化模板]  [Agentic创建模板]             │
│  ─────────────────────────────────────────────────────────  │
│                                                             │
│  🪄 技能LLM优化提示词模板                           编辑│预览│
│                                                             │
│  配置LLM优化技能时使用的提示词模板。模板中使用               │
│  `{{currentContent}}` 作为当前内容的占位符，                 │
│  `{{optimizeTarget}}` 作为优化目标的占位符。                 │
│                                                             │
│  [模板编辑区域...]                                          │
│                                                             │
│  使用说明：                                                  │
│  • LLM优化技能时，系统会将当前技能内容和优化目标替换模板中的占位符 │
│  • LLM 会根据提示词对技能内容进行优化改进                     │
│  • 优化后可以预览和对比，确认后才会应用                       │
│  • 优化结果可以手动编辑调整                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 十七、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.4 | 2026-03-24 | 新增技能内容优化功能：优化按钮、OptimizeModal 集成、LLM优化模板配置 |
| 1.3 | 2026-03-24 | 新增设置页面技能模板配置入口，支持自定义 LLM 创建和 Agentic 创建模板 |
| 1.2 | 2026-03-24 | 新增 LLM 创建和 Agentic 创建模式，添加模板配置支持 |
| 1.1 | 2026-03-23 | 详情页/编辑页分离优化：资源管理迁移至编辑页标签页 |
| 1.0 | 2026-03-20 | 初始版本，设计技能模块完整功能 |

---

*本文档持续更新中，如有新的设计规范请及时补充。