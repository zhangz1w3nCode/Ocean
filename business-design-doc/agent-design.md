# 智能体模块前端设计规范

> 本文档总结了智能体模块的前端UI设计、交互效果和视觉规范，供其他模块复用参考。

---

## 一、设计理念

### 1.1 整体风格
- **简约现代**：采用极简设计风格，减少视觉干扰
- **灰色基调**：以灰色、白色为主色调，营造专业、稳重的视觉感受
- **一致性**：与节点模块、资源文件模块保持统一的视觉语言和交互模式

### 1.2 核心原则
- 避免使用过多的彩色，以灰白为主
- 颜色点缀仅用于智能体标识（图标颜色）
- 反馈及时明确，但不过度打扰用户
- 交互状态变化平滑自然，无抖动

---

## 二、数据持久化设计

### 2.1 存储格式

智能体模块采用 **Markdown 文件持久化**，与资源文件模块类似，但 frontmatter 格式不同：

```markdown
---
name: doc-agent
description: 该agent是文档助手Agent...
model: haiku
color: blue
---
# 角色
- 你是一个充分理解人类自然语言的...
```

### 2.2 存储位置

```
.workflow-maker/
├── agents/           # 智能体文件（sub-agent）存储目录
│   └── {name}.md
└── resources/        # 资源文件存储目录（对比参考）
    └── {name}.md
```

### 2.3 Frontmatter 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 智能体名称，作为文件名 |
| description | string | 否 | 智能体描述 |
| model | string | 是 | 模型选择：haiku / sonnet / opus |
| color | string | 是 | 图标颜色：blue / green / purple / yellow / red / orange |

---

## 三、颜色体系

### 3.1 主色调

```
灰色系（主要使用）：
- 深灰（文字）：#1F2937 / text-gray-800
- 中灰（次要文字）：#6B7280 / text-gray-500
- 浅灰（边框）：#E5E7EB / border-gray-200
- 超浅灰（背景）：#F3F4F6 / bg-gray-100
- 纯白：#FFFFFF
```

### 3.2 智能体图标颜色（用于图标标识）

| 颜色 | 主色 | 背景色 |
|------|------|--------|
| 蓝色 | #007AFF | #E3F2FD |
| 绿色 | #34C759 | #E8F5E9 |
| 紫色 | #5856D6 | #EDE7F6 |
| 黄色 | #FF9500 | #FFF3E0 |
| 红色 | #FF3B30 | #FFEBEE |
| 橙色 | #FF9500 | #FFF3E0 |

### 3.3 模型标签颜色

| 模型 | 文字颜色 | 背景颜色 |
|------|----------|----------|
| Haiku | #34C759（绿色） | #E8F5E9 |
| Sonnet | #FF9500（黄色） | #FFF3E0 |
| Opus | #FF3B30（红色） | #FFEBEE |

---

## 四、组件设计

### 4.1 智能体卡片 (AgentCard) - 2025-02-25 重新设计

#### 整体布局

```
┌─────────────────────────────────────┐
│  [🤖] 智能体名称           [✎] [🗑]  │  <- 头部 (pt-4 pb-0)
│                                     │
│  ┌─────────────────────────────┐   │
│  │ # 角色 - 你是一个...        │   │  <- 内容预览区 (bg-gray-50)
│  │ # 任务 - 严格执行...        │   │
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
      {/* 左侧：Robot 图标 + 名称 */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
          <Bot size={18} className="text-gray-600" strokeWidth={1.5} />
        </div>
        <h3 className="font-bold text-[17px] text-gray-900">
          {agent.name}
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
  </div>
</Card>
```

#### 设计要点

| 元素 | 规范 | 说明 |
|------|------|------|
| 卡片容器 | `p-0` | 移除默认 padding，内部自定义布局 |
| 头部区域 | `pt-4 pb-0 px-4` | 顶部 16px，底部无 padding，左右 16px |
| Robot 图标 | 32x32 圆角方形 | `bg-gray-100` 背景，`text-gray-600` 图标 |
| 名称字体 | `17px font-bold text-gray-900` | 加粗黑色，比之前更大 |
| 操作按钮 | 右上角，悬浮显示 | 编辑和删除按钮，`opacity-0` → `opacity-100` |
| 内容预览区 | `bg-gray-50` 浅灰背景 | 圆角 `rounded-lg`，内边距 `p-4` |
| 内容文字 | `text-xs text-gray-500` | 12px 灰色文字，最多显示 3 行 |
| 间距关系 | 内容区紧贴头部 `mt-0` | 灰色区域顶部接近图标底部，留小间距 |

#### 内容预览处理

```typescript
// 提取角色指令内容的前 100 个字符，移除 Markdown 符号
const contentPreview = agent.content?.replace(/[#*`]/g, '').slice(0, 100) || ''
```

#### 配色方案

| 元素 | 背景色 | 文字色 | 边框色 |
|------|--------|--------|--------|
| 卡片背景 | `#FFFFFF` | - | `#E5E5E5` |
| Robot 图标容器 | `#F3F4F6` (gray-100) | - | - |
| Robot 图标 | - | `#4B5563` (gray-600) | - |
| 名称文字 | - | `#111827` (gray-900) | - |
| 内容预览区 | `#F9FAFB` (gray-50) | `#6B7280` (gray-500) | - |
| 操作按钮 | hover: `#F3F4F6` | `#6B7280` | - |
| 删除按钮 | hover: `#FEF2F2` | hover: `#FF3B30` | - |

#### 交互状态

| 状态 | 效果 |
|------|------|
| 默认 | 卡片无边框阴影，操作按钮隐藏 |
| 悬浮 | 卡片上浮 2px + 阴影，操作按钮显示 |
| 点击 | 触发 `onClick`，打开详情弹窗 |

---

### 4.2 智能体卡片 (AgentCard) - 旧版设计（已废弃）

> 注：此设计已於 2025-02-25 废弃，改为上方的新设计。

```tsx
// 旧版：彩色图标 + 彩色标签 + 更新时间
  {/* 悬浮显示的操作按钮 */}
  <div className="absolute top-3 right-3 flex items-center gap-1
                  opacity-0 group-hover:opacity-100 transition-opacity z-10">
    <button className="p-1.5 rounded-md hover:bg-gray-100">
      <Edit3 size={14} />
    </button>
    <button className="p-1.5 rounded-md hover:bg-red-50 hover:text-red-600">
      <Trash2 size={14} />
    </button>
  </div>

  {/* 内容区域 */}
  <div className="flex items-start gap-4">
    {/* 智能体图标 */}
    <div className="w-12 h-12 rounded-xl flex items-center justify-center"
         style={{ backgroundColor: colorBg }}>
      <Bot size={22} style={{ color: colorMain }} />
    </div>

    {/* 智能体信息 */}
    <div className="flex-1 min-w-0">
      <h3 className="font-semibold text-sm">智能体名称</h3>
      {/* 标签 */}
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 rounded text-xs">sub-agent</span>
        <span className="px-2 py-0.5 rounded text-xs">Haiku</span>
      </div>
      {/* 描述 */}
      <p className="text-xs line-clamp-2">描述内容...</p>
    </div>
  </div>
</Card>
```

### 4.2 卡片悬浮效果

```css
/* 悬浮动效 */
.card-hover:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

/* 过渡 */
transition: transform 0.2s, box-shadow 0.2s;
```

---

## 五、创建/编辑弹窗设计

### 5.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  创建新智能体                        × 关闭 │  <- 头部区域
├─────────────────────────────────────────┤
│                                         │
│  智能体名称 *                             │
│  [________________________]             │
│                                         │
│  智能体描述                               │
│  [________________________]             │
│                                         │
│  模型选择                               │
│  [ Haiku ] [ Sonnet ] [ Opus ]          │
│                                         │
│  图标颜色                               │
│  [ 蓝色 ] [ 绿色 ] [ 紫色 ] ...          │
│                                         │
│  角色指令内容 *                    编辑│预览│
│  [________________________]             │
│  [________________________]             │
│  [________________________]             │
│                                         │
├─────────────────────────────────────────┤
│                         取消      创建   │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 5.2 表单字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 智能体名称 | Input | 是 | 唯一标识，编辑时不可修改 |
| 智能体描述 | Textarea | 否 | 简要描述智能体用途 |
| 模型选择 | RadioGroup | 是 | haiku / sonnet / opus |
| 图标颜色 | RadioGroup | 是 | 6种预设颜色 |
| 角色指令内容 | Textarea | 是 | 支持 Markdown 格式 |

### 5.3 编辑/预览切换

```tsx
// 切换按钮组
<div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
  <button className={viewMode === 'edit' ? 'bg-white shadow-sm' : ''}>
    <Edit3 size={14} /> 编辑
  </button>
  <button className={viewMode === 'preview' ? 'bg-white shadow-sm' : ''}>
    <Eye size={14} /> 预览
  </button>
</div>
```

### 5.4 Markdown 渲染

```tsx
// 预览模式 - 支持代码块语法高亮
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

<div className="prose prose-custom prose-sm max-w-none prose-code-custom">
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    rehypePlugins={[rehypeHighlight]}
  >
    {content}
  </ReactMarkdown>
</div>
```

> 注：预览模式需要添加 `rehypeHighlight` 插件以支持代码块语法高亮，与详情弹窗保持一致。

---

## 六、详情弹窗设计

### 6.1 弹窗结构

```
┌─────────────────────────────────────────┐
│  [图标] 智能体名称        [sub-agent] [Haiku] │  <- 头部固定区域
├─────────────────────────────────────────┤
│ ▼ 内容区域（固定高度，超出滚动）        │
│                                         │
│  智能体描述                               │
│  [描述内容...]                          │
│                                         │
│  模型              │  图标颜色          │
│  [Haiku]          │  [● 蓝色]          │
│                                         │
│  角色指令内容                           │
│  [Markdown 渲染内容...]                 │
│                                         │
├─────────────────────────────────────────┤
│  关闭                         [编辑]    │  <- 底部按钮区域
└─────────────────────────────────────────┘
```

### 6.2 样式规范

```css
/* 头部固定区域 */
.detail-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 1rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #F3F4F6;
}

/* 内容区域 - 固定高度滚动 */
.detail-content {
  max-height: 400px;
  overflow-y: auto;
  padding-right: 0.5rem;
}

/* 模型和颜色信息容器 */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

/* 信息项容器 - 固定高度 */
.info-item-container {
  background-color: #F9FAFB;
  border-radius: 0.5rem;
  padding: 0.75rem;
  display: flex;
  align-items: center;
  height: 2.75rem;  /* h-11 */
}
```

---

## 七、页面布局设计

### 7.1 页面容器

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

### 7.2 头部区域

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

### 7.3 内容区域

```css
.page-content {
  flex: 1;
  padding: 1.5rem;
  overflow-y: auto;
}
```

---

## 八、表单验证设计

### 8.1 验证规则

| 字段 | 规则 |
|------|------|
| 智能体名称 | 必填，创建时检查唯一性 |
| 角色指令内容 | 必填 |

### 8.2 验证反馈方式

```tsx
// 1. Toast 提示
addToast('请输入智能体名称', 'warning')

// 2. 输入框高亮
setInvalidFields(new Set(['name']))

// 3. 输入框恢复
setTimeout(() => setInvalidFields(new Set()), 3000)
```

### 8.3 未保存退出确认

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

## 九、交互状态总结

### 9.1 输入框状态流转

```
默认状态 (border-gray-200)
    ↓ hover
悬浮状态 (border-gray-300)
    ↓ focus
聚焦状态 (border-gray-400 + shadow)
    ↓ blur
回到默认状态
```

### 9.2 卡片状态流转

```
默认状态 (无阴影)
    ↓ hover
悬浮状态 (y: -2px + shadow)
    ↓ leave
回到默认状态
```

---

## 十、MarkdownEditor 编辑器组件

### 10.1 组件定位

`MarkdownEditor` 是智能体"角色指令内容"字段的专用编辑器，替代原有的 `ReferenceTextarea`，提供专业的 Markdown 编辑体验。

### 10.2 核心功能

| 功能 | 说明 |
|------|------|
| Markdown 语法高亮 | 使用 `materialLight` 主题，实时高亮标题、加粗、斜体、代码块等 |
| @引用功能 | 输入@符号触发引用选择弹窗，支持引用其他业务内容 |
| 引用块高亮 | 自定义装饰器高亮 `` `agents/xxx.md` `` 格式的引用路径 |
| 表单集成 | 支持表单验证、禁用状态等标准表单属性 |

### 10.3 使用示例

```tsx
import { MarkdownEditor } from '../ui'

<MarkdownEditor
  placeholder="在此输入智能体的角色指令内容，支持 Markdown 格式..."
  value={content}
  onChange={(e) => setContent(e.target.value)}
  rows={12}
  invalid={invalidFields.has('content')}
  excludeCategory="agents"
/>
```

### 10.4 技术选型

| 依赖 | 版本 | 用途 |
|------|------|------|
| `@uiw/react-codemirror` | ^4.25.4 | CodeMirror React 封装 |
| `@codemirror/lang-markdown` | ^6.5.0 | Markdown 语言支持 |
| `@uiw/codemirror-themes-all` | ^4.25.5 | 主题包（使用 materialLight） |

### 10.5 语法高亮效果

使用 `materialLight` 主题提供的语法高亮：

| 语法元素 | 高亮效果 |
|---------|---------|
| 标题（#）| 蓝色、加粗 |
| 加粗（**text**）| 加粗显示 |
| 斜体（*text*）| 斜体显示 |
| 代码块（```）| 背景色区分 |
| 内联代码（`code`）| 背景色区分 |
| 引用路径（`xxx.md`）| 蓝色背景 + 蓝色文字 |

### 10.6 引用块高亮样式

```css
/* 引用路径背景色 */
background-color: #DBEAFE;  /* Tailwind blue-100 */

/* 引用路径文字色 */
color: #1D4ED8;  /* Tailwind blue-700 */

/* 反引号颜色 */
color: #1D4ED8;
```

### 10.7 组件文件结构

```
src/components/ui/MarkdownEditor/
├── index.ts                    # 组件导出
├── MarkdownEditor.tsx          # 主组件
└── referenceHighlight.ts       # 引用块高亮扩展
```

### 10.8 详细设计文档

完整的技术实现细节请参考：`function-design-doc/markdown-high-light-design-doc.md`

---

## 十一、Markdown 预览行内代码样式优化

### 11.1 优化背景

在优化前，智能体详情弹窗中的 Markdown 预览功能里，行内代码（\`xx\` 语法）仅显示为加粗文字，缺少灰色块背景，与普通文字没有明显的视觉区分。

### 11.2 优化目标

| 优化项 | 优化前 | 优化后 |
|--------|--------|--------|
| 背景色 | 无 | 浅灰色 `#F3F4F6` |
| 边框 | 无 | 细边框 `#E5E7EB` |
| 圆角 | 无 | 4px 圆角 |
| 内边距 | 无 | 2px 6px |
| 反引号 | 显示 | 隐藏 |
| 字体 | 继承 | 等宽字体 |

### 11.3 样式规范

```css
/* 行内代码样式 - 只针对行内代码，排除代码块 */
.prose :where(code):not(pre > code) {
  background-color: #F3F4F6;      /* 浅灰色背景 */
  padding: 2px 6px;                /* 内边距 */
  border-radius: 4px;              /* 圆角 */
  border: 1px solid #E5E7EB;       /* 细边框 */
  font-family: ui-monospace, monospace; /* 等宽字体 */
  font-size: 0.875em;              /* 略小于正文 */
  color: #1D1D1F;                  /* 文字颜色 */
}

/* 移除反引号伪元素 */
.prose :where(code):not(pre > code)::before,
.prose :where(code):not(pre > code)::after {
  content: '' !important;
  display: none !important;
}
```

### 11.4 关键技术点

#### 11.4.1 区分行内代码和代码块

使用 `:not(pre > code)` 选择器排除代码块中的 `code` 元素：

- 行内代码：\`xx\` → 应用灰色块样式
- 代码块：\`\`\`xxx\`\`\` → 保持原有样式

#### 11.4.2 Tailwind Typography 插件配置

在 `tailwind.config.js` 中使用相同的选择器：

```javascript
typography: {
  DEFAULT: {
    css: {
      'code:not(pre > code)::before': {
        content: 'none',
      },
      'code:not(pre > code)::after': {
        content: 'none',
      },
    },
  },
},
```

### 11.5 应用组件

| 组件 | 说明 | 修改内容 |
|------|------|----------|
| AgentDetailModal.tsx | 智能体详情弹窗 | 添加 `prose-code-custom` 类 |
| ResourceDetailModal.tsx | 资源详情弹窗 | 添加 `prose-code-custom` 类 |
| CommandDetailModal.tsx | 命令详情弹窗 | 添加 `prose-code-custom` 类 |

### 11.6 效果对比

```
优化前：
请查看 `agents/工具名.md` 文件
        ↓ 仅加粗

优化后：
请查看 [灰色块包裹的] agents/工具名.md [结束] 文件
        ↓ 灰色背景 + 圆角 + 边框
```

### 11.7 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| flow-editor/src/styles/tailwind.css | 修改 | 添加行内代码样式 |
| flow-editor/tailwind.config.js | 修改 | 添加 typography 扩展 |
| flow-editor/src/components/agent/AgentDetailModal.tsx | 修改 | 应用新样式 |
| flow-editor/src/components/resource/ResourceDetailModal.tsx | 修改 | 应用新样式 |
| flow-editor/src/components/command/CommandDetailModal.tsx | 修改 | 应用新样式 |

### 11.8 详细设计文档

完整的技术实现细节请参考：`function-design-doc/markdown-inline-code-style-design.md`

---

## 十二、Markdown 预览代码块语法高亮

### 12.1 功能背景

在优化前，智能体详情弹窗中的 Markdown 预览功能里，代码块（\`\`\`json、\`\`\`java 等）没有语法高亮，所有代码都是纯文本显示，影响阅读体验。

### 12.2 功能目标

代码块应当根据指定的语言显示对应的语法高亮颜色，例如：
- JSON 代码块显示属性名、字符串、数字等不同颜色
- Java 代码块显示关键字、字符串、注释等不同颜色
- Python 代码块显示关键字、函数名、字符串等不同颜色

### 12.3 技术选型

| 方案 | 优点 | 选择原因 |
|------|------|----------|
| rehype-highlight + highlight.js | 与 react-markdown 生态兼容，配置简单 | 最终采用 |

### 12.4 依赖安装

```bash
pnpm add rehype-highlight highlight.js
```

| 依赖 | 版本 | 用途 |
|------|------|------|
| `rehype-highlight` | ^7.0.2 | rehype 插件，为代码块添加语法高亮 class |
| `highlight.js` | ^11.11.1 | 提供语法高亮样式 |

### 12.5 组件实现

```tsx
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github.css'

// ReactMarkdown 配置
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[rehypeHighlight]}
>
  {content}
</ReactMarkdown>
```

### 12.6 样式规范

```css
/* 代码块容器样式 */
.prose pre {
  background-color: #F6F8FA;
  border: 1px solid #E1E4E8;
  border-radius: 8px;
  padding: 16px;
  overflow-x: auto;
}

/* 代码块内部代码样式 */
.prose pre code {
  background-color: transparent;
  padding: 0;
  border: none;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.6;
}

/* 语法高亮颜色 */
.prose .hljs-keyword { color: #D73A49; }      /* 关键字 - 红色 */
.prose .hljs-string { color: #032F62; }       /* 字符串 - 蓝色 */
.prose .hljs-number { color: #005CC5; }       /* 数字 - 蓝色 */
.prose .hljs-comment { color: #6A737D; }      /* 注释 - 灰色 */
.prose .hljs-title { color: #6F42C1; }        /* 函数名 - 紫色 */
```

### 12.7 主题选择

选择 **GitHub** 浅色主题：
- 与项目的 macOS 风格浅色 UI 保持一致
- 颜色搭配简洁，适合阅读
- GitHub 风格广为人知，用户熟悉

### 12.8 支持的语言

highlight.js 支持超过 190 种编程语言，常用的包括：

| 语言 | 标识符 | 语言 | 标识符 |
|------|--------|------|--------|
| JavaScript | `javascript`, `js` | TypeScript | `typescript`, `ts` |
| Python | `python`, `py` | Java | `java` |
| JSON | `json` | YAML | `yaml`, `yml` |
| Markdown | `markdown`, `md` | HTML | `html` |
| CSS | `css` | SQL | `sql` |
| Shell | `shell`, `bash` | Go | `go` |

### 12.9 使用示例

```markdown
```json
{
  "name": "example",
  "version": "1.0.0"
}
```

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```
```

### 12.10 应用组件

| 组件 | 说明 | 修改内容 |
|------|------|----------|
| AgentDetailModal.tsx | 智能体详情弹窗 | 添加 rehypeHighlight 插件 |
| ResourceDetailModal.tsx | 资源详情弹窗 | 添加 rehypeHighlight 插件 |
| CommandDetailModal.tsx | 命令详情弹窗 | 添加 rehypeHighlight 插件 |

### 12.11 文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| flow-editor/package.json | 新增依赖 | 添加 rehype-highlight 和 highlight.js |
| flow-editor/src/components/agent/AgentDetailModal.tsx | 修改 | 添加 rehypeHighlight 插件 |
| flow-editor/src/components/resource/ResourceDetailModal.tsx | 修改 | 添加 rehypeHighlight 插件 |
| flow-editor/src/components/command/CommandDetailModal.tsx | 修改 | 添加 rehypeHighlight 插件 |
| flow-editor/src/styles/tailwind.css | 新增样式 | 添加代码块高亮样式 |

### 12.12 详细设计文档

完整的技术实现细节请参考：`function-design-doc/code-block-syntax-highlight-design.md`

---

## 十三、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| flow-editor/src/styles/tailwind.css | 修改 | 添加行内代码样式 |
| flow-editor/tailwind.config.js | 修改 | 添加 typography 扩展 |
| flow-editor/src/components/agent/AgentDetailModal.tsx | 修改 | 应用新样式 |
| flow-editor/src/components/resource/ResourceDetailModal.tsx | 修改 | 应用新样式 |
| flow-editor/src/components/command/CommandDetailModal.tsx | 修改 | 应用新样式 |

---

## 十三、与资源文件模块的关键差异

### 13.1 Frontmatter 格式差异

```markdown
<!-- 资源文件 frontmatter -->
---
id: resource-xxx
type: rule
description: ...
---

<!-- 智能体文件 frontmatter -->
---
name: doc-agent
description: ...
model: haiku
color: blue
---
```

### 13.2 存储目录差异

```
.workflow-maker/
├── agents/           # 智能体文件（sub-agent）
└── resources/        # 资源文件
```

### 13.3 功能差异

| 特性 | 资源文件 | 智能体文件 |
|------|----------|----------|
| 类型分类 | rule / reference / tool | 仅 sub-agent |
| 模型选择 | 无 | haiku / sonnet / opus |
| 颜色选择 | 根据类型自动设置 | 用户自定义 |
| 列表展示位置 | 资源文件页面 | 智能体页面（独立） |

---

## 十四、设计检查清单

在开发相关模块时，请检查以下项目：

- [ ] 输入框默认边框是否为 `border-gray-200`
- [ ] 输入框悬浮边框是否为 `border-gray-300`
- [ ] 输入框聚焦边框是否为 `border-gray-400`
- [ ] 按钮是否使用灰色主题
- [ ] 按钮是否移除了蓝色聚焦环
- [ ] 弹窗是否移除了分隔线
- [ ] 详情弹窗模型和颜色容器高度是否一致
- [ ] 模型标签是否使用深浅配色方案
- [ ] Toast 是否居中显示
- [ ] 卡片悬浮是否有上浮+阴影效果

---

## 十五、版本记录

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.7 | 2025-02-25 | 修复：AgentModal/ResourceModal/CommandModal 预览模式添加 rehypeHighlight 插件，支持代码块语法高亮，与详情弹窗保持一致 |
| 1.6 | 2025-02-25 | 重新设计 AgentCard 卡片布局：采用参考图片的简约风格，移除彩色元素，改为灰白色调，移除更新时间，添加 Robot 图标，调整名称字体为 17px 加粗，内容预览区采用浅灰色背景 |
| 1.5 | 2025-02-25 | 新增：Markdown 预览代码块语法高亮功能，支持 json/java/python 等 190+ 语言 |
| 1.4 | 2025-02-25 | 新增：Markdown 预览行内代码样式优化完整文档（区分行内代码和代码块） |
| 1.3 | 2025-02-25 | 新增：Markdown 预览行内代码样式优化，灰色块背景 + 移除反引号 |
| 1.2 | 2025-02-25 | 新增：MarkdownEditor 组件，实现编辑模式 Markdown 语法高亮 |
| 1.1 | 2025-02-25 | 重构：工具模块重命名为智能体模块，更新所有组件和文案 |
| 1.0 | 2025-02-14 | 初始版本，基于智能体模块设计规范 |

---

*本文档持续更新中，如有新的设计规范请及时补充。*