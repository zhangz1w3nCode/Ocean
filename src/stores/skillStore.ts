import { create } from 'zustand'
import type { SkillFile, CreateSkillInput, SkillResource } from '../types'
import {
  saveSkillFilesToLocal,
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
  addSkillFile: (skill: SkillFile) => void
  updateSkillFile: (id: string, updates: Partial<SkillFile>) => void
  deleteSkillFile: (id: string) => void
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

  addSkillFile: (skill) =>
    set((state) => {
      const newSkills = [skill, ...state.skillFiles]
      // 异步保存到本地
      saveSkillFilesToLocal(newSkills)
      return { skillFiles: newSkills }
    }),

  updateSkillFile: (id, updates) =>
    set((state) => {
      const newSkills = state.skillFiles.map((skill) =>
        skill.id === id ? { ...skill, ...updates } : skill
      )
      // 异步保存到本地
      saveSkillFilesToLocal(newSkills)
      return { skillFiles: newSkills }
    }),

  deleteSkillFile: (id) =>
    set((state) => {
      const skillToDelete = state.skillFiles.find((skill) => skill.id === id)
      const newSkills = state.skillFiles.filter((skill) => skill.id !== id)
      // 异步删除目录并保存列表
      if (skillToDelete) {
        deleteSkillFromLocal(skillToDelete.name)
      }
      return { skillFiles: newSkills }
    }),

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