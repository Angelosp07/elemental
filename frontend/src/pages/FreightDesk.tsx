import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { Table } from '../components/ui/Table'
import { supabase } from '../lib/supabase'
import { formatNumber, formatUSD } from '../utils/formatNumber'
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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Freight desk</h1>
        <p className="text-sm text-gray-500 mb-6">Route intelligence, indicative rates, and vessel eligibility.</p>
      </div>

      {error ? (
        <Card><p className="text-sm text-red-400">{error}</p></Card>
      ) : null}

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Route intelligence query</h2>
        <p className="text-sm text-gray-500">Select route and cargo size to evaluate eligibility.</p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Select
            value={originCode}
            onChange={(event) => setOriginCode(event.target.value)}
            options={ports.map((port) => ({ value: port.code, label: `${port.name} (${port.code})` }))}
          />

          <Select
            value={destinationCode}
            onChange={(event) => setDestinationCode(event.target.value)}
            options={ports.map((port) => ({ value: port.code, label: `${port.name} (${port.code})` }))}
          />

          <Input
            type="number"
            min="0"
            step="0.01"
            label="Cargo (tons)"
            value={cargoTons}
            onChange={(event) => setCargoTons(event.target.value)}
            placeholder="Cargo (tons)"
          />

          <div className="flex items-end">
            <Button type="button" onClick={evaluateRoute} className="w-full" loading={loading}>
              Evaluate route
            </Button>
          </div>
        </div>
      </Card>

      {evaluated ? (
        <Card className="animate-[fadeIn_260ms_ease-out]">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Indicative freight rates</h2>
          <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-3 text-sm">
            <p className="font-mono text-slate-200">
              {(originPort?.code ?? originCode) || '—'} → {(destinationPort?.code ?? destinationCode) || '—'}
            </p>
            {routeAvailable && freightRate ? (
              <>
                <p className="mt-1 text-lg font-semibold text-cyan-300">
                  {formatUSD(Number(freightRate.usd_per_ton))}/ton
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  Updated: {formatLondonTime(freightRate.updated_at)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-amber-300">Route not available</p>
            )}
          </div>
        </Card>
      ) : null}

      {evaluated ? (
        <Card className="animate-[fadeIn_260ms_ease-out]">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Vessel eligibility</h2>
          {vesselEvaluations.length === 0 ? (
            <EmptyState message="No vessels to evaluate" />
          ) : (
            <Table<(typeof vesselEvaluations)[number]>
              data={vesselEvaluations}
              getRowKey={(row) => row.vessel.id}
              rowClassName={(row) => (row.eligible ? 'bg-emerald-500/[0.05]' : 'bg-red-500/[0.05]')}
              columns={[
                { key: 'vessel', header: 'Vessel', render: (row) => row.vessel.name },
                { key: 'class', header: 'Class', render: (row) => row.vessel.vessel_class },
                {
                  key: 'capacity',
                  header: 'Capacity',
                  render: (row) => `${formatNumber(Number(row.vessel.max_cargo_tons), 0)} tons`,
                },
                {
                  key: 'eligible',
                  header: 'Eligibility',
                  render: (row) => (
                    <Badge label={row.eligible ? 'Eligible' : 'Ineligible'} variant={row.eligible ? 'green' : 'red'} />
                  ),
                },
              ]}
            />
          )}
        </Card>
      ) : null}

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Port constraint database</h2>
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-8 rounded bg-white/5 animate-pulse mb-2" />)
        ) : (
          <Table<Port>
            data={ports}
            getRowKey={(port) => port.code}
            emptyMessage="No ports configured"
            columns={[
              { key: 'port', header: 'Port', render: (port) => `${port.name} (${port.code})` },
              { key: 'country', header: 'Country', render: (port) => port.country },
              { key: 'draft', header: 'Max draft', render: (port) => `${formatNumber(Number(port.max_draft_m), 1)}m` },
              { key: 'beam', header: 'Max beam', render: (port) => `${formatNumber(Number(port.max_beam_m), 1)}m` },
              { key: 'loa', header: 'Max LOA', render: (port) => `${formatNumber(Number(port.max_loa_m), 1)}m` },
            ]}
          />
        )}
      </Card>
    </section>
  )
}
