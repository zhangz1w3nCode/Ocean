import { forwardRef, type FC, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  invalid?: boolean
}

export const Input: FC<InputProps> = ({ label, error, invalid, className = '', disabled, ...props }) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-macos-text mb-1.5">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2.5 text-sm bg-white border rounded-lg
          placeholder:text-macos-text-tertiary
          focus:outline-none
          transition-[border-color,box-shadow] duration-200
          ${error
            ? 'border-red-300 hover:border-red-400 focus:border-red-400'
            : invalid
              ? 'border-gray-400'
              : 'border-gray-200 hover:border-gray-300 focus:border-gray-400 focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]'
          }
          ${disabled ? 'bg-gray-100 text-macos-text-secondary cursor-not-allowed hover:border-gray-200' : ''}
          ${className}
        `}
        disabled={disabled}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-macos-error">{error}</p>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, invalid, className = '', disabled, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-macos-text mb-1.5">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full px-3 py-2.5 text-sm bg-white border rounded-lg
            placeholder:text-macos-text-tertiary
            focus:outline-none
            transition-[border-color,box-shadow] duration-200 resize-none
            ${error
              ? 'border-red-300 hover:border-red-400 focus:border-red-400'
              : invalid
                ? 'border-gray-400'
                : 'border-gray-200 hover:border-gray-300 focus:border-gray-400 focus:shadow-[0_4px_12px_rgba(0,0,0,0.08)]'
            }
            ${disabled ? 'bg-gray-100 text-macos-text-secondary cursor-not-allowed hover:border-gray-200' : ''}
            ${className}
          `}
          disabled={disabled}
          {...props}
        />
        {error && <p className="mt-1 text-xs text-macos-error">{error}</p>}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'