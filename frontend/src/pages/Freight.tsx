import { useFreightData } from '../hooks/useTradingData'

export function Freight() {
  const { routesQuery, vesselsQuery } = useFreightData()

  if (!routesQuery.data || !vesselsQuery.data) {
    return <p className="text-slate-400">Loading freight desk…</p>
  }

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Route Intelligence Query</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" value="NLRTM - Rotterdam" readOnly />
          <input className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm" value="SGSIN - Singapore" readOnly />
          <button className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400">
            Evaluate Route
          </button>
        </div>
      </article>

      <div className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Indicative Freight Rates</h3>
          {routesQuery.data.map((row) => (
            <div
              key={row.route}
              className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2"
            >
              <span>{row.route}</span>
              <span className="font-semibold text-cyan-300">{row.rate}</span>
            </div>
          ))}
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Vessel Eligibility</h3>
          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950/60 text-xs text-slate-400">
                <tr>
                  <th className="px-3 py-2">Vessel</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Capacity</th>
                  <th className="px-3 py-2">Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {vesselsQuery.data.map((vessel) => (
                  <tr key={vessel.vessel}>
                    <td className="px-3 py-2">{vessel.vessel}</td>
                    <td className="px-3 py-2 text-slate-400">{vessel.class}</td>
                    <td className="px-3 py-2 text-slate-400">{vessel.capacity}</td>
                    <td className="px-3 py-2 text-emerald-300">{vessel.eligibility}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  )
}
