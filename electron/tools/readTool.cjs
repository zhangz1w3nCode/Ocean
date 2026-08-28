const fs = require('fs')
const path = require('path')

function createReadTool(cwd) {
  return {
    execute: async (_toolCallId, args, _signal) => {
      const { path: relPath, offset, limit } = args || {}
      if (!relPath) return toText('错误: 未提供 path 参数')
      const absPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath)
      try {
        if (!fs.existsSync(absPath)) return toText(`错误: 文件不存在: ${relPath}`)
        const stat = fs.statSync(absPath)
        if (stat.isDirectory()) return toText(`错误: 路径是目录而非文件: ${relPath}`)
        let content = fs.readFileSync(absPath, 'utf8')
        let lines = content.split('\n')
        if (offset && offset > 0) lines = lines.slice(offset - 1)
        if (limit && limit > 0) lines = lines.slice(0, limit)
        return toText(lines.join('\n'))
      } catch (e) {
        return toText(`错误: ${e.message}`)
      }
    }
  }
}

function toText(text) {
  return { content: [{ type: 'text', text: String(text) }] }
}

module.exports = createReadTool
