import type { FC } from 'react'
import { useMemo } from 'react'
import { Modal } from './Modal'

interface ContentDiffModalProps {
  isOpen: boolean
  onClose: () => void
  oldContent: string      // 原始内容
  newContent: string      // 新内容
  oldTitle?: string       // 左侧标题
  newTitle?: string       // 右侧标题
}

/**
 * 内容对比弹窗组件
 * 展示优化前后的对比,类似 git diff 的样式
 */
export const ContentDiffModal: FC<ContentDiffModalProps> = ({
  isOpen,
  onClose,
  oldContent,
  newContent,
  oldTitle = '原始内容',
  newTitle = '优化后内容',
}) => {
  // 计算差异
  const diffResult = useMemo(() => {
    const oldLines = oldContent.split('\n')
    const newLines = newContent.split('\n')

    const result: Array<{
      type: 'unchanged' | 'added' | 'removed'
      oldLine?: string
      newLine?: string
      oldLineNumber?: number
      newLineNumber?: number
    }> = []

    let oldIndex = 0
    let newIndex = 0

    // 简单的行对行比较算法
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      if (oldIndex >= oldLines.length) {
        // 剩余的新行都是新增
        result.push({
          type: 'added',
          newLine: newLines[newIndex],
          newLineNumber: newIndex + 1,
        })
        newIndex++
      } else if (newIndex >= newLines.length) {
        // 剩余旧行都是删除
        result.push({
          type: 'removed',
          oldLine: oldLines[oldIndex],
          oldLineNumber: oldIndex + 1,
        })
        oldIndex++
      } else if (oldLines[oldIndex] === newLines[newIndex]) {
        // 未改变的行
        result.push({
          type: 'unchanged',
          oldLine: oldLines[oldIndex],
          newLine: newLines[newIndex],
          oldLineNumber: oldIndex + 1,
          newLineNumber: newIndex + 1,
        })
        oldIndex++
        newIndex++
      } else {
        // 查找新内容中是否有匹配的行
        let foundInNew = false
        for (let i = newIndex; i < newLines.length; i++) {
          if (oldLines[oldIndex] === newLines[i]) {
            // 找到了,中间的新行都是新增
            for (let j = newIndex; j < i; j++) {
              result.push({
                type: 'added',
                newLine: newLines[j],
                newLineNumber: j + 1,
              })
            }
            result.push({
              type: 'unchanged',
              oldLine: oldLines[oldIndex],
              newLine: newLines[i],
              oldLineNumber: oldIndex + 1,
              newLineNumber: i + 1,
            })
            oldIndex++
            newIndex = i + 1
            foundInNew = true
            break
          }
        }

        if (!foundInNew) {
          // 查找旧内容中是否有匹配的行
          let foundInOld = false
          for (let i = oldIndex; i < oldLines.length; i++) {
            if (oldLines[i] === newLines[newIndex]) {
              // 找到了,中间的旧行都是删除
              for (let j = oldIndex; j < i; j++) {
                result.push({
                  type: 'removed',
                  oldLine: oldLines[j],
                  oldLineNumber: j + 1,
                })
              }
              result.push({
                type: 'unchanged',
                oldLine: oldLines[i],
                newLine: newLines[newIndex],
                oldLineNumber: i + 1,
                newLineNumber: newIndex + 1,
              })
              oldIndex = i + 1
              newIndex++
              foundInOld = true
              break
            }
          }

          if (!foundInOld) {
            // 都没找到,视为修改
            result.push({
              type: 'removed',
              oldLine: oldLines[oldIndex],
              oldLineNumber: oldIndex + 1,
            })
            result.push({
              type: 'added',
              newLine: newLines[newIndex],
              newLineNumber: newIndex + 1,
            })
            oldIndex++
            newIndex++
          }
        }
      }
    }

    return result
  }, [oldContent, newContent])

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="内容对比"
      size="xl"
    >
      <div className="space-y-4">
        {/* 图例说明 */}
        <div className="flex items-center gap-4 text-xs text-gray-500 px-4 py-2 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-red-100 border border-red-200 rounded" />
            <span>删除的内容</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-green-100 border border-green-200 rounded" />
            <span>新增的内容</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 bg-white border border-gray-200 rounded" />
            <span>未改变的内容</span>
          </div>
        </div>

        {/* 标题栏 */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-sm font-medium text-gray-700 px-4 py-2 bg-gray-50 border border-gray-200 rounded-t-lg">
            {oldTitle}
          </div>
          <div className="text-sm font-medium text-gray-700 px-4 py-2 bg-gray-50 border border-gray-200 rounded-t-lg">
            {newTitle}
          </div>
        </div>

        {/* 差异内容 */}
        <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto">
          {/* 左侧 - 原始内容 */}
          <div className="border border-gray-200 rounded-b-lg overflow-hidden">
            {diffResult.map((item, index) => {
              if (item.type === 'removed') {
                return (
                  <div
                    key={index}
                    className="flex items-start bg-red-50 border-l-4 border-red-400 px-3 py-1 font-mono text-xs"
                  >
                    <span className="text-red-400 mr-3 select-none min-w-[2rem] text-right">
                      {item.oldLineNumber}
                    </span>
                    <span className="text-red-400 mr-2 select-none">-</span>
                    <span className="text-red-900 whitespace-pre-wrap">{item.oldLine}</span>
                  </div>
                )
              } else if (item.type === 'unchanged') {
                return (
                  <div
                    key={index}
                    className="flex items-start bg-white px-3 py-1 font-mono text-xs border-l-4 border-transparent"
                  >
                    <span className="text-gray-300 mr-3 select-none min-w-[2rem] text-right">
                      {item.oldLineNumber}
                    </span>
                    <span className="text-gray-500 mr-2 select-none"> </span>
                    <span className="text-gray-700 whitespace-pre-wrap">{item.oldLine}</span>
                  </div>
                )
              } else {
                // added 在左侧不显示,占位
                return (
                  <div
                    key={index}
                    className="flex items-start bg-gray-50 px-3 py-1 font-mono text-xs"
                  >
                    <span className="text-gray-300 mr-3 select-none min-w-[2rem]"> </span>
                    <span className="text-gray-300 mr-2 select-none"> </span>
                    <span className="text-gray-300"> </span>
                  </div>
                )
              }
            })}
          </div>

          {/* 右侧 - 新内容 */}
          <div className="border border-gray-200 rounded-b-lg overflow-hidden">
            {diffResult.map((item, index) => {
              if (item.type === 'added') {
                return (
                  <div
                    key={index}
                    className="flex items-start bg-green-50 border-l-4 border-green-400 px-3 py-1 font-mono text-xs"
                  >
                    <span className="text-green-400 mr-3 select-none min-w-[2rem] text-right">
                      {item.newLineNumber}
                    </span>
                    <span className="text-green-400 mr-2 select-none">+</span>
                    <span className="text-green-900 whitespace-pre-wrap">{item.newLine}</span>
                  </div>
                )
              } else if (item.type === 'unchanged') {
                return (
                  <div
                    key={index}
                    className="flex items-start bg-white px-3 py-1 font-mono text-xs border-l-4 border-transparent"
                  >
                    <span className="text-gray-300 mr-3 select-none min-w-[2rem] text-right">
                      {item.newLineNumber}
                    </span>
                    <span className="text-gray-500 mr-2 select-none"> </span>
                    <span className="text-gray-700 whitespace-pre-wrap">{item.newLine}</span>
                  </div>
                )
              } else {
                // removed 在右侧不显示,占位
                return (
                  <div
                    key={index}
                    className="flex items-start bg-gray-50 px-3 py-1 font-mono text-xs"
                  >
                    <span className="text-gray-300 mr-3 select-none min-w-[2rem]"> </span>
                    <span className="text-gray-300 mr-2 select-none"> </span>
                    <span className="text-gray-300"> </span>
                  </div>
                )
              }
            })}
          </div>
        </div>

        {/* 统计信息 */}
        <div className="flex items-center justify-center gap-6 text-xs text-gray-500 pt-2 border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-red-100 border border-red-200 rounded" />
            <span>删除 {diffResult.filter(r => r.type === 'removed').length} 行</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-100 border border-green-200 rounded" />
            <span>新增 {diffResult.filter(r => r.type === 'added').length} 行</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-white border border-gray-200 rounded" />
            <span>未改变 {diffResult.filter(r => r.type === 'unchanged').length} 行</span>
          </div>
        </div>
      </div>
    </Modal>
  )
}