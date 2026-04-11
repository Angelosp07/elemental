import { useProfile, useDashboardData } from '../hooks/useTradingData'

export function Dashboard() {
  const { data: profile } = useProfile()
  const { data } = useDashboardData()

  if (!data) {
    return <p className="text-slate-400">Loading dashboard…</p>
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-2xl font-semibold">Welcome back, {profile?.username ?? 'Trader'}</h2>
        <p className="mt-1 text-sm text-slate-400">Your strategy is in profit today.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.summaryCards.map((card) => (
          <article key={card.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-cyan-300">{card.value}</p>
            <p className="mt-1 text-xs text-slate-400">{card.note}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 xl:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-300">Portfolio Allocation</h3>
          <div className="space-y-4">
            {data.allocations.map((item) => (
              <div key={item.symbol}>
                <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                  <span>{item.symbol}</span>
                  <span>{item.percentage}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-slate-400">
                  <span>{item.value}</span>
                  <span className="text-emerald-400">{item.pnl}</span>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Watchlist Pulse</h3>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
            PROX · In Portfolio
          </div>
        </article>
      </div>
    </section>
  )
}
