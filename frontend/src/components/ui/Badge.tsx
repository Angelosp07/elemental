type BadgeVariant = 'green' | 'red' | 'amber' | 'blue' | 'teal' | 'gray' | 'indigo'

interface BadgeProps {
  label: string
  variant: BadgeVariant
}

const variants: Record<BadgeVariant, string> = {
  green: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20',
  red: 'bg-red-500/15 text-red-400 border border-red-500/20',
  amber: 'bg-amber-500/15 text-amber-400 border border-amber-500/20',
  blue: 'bg-blue-500/15 text-blue-400 border border-blue-500/20',
  teal: 'bg-teal-500/15 text-teal-400 border border-teal-500/20',
  gray: 'bg-white/5 text-gray-400 border border-white/10',
  indigo: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20',
}

export function Badge({ label, variant }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${variants[variant]}`}>
      {label}
    </span>
  )
}
