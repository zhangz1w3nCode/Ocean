import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { FileText, RotateCcw, Edit3, Eye } from 'lucide-react'
import { useToastStore } from '../../stores/toastStore'
import { Button, MarkdownEditor, MarkdownRenderer } from '../ui'
import {
  getDefaultAbilityPromptTemplate,
  getDefaultAbilityOptimizePromptTemplate,
  getDefaultAgenticCreatePromptTemplate,
  getDefaultAgenticOptimizePromptTemplate,
  loadAbilityTemplateFile,
  saveAbilityTemplateFile
} from '../../utils/storage'

// Tab 类型定义
type TabType = 'llm-create' | 'llm-optimize' | 'agentic-create' | 'agentic-optimize'

export const AbilitySettings: FC = () => {
  const { addToast } = useToastStore()
  const [promptTemplate, setPromptTemplate] = useState('')
  const [optimizePromptTemplate, setOptimizePromptTemplate] = useState('')
  const [agenticCreateTemplate, setAgenticCreateTemplate] = useState('')
  const [agenticOptimizeTemplate, setAgenticOptimizeTemplate] = useState('')
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('edit')
  const [activeTab, setActiveTab] = useState<TabType>('llm-create')

  // 加载模板文件
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const llmCreateTemplate = await loadAbilityTemplateFile('llm-create')
        const llmOptimizeTemplate = await loadAbilityTemplateFile('llm-optimize')
        const agenticCreateTpl = await loadAbilityTemplateFile('agentic-create')
        const agenticOptimizeTpl = await loadAbilityTemplateFile('agentic-optimize')
        setPromptTemplate(llmCreateTemplate)
        setOptimizePromptTemplate(llmOptimizeTemplate)
        setAgenticCreateTemplate(agenticCreateTpl)
        setAgenticOptimizeTemplate(agenticOptimizeTpl)
      } catch (error) {
        console.error('加载模板失败:', error)
        addToast('加载模板失败', 'error')
      }
    }
    loadTemplates()
  }, [addToast])

  const handleSave = async () => {
    try {
      // 保存LLM创建模板
      await saveAbilityTemplateFile('llm-create', promptTemplate)
      // 保存LLM优化模板
      await saveAbilityTemplateFile('llm-optimize', optimizePromptTemplate)
      // 保存 Agentic 创建模板
      await saveAbilityTemplateFile('agentic-create', agenticCreateTemplate)
      // 保存 Agentic 优化模板
      await saveAbilityTemplateFile('agentic-optimize', agenticOptimizeTemplate)
      addToast('保存成功', 'success')
    } catch (error) {
      console.error('保存模板失败:', error)
      addToast('保存失败', 'error')
    }
  }

  const handleReset = () => {
    switch (activeTab) {
      case 'llm-create':
        setPromptTemplate(getDefaultAbilityPromptTemplate())
        break
      case 'llm-optimize':
        setOptimizePromptTemplate(getDefaultAbilityOptimizePromptTemplate())
        break
      case 'agentic-create':
        setAgenticCreateTemplate(getDefaultAgenticCreatePromptTemplate())
        break
      case 'agentic-optimize':
        setAgenticOptimizeTemplate(getDefaultAgenticOptimizePromptTemplate())
        break
    }
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
            onClick={() => setActiveTab('llm-create')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'llm-create'
                ? 'text-gray-800 border-gray-800'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            LLM创建模板
          </button>
          <button
            onClick={() => setActiveTab('llm-optimize')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'llm-optimize'
                ? 'text-gray-800 border-gray-800'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            LLM优化模板
          </button>
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
          <button
            onClick={() => setActiveTab('agentic-optimize')}
            className={`pb-2 px-1 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'agentic-optimize'
                ? 'text-gray-800 border-gray-800'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            Agentic优化模板
          </button>
        </div>

        {/* LLM创建提示词模板配置 */}
        {activeTab === 'llm-create' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-gray-600" />
                <h3 className="text-base font-medium text-gray-800">能力LLM创建提示词模板</h3>
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
              配置LLM创建能力时使用的提示词模板。模板中使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{userDescription}}'}</code> 作为用户输入描述的占位符。
            </p>

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <MarkdownEditor
                placeholder="请输入提示词模板...&#10;&#10;支持 Markdown 格式，可使用 {{userDescription}} 作为占位符。"
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
            )}

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div className="bg-gray-50 rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
                {promptTemplate.trim() ? (
                  <MarkdownRenderer content={promptTemplate} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    暂无内容，请切换到编辑模式输入内容
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* LLM优化提示词模板配置 */}
        {activeTab === 'llm-optimize' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-gray-600" />
                <h3 className="text-base font-medium text-gray-800">LLM优化能力提示词模板</h3>
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
              配置优化能力内容时使用的提示词模板。模板中使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{currentContent}}'}</code> 作为当前能力内容的占位符，<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{optimizeTarget}}'}</code> 作为优化目标的占位符。
            </p>

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <MarkdownEditor
                placeholder="请输入提示词模板...&#10;&#10;支持 Markdown 格式，可使用 {{currentContent}} 和 {{optimizeTarget}} 作为占位符。"
                value={optimizePromptTemplate}
                onChange={(e) => setOptimizePromptTemplate(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
            )}

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div className="bg-gray-50 rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
                {optimizePromptTemplate.trim() ? (
                  <MarkdownRenderer content={optimizePromptTemplate} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-8">
                    暂无内容，请切换到编辑模式输入内容
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Agentic创建提示词模板配置 */}
        {activeTab === 'agentic-create' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-gray-600" />
                <h3 className="text-base font-medium text-gray-800">Agentic创建能力提示词模板</h3>
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
              配置 Agentic 创建能力时使用的提示词模板。模板中使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{userDescription}}'}</code> 作为用户输入描述的占位符。
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

        {/* Agentic优化提示词模板配置 */}
        {activeTab === 'agentic-optimize' && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-gray-600" />
                <h3 className="text-base font-medium text-gray-800">Agentic优化能力提示词模板</h3>
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
              配置 Agentic 优化能力时使用的任务提示词模板。模板中使用 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{filePath}}'}</code> 作为能力文件路径的占位符，<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{currentContent}}'}</code> 作为当前能力内容的占位符，<code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{'{{optimizeTarget}}'}</code> 作为优化目标的占位符。
            </p>

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <MarkdownEditor
                placeholder="请输入提示词模板...&#10;&#10;支持 Markdown 格式，可使用 {{filePath}}、{{currentContent}} 和 {{optimizeTarget}} 作为占位符。"
                value={agenticOptimizeTemplate}
                onChange={(e) => setAgenticOptimizeTemplate(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
            )}

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div className="bg-gray-50 rounded-lg p-4 min-h-[400px] max-h-[600px] overflow-y-auto">
                {agenticOptimizeTemplate.trim() ? (
                  <MarkdownRenderer content={agenticOptimizeTemplate} />
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
          {activeTab === 'llm-create' && (
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>LLM创建能力时，系统会将用户输入的描述替换模板中的占位符</li>
              <li>LLM 会根据提示词生成能力名称、描述和详细内容</li>
              <li>生成后用户可以二次编辑，确认后才会保存</li>
              <li>建议在模板中明确输出格式(如 JSON),便于解析</li>
            </ul>
          )}
          {activeTab === 'llm-optimize' && (
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>LLM优化能力时，系统会将当前内容和优化目标替换模板中的占位符</li>
              <li>LLM 会根据优化目标对现有内容进行改进</li>
              <li>优化结果可以预览，满意后确认应用到编辑区</li>
              <li>支持多次迭代优化，直到满意为止</li>
            </ul>
          )}
          {activeTab === 'agentic-create' && (
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Agentic 创建能力时，系统会将用户输入的描述替换模板中的占位符</li>
              <li>Agent 会根据提示词生成能力内容</li>
              <li>生成后用户可以二次编辑，确认后才会保存</li>
            </ul>
          )}
          {activeTab === 'agentic-optimize' && (
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Agentic 优化能力时，Agent 会自动读取当前能力文档和其他文档作为参考</li>
              <li>系统会将文件路径、当前内容和优化目标替换模板中的占位符</li>
              <li>Agent 会使用 edit 工具直接修改文件内容</li>
              <li>优化结果可以预览，满意后确认应用</li>
              <li>模板中应包含明确的优化原则和任务要求</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}