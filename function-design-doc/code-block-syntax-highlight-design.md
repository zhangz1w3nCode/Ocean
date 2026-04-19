# 代码块语法高亮功能设计文档

## 概述

本文档记录了在详情弹窗（智能体/资源/命令）的 Markdown 预览中，为代码块添加语法高亮功能的实现方案。

---

## 1. 需求背景

### 1.1 问题描述

用户在查看智能体详情页面时，Markdown 内容中的代码块（如 ` ```json `、` ```java ` 等）没有语法高亮，所有代码都是纯文本显示，影响阅读体验。

### 1.2 预期效果

代码块应当根据指定的语言显示对应的语法高亮颜色，例如：
- JSON 代码块显示属性名、字符串、数字等不同颜色
- Java 代码块显示关键字、字符串、注释等不同颜色

---

## 2. 技术选型

### 2.1 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| rehype-highlight + highlight.js | 与 react-markdown 生态兼容，轻量 | 样式需额外配置 |
| react-syntax-highlighter | 功能强大，支持主题 | 需自定义 code 组件 |
| shiki | 高质量高亮，支持 VSCode 主题 | 体积较大，需异步加载 |

### 2.2 最终选择

选择 `rehype-highlight` + `highlight.js` 方案，原因：
1. 与现有 `react-markdown` + `remark-gfm` 生态完全兼容
2. 配置简单，只需添加 rehype 插件
3. highlight.js 支持自动语言检测
4. 提供多种主题样式可选

---

## 3. 依赖安装

```bash
pnpm add rehype-highlight highlight.js
```

### 3.1 依赖版本

| 依赖 | 版本 | 用途 |
|------|------|------|
| `rehype-highlight` | ^7.0.2 | rehype 插件，为代码块添加语法高亮 class |
| `highlight.js` | ^11.11.1 | 提供语法高亮样式 |

---

## 4. 实现方案

### 4.1 组件修改

修改三个详情弹窗组件：
- `AgentDetailModal.tsx`
- `ResourceDetailModal.tsx`
- `CommandDetailModal.tsx`

### 4.2 代码示例

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

### 4.3 样式文件修改

**文件路径**: `src/styles/tailwind.css`

添加代码块语法高亮样式优化：

```css
/* 代码块语法高亮样式 - highlight.js 优化 */
.prose pre {
  background-color: #F6F8FA !important;
  border: 1px solid #E1E4E8 !important;
  border-radius: 8px !important;
  padding: 16px !important;
  overflow-x: auto !important;
}

.prose pre code {
  background-color: transparent !important;
  padding: 0 !important;
  border: none !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 13px !important;
  line-height: 1.6 !important;
}

/* highlight.js 语法高亮颜色优化 */
.prose .hljs-comment,
.prose .hljs-quote {
  color: #6A737D !important;
}

.prose .hljs-keyword,
.prose .hljs-selector-tag,
.prose .hljs-addition {
  color: #D73A49 !important;
}

.prose .hljs-string,
.prose .hljs-meta .hljs-meta-string,
.prose .hljs-addition {
  color: #032F62 !important;
}

.prose .hljs-number,
.prose .hljs-literal,
.prose .hljs-type,
.prose .hljs-variable,
.prose .hljs-template-variable,
.prose .hljs-tag .hljs-attr {
  color: #005CC5 !important;
}

.prose .hljs-title,
.prose .hljs-section,
.prose .hljs-selector-id {
  color: #6F42C1 !important;
}
```

---

## 5. 高亮语言支持

### 5.1 支持的语言

highlight.js 支持超过 190 种编程语言，常用的包括：

| 语言 | 标识符 |
|------|--------|
| JavaScript | `javascript`, `js` |
| TypeScript | `typescript`, `ts` |
| Python | `python`, `py` |
| Java | `java` |
| JSON | `json` |
| YAML | `yaml`, `yml` |
| Markdown | `markdown`, `md` |
| HTML | `html` |
| CSS | `css` |
| SQL | `sql` |
| Shell | `shell`, `bash`, `sh` |
| Go | `go` |
| Rust | `rust` |

### 5.2 使用示例

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

```python
def hello():
    print("Hello, World!")
```
```

---

## 6. 样式主题选择

### 6.1 可用主题

highlight.js 提供多种主题，可根据项目风格选择：

| 主题 | 文件路径 | 适用场景 |
|------|----------|----------|
| GitHub | `highlight.js/styles/github.css` | 浅色主题（当前使用） |
| GitHub Dark | `highlight.js/styles/github-dark.css` | 深色主题 |
| One Dark | `highlight.js/styles/atom-one-dark.css` | 类 VSCode 深色 |
| One Light | `highlight.js/styles/atom-one-light.css` | 类 VSCode 浅色 |
| Monokai | `highlight.js/styles/monokai.css` | 经典深色主题 |

### 6.2 当前选择

选择 **GitHub** 主题，因为：
1. 与项目的 macOS 风格浅色 UI 保持一致
2. 颜色搭配简洁，适合阅读
3. GitHub 风格广为人知，用户熟悉

---

## 7. 文件改动清单

| 文件路径 | 改动类型 | 说明 |
|----------|----------|------|
| `flow-editor/package.json` | 新增依赖 | 添加 rehype-highlight 和 highlight.js |
| `flow-editor/src/components/agent/AgentDetailModal.tsx` | 修改 | 添加 rehypeHighlight 插件 |
| `flow-editor/src/components/resource/ResourceDetailModal.tsx` | 修改 | 添加 rehypeHighlight 插件 |
| `flow-editor/src/components/command/CommandDetailModal.tsx` | 修改 | 添加 rehypeHighlight 插件 |
| `flow-editor/src/styles/tailwind.css` | 新增样式 | 添加代码块高亮样式 |

---

## 8. 扩展建议

如需进一步优化代码块体验：

1. **代码复制按钮**: 添加一键复制代码功能
2. **行号显示**: 集成 `rehype-prism-plus` 支持行号
3. **代码差异高亮**: 对于 diff 语言显示增删标记
4. **主题切换**: 支持深色/浅色主题自动切换

---

## 9. 版本记录

| 日期 | 版本 | 变更内容 |
|------|------|----------|
| 2025-02-25 | v1.0.0 | 初始实现，支持智能体/资源/命令详情弹窗代码块语法高亮 |