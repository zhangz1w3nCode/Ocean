import type { FC } from 'react'
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export const Dropdown: FC<DropdownProps> = ({ value, options, onChange, placeholder, className = '' }) => {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selected = options.find(o => o.value === value)
  const displayLabel = selected ? selected.label : (placeholder || '请选择')

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: '#ffffff',
          border: '1px solid #d2d2d7',
          borderRadius: '8px',
          letterSpacing: '-0.224px',
          transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          borderColor: isOpen ? '#9ca3af' : '#d2d2d7',
          boxShadow: isOpen ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
        }}
        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer focus:outline-none min-w-0"
      >
        <span
          className="truncate"
          style={{ color: selected ? '#1d1d1f' : 'rgba(0, 0, 0, 0.48)' }}
        >
          {displayLabel}
        </span>
        <ChevronDown
          size={14}
          className="flex-shrink-0 transition-transform duration-150"
          style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', color: 'rgba(0, 0, 0, 0.48)' }}
          strokeWidth={1.5}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              boxShadow: 'rgba(0, 0, 0, 0.22) 3px 5px 30px 0px',
            }}
            className="absolute top-full left-0 mt-1.5 min-w-full p-2 z-50"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value
              return (
                <button
                  key={opt.value}
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                  style={{
                    letterSpacing: '-0.224px',
                    background: isSelected ? '#f5f5f7' : 'transparent',
                    borderRadius: '8px',
                    transition: 'background 0.15s ease',
                  }}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-[#f5f5f7]"
                >
                  <span
                    className="truncate"
                    style={{ color: isSelected ? '#1d1d1f' : 'rgba(0, 0, 0, 0.8)', fontWeight: isSelected ? 500 : 400 }}
                  >
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
