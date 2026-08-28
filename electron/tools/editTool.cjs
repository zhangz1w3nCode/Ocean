const fs = require('fs')
const path = require('path')

function createEditTool(cwd) {
  return {
    execute: async (_toolCallId, args, _signal) => {
      const { path: relPath, oldText, newText } = args || {}
      if (!relPath) return toText('错误: 未提供 path 参数')
      if (oldText === undefined) return toText('错误: 未提供 oldText 参数')
      if (newText === undefined) return toText('错误: 未提供 newText 参数')
      const absPath = path.isAbsolute(relPath) ? relPath : path.join(cwd, relPath)
      try {
        if (!fs.existsSync(absPath)) return toText(`错误: 文件不存在: ${relPath}`)
        let content = fs.readFileSync(absPath, 'utf8')
        if (!content.includes(oldText)) return toText(`错误: 未在文件中找到要替换的文本`)
        const newContent = content.replace(oldText, newText)
        fs.writeFileSync(absPath, newContent, 'utf8')
        return toText(`成功编辑文件: ${relPath}`)
      } catch (e) {
        return toText(`错误: ${e.message}`)
      }
    }
  }
}

function toText(text) {
  return { content: [{ type: 'text', text: String(text) }] }
}

module.exports = createEditTool
