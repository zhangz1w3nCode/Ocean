import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import {
  artifactDir,
  getLatestVersion,
  listVersions,
  writeDetail,
  writeError,
  updateDetail,
  hasDetail,
  readContentAtVersion,
} from '../artifact'

describe('artifact versioning', () => {
  let tmpDir: string
  const workflow = 'test-wf'
  const instanceId = 'test-instance'
  const node = 'testNode'
  const invoke = 'invoke-test-001'

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  describe('artifactDir', () => {
    it('returns base path without version', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke)
      expect(dir).toBe(path.join(tmpDir, '.workflows', workflow, 'instance', instanceId, 'artifacts', node, invoke))
    })

    it('includes version in path when provided', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke, 'v1')
      expect(dir).toBe(path.join(tmpDir, '.workflows', workflow, 'instance', instanceId, 'artifacts', node, invoke, 'v1'))
    })
  })

  describe('getLatestVersion', () => {
    it('returns 0 when no artifact dir exists', () => {
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(0)
    })

    it('returns 1 when old-style detail.md exists (backward compat)', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'content')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(1)
    })

    it('returns 1 when old-style error.md exists (backward compat)', () => {
      writeError(tmpDir, workflow, instanceId, node, invoke, 'error reason')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(1)
    })

    it('returns max version number when version dirs exist', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'v1 content', 'v1')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'v2 content', 'v2')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'v3 content', 'v3')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(3)
    })

    it('returns 0 when dir exists but no version dirs and no detail.md', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'other.txt'), 'not an artifact')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(0)
    })
  })

  describe('listVersions', () => {
    it('returns empty array when no dir exists', () => {
      expect(listVersions(tmpDir, workflow, instanceId, node, invoke)).toEqual([])
    })

    it('returns sorted version array', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'c3', 'v3')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'c1', 'v1')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'c2', 'v2')
      expect(listVersions(tmpDir, workflow, instanceId, node, invoke)).toEqual(['v1', 'v2', 'v3'])
    })
  })

  describe('writeDetail', () => {
    it('writes to v1 by default', () => {
      const filePath = writeDetail(tmpDir, workflow, instanceId, node, invoke, 'test content')
      expect(filePath).toContain('v1')
      expect(filePath).toContain('detail.md')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('test content')
    })

    it('writes to specified version', () => {
      const filePath = writeDetail(tmpDir, workflow, instanceId, node, invoke, 'v2 content', 'v2')
      expect(filePath).toContain('v2')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('v2 content')
    })

    it('does not overwrite previous version', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'original', 'v1')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'updated', 'v2')
      const v1Content = fs.readFileSync(
        path.join(artifactDir(tmpDir, workflow, instanceId, node, invoke), 'v1', 'detail.md'), 'utf-8'
      )
      expect(v1Content).toBe('original')
    })
  })

  describe('writeError', () => {
    it('writes error.md to v1 by default', () => {
      const filePath = writeError(tmpDir, workflow, instanceId, node, invoke, 'error reason')
      expect(filePath).toContain('v1')
      expect(filePath).toContain('error.md')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('error reason')
    })
  })

  describe('updateDetail', () => {
    it('creates v2 after v1 exists', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'v1 content')
      const filePath = updateDetail(tmpDir, workflow, instanceId, node, invoke, 'v2 content')
      expect(filePath).toContain('v2')
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('v2 content')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(2)
    })

    it('creates v3 after v2 exists', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'c1', 'v1')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'c2', 'v2')
      const filePath = updateDetail(tmpDir, workflow, instanceId, node, invoke, 'c3')
      expect(filePath).toContain('v3')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(3)
    })

    it('creates v1 when no existing artifact (latest=0)', () => {
      updateDetail(tmpDir, workflow, instanceId, node, invoke, 'first content')
      expect(getLatestVersion(tmpDir, workflow, instanceId, node, invoke)).toBe(1)
    })
  })

  describe('hasDetail', () => {
    it('returns false when no artifact exists', () => {
      expect(hasDetail(tmpDir, workflow, instanceId, node, invoke)).toBe(false)
    })

    it('returns true for old-style detail.md (backward compat)', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'content')
      expect(hasDetail(tmpDir, workflow, instanceId, node, invoke)).toBe(true)
    })

    it('returns true for version directory detail.md', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'content', 'v1')
      expect(hasDetail(tmpDir, workflow, instanceId, node, invoke)).toBe(true)
    })

    it('returns true for mixed scenario (old detail.md + version dirs)', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'detail.md'), 'old content')
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'new content', 'v2')
      expect(hasDetail(tmpDir, workflow, instanceId, node, invoke)).toBe(true)
    })

    it('returns false for empty detail.md', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'detail.md'), '')
      expect(hasDetail(tmpDir, workflow, instanceId, node, invoke)).toBe(false)
    })
  })

  describe('readContentAtVersion', () => {
    it('returns null when version does not exist', () => {
      expect(readContentAtVersion(tmpDir, workflow, instanceId, node, invoke, 'v2')).toBeNull()
    })

    it('reads from version directory', () => {
      writeDetail(tmpDir, workflow, instanceId, node, invoke, 'v1 content', 'v1')
      const result = readContentAtVersion(tmpDir, workflow, instanceId, node, invoke, 'v1')
      expect(result).not.toBeNull()
      expect(result![0]).toBe('detail')
      expect(result![1]).toBe('v1 content')
    })

    it('reads error.md when detail.md not present', () => {
      writeError(tmpDir, workflow, instanceId, node, invoke, 'error reason', 'v1')
      const result = readContentAtVersion(tmpDir, workflow, instanceId, node, invoke, 'v1')
      expect(result).not.toBeNull()
      expect(result![0]).toBe('error')
      expect(result![1]).toBe('error reason')
    })

    it('falls back to old-style detail.md for v1 (backward compat)', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'detail.md'), 'old style content')
      const result = readContentAtVersion(tmpDir, workflow, instanceId, node, invoke, 'v1')
      expect(result).not.toBeNull()
      expect(result![1]).toBe('old style content')
    })

    it('returns null when version dir exists but both detail.md and error.md are empty', () => {
      const dir = artifactDir(tmpDir, workflow, instanceId, node, invoke, 'v1')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'detail.md'), '')
      const result = readContentAtVersion(tmpDir, workflow, instanceId, node, invoke, 'v1')
      expect(result).toBeNull()
    })
  })
})
