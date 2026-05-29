/**
 * Ocean 应用图标生成脚本
 *
 * 将 build/icon.svg 转换为 build/icon.png（1024x1024）
 * electron-builder 会自动将 PNG 转换为各平台所需格式：
 *   - macOS: .icns
 *   - Windows: .ico
 *   - Linux: .png
 *
 * 用法：
 *   pnpm build:icon
 *
 * 依赖：sharp (已添加到 devDependencies)
 */

const fs = require('fs')
const path = require('path')

const svgPath = path.join(__dirname, '..', 'build', 'icon.svg')
const pngPath = path.join(__dirname, '..', 'build', 'icon.png')

async function generate() {
  let sharp
  try {
    sharp = require('sharp')
  } catch {
    console.error('错误：未安装 sharp。请运行：pnpm add -D sharp')
    process.exit(1)
  }

  if (!fs.existsSync(svgPath)) {
    console.error(`错误：找不到 SVG 源文件 ${svgPath}`)
    process.exit(1)
  }

  const svgBuffer = fs.readFileSync(svgPath)

  await sharp(svgBuffer)
    .resize(1024, 1024, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(pngPath)

  console.log(`图标已生成: ${pngPath}`)
  console.log('接下来可以运行 pnpm electron:build 进行打包')
}

generate().catch((err) => {
  console.error('生成图标失败:', err)
  process.exit(1)
})
