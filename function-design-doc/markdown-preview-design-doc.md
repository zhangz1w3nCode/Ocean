# Markdown 预览设计文档

## 概述

本文档记录了 Cherry Studio 中智能体页面预览智能体时，提示词区域的 Markdown 渲染实现方案。

---

## 1. 核心实现位置

### 1.1 主组件文件

**文件路径**: `src/renderer/src/pages/agents/AgentsPage.tsx`

**核心代码** (第 68-94 行):

```tsx
const onAddAgentConfirm = useCallback(
  (agent: Agent) => {
    window.modal.confirm({
      title: agent.name,
      content: (
        <Flex gap={16} vertical style={{ width: 'calc(100% + 12px)' }}>
          {agent.description && <AgentDescription>{agent.description}</AgentDescription>}

          {agent.prompt && (
            <AgentPrompt className="markdown">
              <ReactMarkdown>{agent.prompt}</ReactMarkdown>
            </AgentPrompt>
          )}
        </Flex>
      ),
      width: 600,
      icon: null,
      closable: true,
      maskClosable: true,
      centered: true,
      okButtonProps: { type: 'primary' },
      okText: t('agents.add.button'),
      onOk: () => createAssistantFromAgent(agent)
    })
  },
  [t]
)
```

### 1.2 关键技术选型

| 技术 | 说明 |
|------|------|
| `ReactMarkdown` | 用于解析和渲染 Markdown 内容 |
| `className="markdown"` | 应用全局 Markdown 样式类 |
| `styled-components` | 用于容器组件的样式定义 |

---

## 2. 样式实现

### 2.1 Markdown 全局样式文件

**文件路径**: `src/renderer/src/assets/styles/markdown.css`

### 2.2 行内代码 `` `xx` `` 样式

**代码位置**: 第 120-129 行

```css
.markdown p code,
.markdown li code {
  background: var(--color-background-mute);
  padding: 3px 5px;
  margin: 0 2px;
  border-radius: 5px;
  word-break: keep-all;
  white-space: pre;
  text-wrap: wrap;
}
```

**样式说明**:
- `background`: 使用 CSS 变量设置背景色，支持主题切换
- `padding: 3px 5px`: 内边距，使代码有呼吸空间
- `margin: 0 2px`: 左右外边距，与周围文本保持间距
- `border-radius: 5px`: 圆角边框
- `word-break: keep-all`: 防止代码在单词内换行
- `white-space: pre`: 保留空白字符
- `text-wrap: wrap`: 允许文本换行

### 2.3 代码块样式

**代码位置**: 第 131-163 行

```css
/* 代码字体设置 */
.markdown code {
  font-family: var(--code-font-family);
}

/* 代码块容器样式 */
.markdown pre {
  border-radius: 8px;
  overflow-x: auto;
  font-family: var(--code-font-family);
  background-color: var(--color-background-mute);
}

/* 特殊预览背景透明处理 */
.markdown pre:has(.special-preview) {
  background-color: transparent;
}

/* 代码块内部代码样式 */
.markdown pre:not(pre pre) > code:not(pre pre > code) {
  padding: 15px;
  display: block;
}

/* 嵌套 pre 处理 */
.markdown pre pre {
  margin: 0 !important;
}

.markdown pre pre code {
  background: none;
  padding: 0;
  border-radius: 0;
}

/* 连续代码块间距 */
.markdown pre + pre {
  margin-top: 10px;
}
```

**样式说明**:
- 代码块使用等宽字体 `var(--code-font-family)`
- 水平方向可滚动 `overflow-x: auto`
- 统一圆角设计 `border-radius: 8px`
- 使用 CSS 变量支持主题切换

### 2.4 容器组件样式

**代码位置**: 第 375-381 行

```tsx
const AgentPrompt = styled.div`
  max-height: 60vh;
  overflow-y: scroll;
  background-color: var(--color-background-soft);
  padding: 8px;
  border-radius: 10px;
`
```

**样式说明**:
- `max-height: 60vh`: 最大高度为视口高度的 60%，防止内容过长
- `overflow-y: scroll`: 内容超出时垂直滚动
- `background-color`: 使用 CSS 变量设置背景色
- `padding: 8px`: 内边距
- `border-radius: 10px`: 圆角边框

---

## 3. 完整样式参考

### 3.1 基础样式

```css
.markdown {
  color: var(--color-text);
  line-height: 1.6;
  user-select: text;
  word-break: break-word;
}
```

### 3.2 标题样式

```css
.markdown h1 {
  margin-top: 0;
  font-size: 2em;
  border-bottom: 0.5px solid var(--color-border);
  padding-bottom: 0.3em;
}

.markdown h2 {
  font-size: 1.5em;
  border-bottom: 0.5px solid var(--color-border);
  padding-bottom: 0.3em;
}

.markdown h3 {
  font-size: 1.2em;
}
```

### 3.3 列表样式

```css
.markdown ul,
.markdown ol {
  padding-left: 1.5em;
  margin: 1em 0;
}

.markdown li {
  margin-bottom: 0.5em;
}

.markdown li::marker {
  color: var(--color-text-3);
}
```

### 3.4 引用块样式

```css
.markdown .markdown-alert,
.markdown blockquote {
  margin: 1.5em 0;
  padding: 1em 1.5em;
  background-color: var(--color-background-soft);
  border-left: 4px solid var(--color-primary);
  border-radius: 0 8px 8px 0;
  font-style: italic;
  position: relative;
}
```

### 3.5 表格样式

```css
.markdown table {
  --table-border-radius: 8px;
  margin: 2em 0;
  font-size: 0.9em;
  width: 100%;
  border-radius: var(--table-border-radius);
  overflow: hidden;
  border-collapse: separate;
  border: 0.5px solid var(--color-border);
  border-spacing: 0;
}

.markdown th {
  background-color: var(--color-background-mute);
  font-weight: 600;
  text-align: left;
}

.markdown tr:hover {
  background-color: var(--color-background-soft);
}
```

### 3.6 链接样式

```css
.markdown a,
.markdown .link {
  color: var(--color-link);
  text-decoration: none;
  cursor: pointer;
}

.markdown a:hover,
.markdown .link:hover {
  text-decoration: underline;
}
```

---

## 4. 数据流

```
Agent 数据
    │
    ▼
agent.prompt (Markdown 字符串)
    │
    ▼
ReactMarkdown 组件解析
    │
    ▼
渲染为 HTML 元素
    │
    ▼
应用 .markdown 类样式
    │
    ▼
最终渲染结果
```

---

## 5. 依赖关系

| 依赖 | 版本 | 用途 |
|------|------|------|
| `react-markdown` | - | Markdown 解析与渲染 |
| `styled-components` | - | CSS-in-JS 样式方案 |

---

## 6. 设计亮点

1. **CSS 变量支持**: 所有颜色使用 CSS 变量，支持主题切换
2. **语义化选择器**: 通过 `.markdown p code` 等选择器精确控制样式
3. **响应式滚动**: 容器设置 `max-height` 和 `overflow-y`，处理长内容
4. **统一圆角设计**: 全局使用一致的圆角设计语言

---

## 7. 相关文件索引

| 文件路径 | 说明 |
|----------|------|
| `src/renderer/src/pages/agents/AgentsPage.tsx` | 智能体页面主组件 |
| `src/renderer/src/assets/styles/markdown.css` | Markdown 全局样式 |
| `src/renderer/src/assets/styles/index.css` | 样式入口文件 |

---

## 8. 扩展建议

如需扩展 Markdown 渲染功能，可考虑:

1. **代码高亮**: 集成 `rehype-highlight` 或 `shiki` 实现代码语法高亮
2. **数学公式**: 集成 `remark-math` 和 `rehype-katex` 支持 LaTeX 数学公式
3. **自定义组件**: 通过 `ReactMarkdown` 的 `components` 属性自定义渲染
4. **Mermaid 图表**: 集成 `mermaid` 支持流程图等图表渲染