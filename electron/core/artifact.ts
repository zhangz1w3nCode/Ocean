import * as fs from 'node:fs'
import * as path from 'node:path'

export function artifactDir(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
): string {
  return path.join(
    root, '.workflows', workflow, 'instance', instanceId, 'artifacts', nodeName, invoke,
  )
}

export function writeDetail(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
  content: string,
): string {
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e: any) {
    throw new Error(`创建产物目录失败: ${e.message}`)
  }
  const filePath = path.join(dir, 'detail.md')
  try {
    fs.writeFileSync(filePath, content)
  } catch (e: any) {
    throw new Error(`写入 detail.md 失败: ${e.message}`)
  }
  return filePath
}

export function writeError(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
  reason: string,
): string {
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (e: any) {
    throw new Error(`创建产物目录失败: ${e.message}`)
  }
  const filePath = path.join(dir, 'error.md')
  try {
    fs.writeFileSync(filePath, reason)
  } catch (e: any) {
    throw new Error(`写入 error.md 失败: ${e.message}`)
  }
  return filePath
}

export function hasDetail(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
): boolean {
  const filePath = path.join(
    artifactDir(root, workflow, instanceId, nodeName, invoke), 'detail.md',
  )
  try {
    const stats = fs.statSync(filePath)
    return stats.size > 0
  } catch {
    return false
  }
}
