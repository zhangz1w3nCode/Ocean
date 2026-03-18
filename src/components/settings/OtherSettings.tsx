import type { FC } from 'react'

export const OtherSettings: FC = () => {
  return (
    <div className="h-full flex flex-col">
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center border-b border-gray-200">
        <h1 className="text-xl font-semibold text-gray-900">其他设置</h1>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex flex-col items-center justify-center h-full text-gray-500">
          <p className="text-base mb-2">其他设置功能开发中</p>
          <p className="text-sm text-gray-400">后续将支持外观、语言、快捷键等配置</p>
        </div>
      </div>
    </div>
  )
}