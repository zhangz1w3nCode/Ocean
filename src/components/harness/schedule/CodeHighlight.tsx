import type { FC } from 'react'
import { useMemo } from 'react'
import hljs from 'highlight.js/lib/core'

// 按需注册常用语言（避免全量引入 highlight.js）
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import bash from 'highlight.js/lib/languages/bash'
import shell from 'highlight.js/lib/languages/shell'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import diff from 'highlight.js/lib/languages/diff'
import markdown from 'highlight.js/lib/languages/markdown'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import ruby from 'highlight.js/lib/languages/ruby'
import php from 'highlight.js/lib/languages/php'
import swift from 'highlight.js/lib/languages/swift'
import kotlin from 'highlight.js/lib/languages/kotlin'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'
import toml from 'highlight.js/lib/languages/ini'
import graphql from 'highlight.js/lib/languages/graphql'
import lua from 'highlight.js/lib/languages/lua'
import scss from 'highlight.js/lib/languages/scss'
import less from 'highlight.js/lib/languages/less'
import plaintext from 'highlight.js/lib/languages/plaintext'

// 注册
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('python', python)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('php', php)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('toml', toml)
hljs.registerLanguage('graphql', graphql)
hljs.registerLanguage('lua', lua)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('less', less)
hljs.registerLanguage('plaintext', plaintext)
// xml 覆盖 html/vue/svelte
hljs.registerAliases(['html', 'vue', 'svelte', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['sh', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['c', 'h', 'cpp', 'hpp', 'cc', 'hh', 'c++'], { languageName: 'cpp' })
hljs.registerAliases(['cs'], { languageName: 'csharp' })
hljs.registerAliases(['rs'], { languageName: 'rust' })
hljs.registerAliases(['rb'], { languageName: 'ruby' })
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' })
hljs.registerAliases(['docker'], { languageName: 'dockerfile' })
hljs.registerAliases(['gql'], { languageName: 'graphql' })

const EXT_LANG: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
  ts: 'typescript', tsx: 'typescript',
  html: 'xml', vue: 'xml', svelte: 'xml', svg: 'xml',
  css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  sh: 'bash', zsh: 'bash', bash: 'bash',
  py: 'python', sql: 'sql', diff: 'diff', patch: 'diff',
  md: 'markdown', markdown: 'markdown',
  go: 'go', rs: 'rust', java: 'java',
  c: 'cpp', h: 'cpp', cpp: 'cpp', hpp: 'cpp', cc: 'cpp', 'c++': 'cpp',
  cs: 'csharp', rb: 'ruby', php: 'php',
  swift: 'swift', kt: 'kotlin', kts: 'kotlin',
  dockerfile: 'dockerfile',
  ini: 'ini', cfg: 'ini', conf: 'ini',
  gql: 'graphql', graphql: 'graphql',
  lua: 'lua',
  txt: 'plaintext',
}

import 'highlight.js/styles/github.css'

// 代码文件语法高亮渲染（用于文件预览 Tab 的非 markdown 内容）
export const CodeHighlight: FC<{ code: string; filePath: string }> = ({ code, filePath }) => {
  const html = useMemo(() => {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const lang = EXT_LANG[ext]
    if (!lang || !hljs.getLanguage(lang)) {
      // 无匹配语言：纯文本
      return `<span class="hljs-plain">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
    }
    try {
      return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
    } catch {
      return `<span class="hljs-plain">${code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`
    }
  }, [code, filePath])

  return (
    <pre className="px-4 py-3 text-[11px] font-mono whitespace-pre-wrap break-all leading-relaxed">
      <code className="hljs bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  )
}
