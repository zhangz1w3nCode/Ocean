import { create } from 'zustand'
import type { SkillFile, CreateSkillInput, SkillResource } from '../types'
import {
  saveSkillFilesToLocal,
  saveSingleSkillFileToLocal,
  loadSingleSkillFileFromLocal,
  loadSkillFilesFromLocal,
  deleteSkillFromLocal,
  createSkillDirectory,
  loadSkillResources,
  saveSkillResource,
  deleteSkillResource,
} from '../utils/storage'

interface SkillState {
  skillFiles: SkillFile[]
  isLoaded: boolean
  setSkillFiles: (skills: SkillFile[]) => void
  addSkillFile: (skill: SkillFile) => Promise<boolean>
  updateSkillFile: (id: string, updates: Partial<SkillFile>) => Promise<boolean>
  deleteSkillFile: (id: string) => Promise<boolean>
  loadSkillFiles: () => Promise<void>
  createSkill: (input: CreateSkillInput) => Promise<SkillFile | null>
  // 资源文件管理
  loadResources: (skillName: string, resourceType: 'scripts' | 'references' | 'examples') => Promise<SkillResource[]>
  saveResource: (skillName: string, resourceType: 'scripts' | 'references' | 'examples', fileName: string, content: string) => Promise<boolean>
  deleteResource: (skillName: string, resourceType: 'scripts' | 'references' | 'examples', fileName: string) => Promise<boolean>
}

export const useSkillStore = create<SkillState>((set, get) => ({
  skillFiles: [],
  isLoaded: false,

  setSkillFiles: (skillFiles) => {
    set({ skillFiles })
    // 自动保存到本地
    saveSkillFilesToLocal(skillFiles)
  },

  addSkillFile: async (skill) => {
    const success = await saveSingleSkillFileToLocal(skill)
    if (success) {
      const diskSkill = await loadSingleSkillFileFromLocal(skill.name)
      if (diskSkill) {
        set({ skillFiles: [{ ...diskSkill, id: skill.id }, ...get().skillFiles] })
      } else {
        set({ skillFiles: [skill, ...get().skillFiles] })
      }
    }
    return success
  },

  updateSkillFile: async (id, updates) => {
    const skill = get().skillFiles.find(s => s.id === id)
    if (!skill) return false
    const updatedSkill = { ...skill, ...updates }
    const success = await saveSingleSkillFileToLocal(updatedSkill)
    if (success) {
      const diskSkill = await loadSingleSkillFileFromLocal(skill.name)
      if (diskSkill) {
        set({ skillFiles: get().skillFiles.map(s => s.id === id ? { ...diskSkill, id: s.id, createdAt: s.createdAt } : s) })
      } else {
        set({ skillFiles: get().skillFiles.map(s => s.id === id ? updatedSkill : s) })
      }
    }
    return success
  },

  deleteSkillFile: async (id) => {
    const skillToDelete = get().skillFiles.find((skill) => skill.id === id)
    if (!skillToDelete) return true
    const success = await deleteSkillFromLocal(skillToDelete.name)
    if (success) {
      set({ skillFiles: get().skillFiles.filter((skill) => skill.id !== id) })
    }
    return success
  },

  loadSkillFiles: async () => {
    // 从本地加载
    const loadedSkills = await loadSkillFilesFromLocal()

    if (loadedSkills && loadedSkills.length > 0) {
      set({ skillFiles: loadedSkills, isLoaded: true })
    } else {
      // 没有本地数据，使用空数组
      set({ skillFiles: [], isLoaded: true })
    }
  },

  createSkill: async (input: CreateSkillInput) => {
    try {
      const result = await createSkillDirectory(input)
      if (result) {
        // 重新加载技能列表
        await get().loadSkillFiles()
        // 返回新创建的技能
        const newSkill = get().skillFiles.find(s => s.name === input.name)
        return newSkill || null
      }
      return null
    } catch (error) {
      console.error('创建技能失败:', error)
      return null
    }
  },

  loadResources: async (skillName, resourceType) => {
    try {
      const resources = await loadSkillResources(skillName, resourceType)
      return resources
    } catch (error) {
      console.error('加载资源文件失败:', error)
      return []
    }
  },

  saveResource: async (skillName, resourceType, fileName, content) => {
    try {
      const success = await saveSkillResource(skillName, resourceType, fileName, content)
      if (success) {
        // 更新技能文件中的资源列表
        const skills = get().skillFiles
        const skillIndex = skills.findIndex(s => s.name === skillName)
        if (skillIndex !== -1) {
          const skill = skills[skillIndex]
          const resourceList = skill[resourceType] || []
          if (!resourceList.includes(fileName)) {
            const updatedSkill = {
              ...skill,
              [resourceType]: [...resourceList, fileName]
            }
            set((state) => ({
              skillFiles: state.skillFiles.map(s =>
                s.id === skill.id ? updatedSkill : s
              )
            }))
          }
        }
      }
      return success
    } catch (error) {
      console.error('保存资源文件失败:', error)
      return false
    }
  },

  deleteResource: async (skillName, resourceType, fileName) => {
    try {
      const success = await deleteSkillResource(skillName, resourceType, fileName)
      if (success) {
        // 更新技能文件中的资源列表
        set((state) => ({
          skillFiles: state.skillFiles.map(s => {
            if (s.name === skillName) {
              return {
                ...s,
                [resourceType]: (s[resourceType] || []).filter(f => f !== fileName)
              }
            }
            return s
          })
        }))
      }
      return success
    } catch (error) {
      console.error('删除资源文件失败:', error)
      return false
    }
  },
}))