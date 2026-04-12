import { useEffect, useMemo, useState } from 'react'
import L, { type DivIcon } from 'leaflet'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatLondonTime } from '../utils/formatTime'
import iconUrl from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

L.Marker.prototype.options.icon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconAnchor: [12, 41],
})

type ProfileJoin = {
  username: string | null
}

type ContractJoin = {
  id: string
  asset_symbol: string
  quantity_kg: number
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

function dotIcon(colorClass: string): DivIcon {
  return L.divIcon({
    className: '',
    html: `<span class="block h-3 w-3 rounded-full border border-white/70 ${colorClass}"></span>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  })
}

const originIcon = dotIcon('bg-amber-400')
const destinationIcon = dotIcon('bg-teal-400')
const vesselIcon = dotIcon('bg-white')

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
          contract:contracts(
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
      .or(`contract.buyer_id.eq.${user.id},contract.seller_id.eq.${user.id}`)
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

  const mapCoordinates = useMemo(() => {
    const points: [number, number][] = []

    for (const shipment of shipments) {
      const origin = normalizeJoin(shipment.origin)
      const destination = normalizeJoin(shipment.destination)

      if (origin?.latitude != null && origin?.longitude != null) {
        points.push([Number(origin.latitude), Number(origin.longitude)])
      }

      if (destination?.latitude != null && destination?.longitude != null) {
        points.push([Number(destination.latitude), Number(destination.longitude)])
      }

      if (shipment.current_lat != null && shipment.current_lon != null) {
        points.push([Number(shipment.current_lat), Number(shipment.current_lon)])
      }
    }

    return points
  }, [shipments])

  const mapCenter = useMemo<[number, number]>(() => {
    if (mapCoordinates.length === 0) {
      return [20, 0]
    }

    const [first] = mapCoordinates
    return first
  }, [mapCoordinates])

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
    return <p className="text-slate-400">Loading cargo…</p>
  }

  return (
    <section className="space-y-4">
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
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Live World Map</h2>
        <MapContainer
          center={mapCenter}
          zoom={2}
          scrollWheelZoom
          className="rounded-md border border-slate-800"
          style={{ height: '400px' }}
          bounds={mapCoordinates.length > 0 ? mapCoordinates : undefined}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {shipments.map((shipment) => {
            const origin = normalizeJoin(shipment.origin)
            const destination = normalizeJoin(shipment.destination)

            const originLat = origin?.latitude != null ? Number(origin.latitude) : null
            const originLon = origin?.longitude != null ? Number(origin.longitude) : null
            const destinationLat = destination?.latitude != null ? Number(destination.latitude) : null
            const destinationLon = destination?.longitude != null ? Number(destination.longitude) : null

            const hasRoute =
              originLat != null &&
              Number.isFinite(originLat) &&
              originLon != null &&
              Number.isFinite(originLon) &&
              destinationLat != null &&
              Number.isFinite(destinationLat) &&
              destinationLon != null &&
              Number.isFinite(destinationLon)

            return (
              <>
                {originLat != null && originLon != null ? (
                  <Marker
                    key={`${shipment.id}-origin`}
                    position={[originLat, originLon]}
                    icon={originIcon}
                  >
                    <Tooltip>Origin · {origin?.code ?? shipment.origin_port}</Tooltip>
                  </Marker>
                ) : null}

                {destinationLat != null && destinationLon != null ? (
                  <Marker
                    key={`${shipment.id}-destination`}
                    position={[destinationLat, destinationLon]}
                    icon={destinationIcon}
                  >
                    <Tooltip>Destination · {destination?.code ?? shipment.destination_port}</Tooltip>
                  </Marker>
                ) : null}

                {hasRoute ? (
                  <Polyline
                    key={`${shipment.id}-line`}
                    positions={[
                      [originLat as number, originLon as number],
                      [destinationLat as number, destinationLon as number],
                    ]}
                    pathOptions={{ color: '#60a5fa', dashArray: '6 6' }}
                  />
                ) : null}

                {shipment.current_lat != null && shipment.current_lon != null ? (
                  <Marker
                    key={`${shipment.id}-vessel`}
                    position={[Number(shipment.current_lat), Number(shipment.current_lon)]}
                    icon={vesselIcon}
                  >
                    <Tooltip>Vessel position · {shipment.id}</Tooltip>
                  </Marker>
                ) : null}
              </>
            )
          })}
        </MapContainer>

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
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Route Progress Board</h2>

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
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Ready to Dispatch</h2>

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
                </div>
              )
            })}
          </div>
        )}
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold text-slate-100">Shipment Ledger</h2>

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
                    {(['departed', 'in_transit', 'arrived', 'delivered'] as ShipmentStatus[]).map((nextStatus) => (
                      <button
                        key={nextStatus}
                        type="button"
                        disabled={working || shipment.status === nextStatus}
                        onClick={() => updateShipmentStatus(shipment.id, nextStatus)}
                        className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-50"
                      >
                        {nextStatus === 'in_transit'
                          ? 'In Transit'
                          : nextStatus.charAt(0).toUpperCase() + nextStatus.slice(1)}
                      </button>
                    ))}

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
