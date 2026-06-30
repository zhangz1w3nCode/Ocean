import type { FC } from 'react'
import { motion } from 'framer-motion'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Bot, FolderGit2, Box, Folder, ArrowRightLeft, BookOpen, Settings, Wand2 } from 'lucide-react'
import { useAppStore, type PageType } from '../../stores/appStore'
import { useProjectStore } from '../../stores/projectStore'

// 导航项定义
const navItemDefinitions: { id: PageType; label: string; icon: typeof Bot }[] = [
  { id: 'agents', label: '智能体', icon: Bot },
  { id: 'skills', label: '技能', icon: Wand2 },
  { id: 'knowledges', label: '知识', icon: BookOpen },
  { id: 'workflows', label: '工作流', icon: FolderGit2 },
  { id: 'nodes', label: '节点', icon: Box },
  { id: 'resources', label: '资源文件', icon: Folder },
  { id: 'settings', label: '设置', icon: Settings },
]

interface SortableNavItemProps {
  id: PageType
  label: string
  icon: typeof Bot
  isActive: boolean
  onClick: () => void
}

const SortableNavItem: FC<SortableNavItemProps> = ({ id, label, icon: Icon, isActive, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1000 : 'auto',
  }

  return (
    <div className="relative px-2 mb-1" ref={setNodeRef} style={style}>
      <motion.button
        onClick={onClick}
        className={`
          relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
          text-sm font-medium transition-colors duration-200
          cursor-grab active:cursor-grabbing
          ${isActive
            ? 'text-macos-text bg-[#E5E7EB] border border-gray-300'
            : 'text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED]'
          }
        `}
        whileTap={{ scale: 0.98 }}
        {...attributes}
        {...listeners}
      >
        {/* 选中状态左侧黑色竖线指示器 */}
        {isActive && (
          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-black rounded-full" />
        )}

        {/* 占位符，保持图标位置对齐 */}
        {isActive && <div className="w-1" />}

        <Icon size={20} strokeWidth={1.5} />
        <span className="flex-1 text-left">{label}</span>
      </motion.button>
    </div>
  )
}

export const Sidebar: FC = () => {
  const { currentPage, setCurrentPage, isEditing, stopEditing, startSwitchingProject, sidebarNavOrder, setSidebarNavOrder } = useAppStore()
  const { setCurrentProject } = useProjectStore()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 200, // 长按200ms后激活拖拽
        tolerance: 5, // 允许最多移动5px
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleNavClick = (pageId: PageType) => {
    // 如果当前在编辑模式，先退出编辑模式
    if (isEditing) {
      stopEditing()
    }
    setCurrentPage(pageId)
  }

  const handleSwitchProject = () => {
    startSwitchingProject()
    setCurrentProject(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = sidebarNavOrder.indexOf(active.id as PageType)
      const newIndex = sidebarNavOrder.indexOf(over.id as PageType)
      const newOrder = arrayMove(sidebarNavOrder, oldIndex, newIndex)
      setSidebarNavOrder(newOrder)
    }
  }

  // 根据当前排序顺序生成导航项列表
  const sortedNavItems = sidebarNavOrder.map(id =>
    navItemDefinitions.find(item => item.id === id)
  ).filter(Boolean) as typeof navItemDefinitions

  return (
    <aside className="w-52 h-full bg-macos-bg flex flex-col pt-4">
      {/* Logo区域 */}
      <div className="px-4 pb-5 no-drag">
        <div className="flex items-center justify-center">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center relative overflow-hidden cursor-pointer"
            style={{
              background: '#1f2937',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)'
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.5)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.4)'
            }}
          >
            {/* 像素风格 OCEAN Logo - 缩小版 */}
            <svg width="44" height="16" viewBox="0 0 84 32" className="relative z-10 pointer-events-none">
              {/* O - 大写 */}
              <rect x="2" y="8" width="2" height="2" fill="#f9fafb" /><rect x="4" y="8" width="2" height="2" fill="#f9fafb" /><rect x="6" y="8" width="2" height="2" fill="#f9fafb" /><rect x="8" y="8" width="2" height="2" fill="#f9fafb" /><rect x="10" y="8" width="2" height="2" fill="#f9fafb" /><rect x="12" y="8" width="2" height="2" fill="#f9fafb" /><rect x="14" y="8" width="2" height="2" fill="#f9fafb" />
              <rect x="2" y="10" width="2" height="2" fill="#f9fafb" /><rect x="14" y="10" width="2" height="2" fill="#f9fafb" />
              <rect x="2" y="12" width="2" height="2" fill="#f9fafb" /><rect x="14" y="12" width="2" height="2" fill="#f9fafb" />
              <rect x="2" y="14" width="2" height="2" fill="#f9fafb" /><rect x="14" y="14" width="2" height="2" fill="#f9fafb" />
              <rect x="2" y="16" width="2" height="2" fill="#f9fafb" /><rect x="14" y="16" width="2" height="2" fill="#f9fafb" />
              <rect x="2" y="18" width="2" height="2" fill="#f9fafb" /><rect x="14" y="18" width="2" height="2" fill="#f9fafb" />
              <rect x="2" y="20" width="2" height="2" fill="#f9fafb" /><rect x="4" y="20" width="2" height="2" fill="#f9fafb" /><rect x="6" y="20" width="2" height="2" fill="#f9fafb" /><rect x="8" y="20" width="2" height="2" fill="#f9fafb" /><rect x="10" y="20" width="2" height="2" fill="#f9fafb" /><rect x="12" y="20" width="2" height="2" fill="#f9fafb" /><rect x="14" y="20" width="2" height="2" fill="#f9fafb" />

              {/* C - 大写 */}
              <rect x="20" y="8" width="2" height="2" fill="#f9fafb" /><rect x="22" y="8" width="2" height="2" fill="#f9fafb" /><rect x="24" y="8" width="2" height="2" fill="#f9fafb" /><rect x="26" y="8" width="2" height="2" fill="#f9fafb" /><rect x="28" y="8" width="2" height="2" fill="#f9fafb" /><rect x="30" y="8" width="2" height="2" fill="#f9fafb" />
              <rect x="20" y="10" width="2" height="2" fill="#f9fafb" />
              <rect x="20" y="12" width="2" height="2" fill="#f9fafb" />
              <rect x="20" y="14" width="2" height="2" fill="#f9fafb" />
              <rect x="20" y="16" width="2" height="2" fill="#f9fafb" />
              <rect x="20" y="18" width="2" height="2" fill="#f9fafb" />
              <rect x="20" y="20" width="2" height="2" fill="#f9fafb" /><rect x="22" y="20" width="2" height="2" fill="#f9fafb" /><rect x="24" y="20" width="2" height="2" fill="#f9fafb" /><rect x="26" y="20" width="2" height="2" fill="#f9fafb" /><rect x="28" y="20" width="2" height="2" fill="#f9fafb" /><rect x="30" y="20" width="2" height="2" fill="#f9fafb" />

              {/* E - 大写 */}
              <rect x="36" y="8" width="2" height="2" fill="#f9fafb" /><rect x="38" y="8" width="2" height="2" fill="#f9fafb" /><rect x="40" y="8" width="2" height="2" fill="#f9fafb" /><rect x="42" y="8" width="2" height="2" fill="#f9fafb" /><rect x="44" y="8" width="2" height="2" fill="#f9fafb" /><rect x="46" y="8" width="2" height="2" fill="#f9fafb" />
              <rect x="36" y="10" width="2" height="2" fill="#f9fafb" />
              <rect x="36" y="12" width="2" height="2" fill="#f9fafb" />
              <rect x="36" y="14" width="2" height="2" fill="#f9fafb" /><rect x="38" y="14" width="2" height="2" fill="#f9fafb" /><rect x="40" y="14" width="2" height="2" fill="#f9fafb" /><rect x="42" y="14" width="2" height="2" fill="#f9fafb" /><rect x="44" y="14" width="2" height="2" fill="#f9fafb" />
              <rect x="36" y="16" width="2" height="2" fill="#f9fafb" />
              <rect x="36" y="18" width="2" height="2" fill="#f9fafb" />
              <rect x="36" y="20" width="2" height="2" fill="#f9fafb" /><rect x="38" y="20" width="2" height="2" fill="#f9fafb" /><rect x="40" y="20" width="2" height="2" fill="#f9fafb" /><rect x="42" y="20" width="2" height="2" fill="#f9fafb" /><rect x="44" y="20" width="2" height="2" fill="#f9fafb" /><rect x="46" y="20" width="2" height="2" fill="#f9fafb" />

              {/* A - 大写 */}
              <rect x="54" y="8" width="2" height="2" fill="#f9fafb" /><rect x="56" y="8" width="2" height="2" fill="#f9fafb" /><rect x="58" y="8" width="2" height="2" fill="#f9fafb" /><rect x="60" y="8" width="2" height="2" fill="#f9fafb" />
              <rect x="52" y="10" width="2" height="2" fill="#f9fafb" /><rect x="62" y="10" width="2" height="2" fill="#f9fafb" />
              <rect x="52" y="12" width="2" height="2" fill="#f9fafb" /><rect x="62" y="12" width="2" height="2" fill="#f9fafb" />
              <rect x="52" y="14" width="2" height="2" fill="#f9fafb" /><rect x="54" y="14" width="2" height="2" fill="#f9fafb" /><rect x="56" y="14" width="2" height="2" fill="#f9fafb" /><rect x="58" y="14" width="2" height="2" fill="#f9fafb" /><rect x="60" y="14" width="2" height="2" fill="#f9fafb" /><rect x="62" y="14" width="2" height="2" fill="#f9fafb" />
              <rect x="52" y="16" width="2" height="2" fill="#f9fafb" /><rect x="62" y="16" width="2" height="2" fill="#f9fafb" />
              <rect x="52" y="18" width="2" height="2" fill="#f9fafb" /><rect x="62" y="18" width="2" height="2" fill="#f9fafb" />
              <rect x="52" y="20" width="2" height="2" fill="#f9fafb" /><rect x="62" y="20" width="2" height="2" fill="#f9fafb" />

              {/* N - 大写 */}
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
      </div>

      {/* 导航菜单 - 长按拖拽排序 */}
      <nav className="flex-1 px-1 py-1 no-drag">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={sidebarNavOrder}
            strategy={verticalListSortingStrategy}
          >
            {sortedNavItems.map((item) => (
              <SortableNavItem
                key={item.id}
                id={item.id}
                label={item.label}
                icon={item.icon}
                isActive={currentPage === item.id}
                onClick={() => handleNavClick(item.id)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </nav>

      {/* 底部区域 */}
      <div className="p-4 no-drag">
        {/* 切换项目按钮 */}
        <button
          onClick={handleSwitchProject}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-macos-text-secondary hover:bg-gray-200/50 hover:text-macos-text transition-colors"
        >
          <ArrowRightLeft size={16} />
          <span>切换项目</span>
        </button>
      </div>
    </aside>
  )
}