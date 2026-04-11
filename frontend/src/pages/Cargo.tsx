import { useCargoData } from '../hooks/useTradingData'

export function Cargo() {
  const { data } = useCargoData()

  if (!data) {
    return <p className="text-slate-400">Loading cargo…</p>
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Contracts Ready</p>
          <p className="text-2xl font-bold">0</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Active Shipments</p>
          <p className="text-2xl font-bold">1</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Total Shipment Records</p>
          <p className="text-2xl font-bold">1</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs text-slate-400">Data Sync</p>
          <p className="text-2xl font-bold text-emerald-300">Live</p>
        </article>
      </div>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Origin ⇔ Destination Ports Map</h2>
        <div className="relative h-72 rounded-md border border-slate-800 bg-gradient-to-r from-sky-900/30 via-slate-950 to-sky-900/30">
          <div className="absolute left-1/4 top-1/2 h-2 w-2 rounded-full bg-emerald-400" />
          <div className="absolute right-1/4 top-1/2 h-2 w-2 rounded-full bg-amber-300" />
          <div className="absolute left-1/4 right-1/4 top-1/2 border-t border-dashed border-indigo-400" />
          <div className="absolute left-1/4 top-[46%] rounded bg-slate-900/90 px-2 py-1 text-xs">Destination Port · USHOU</div>
          <div className="absolute right-1/4 top-[46%] rounded bg-slate-900/90 px-2 py-1 text-xs">Origin Port · CNNGB</div>
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Route Progress Board</h2>
        {data.map((shipment) => (
          <div key={shipment.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
            <div className="mb-1 flex justify-between text-sm text-slate-300">
              <span>{shipment.contract}</span>
              <span>{shipment.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-indigo-500" style={{ width: `${shipment.progress}%` }} />
            </div>
            <div className="mt-1 flex justify-between text-xs text-slate-400">
              <span>{shipment.route}</span>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                {shipment.status}
              </span>
            </div>
          </div>
        ))}
      </article>
    </section>
  )
}
