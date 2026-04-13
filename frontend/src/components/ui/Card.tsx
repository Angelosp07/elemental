interface CardProps {
  children: React.ReactNode
  className?: string
  padding?: 'sm' | 'md' | 'lg'
}

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  const paddings = { sm: 'p-3', md: 'p-5', lg: 'p-6' }
  return (
    <div className={`bg-[var(--bg-surface)] border border-white/[0.08] rounded-xl ${paddings[padding]} ${className}`}>
      {children}
    </div>
  )
}
