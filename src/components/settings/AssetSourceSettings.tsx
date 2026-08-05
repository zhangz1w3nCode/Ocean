import type { FC } from 'react'
import { Check } from 'lucide-react'
import { useSettingsStore } from '../../stores/settingsStore'
import { useToastStore } from '../../stores/toastStore'
import type { AssetRoot } from '../../types'

// Claude 品牌图标（来源：orca 项目 src/renderer/src/components/status-bar/icons.tsx）
const ClaudeIcon: FC<{ size?: number }> = ({ size = 48 }) => (
  <svg height={size} width={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"
      fill="#D97757"
      fillRule="nonzero"
    />
  </svg>
)

// Pi 品牌图标（来源：orca 项目 src/renderer/src/lib/agent-icon-glyphs.tsx，源自 pi.dev/favicon.svg）
const PiIcon: FC<{ size?: number }> = ({ size = 48 }) => (
  <svg height={size} width={size} viewBox="0 0 800 800" xmlns="http://www.w3.org/2000/svg">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z"
    />
    <path fill="currentColor" d="M517.36 400 H634.72 V634.72 H517.36 Z" />
  </svg>
)

interface SourceOption {
  id: AssetRoot
  name: string
  icon: FC<{ size?: number }>
}

const sourceOptions: SourceOption[] = [
  {
    id: 'claude',
    name: 'Claude',
    icon: ClaudeIcon,
  },
  {
    id: 'pi',
    name: 'Pi',
    icon: PiIcon,
  },
]

export const AssetSourceSettings: FC = () => {
  const { assetRoot, setAssetRoot } = useSettingsStore()
  const { addToast } = useToastStore()

  const getCardClass = (isActive: boolean) =>
    [
      'relative flex flex-col items-center justify-center gap-3 p-5 rounded-xl border-2 transition-all duration-200',
      isActive ? 'border-gray-900 bg-gray-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-400 hover:bg-gray-50'
    ].join(' ')

  return (
    <div className="max-w-sm">
      <div className="grid grid-cols-2 gap-3">
        {sourceOptions.map((option) => {
          const isActive = assetRoot === option.id
          const Icon = option.icon
          return (
            <button
              key={option.id}
              onClick={() => {
                setAssetRoot(option.id)
                addToast('切换成功', 'success')
              }}
              className={getCardClass(isActive)}
            >
              {isActive && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-900 flex items-center justify-center">
                  <Check size={12} className="text-white" strokeWidth={3} />
                </span>
              )}

              <div className={isActive ? 'text-gray-900' : 'text-gray-400'}>
                <Icon size={40} />
              </div>

              <span className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-600'}`}>
                {option.name}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
