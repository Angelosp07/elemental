export function EmptyState({ message, sub }: { message: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-3">
        <div className="w-4 h-4 border-2 border-gray-600 rounded-sm" />
      </div>
      <p className="text-sm text-gray-400">{message}</p>
      {sub ? <p className="text-xs text-gray-600 mt-1">{sub}</p> : null}
    </div>
  )
}
