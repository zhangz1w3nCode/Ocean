import type { FC } from 'react'
import { Settings } from 'lucide-react'

export const CodebasesSettingsPage: FC = () => {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
        <Settings size={32} className="text-macos-text-tertiary" />
      </div>
    </div>
  )
}
