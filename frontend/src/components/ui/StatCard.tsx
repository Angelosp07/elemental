interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  valueColor?: 'default' | 'green' | 'red' | 'amber'
}

export function StatCard({ label, value, sub, valueColor = 'default' }: StatCardProps) {
  const colors = {
    default: 'text-white',
    green: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-white/[0.08] rounded-xl p-5 flex flex-col gap-1">
      <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-semibold ${colors[valueColor]}`}>{value}</span>
      {sub ? <span className="text-xs text-gray-500">{sub}</span> : null}
    </div>
  )
}
