import React from 'react'
import { motion } from 'framer-motion'

interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  size?: 'sm' | 'md'
  disabled?: boolean
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, size = 'md', disabled = false }) => {
  const sizes = {
    sm: { width: 36, height: 20, knob: 16 },
    md: { width: 44, height: 24, knob: 20 },
  }

  const s = sizes[size]

  return (
    <motion.button
      className={`relative rounded-full focus:outline-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ width: s.width, height: s.height, opacity: disabled ? 0.5 : 1 }}
      animate={{
        backgroundColor: checked ? '#34C759' : '#E5E5E5',
      }}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
    >
      <motion.div
        className="absolute bg-white rounded-full shadow-sm"
        style={{
          width: s.knob,
          height: s.knob,
          top: (s.height - s.knob) / 2,
        }}
        animate={{
          x: checked ? s.width - s.knob - (s.height - s.knob) / 2 : (s.height - s.knob) / 2,
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  )
}