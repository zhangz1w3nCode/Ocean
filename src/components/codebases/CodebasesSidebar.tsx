import type { FC } from 'react'
import { motion } from 'framer-motion'
import { LayoutGrid, Settings } from 'lucide-react'
import { useAppStore, type CodebaseSubPage } from '../../stores/appStore'

const subNavItems: { id: CodebaseSubPage; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'manage', label: '管理', icon: LayoutGrid },
  { id: 'settings', label: '设置', icon: Settings },
]

export const CodebasesSidebar: FC = () => {
  const { codebaseSubPage, setCodebaseSubPage } = useAppStore()

  return (
    <nav className="w-44 h-full flex flex-col pt-4 pb-4">
      {subNavItems.map((item) => {
        const isActive = codebaseSubPage === item.id
        const Icon = item.icon

        return (
          <div key={item.id} className="px-2 mb-1">
            <motion.button
              onClick={() => setCodebaseSubPage(item.id)}
              whileTap={{ scale: 0.98 }}
              className={`
                relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg
                text-sm font-medium transition-colors duration-200
                ${isActive
                  ? 'text-macos-text bg-[#E5E7EB] border border-gray-300'
                  : 'text-macos-text-secondary hover:text-macos-text hover:bg-[#E8EAED]'
                }
              `}
            >
              {isActive && (
                <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-5 bg-black rounded-full" />
              )}
              {isActive && <div className="w-1" />}
              <Icon size={20} strokeWidth={1.5} />
              <span className="flex-1 text-left">{item.label}</span>
            </motion.button>
          </div>
        )
      })}
    </nav>
  )
}
