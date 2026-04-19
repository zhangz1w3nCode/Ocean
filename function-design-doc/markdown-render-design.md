# 智能体提示词区域 Markdown 颜色渲染机制

## 概述

本文档详细说明了 Cherry Studio 中智能体编辑页面提示词区域的 Markdown 语法高亮渲染机制。该区域支持两种模式：编辑模式和预览模式，分别使用不同的技术方案实现语法高亮。

## 相关源码位置

| 文件 | 路径 | 说明 |
|------|------|------|
| AssistantPromptSettings.tsx | `src/renderer/src/pages/settings/AssistantSettings/AssistantPromptSettings.tsx` | 提示词设置主组件 |
| CodeEditor/index.tsx | `src/renderer/src/components/CodeEditor/index.tsx` | CodeMirror 编辑器封装 |
| CodeStyleProvider.tsx | `src/renderer/src/context/CodeStyleProvider.tsx` | 代码风格上下文提供者 |
| markdown.css | `src/renderer/src/assets/styles/markdown.css` | Markdown 预览样式 |
| color.css | `src/renderer/src/assets/styles/color.css` | CSS 颜色变量定义 |

---

## 一、组件结构

### 1.1 入口组件

位置: `src/renderer/src/pages/settings/AssistantSettings/AssistantPromptSettings.tsx`

提示词区域根据 `showPreview` 状态切换两种渲染模式：

```tsx
{showPreview ? (
  <MarkdownContainer
    onDoubleClick={() => {
      const currentScrollTop = editorRef.current?.getScrollTop?.() || 0
      setShowPreview(false)
      requestAnimationFrame(() => editorRef.current?.setScrollTop?.(currentScrollTop))
    }}>
    <ReactMarkdown>{processedPrompt || prompt}</ReactMarkdown>
  </MarkdownContainer>
) : (
  <CodeEditor
    value={prompt}
    language="markdown"
    onChange={setPrompt}
    height="100%"
    expanded={false}
    style={{
      height: '100%'
    }}
  />
)}
```

### 1.2 样式定义

```tsx
const MarkdownContainer = styled.div.attrs({ className: 'markdown' })`
  height: 100%;
  padding: 0.5em;
  overflow: auto;
`

const RichEditorContainer = styled.div`
  height: calc(80vh - 202px);
  border: 0.5px solid var(--color-border);
  border-radius: 5px;
  overflow: hidden;
`
```

---

## 二、编辑模式 - CodeMirror 语法高亮

### 2.1 技术方案

编辑模式使用 **CodeMirror** 编辑器实现实时的 Markdown 语法高亮：

- **核心库**: `@uiw/react-codemirror`
- **主题包**: `@uiw/codemirror-themes-all`
- **语言支持**: 通过 `useLanguageExtensions` hook 加载 Markdown 语言扩展

### 2.2 主题获取机制

位置: `src/renderer/src/context/CodeStyleProvider.tsx:85-92`

```ts
const activeCmTheme = useMemo(() => {
  const field = theme === ThemeMode.light ? 'themeLight' : 'themeDark'
  let themeName = codeEditor[field]
  if (!themeName || themeName === 'auto' || !themeNames.includes(themeName)) {
    themeName = theme === ThemeMode.light ? 'materialLight' : 'dark'
  }
  return cmThemes[themeName as keyof typeof cmThemes] || themeName
}, [theme, codeEditor, themeNames])
```

### 2.3 默认主题

| 应用主题 | CodeMirror 主题 |
|---------|----------------|
| 亮色模式 (light) | `materialLight` |
| 暗色模式 (dark) | `dark` |

### 2.4 可用主题列表

```ts
const themeNames = useMemo(() => {
  if (codeEditor.enabled) {
    return ['auto', 'light', 'dark']
      .concat(Object.keys(cmThemes))
      .filter((item) => typeof cmThemes[item as keyof typeof cmThemes] !== 'function')
      .filter((item) => !/^(defaultSettings)/.test(item as string) && !/(Style)$/.test(item as string))
  }
  return ['auto', ...shikiThemesInfo.map((info) => info.id)]
}, [codeEditor.enabled, shikiThemesInfo])
```

### 2.5 编辑器配置

位置: `src/renderer/src/components/CodeEditor/index.tsx:182-227`

```tsx
<CodeMirror
  value={initialContent.current}
  placeholder={placeholder}
  width="100%"
  height={expanded ? undefined : height}
  editable={editable}
  theme={activeCmTheme}
  extensions={customExtensions}
  basicSetup={{
    dropCursor: true,
    allowMultipleSelections: true,
    indentOnInput: true,
    bracketMatching: true,
    closeBrackets: true,
    rectangularSelection: true,
    crosshairCursor: true,
    highlightActiveLineGutter: false,
    highlightSelectionMatches: true,
    ...basicSetup
  }}
  style={{
    fontSize,
    marginTop: 0,
    borderRadius: 'inherit',
    ...style
  }}
/>
```

---

## 三、预览模式 - ReactMarkdown 渲染

### 3.1 技术方案

预览模式使用 **ReactMarkdown** 组件渲染 Markdown 内容，样式通过 CSS 类实现：

- **核心库**: `react-markdown`
- **样式类**: `.markdown`

### 3.2 基础样式

位置: `src/renderer/src/assets/styles/markdown.css`

```css
.markdown {
  color: var(--color-text);
  line-height: 1.6;
  user-select: text;
  word-break: break-word;
}
```

### 3.3 颜色变量定义

位置: `src/renderer/src/assets/styles/color.css`

#### 暗色模式 (默认)

| CSS 变量 | 值 | 用途 |
|---------|-----|------|
| `--color-text` | `rgba(255, 255, 245, 0.9)` | 主要文本颜色 |
| `--color-text-1` | `rgba(255, 255, 245, 0.9)` | 一级文本 |
| `--color-text-2` | `rgba(235, 235, 245, 0.6)` | 二级文本 (次要内容) |
| `--color-text-3` | `rgba(235, 235, 245, 0.38)` | 三级文本 (辅助内容) |
| `--color-primary` | `#00b96b` | 主色调 |
| `--color-link` | `#338cff` | 链接颜色 |
| `--color-background` | `#181818` | 主背景色 |
| `--color-background-soft` | `#222222` | 柔和背景 |
| `--color-background-mute` | `#333333` | 静音背景 |
| `--color-inline-code-text` | `rgb(218, 97, 92)` | 内联代码文本颜色 |

#### 亮色模式

| CSS 变量 | 值 | 用途 |
|---------|-----|------|
| `--color-text` | `rgba(0, 0, 0, 1)` | 主要文本颜色 |
| `--color-text-1` | `rgba(0, 0, 0, 1)` | 一级文本 |
| `--color-text-2` | `rgba(0, 0, 0, 0.6)` | 二级文本 |
| `--color-text-3` | `rgba(0, 0, 0, 0.38)` | 三级文本 |
| `--color-primary` | `#00b96b` | 主色调 |
| `--color-link` | `#1677ff` | 链接颜色 |
| `--color-background` | `#ffffff` | 主背景色 |
| `--color-background-soft` | `rgba(0, 0, 0, 0.04)` | 柔和背景 |
| `--color-background-mute` | `#eee` | 静音背景 |
| `--color-inline-code-text` | `rgba(235, 87, 87)` | 内联代码文本颜色 |

---

## 四、Markdown 元素样式映射

### 4.1 标题样式

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

.markdown h3 { font-size: 1.2em; }
.markdown h4 { font-size: 1em; }
.markdown h5 { font-size: 0.9em; }
.markdown h6 { font-size: 0.8em; }
```

### 4.2 代码块样式

```css
/* 代码块容器 */
.markdown pre {
  border-radius: 8px;
  overflow-x: auto;
  font-family: var(--code-font-family);
  background-color: var(--color-background-mute);
}

/* 代码块内容 */
.markdown pre:not(pre pre) > code:not(pre pre > code) {
  padding: 15px;
  display: block;
}

/* 内联代码 */
.markdown p code,
.markdown li code {
  background: var(--color-background-mute);
  padding: 3px 5px;
  margin: 0 2px;
  border-radius: 5px;
  word-break: keep-all;
  white-space: pre;
}
```

### 4.3 引用块样式

```css
.markdown .markdown-alert,
.markdown blockquote {
  margin: 1.5em 0;
  padding: 1em 1.5em;
  background-color: var(--color-background-soft);
  border-left: 4px solid var(--color-primary);
  border-radius: 0 8px 8px 0;
  font-style: italic;
}
```

### 4.4 链接样式

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

### 4.5 列表样式

```css
.markdown ul { list-style: initial; }
.markdown ol { list-style: decimal; }

.markdown ul,
.markdown ol {
  padding-left: 1.5em;
  margin: 1em 0;
}

.markdown li { margin-bottom: 0.5em; }

.markdown li::marker {
  color: var(--color-text-3);
}
```

### 4.6 表格样式

```css
.markdown table {
  margin: 2em 0;
  font-size: 0.9em;
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border-collapse: separate;
  border: 0.5px solid var(--color-border);
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

---

## 五、主题切换机制

### 5.1 主题提供者

位置: `src/renderer/src/context/CodeStyleProvider.tsx`

```tsx
export const CodeStyleProvider: React.FC<PropsWithChildren> = ({ children }) => {
  const { codeEditor, codeViewer } = useSettings()
  const { theme } = useTheme()

  // 获取当前使用的 CodeMirror 主题对象（只用于编辑器）
  const activeCmTheme = useMemo(() => {
    const field = theme === ThemeMode.light ? 'themeLight' : 'themeDark'
    let themeName = codeEditor[field]
    if (!themeName || themeName === 'auto' || !themeNames.includes(themeName)) {
      themeName = theme === ThemeMode.light ? 'materialLight' : 'dark'
    }
    return cmThemes[themeName as keyof typeof cmThemes] || themeName
  }, [theme, codeEditor, themeNames])

  // ...
}
```

### 5.2 主题模式检测

应用通过 `body` 元素的 `theme-mode` 属性切换主题：

```html
<!-- 暗色模式 -->
<body theme-mode="dark">

<!-- 亮色模式 -->
<body theme-mode="light">
```

CSS 根据属性选择器应用不同变量：

```css
:root {
  /* 暗色模式变量 */
}

[theme-mode='light'] {
  /* 亮色模式变量 */
}
```

---

## 六、流程图

### 6.1 编辑模式渲染流程

```
用户输入
    |
    v
CodeEditor 组件
    |
    +-- useCodeStyle() hook
    |       |
    |       +-- 获取 activeCmTheme (CodeMirror 主题)
    |       |
    |       +-- 根据 theme (light/dark) 选择主题
    |
    +-- useLanguageExtensions('markdown')
    |       |
    |       +-- 加载 Markdown 语言扩展
    |
    v
CodeMirror 渲染
    |
    +-- 应用语法高亮
    |
    +-- 应用主题颜色
    |
    v
显示带语法高亮的 Markdown
```

### 6.2 预览模式渲染流程

```
prompt 文本
    |
    v
usePromptProcessor hook
    |
    +-- 处理变量替换
    |
    v
ReactMarkdown 组件
    |
    +-- 解析 Markdown 语法
    |
    +-- 生成 HTML 结构
    |
    v
MarkdownContainer (.markdown 类)
    |
    +-- 应用 markdown.css 样式
    |
    +-- 使用 CSS 变量着色
    |
    v
渲染预览内容
```

---

## 七、扩展建议

### 7.1 自定义主题

如需添加自定义 CodeMirror 主题：

1. 在 `@uiw/codemirror-themes-all` 中定义主题
2. 在设置中添加主题选项
3. 通过 `codeEditor.themeLight` 或 `codeEditor.themeDark` 配置

### 7.2 自定义颜色

如需修改预览模式颜色：

1. 修改 `color.css` 中的 CSS 变量值
2. 或在组件级别覆盖 `.markdown` 类样式

### 7.3 扩展 Markdown 语法

在 `ReactMarkdown` 组件中添加自定义渲染器：

```tsx
<ReactMarkdown
  components={{
    code: CustomCodeRenderer,
    pre: CustomPreRenderer,
    // ...
  }}
>
  {content}
</ReactMarkdown>
```

---

## 八、总结

| 方面 | 编辑模式 | 预览模式 |
|------|---------|---------|
| 技术方案 | CodeMirror | ReactMarkdown |
| 高亮方式 | 编辑器主题 | CSS 样式 |
| 颜色控制 | CodeMirror 主题配置 | CSS 变量 |
| 切换触发 | 点击编辑按钮 | 保存/双击预览区 |
| 适用场景 | 实时编辑 | 内容展示 |

智能体提示词区域的 Markdown 渲染采用双模式设计，编辑时使用 CodeMirror 提供实时代码高亮，预览时使用 ReactMarkdown 配合 CSS 变量实现主题感知的渲染效果。这种设计既保证了编辑体验，又保证了预览一致性。