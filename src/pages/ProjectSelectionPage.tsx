import type { FC } from 'react'
import { motion } from 'framer-motion'
import { FolderOpen, FolderPlus, Trash2 } from 'lucide-react'
import { useProjectStore } from '../stores/projectStore'
import type { Project } from '../types'

interface ProjectCardProps {
  project: Project
  onSelect: () => void
  onRemove: (e: React.MouseEvent) => void
}

const ProjectCard: FC<ProjectCardProps> = ({ project, onSelect, onRemove }) => {
  // 显示完整的项目路径
  const pathPreview = project.path || ''

  return (
    <motion.button
      onClick={onSelect}
      className="relative w-full bg-white rounded-2xl border border-gray-200 text-left group overflow-hidden"
      whileTap={{ scale: 0.99 }}
      style={{
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {/* 头部区域 */}
      <div className="px-4 pb-0 pt-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            {/* FolderOpen 图标 */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100">
              <FolderOpen size={18} className="text-gray-600" strokeWidth={1.5} />
            </div>
            {/* 名称 */}
            <h3 className="font-bold text-[17px] text-gray-900">
              {project.name}
            </h3>
          </div>

          {/* 操作按钮区 */}
          <div className="flex items-center gap-1">
            {/* 悬浮时显示的移除按钮 */}
            <button
              onClick={onRemove}
              className="p-1.5 rounded-md hover:bg-red-50 text-macos-text-secondary hover:text-macos-error opacity-0 group-hover:opacity-100 transition-opacity"
              title="从列表移除"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 内容预览区 - 浅灰色背景 */}
      <div className="mx-4 mb-4 mt-0 p-4 rounded-lg bg-gray-50">
        <p className="text-xs text-gray-500 leading-relaxed line-clamp-2">
          {pathPreview || '暂无路径'}
        </p>
      </div>
    </motion.button>
  )
}

export const ProjectSelectionPage: FC = () => {
  const {
    recentProjects,
    isLoading,
    openProjectFromFolder,
    selectProject,
    removeRecentProject,
  } = useProjectStore()

  const handleOpenFolder = async () => {
    try {
      await openProjectFromFolder()
    } catch (error) {
      console.error('打开项目失败:', error)
    }
  }

  const handleSelectProject = async (project: Project) => {
    try {
      await selectProject(project)
    } catch (error) {
      console.error('选择项目失败:', error)
    }
  }

  const handleRemoveProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    try {
      await removeRecentProject(projectId)
    } catch (error) {
      console.error('移除项目失败:', error)
    }
  }

  return (
    <div className="h-screen w-full bg-macos-bg flex flex-col items-center justify-center p-8 pt-10">
      {/* 窗口拖动区域 - 用于 macOS hiddenInset 标题栏 */}
      <div className="fixed top-0 left-0 right-0 h-8 drag-region z-50" />

      {/* 加载遮罩 */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-50 no-drag">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            <span className="text-sm text-macos-text-secondary">Ocean</span>
          </div>
        </div>
      )}

      {/* Logo */}
      <div className="flex flex-col items-center mb-8 no-drag">
        <div
          className="w-24 h-24 rounded-2xl flex items-center justify-center relative overflow-hidden cursor-pointer"
          style={{
            background: '#1f2937',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            transition: 'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.5)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.4)'
          }}
        >
          {/* 像素风格 OCEAN Logo - 全大写16x20网格 */}
          <svg width="100" height="32" viewBox="0 0 84 32" className="relative z-10 pointer-events-none">
            {/* O - 大写空心 8x10 */}
            <rect x="2" y="8" width="2" height="2" fill="#f9fafb" /><rect x="4" y="8" width="2" height="2" fill="#f9fafb" /><rect x="6" y="8" width="2" height="2" fill="#f9fafb" /><rect x="8" y="8" width="2" height="2" fill="#f9fafb" /><rect x="10" y="8" width="2" height="2" fill="#f9fafb" /><rect x="12" y="8" width="2" height="2" fill="#f9fafb" /><rect x="14" y="8" width="2" height="2" fill="#f9fafb" />
            <rect x="2" y="10" width="2" height="2" fill="#f9fafb" /><rect x="14" y="10" width="2" height="2" fill="#f9fafb" />
            <rect x="2" y="12" width="2" height="2" fill="#f9fafb" /><rect x="14" y="12" width="2" height="2" fill="#f9fafb" />
            <rect x="2" y="14" width="2" height="2" fill="#f9fafb" /><rect x="14" y="14" width="2" height="2" fill="#f9fafb" />
            <rect x="2" y="16" width="2" height="2" fill="#f9fafb" /><rect x="14" y="16" width="2" height="2" fill="#f9fafb" />
            <rect x="2" y="18" width="2" height="2" fill="#f9fafb" /><rect x="14" y="18" width="2" height="2" fill="#f9fafb" />
            <rect x="2" y="20" width="2" height="2" fill="#f9fafb" /><rect x="4" y="20" width="2" height="2" fill="#f9fafb" /><rect x="6" y="20" width="2" height="2" fill="#f9fafb" /><rect x="8" y="20" width="2" height="2" fill="#f9fafb" /><rect x="10" y="20" width="2" height="2" fill="#f9fafb" /><rect x="12" y="20" width="2" height="2" fill="#f9fafb" /><rect x="14" y="20" width="2" height="2" fill="#f9fafb" />

            {/* C - 大写开口向右 */}
            <rect x="20" y="8" width="2" height="2" fill="#f9fafb" /><rect x="22" y="8" width="2" height="2" fill="#f9fafb" /><rect x="24" y="8" width="2" height="2" fill="#f9fafb" /><rect x="26" y="8" width="2" height="2" fill="#f9fafb" /><rect x="28" y="8" width="2" height="2" fill="#f9fafb" /><rect x="30" y="8" width="2" height="2" fill="#f9fafb" />
            <rect x="20" y="10" width="2" height="2" fill="#f9fafb" />
            <rect x="20" y="12" width="2" height="2" fill="#f9fafb" />
            <rect x="20" y="14" width="2" height="2" fill="#f9fafb" />
            <rect x="20" y="16" width="2" height="2" fill="#f9fafb" />
            <rect x="20" y="18" width="2" height="2" fill="#f9fafb" />
            <rect x="20" y="20" width="2" height="2" fill="#f9fafb" /><rect x="22" y="20" width="2" height="2" fill="#f9fafb" /><rect x="24" y="20" width="2" height="2" fill="#f9fafb" /><rect x="26" y="20" width="2" height="2" fill="#f9fafb" /><rect x="28" y="20" width="2" height="2" fill="#f9fafb" /><rect x="30" y="20" width="2" height="2" fill="#f9fafb" />

            {/* E - 大写三横一竖 */}
            <rect x="36" y="8" width="2" height="2" fill="#f9fafb" /><rect x="38" y="8" width="2" height="2" fill="#f9fafb" /><rect x="40" y="8" width="2" height="2" fill="#f9fafb" /><rect x="42" y="8" width="2" height="2" fill="#f9fafb" /><rect x="44" y="8" width="2" height="2" fill="#f9fafb" /><rect x="46" y="8" width="2" height="2" fill="#f9fafb" />
            <rect x="36" y="10" width="2" height="2" fill="#f9fafb" />
            <rect x="36" y="12" width="2" height="2" fill="#f9fafb" />
            <rect x="36" y="14" width="2" height="2" fill="#f9fafb" /><rect x="38" y="14" width="2" height="2" fill="#f9fafb" /><rect x="40" y="14" width="2" height="2" fill="#f9fafb" /><rect x="42" y="14" width="2" height="2" fill="#f9fafb" /><rect x="44" y="14" width="2" height="2" fill="#f9fafb" />
            <rect x="36" y="16" width="2" height="2" fill="#f9fafb" />
            <rect x="36" y="18" width="2" height="2" fill="#f9fafb" />
            <rect x="36" y="20" width="2" height="2" fill="#f9fafb" /><rect x="38" y="20" width="2" height="2" fill="#f9fafb" /><rect x="40" y="20" width="2" height="2" fill="#f9fafb" /><rect x="42" y="20" width="2" height="2" fill="#f9fafb" /><rect x="44" y="20" width="2" height="2" fill="#f9fafb" /><rect x="46" y="20" width="2" height="2" fill="#f9fafb" />

            {/* A - 大写尖顶 */}
            <rect x="54" y="8" width="2" height="2" fill="#f9fafb" /><rect x="56" y="8" width="2" height="2" fill="#f9fafb" /><rect x="58" y="8" width="2" height="2" fill="#f9fafb" /><rect x="60" y="8" width="2" height="2" fill="#f9fafb" />
            <rect x="52" y="10" width="2" height="2" fill="#f9fafb" /><rect x="62" y="10" width="2" height="2" fill="#f9fafb" />
            <rect x="52" y="12" width="2" height="2" fill="#f9fafb" /><rect x="62" y="12" width="2" height="2" fill="#f9fafb" />
            <rect x="52" y="14" width="2" height="2" fill="#f9fafb" /><rect x="54" y="14" width="2" height="2" fill="#f9fafb" /><rect x="56" y="14" width="2" height="2" fill="#f9fafb" /><rect x="58" y="14" width="2" height="2" fill="#f9fafb" /><rect x="60" y="14" width="2" height="2" fill="#f9fafb" /><rect x="62" y="14" width="2" height="2" fill="#f9fafb" />
            <rect x="52" y="16" width="2" height="2" fill="#f9fafb" /><rect x="62" y="16" width="2" height="2" fill="#f9fafb" />
            <rect x="52" y="18" width="2" height="2" fill="#f9fafb" /><rect x="62" y="18" width="2" height="2" fill="#f9fafb" />
            <rect x="52" y="20" width="2" height="2" fill="#f9fafb" /><rect x="62" y="20" width="2" height="2" fill="#f9fafb" />

            {/* N - 大写两根竖线加斜线 */}
            <rect x="68" y="8" width="2" height="2" fill="#f9fafb" /><rect x="78" y="8" width="2" height="2" fill="#f9fafb" />
            <rect x="68" y="10" width="2" height="2" fill="#f9fafb" /><rect x="70" y="10" width="2" height="2" fill="#f9fafb" /><rect x="78" y="10" width="2" height="2" fill="#f9fafb" />
            <rect x="68" y="12" width="2" height="2" fill="#f9fafb" /><rect x="72" y="12" width="2" height="2" fill="#f9fafb" /><rect x="78" y="12" width="2" height="2" fill="#f9fafb" />
            <rect x="68" y="14" width="2" height="2" fill="#f9fafb" /><rect x="74" y="14" width="2" height="2" fill="#f9fafb" /><rect x="78" y="14" width="2" height="2" fill="#f9fafb" />
            <rect x="68" y="16" width="2" height="2" fill="#f9fafb" /><rect x="76" y="16" width="2" height="2" fill="#f9fafb" /><rect x="78" y="16" width="2" height="2" fill="#f9fafb" />
            <rect x="68" y="18" width="2" height="2" fill="#f9fafb" /><rect x="78" y="18" width="2" height="2" fill="#f9fafb" />
            <rect x="68" y="20" width="2" height="2" fill="#f9fafb" /><rect x="78" y="20" width="2" height="2" fill="#f9fafb" />
          </svg>
        </div>
      </div>

      {/* 操作按钮区 */}
      <motion.button
        onClick={handleOpenFolder}
        className="flex items-center gap-2 px-6 py-3 bg-[#E5E7EB] text-macos-text
                   font-medium rounded-xl mb-8 no-drag"
        style={{
          transition: 'transform 0.2s, box-shadow 0.2s, background-color 0.2s'
        }}
        whileTap={{ scale: 0.98 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
          e.currentTarget.style.backgroundColor = '#D1D5DB'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.backgroundColor = '#E5E7EB'
        }}
      >
        <FolderPlus size={20} />
        <span>打开文件夹</span>
      </motion.button>

      {/* 最近项目列表 */}
      {recentProjects.length > 0 ? (
        <div className="w-full max-w-2xl no-drag">
          <h2 className="text-sm font-medium text-macos-text-secondary mb-3 px-1">最近打开的项目</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recentProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onSelect={() => handleSelectProject(project)}
                onRemove={(e) => handleRemoveProject(e, project.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

    </div>
  )
}