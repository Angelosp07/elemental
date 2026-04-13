import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'
import { createNotification } from '../utils/notifications'
import { CargoMap } from '../components/CargoMap'

type ProfileJoin = {
  username: string | null
}

type ContractJoin = {
  id: string
  asset_symbol: string
  quantity_kg: number
  buyer_id: string
  seller_id: string
  buyer: ProfileJoin | ProfileJoin[] | null
  seller: ProfileJoin | ProfileJoin[] | null
}

type PortJoin = {
  code: string
  name: string
  latitude: number
  longitude: number
}

type VesselJoin = {
  name: string
  vessel_class: string
}

type ShipmentStatus = 'planned' | 'departed' | 'in_transit' | 'arrived' | 'delivered'

type ShipmentRow = {
  id: string
  status: ShipmentStatus
  eta: string | null
  current_lat: number | null
  current_lon: number | null
  last_position_at: string | null
  origin_port: string
  destination_port: string
  broker_name: string | null
  created_at: string
  contract: ContractJoin | ContractJoin[] | null
  vessel: VesselJoin | VesselJoin[] | null
  origin: PortJoin | PortJoin[] | null
  destination: PortJoin | PortJoin[] | null
}

type ReadyContract = {
  id: string
  asset_symbol: string
  quantity_kg: number
  origin_port: string
  destination_port: string
  buyer: ProfileJoin | ProfileJoin[] | null
  seller: ProfileJoin | ProfileJoin[] | null
}

type ShipmentEvent = {
  id: string
  event_type: string
  description: string
  latitude: number | null
  longitude: number | null
  created_at: string
}

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

function getProgressPercent(status: ShipmentStatus): number {
  if (status === 'planned') {
    return 0
  }
  if (status === 'departed') {
    return 25
  }
  if (status === 'in_transit') {
    return 60
  }
  if (status === 'arrived') {
    return 85
  }
  return 100
}

function statusBadgeClass(status: ShipmentStatus): string {
  if (status === 'departed') {
    return 'bg-amber-500/20 text-amber-400'
  }
  if (status === 'in_transit') {
    return 'bg-blue-500/20 text-blue-400'
  }
  if (status === 'arrived') {
    return 'bg-teal-500/20 text-teal-400'
  }
  if (status === 'delivered') {
    return 'bg-green-500/20 text-green-400'
  }
  return 'bg-slate-500/20 text-slate-300'
}

function statusProgressIndex(status: ShipmentStatus): number {
  const progression: ShipmentStatus[] = ['planned', 'departed', 'in_transit', 'arrived', 'delivered']
  return progression.indexOf(status)
}

export function Cargo() {
  const { user } = useAuth()

  const [shipments, setShipments] = useState<ShipmentRow[]>([])
  const [readyContracts, setReadyContracts] = useState<ReadyContract[]>([])
  const [expandedTimeline, setExpandedTimeline] = useState<Record<string, boolean>>({})
  const [eventsByShipment, setEventsByShipment] = useState<Record<string, ShipmentEvent[]>>({})
  const [syncAt, setSyncAt] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadReadyContracts = async () => {
    if (!user) {
      return
    }

    const { data, error: readyError } = await supabase
      .from('contracts')
      .select(
        `
          id,
          asset_symbol,
          quantity_kg,
          origin_port,
          destination_port,
          buyer:profiles!contracts_buyer_id_fkey(username),
          seller:profiles!contracts_seller_id_fkey(username)
        `
      )
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .eq('status', 'signed')
      .not('id', 'in', '(select contract_id from shipments)')

    if (readyError) {
      throw new Error(readyError.message)
    }

    setReadyContracts((data ?? []) as ReadyContract[])
  }

  const loadShipments = async () => {
    if (!user) {
      return
    }

    const { data, error: shipmentsError } = await supabase
      .from('shipments')
      .select(
        `
          id,
          status,
          eta,
          current_lat,
          current_lon,
          last_position_at,
          origin_port,
          destination_port,
          broker_name,
          created_at,
          contract:contracts!inner(
            id,
            asset_symbol,
            quantity_kg,
            buyer_id,
            seller_id,
            buyer:profiles!contracts_buyer_id_fkey(username),
            seller:profiles!contracts_seller_id_fkey(username)
          ),
          vessel:vessels(name, vessel_class),
          origin:ports!shipments_origin_port_fkey(code, name, latitude, longitude),
          destination:ports!shipments_destination_port_fkey(code, name, latitude, longitude)
        `
      )
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`, { foreignTable: 'contracts' })
      .order('created_at', { ascending: false })

    if (shipmentsError) {
      throw new Error(shipmentsError.message)
    }

    setShipments((data ?? []) as ShipmentRow[])
  }

  const loadAll = async () => {
    await Promise.all([loadShipments(), loadReadyContracts()])
    setSyncAt(new Date().toISOString())
  }

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const start = async () => {
      setLoading(true)
      setError(null)

      try {
        await loadAll()
      } catch (caughtError) {
        if (!active) {
          return
        }

        const message = caughtError instanceof Error ? caughtError.message : 'Failed to load cargo page'
        setError(message)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void start()

    const channel = supabase
      .channel('shipments')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shipments' },
        (payload) => {
          const next = payload.new as ShipmentRow

          setShipments((current) =>
            current.map((shipment) =>
              shipment.id === next.id
                ? {
                    ...shipment,
                    status: next.status,
                    current_lat: next.current_lat,
                    current_lon: next.current_lon,
                    last_position_at: next.last_position_at,
                    eta: next.eta,
                  }
                : shipment
            )
          )

          setSyncAt(new Date().toISOString())
        }
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user])

  const activeShipments = useMemo(
    () => shipments.filter((shipment) => shipment.status === 'departed' || shipment.status === 'in_transit'),
    [shipments]
  )

  const updateShipmentStatus = async (shipmentId: string, newStatus: ShipmentStatus) => {
    if (!user) {
      return
    }

    setWorking(true)
    setError(null)

    const { error: updateError } = await supabase
      .from('shipments')
      .update({ status: newStatus })
      .eq('id', shipmentId)

    if (updateError) {
      setError(updateError.message)
      setWorking(false)
      return
    }

    const { error: eventError } = await supabase.from('shipment_events').insert({
      shipment_id: shipmentId,
      event_type: newStatus,
      description: `Status updated to ${newStatus}`,
    })

    if (eventError) {
      setError(eventError.message)
    }

    const targetShipment = shipments.find((shipment) => shipment.id === shipmentId)
    const contract = normalizeJoin(targetShipment?.contract)

    if (contract?.buyer_id && contract.buyer_id !== user.id) {
      try {
        await createNotification(
          contract.buyer_id,
          'shipment_update',
          'Shipment update',
          `Shipment #${shipmentId} status changed to ${newStatus}`,
          shipmentId
        )
      } catch {
        setError('Notification setup is not available yet. Please run notification SQL setup.')
      }
    }

    if (contract?.seller_id && contract.seller_id !== user.id) {
      try {
        await createNotification(
          contract.seller_id,
          'shipment_update',
          'Shipment update',
          `Shipment #${shipmentId} status changed to ${newStatus}`,
          shipmentId
        )
      } catch {
        setError('Notification setup is not available yet. Please run notification SQL setup.')
      }
    }

    setShipments((current) =>
      current.map((shipment) =>
        shipment.id === shipmentId
          ? {
              ...shipment,
              status: newStatus,
            }
          : shipment
      )
    )

    setWorking(false)
    setSyncAt(new Date().toISOString())
  }

  const toggleTimeline = async (shipmentId: string) => {
    const isOpen = expandedTimeline[shipmentId]

    if (isOpen) {
      setExpandedTimeline((current) => ({
        ...current,
        [shipmentId]: false,
      }))
      return
    }

    if (!eventsByShipment[shipmentId]) {
      const { data, error: eventsError } = await supabase
        .from('shipment_events')
        .select('id, event_type, description, latitude, longitude, created_at')
        .eq('shipment_id', shipmentId)
        .order('created_at', { ascending: true })

      if (eventsError) {
        setError(eventsError.message)
        return
      }

      setEventsByShipment((current) => ({
        ...current,
        [shipmentId]: (data ?? []) as ShipmentEvent[],
      }))
    }

    setExpandedTimeline((current) => ({
      ...current,
      [shipmentId]: true,
    }))
  }

  if (loading) {
    return <p className="text-sm text-gray-500">Loading cargo…</p>
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Live cargo</h1>
        <p className="text-sm text-gray-500 mb-6">Shipment map, route milestones, and dispatch board.</p>
      </div>

      {error ? (
        <p className="rounded-md border border-rose-800 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Contracts Ready</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{readyContracts.length}</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Active Shipments</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{activeShipments.length}</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Shipment Records</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{shipments.length}</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Data Sync</p>
          <p className="mt-1 text-lg font-bold text-green-400">Live</p>
          <p className="mt-1 text-xs text-slate-400">
            {syncAt ? formatLondonTime(syncAt) : 'Waiting for sync…'}
          </p>
        </article>
      </div>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Live world map</h2>
        <CargoMap shipments={shipments} />

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Origin port
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-400" /> Destination port
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-full bg-white" /> Vessel
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-200/90 bg-cyan-400/90 text-[9px] leading-none">🚢</span>{' '}
            Demo vessel
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-5 bg-cyan-300" /> Active route
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-0.5 w-5 border-t border-dashed border-blue-300" /> Planned route
          </span>
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Route progress board</h2>

        {activeShipments.length === 0 ? (
          <p className="text-sm text-slate-400">No active shipments right now.</p>
        ) : (
          <div className="space-y-3">
            {activeShipments.map((shipment) => {
              const contract = normalizeJoin(shipment.contract)
              const progress = getProgressPercent(shipment.status)

              return (
                <div key={shipment.id} className="rounded-md border border-slate-800 bg-slate-950/60 p-3">
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-mono text-slate-100">{shipment.id}</span>
                    <span className="text-slate-300">{contract?.asset_symbol ?? '—'} · {progress}%</span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                  </div>

                  <div className="mt-1 flex justify-between text-xs text-slate-400">
                    <span>{shipment.origin_port}</span>
                    <span>{shipment.destination_port}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Ready to dispatch</h2>

        {readyContracts.length === 0 ? (
          <p className="text-sm text-slate-400">No signed contracts waiting for shipment setup</p>
        ) : (
          <div className="space-y-2">
            {readyContracts.map((contract) => {
              const buyerUsername = normalizeJoin(contract.buyer)?.username ?? 'Unknown'
              const sellerUsername = normalizeJoin(contract.seller)?.username ?? 'Unknown'

              return (
                <div key={contract.id} className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="font-mono text-sm text-cyan-300">
                    {contract.asset_symbol} · {Number(contract.quantity_kg).toLocaleString()} kg
                  </p>
                  <p className="text-xs text-slate-300">
                    {buyerUsername} ↔ {sellerUsername}
                  </p>
                  <p className="text-xs text-slate-500">
                    {contract.origin_port} → {contract.destination_port}
                  </p>
                  <p className="mt-1 text-xs text-amber-300">Warning: inspection status unavailable in current schema</p>
                </div>
              )
            })}
          </div>
        )}
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Shipment ledger</h2>

        {shipments.length === 0 ? (
          <p className="text-sm text-slate-400">No shipment records found.</p>
        ) : (
          <div className="space-y-3">
            {shipments.map((shipment) => {
              const contract = normalizeJoin(shipment.contract)
              const vessel = normalizeJoin(shipment.vessel)
              const events = eventsByShipment[shipment.id] ?? []
              const timelineOpen = Boolean(expandedTimeline[shipment.id])

              return (
                <div key={shipment.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-mono text-sm text-cyan-300">Shipment {shipment.id}</p>
                      <p className="text-xs text-slate-300">
                        {contract?.asset_symbol ?? '—'} · Contract {contract?.id ?? '—'}
                      </p>
                    </div>

                    <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusBadgeClass(shipment.status)}`}>
                      {shipment.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    Route: {shipment.origin_port} → {shipment.destination_port}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Created: {formatLondonTime(shipment.created_at)}
                  </p>
                  {shipment.eta ? <p className="text-xs text-slate-500">ETA: {formatLondonTime(shipment.eta)}</p> : null}
                  {shipment.last_position_at ? (
                    <p className="text-xs text-slate-500">
                      Last Position: {formatLondonTime(shipment.last_position_at)}
                    </p>
                  ) : null}
                  {vessel ? (
                    <p className="text-xs text-slate-500">
                      Vessel: {vessel.name} ({vessel.vessel_class})
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(['departed', 'in_transit', 'arrived', 'delivered'] as ShipmentStatus[]).map((nextStatus) => {
                      const currentIndex = statusProgressIndex(shipment.status)
                      const targetIndex = statusProgressIndex(nextStatus)
                      const isCurrent = shipment.status === nextStatus
                      const isFuture = targetIndex > currentIndex

                      return (
                        <button
                          key={nextStatus}
                          type="button"
                          disabled={working || isCurrent}
                          onClick={() => updateShipmentStatus(shipment.id, nextStatus)}
                          className={`rounded border px-2 py-1 text-xs transition-colors disabled:opacity-60 ${
                            isCurrent
                              ? 'border-indigo-500/50 bg-indigo-500/20 text-indigo-200'
                              : isFuture
                                ? 'border-slate-700 text-slate-500 hover:bg-slate-800/20'
                                : 'border-slate-700 text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          {nextStatus === 'in_transit'
                            ? 'In Transit'
                            : nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                        </button>
                      )
                    })}

                    <button
                      type="button"
                      onClick={() => toggleTimeline(shipment.id)}
                      className="rounded border border-indigo-500 px-2 py-1 text-xs text-indigo-300 hover:bg-indigo-900/20"
                    >
                      Timeline
                    </button>
                  </div>

                  {timelineOpen ? (
                    <div className="mt-3 space-y-2 rounded-md border border-slate-800 bg-slate-900/70 p-3">
                      {events.length === 0 ? (
                        <p className="text-xs text-slate-500">No shipment events yet.</p>
                      ) : (
                        events.map((event) => (
                          <div key={event.id} className="rounded border border-slate-800 bg-slate-950/70 px-2 py-2">
                            <p className="text-xs text-slate-500">{formatLondonTime(event.created_at)}</p>
                            <p className="mt-1 text-xs text-slate-300">{event.event_type}</p>
                            <p className="mt-1 text-xs text-slate-400">{event.description}</p>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </article>
    </section>
  )
}
