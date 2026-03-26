import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { FileText, RotateCcw, Edit3, Eye, Wand2 } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { Button, MarkdownEditor, MarkdownRenderer } from '../ui'
import {
  getDefaultKnowledgeAgenticCreatePromptTemplate,
  loadKnowledgeTemplateFile,
  saveKnowledgeTemplateFile
} from '../../utils/storage'

// Tab 类型定义
type TabType = 'agentic-create'

export const KnowledgeSettings: FC = () => {
  const { addToast } = useToastStore()
  const [agenticCreateTemplate, setAgenticCreateTemplate] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [activeTab, setActiveTab] = useState<TabType>('agentic-create')

  // 加载模板文件
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const agenticCreateTpl = await loadKnowledgeTemplateFile('agentic-create')
        setAgenticCreateTemplate(agenticCreateTpl)
      } catch (error) {
        console.error('加载模板失败:', error)
        addToast('加载模板失败', 'error')
      }
    }
    loadTemplates()
  }, [addToast])

  const handleSave = async () => {
    try {
      // 保存 Agentic 创建模板
      await saveKnowledgeTemplateFile('agentic-create', agenticCreateTemplate)
      addToast('保存成功', 'success')
    } catch (error) {
      console.error('保存模板失败:', error)
      addToast('保存失败', 'error')
    }
  }

  const handleReset = () => {
    setAgenticCreateTemplate(getDefaultKnowledgeAgenticCreatePromptTemplate())
    addToast('已重置为默认模板', 'success')
  }

  return (
    <div className="h-full flex flex-col">
      {/* 页面头部 */}
      <div className="h-16 px-6 flex items-center justify-end">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="text-gray-600 hover:text-gray-800"
          >
            <RotateCcw size={14} className="mr-1.5" />
            重置为默认
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSave}
            className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400 rounded-lg px-4 py-2 text-sm"
          >
            保存
          </Button>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 px-6 pb-6 overflow-y-auto">
        {/* Tab 切换 */}
        <div className="flex items-center gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('agentic-create')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'agentic-create'
                ? 'text-gray-800 border-gray-800'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            Agentic创建模板
          </button>
        </div>

        {/* Agentic创建提示词模板配置 */}
        {activeTab === 'agentic-create' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Wand2 size={18} className="text-blue-500" />
                <h3 className="text-base font-medium text-gray-800">知识Agentic创建提示词模板</h3>
              </div>
              {/* 编辑/预览切换 */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'edit'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Edit3 size={14} />
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'preview'
                      ? 'bg-white text-gray-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  <Eye size={14} />
                  预览
                </button>
              </div>
            </div>
            <p className="text-sm text-gray-500 mb-3">
              配置 Agentic 创建知识时使用的提示词模板。模板中使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{userDescription}}'}</code> 作为用户输入描述的占位符。
            </p>

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <MarkdownEditor
                placeholder="请输入提示词模板...&#10;&#10;支持 Markdown 格式，可使用 {{userDescription}} 作为占位符。"
                value={agenticCreateTemplate}
                onChange={(e) => setAgenticCreateTemplate(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
            )}

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div className="bg-gray-50 rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
                {agenticCreateTemplate.trim() ? (
                  <MarkdownRenderer content={agenticCreateTemplate} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    暂无内容，请切换到编辑模式输入内容
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* 使用说明 */}
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">使用说明</h4>
          {activeTab === 'agentic-create' && (
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Agentic 创建知识时，系统会将用户输入的描述替换模板中的占位符</li>
              <li>Agent 会根据提示词自主执行任务生成知识内容</li>
              <li>Agent 可以使用工具查看已有知识文档作为参考</li>
              <li>生成后用户可以二次编辑，确认后才会保存</li>
              <li>知识文档支持使用 [[文件名.md|关系]] 格式建立与其他文档的关联</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}