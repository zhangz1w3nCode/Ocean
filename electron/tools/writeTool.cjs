const fs = require('fs')
const path = require('path')

function createWriteTool(cwd) {
  return {
    execute: async (_toolCallId, args, _signal) => {
      const { path: relPath, content } = args || {}
      if (!relPath) return toText('错误: 未提供 path 参数')
      if (content === undefined) return toText('错误: 未提供 content 参数')
      const absPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath)
      try {
        fs.mkdirSync(path.dirname(absPath), { recursive: true })
        fs.writeFileSync(absPath, content, 'utf8')
        return toText(`成功写入文件: ${relPath}`)
      } catch (e) {
        return toText(`错误: ${e.message}`)
      }
    }
  }
}

function toText(text) {
  return { content: [{ type: 'text', text: String(text) }] }
}

module.exports = createWriteTool
