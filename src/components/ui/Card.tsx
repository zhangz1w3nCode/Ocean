import type { FC, ReactNode, HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean
  selected?: boolean
  children: ReactNode
}

export const Card: FC<CardProps> = ({
  children,
  hoverable = true,
  selected = false,
  className = '',
  ...props
}) => {
  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverable && !selected) {
      e.currentTarget.style.transform = 'translateY(-2px)'
      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'
    }
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'translateY(0)'
    e.currentTarget.style.boxShadow = 'none'
  }

  return (
    <div
      className={`
        bg-white rounded-xl border
        ${selected ? 'border-2 border-macos-accent' : 'border-macos-border'}
        ${hoverable ? 'cursor-pointer' : ''}
        ${className}
      `}
      style={{
        transition: 'transform 0.2s, box-shadow 0.2s'
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </div>
  )
}