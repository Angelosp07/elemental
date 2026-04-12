import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'

type Port = {
  code: string
  name: string
  country: string
  max_draft_m: number
  max_beam_m: number
  max_loa_m: number
  latitude: number
  longitude: number
}

type Vessel = {
  id: string
  name: string
  vessel_class: string
  draft_m: number
  beam_m: number
  loa_m: number
  max_cargo_tons: number
  status: string
}

type FreightRate = {
  usd_per_ton: number
  updated_at: string
}

function checkEligibility(vessel: Vessel, port: Port, cargoTons: number): boolean {
  return (
    vessel.draft_m <= port.max_draft_m &&
    vessel.beam_m <= port.max_beam_m &&
    vessel.loa_m <= port.max_loa_m &&
    vessel.max_cargo_tons >= cargoTons
  )
}

export function FreightDesk() {
  const [ports, setPorts] = useState<Port[]>([])
  const [vessels, setVessels] = useState<Vessel[]>([])

  const [originCode, setOriginCode] = useState('')
  const [destinationCode, setDestinationCode] = useState('')
  const [cargoTons, setCargoTons] = useState('')

  const [evaluated, setEvaluated] = useState(false)
  const [freightRate, setFreightRate] = useState<FreightRate | null>(null)
  const [routeAvailable, setRouteAvailable] = useState(true)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadData = async () => {
      setLoading(true)
      setError(null)

      const [portsResult, vesselsResult] = await Promise.all([
        supabase
          .from('ports')
          .select('code, name, country, max_draft_m, max_beam_m, max_loa_m, latitude, longitude')
          .order('name'),
        supabase
          .from('vessels')
          .select('id, name, vessel_class, draft_m, beam_m, loa_m, max_cargo_tons, status')
          .order('vessel_class'),
      ])

      if (!active) {
        return
      }

      const firstError = portsResult.error ?? vesselsResult.error

      if (firstError) {
        setError(firstError.message)
        setLoading(false)
        return
      }

      const nextPorts = (portsResult.data ?? []) as Port[]
      const nextVessels = (vesselsResult.data ?? []) as Vessel[]

      setPorts(nextPorts)
      setVessels(nextVessels)

      if (nextPorts.length > 0 && !originCode) {
        setOriginCode(nextPorts[0].code)
      }

      if (nextPorts.length > 1 && !destinationCode) {
        setDestinationCode(nextPorts[1].code)
      }

      if (nextPorts.length === 1 && !destinationCode) {
        setDestinationCode(nextPorts[0].code)
      }

      setLoading(false)
    }

    void loadData()

    return () => {
      active = false
    }
  }, [])

  const destinationPort = useMemo(
    () => ports.find((port) => port.code === destinationCode) ?? null,
    [destinationCode, ports]
  )

  const originPort = useMemo(
    () => ports.find((port) => port.code === originCode) ?? null,
    [originCode, ports]
  )

  const parsedCargoTons = useMemo(() => Number(cargoTons || '0'), [cargoTons])

  const vesselEvaluations = useMemo(() => {
    if (!destinationPort || !evaluated) {
      return []
    }

    return vessels.map((vessel) => ({
      vessel,
      eligible: checkEligibility(vessel, destinationPort, parsedCargoTons),
    }))
  }, [destinationPort, evaluated, parsedCargoTons, vessels])

  const evaluateRoute = async () => {
    if (!originCode || !destinationCode) {
      return
    }

    setError(null)
    setEvaluated(true)
    setFreightRate(null)
    setRouteAvailable(true)

    const { data, error: rateError } = await supabase
      .from('freight_rates')
      .select('usd_per_ton, updated_at')
      .eq('origin_port', originCode)
      .eq('destination_port', destinationCode)
      .single()

    if (rateError) {
      if (rateError.code === 'PGRST116') {
        setRouteAvailable(false)
        return
      }

      setError(rateError.message)
      setRouteAvailable(false)
      return
    }

    setFreightRate(data as FreightRate)
    setRouteAvailable(true)
  }

  if (loading) {
    return <p className="text-slate-400">Loading freight desk…</p>
  }

  return (
    <section className="space-y-4">
      {error ? (
        <p className="rounded-md border border-rose-800 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-slate-100">Route Intelligence Query</h2>
        <p className="mt-1 text-xs text-slate-400">Select route and cargo size to evaluate eligibility.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            value={originCode}
            onChange={(event) => setOriginCode(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            {ports.map((port) => (
              <option key={port.code} value={port.code}>
                {port.name} ({port.code})
              </option>
            ))}
          </select>

          <select
            value={destinationCode}
            onChange={(event) => setDestinationCode(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            {ports.map((port) => (
              <option key={port.code} value={port.code}>
                {port.name} ({port.code})
              </option>
            ))}
          </select>

          <input
            type="number"
            min="0"
            step="0.01"
            value={cargoTons}
            onChange={(event) => setCargoTons(event.target.value)}
            placeholder="Cargo (tons)"
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          />

          <button
            type="button"
            onClick={evaluateRoute}
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Evaluate Route
          </button>
        </div>
      </article>

      {evaluated ? (
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-300">Indicative Freight Rates</h3>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm">
            <p className="font-mono text-slate-200">
              {(originPort?.code ?? originCode) || '—'} → {(destinationPort?.code ?? destinationCode) || '—'}
            </p>
            {routeAvailable && freightRate ? (
              <>
                <p className="mt-1 text-lg font-semibold text-cyan-300">
                  ${Number(freightRate.usd_per_ton).toFixed(2)}/ton
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Updated: {formatLondonTime(freightRate.updated_at)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-amber-300">Route not available</p>
            )}
          </div>
        </article>
      ) : null}

      {evaluated ? (
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Vessel Eligibility</h3>
          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Vessel</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Capacity</th>
                  <th className="px-3 py-2">Eligibility</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {vesselEvaluations.map(({ vessel, eligible }) => (
                  <tr key={vessel.id}>
                    <td className="px-3 py-2 text-slate-100">{vessel.name}</td>
                    <td className="px-3 py-2 text-slate-300">{vessel.vessel_class}</td>
                    <td className="px-3 py-2 text-slate-300">{Number(vessel.max_cargo_tons).toFixed(0)} tons</td>
                    <td className={`px-3 py-2 font-medium ${eligible ? 'text-green-400' : 'text-red-400'}`}>
                      {eligible ? 'Eligible' : 'Ineligible'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Port Constraint Database</h3>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Port</th>
                <th className="px-3 py-2">Country</th>
                <th className="px-3 py-2">Max Draft</th>
                <th className="px-3 py-2">Max Beam</th>
                <th className="px-3 py-2">Max LOA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {ports.map((port) => (
                <tr key={port.code}>
                  <td className="px-3 py-2 text-slate-100">
                    {port.name} ({port.code})
                  </td>
                  <td className="px-3 py-2 text-slate-300">{port.country}</td>
                  <td className="px-3 py-2 text-slate-300">{Number(port.max_draft_m).toFixed(1)}m</td>
                  <td className="px-3 py-2 text-slate-300">{Number(port.max_beam_m).toFixed(1)}m</td>
                  <td className="px-3 py-2 text-slate-300">{Number(port.max_loa_m).toFixed(1)}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
