import type { FC } from 'react'
import { useState, useEffect } from 'react'
import { Wand2, ArrowLeft, Edit3, Eye, Type, FileText } from 'lucide-react'
import { Modal, Button, MarkdownEditor, MarkdownRenderer, Input, Textarea } from '../ui'
import { useToastStore } from '../../stores/toastStore'
import { useSkillStore } from '../../stores/skillStore'

interface ApplyModalProps {
  isOpen: boolean
  onClose: () => void
  workflowName: string
  workflowId: string | null
}

type ApplyTarget = 'skill' | null
type Step = 'select' | 'edit'

export const ApplyModal: FC<ApplyModalProps> = ({
  isOpen,
  onClose,
  workflowName,
  workflowId,
}) => {
  const { addToast } = useToastStore()
  const { skillFiles, createSkill } = useSkillStore()
  const [step, setStep] = useState<Step>('select')
  const [selectedTarget, setSelectedTarget] = useState<ApplyTarget>(null)
  const [isCreating, setIsCreating] = useState(false)
  // 编辑/预览模式
  const [viewMode, setViewMode] = useState<'edit' | 'preview'>('preview')
  // 技能名称（可编辑）
  const [skillName, setSkillName] = useState('')
  // 技能描述（可编辑）
  const [skillDescription, setSkillDescription] = useState('')
  // 技能内容（可编辑）
  const [skillContent, setSkillContent] = useState('')

  // 根据当前工作流名称生成工作流路径
  const workflowPath = `.claude/workflows/${workflowName}/WORKFLOW.md`

  // 生成默认技能内容
  const generateDefaultSkillContent = () => `# 用户需求
- $ARGUMENTS

# 工作流
- 位置：\`${workflowPath}\`

# 强制要求
- 强制按照\`工作流\`的内容执行

# 禁止事项
- 不按照强制按照\`工作流\`的内容执行 注意替换内容中的工作流位置
`

  // 弹窗打开时重置状态
  useEffect(() => {
    if (isOpen) {
      setStep('select')
      setSelectedTarget(null)
      setViewMode('preview')

      // 生成默认名称和内容
      const baseName = workflowName.toLowerCase().replace(/\s+/g, '-')
      setSkillName(`${baseName}-workflow-skill`)
      setSkillDescription('')
      setSkillContent(generateDefaultSkillContent())
    }
  }, [isOpen, workflowName])

  // 选择目标并进入编辑步骤
  const handleSelectTarget = (target: ApplyTarget) => {
    if (!target) return
    setSelectedTarget(target)
    setStep('edit')
    setViewMode('preview')
  }

  // 返回选择步骤
  const handleBack = () => {
    setStep('select')
  }

  const applyTargets = [
    {
      id: 'skill' as const,
      name: '技能',
      description: '创建一个技能，引用当前工作流',
      icon: Wand2,
      color: 'bg-violet-100 text-violet-600',
    },
  ]

  const targetInfo = applyTargets.find(t => t.id === selectedTarget)

  const handleCreateSkill = async () => {
    if (!workflowId) {
      addToast('工作流ID无效', 'error')
      return
    }

    // 检查名称是否已存在
    const existingNames = skillFiles.map((s) => s.name)
    if (existingNames.includes(skillName.trim())) {
      addToast('当前技能已应用', 'warning')
      return
    }

    setIsCreating(true)

    try {
      // 创建技能
      const result = await createSkill({
        name: skillName.trim(),
        description: skillDescription.trim(),
        content: skillContent,
      })

      if (result) {
        addToast('技能创建成功', 'success')
        onClose()
      } else {
        addToast('创建技能失败，请重试', 'error')
      }
    } catch (error) {
      console.error('创建技能失败:', error)
      addToast('创建技能失败，请重试', 'error')
    } finally {
      setIsCreating(false)
    }
  }

  const handleConfirm = () => {
    // 验证技能表单
    if (selectedTarget === 'skill') {
      if (!skillName.trim()) {
        addToast('请输入技能名称', 'warning')
        return
      }
      if (!skillDescription.trim()) {
        addToast('请输入技能描述', 'warning')
        return
      }
      if (!skillContent.trim()) {
        addToast('请输入技能内容', 'warning')
        return
      }
      handleCreateSkill()
    }
  }

  // 获取当前名称和内容
  const currentName = skillName
  const currentContent = skillContent
  const setCurrentName = setSkillName
  const setCurrentContent = setSkillContent

  // 选择步骤
  if (step === 'select') {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="应用到"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            选择要将工作流 "{workflowName}" 应用到哪个模块
          </p>

          <div className="space-y-2">
            {applyTargets.map((target) => {
              const Icon = target.icon

              return (
                <button
                  key={target.id}
                  onClick={() => handleSelectTarget(target.id)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${target.color}`}
                  >
                    <Icon size={24} />
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{target.name}</h3>
                    <p className="text-sm text-gray-500">{target.description}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Modal>
    )
  }

  // 编辑步骤
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`创建${targetInfo?.name || ''}`}
      size="xl"
      headerLeft={
        <button
          onClick={handleBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={16} />
          返回
        </button>
      }
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isCreating}>
            取消
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleConfirm}
            disabled={isCreating}
            className="bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? '创建中...' : `创建${targetInfo?.name || ''}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* 名称 */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
            <Type size={16} className={selectedTarget === 'skill' ? 'text-violet-500' : 'text-gray-500'} />
            {targetInfo?.name}名称 *
          </label>
          <Input
            placeholder={`输入${targetInfo?.name || ''}名称...`}
            value={currentName}
            onChange={(e) => setCurrentName(e.target.value)}
          />
        </div>

        {/* 技能描述（仅技能时显示） */}
        {selectedTarget === 'skill' && (
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1.5">
              <FileText size={16} className="text-violet-500" />
              技能描述 *
            </label>
            <Textarea
              placeholder="描述该技能的用途..."
              value={skillDescription}
              onChange={(e) => setSkillDescription(e.target.value)}
              rows={2}
            />
          </div>
        )}

        {/* 编辑/预览切换 */}
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-gray-700">{targetInfo?.name}内容预览（可编辑）：</h4>
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

        {/* 编辑模式 */}
        {viewMode === 'edit' && (
          <MarkdownEditor
            value={currentContent}
            onChange={(e) => setCurrentContent(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
        )}

        {/* 预览模式 */}
        {viewMode === 'preview' && (
          <div className="bg-gray-50 rounded-lg p-4 min-h-[200px] max-h-[300px] overflow-y-auto">
            {currentContent.trim() ? (
              <MarkdownRenderer content={currentContent} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">
                暂无内容
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
