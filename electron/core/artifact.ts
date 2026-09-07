import * as fs from 'node:fs'
import * as path from 'node:path'

export function artifactDir(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
  version?: string,
): string {
  const base = path.join(
    root, '.workflows', workflow, 'instance', instanceId, 'artifacts', nodeName, invoke,
  )
  return version ? path.join(base, version) : base
}

function fileExistsNonEmpty(filePath: string): boolean {
  try {
    return fs.statSync(filePath).size > 0
  } catch {
    return false
  }
}

export function getLatestVersion(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
): number {
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke)
  if (!fs.existsSync(dir)) return 0
  let maxVersion = 0
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const match = entry.name.match(/^v(\d+)$/)
      if (match) {
        const v = parseInt(match[1], 10)
        if (v > maxVersion) maxVersion = v
      }
    }
  } catch {
    // ignore
  }
  // Backward compat: no version dirs but detail.md exists directly → treat as v1
  if (maxVersion === 0) {
    if (fileExistsNonEmpty(path.join(dir, 'detail.md'))) return 1
    if (fileExistsNonEmpty(path.join(dir, 'error.md'))) return 1
  }
  return maxVersion
}

export function listVersions(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
): string[] {
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke)
  if (!fs.existsSync(dir)) return []
  const versions: string[] = []
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      if (/^v\d+$/.test(entry.name)) versions.push(entry.name)
    }
  } catch {
    // ignore
  }
  return versions.sort((a, b) => {
    const na = parseInt(a.slice(1), 10)
    const nb = parseInt(b.slice(1), 10)
    return na - nb
  })
}

export function writeDetail(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
  content: string,
  version?: string,
): string {
  const ver = version ?? 'v1'
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke, ver)
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
  version?: string,
): string {
  const ver = version ?? 'v1'
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke, ver)
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

export function updateDetail(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
  content: string,
): string {
  const latest = getLatestVersion(root, workflow, instanceId, nodeName, invoke)
  const nextVersion = `v${latest + 1}`
  return writeDetail(root, workflow, instanceId, nodeName, invoke, content, nextVersion)
}

export function hasDetail(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
): boolean {
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke)
  // Check version directories
  if (fs.existsSync(dir)) {
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        if (!/^v\d+$/.test(entry.name)) continue
        if (fileExistsNonEmpty(path.join(dir, entry.name, 'detail.md'))) return true
      }
    } catch {
      // ignore
    }
  }
  // Backward compat: detail.md directly in invoke dir
  return fileExistsNonEmpty(path.join(dir, 'detail.md'))
}

export function readContentAtVersion(
  root: string,
  workflow: string,
  instanceId: string,
  nodeName: string,
  invoke: string,
  version: string,
): ['detail' | 'error', string] | null {
  const dir = artifactDir(root, workflow, instanceId, nodeName, invoke, version)
  if (!fs.existsSync(dir)) {
    // Backward compat: v1 may not have a version dir, read from invoke dir directly
    if (version === 'v1') {
      const baseDir = artifactDir(root, workflow, instanceId, nodeName, invoke)
      return readFromDir(baseDir)
    }
    return null
  }
  return readFromDir(dir)
}

function readFromDir(dir: string): ['detail' | 'error', string] | null {
  const detailPath = path.join(dir, 'detail.md')
  const errorPath = path.join(dir, 'error.md')
  if (fs.existsSync(detailPath)) {
    try {
      const content = fs.readFileSync(detailPath, 'utf-8')
      if (content !== '') return ['detail', content]
    } catch {
      // fall through
    }
  }
  if (fs.existsSync(errorPath)) {
    try {
      const content = fs.readFileSync(errorPath, 'utf-8')
      if (content !== '') return ['error', content]
    } catch {
      // fall through
    }
  }
  return null
}
