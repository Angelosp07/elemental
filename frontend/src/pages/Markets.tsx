import { useMarketsData } from '../hooks/useTradingData'

export function Markets() {
  const { data } = useMarketsData()

  if (!data) {
    return <p className="text-slate-400">Loading markets…</p>
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Markets List</h2>
        <div className="space-y-2">
          {data.map((row) => (
            <div key={row.symbol} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-sm font-semibold text-slate-100">{row.symbol}</p>
              <p className="text-xs text-slate-400">{row.name}</p>
              <p className="mt-1 text-xs text-cyan-300">{row.price}</p>
            </div>
          ))}
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Assets Table</h2>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs text-slate-400">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Price</th>
                <th className="px-3 py-2">% Change</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.map((row) => (
                <tr key={row.symbol} className="bg-slate-900/30">
                  <td className="px-3 py-2 text-slate-200">{row.symbol} · {row.name}</td>
                  <td className="px-3 py-2 text-slate-300">{row.price}</td>
                  <td className="px-3 py-2 text-slate-400">{row.change}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
