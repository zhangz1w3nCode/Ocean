const { exec } = require('child_process')

function createBashTool(cwd) {
  return {
    execute: async (_toolCallId, args, _signal) => {
      const { command, timeout } = args || {}
      if (!command) return toText('错误: 未提供 command 参数')
      try {
        const output = await new Promise((resolve) => {
          const options = { cwd: cwd || undefined, maxBuffer: 10 * 1024 * 1024 }
          if (timeout && timeout > 0) options.timeout = timeout
          exec(command, options, (error, stdout, stderr) => {
            let result = ''
            if (stdout) result += stdout
            if (stderr) result += (result ? '\n' : '') + stderr
            if (error && !result) result = error.message
            resolve(result || '(无输出)')
          })
        })
        return toText(output)
      } catch (e) {
        return toText(`错误: ${e.message}`)
      }
    }
  }
}

function toText(text) {
  return { content: [{ type: 'text', text: String(text) }] }
}

module.exports = createBashTool
