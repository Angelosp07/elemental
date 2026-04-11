import { useContractsData } from '../hooks/useTradingData'

const statusStyles = {
  draft: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
  pending: 'bg-slate-500/20 text-slate-300 border-slate-500/40',
  signed: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
}

export function Contracts() {
  const { data } = useContractsData()

  if (!data) {
    return <p className="text-slate-400">Loading contracts…</p>
  }

  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold">Create Contract</h2>
        <p className="mb-4 text-xs text-slate-400">Counterparty search and draft terms</p>

        <form className="grid gap-3">
          <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" placeholder="Counterparty search" />
          <div className="grid grid-cols-2 gap-3">
            <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" placeholder="Quantity (kg)" />
            <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" placeholder="Purity (%)" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" placeholder="Origin Port" />
            <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" placeholder="Destination Port" />
          </div>
          <button
            type="button"
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Create Contract
          </button>
        </form>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Contract Repository</h2>
        <div className="space-y-3">
          {data.map((item) => (
            <div key={item.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-100">{item.title}</h3>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs capitalize ${statusStyles[item.status]}`}
                >
                  {item.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">{item.counterparties}</p>
              <p className="text-xs text-slate-300">{item.details}</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  )
}
