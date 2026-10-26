// 幂等确保 electron/dist 目录与 dist/package.json（{type:'commonjs'}）存在。
// 仓库根 package.json 是 type:module——缺 dist/package.json 时 tsc 产物会被按 ESM
// 解析直接报错（迁移指南陷阱 2）。完整 build:electron 最后一步也会写它；本脚本
// 供 dev/serve 类脚本前置调用（tsc watch 只产出 js 不产 package.json）。
const fs = require('fs')
const path = require('path')

const distDir = path.join(__dirname, '..', 'electron', 'dist')
fs.mkdirSync(distDir, { recursive: true })

const pkgPath = path.join(distDir, 'package.json')
const version = require(path.join(__dirname, '..', 'package.json')).version
fs.writeFileSync(pkgPath, JSON.stringify({ type: 'commonjs', version }))
