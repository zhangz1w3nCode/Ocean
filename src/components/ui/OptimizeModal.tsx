import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Wand2, Loader2, Eye, Edit3, RotateCcw, GitCompare } from 'lucide-react'
import { Modal, Textarea, Button, MarkdownRenderer, ContentDiffModal } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { optimizeContentWithLLM } from '../../services/llmService'
import { getDefaultLLMProvider, loadSkillTemplateFile } from '../../utils/storage'

/**
 * 优化弹窗组件 Props 接口
 *
 * 该组件是一个通用的内容优化弹窗,支持通过 LLM 对任意文本内容进行智能优化。
 * 可用于能力模块、命令模块、智能体模块、技能模块等多个业务场景。
 */
interface OptimizeModalProps {
  /** 弹窗是否打开 */
  isOpen: boolean
  /** 关闭弹窗的回调 */
  onClose: () => void
  /** 当前待优化的内容 */
  currentContent: string
  /** 确认使用优化结果的回调 */
  onConfirm: (optimizedContent: string) => void
  /** 弹窗标题,默认为"优化内容" */
  title?: string
  /** 模板类型，用于从本地文件加载对应的模板 */
  templateType?: 'skill-optimize'
  /** 提示词模板(可选,优先级高于 templateType),用于指导 LLM 如何优化内容 */
  promptTemplate?: string
  /** 占位符配置,用于替换提示词模板中的变量 */
  placeholders?: {
    /** 当前内容的占位符,默认为 {{currentContent}} */
    currentContent?: string
    /** 优化目标的占位符,默认为 {{optimizeTarget}} */
    optimizeTarget?: string
  }
}

/**
 * 通用内容优化弹窗组件
 *
 * @example
 * ```tsx
 * <OptimizeModal
 *   isOpen={showOptimize}
 *   onClose={() => setShowOptimize(false)}
 *   currentContent={content}
 *   onConfirm={(optimized) => setContent(optimized)}
 *   title="优化能力内容"
 *   templateType="ability-optimize"
 *   placeholders={{
 *     currentContent: '{{currentContent}}',
 *     optimizeTarget: '{{optimizeTarget}}'
 *   }}
 * />
 * ```
 */
export const OptimizeModal: FC<OptimizeModalProps> = ({
  isOpen,
  onClose,
  currentContent,
  onConfirm,
  title = '优化内容',
  templateType = 'skill-optimize',
  promptTemplate: providedPromptTemplate,
  placeholders: _placeholders = {
    currentContent: '{{currentContent}}',
    optimizeTarget: '{{optimizeTarget}}'
  }
}) => {
  const { addToast } = useToastStore()

  // 优化目标输入
  const [optimizeTarget, setOptimizeTarget] = useState('')

  // 优化结果
  const [optimizedContent, setOptimizedContent] = useState('')

  // 加载状态
  const [isOptimizing, setIsOptimizing] = useState(false)

  // 视图模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')

  // 对比弹窗状态
  const [showDiffModal, setShowDiffModal] = useState(false)

  // 重置状态
  useEffect(() => {
    if (isOpen) {
      setOptimizeTarget('')
      setOptimizedContent('')
      setViewMode('preview')
      setShowDiffModal(false)
    }
  }, [isOpen])

  // 执行优化
  const handleOptimize = async () => {
    // 验证优化目标
    if (!optimizeTarget.trim()) {
      addToast('请输入优化目标', 'warning')
      return
    }

    // 获取默认 LLM 提供商
    const defaultProvider = await getDefaultLLMProvider()
    if (!defaultProvider) {
      addToast('请先在设置中配置并启用 LLM 提供商', 'warning')
      return
    }

    // 校验 Base URL
    if (!defaultProvider.baseUrl) {
      addToast('请先配置 Base URL', 'warning')
      return
    }

    // 校验 API Key
    if (!defaultProvider.apiKey) {
      addToast('请先配置 API Key', 'warning')
      return
    }

    // 校验模型
    if (!defaultProvider.defaultModel) {
      addToast('请先配置默认模型', 'warning')
      return
    }

    setIsOptimizing(true)

    try {
      // 加载模板：优先使用传入的模板，否则从本地文件加载
      let promptTemplate = providedPromptTemplate
      if (!promptTemplate) {
        // 技能模块使用 loadSkillTemplateFile
        promptTemplate = await loadSkillTemplateFile('llm-optimize')
      }

      // 始终基于原始内容进行优化
      const result = await optimizeContentWithLLM(
        defaultProvider,
        promptTemplate,
        currentContent,
        optimizeTarget
      )

      if (!result.success || !result.content) {
        addToast(result.error || 'LLM 调用失败', 'error')
        setIsOptimizing(false)
        return
      }

      // 设置优化结果
      setOptimizedContent(result.content)
      addToast('优化完成', 'success')
    } catch (error) {
      addToast('优化失败: ' + (error instanceof Error ? error.message : '未知错误'), 'error')
    } finally {
      setIsOptimizing(false)
    }
  }

  // 确认使用优化结果
  const handleConfirm = () => {
    if (!optimizedContent.trim()) {
      addToast('暂无优化结果', 'warning')
      return
    }
    onConfirm(optimizedContent)
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="xl"
      footer={
        <div className="flex justify-between gap-3">
          <div className="flex gap-2">
            {optimizedContent && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDiffModal(true)}
                  disabled={isOptimizing}
                  className="text-gray-600 hover:text-gray-800"
                >
                  <GitCompare size={14} className="mr-1.5" />
                  对比
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOptimizedContent('')}
                  disabled={isOptimizing}
                  className="text-gray-600 hover:text-gray-800"
                >
                  <RotateCcw size={14} className="mr-1.5" />
                  清除结果
                </Button>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleOptimize}
              disabled={isOptimizing || !optimizeTarget.trim()}
              className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              {isOptimizing ? (
                <>
                  <Loader2 size={14} className="mr-1.5 animate-spin" />
                  优化中...
                </>
              ) : (
                <>
                  <Wand2 size={14} className="mr-1.5" />
                  优化
                </>
              )}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleConfirm}
              disabled={!optimizedContent.trim()}
              className="bg-[#E5E7EB] border border-gray-300 text-gray-700 hover:bg-gray-200 rounded-lg px-4 py-2 text-sm"
            >
              确认使用
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
        {/* 优化目标输入 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            优化目标
          </label>
          <Textarea
            placeholder=""
            value={optimizeTarget}
            onChange={(e) => setOptimizeTarget(e.target.value)}
            rows={2}
            disabled={isOptimizing}
          />
        </div>

        {/* 优化结果展示 */}
        {optimizedContent && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                优化结果
              </label>
              {/* 编辑/预览切换 */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
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
              </div>
            </div>

            {/* 预览模式 */}
            {viewMode === 'preview' && (
              <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[300px] overflow-y-auto border border-gray-200">
                <MarkdownRenderer content={optimizedContent} />
              </div>
            )}

            {/* 编辑模式 */}
            {viewMode === 'edit' && (
              <Textarea
                value={optimizedContent}
                onChange={(e) => setOptimizedContent(e.target.value)}
                rows={10}
                className="font-mono text-sm"
              />
            )}
          </div>
        )}
      </div>

      {/* 对比弹窗 */}
      <ContentDiffModal
        isOpen={showDiffModal}
        onClose={() => setShowDiffModal(false)}
        oldContent={currentContent}
        newContent={optimizedContent}
        oldTitle="原始内容"
        newTitle="优化后内容"
      />
    </Modal>
  )
}