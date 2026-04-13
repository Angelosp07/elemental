export function SkeletonRow() {
  return (
    <div className="flex gap-4 py-3 border-b border-white/5">
      <div className="h-4 bg-white/5 rounded animate-pulse w-16" />
      <div className="h-4 bg-white/5 rounded animate-pulse w-32" />
      <div className="h-4 bg-white/5 rounded animate-pulse w-20 ml-auto" />
    </div>
  )
}
