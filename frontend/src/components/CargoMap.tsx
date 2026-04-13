import { Fragment, useEffect, useMemo, useState } from 'react'
import L from 'leaflet'
import 'leaflet-ant-path'
import 'leaflet.geodesic'
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'

type ShipmentStatus = 'planned' | 'departed' | 'in_transit' | 'arrived' | 'delivered'

type PortJoin = {
  code: string
  name: string
  latitude: number
  longitude: number
}

type ShipmentMapRow = {
  id: string
  status: ShipmentStatus
  origin_port: string
  destination_port: string
  current_lat: number | null
  current_lon: number | null
  origin: PortJoin | PortJoin[] | null
  destination: PortJoin | PortJoin[] | null
}

type CargoMapProps = {
  shipments: ShipmentMapRow[]
}

type RouteLine = {
  id: string
  origin: [number, number]
  destination: [number, number]
  active: boolean
  path?: [number, number][]
}

const FALLBACK_DEMO_ROUTES: RouteLine[] = [
  {
    id: 'demo-singapore-suez',
    origin: [1.2644, 103.8223],
    destination: [29.9668, 32.5498],
    active: true,
    path: [
      [1.2644, 103.8223],
      [6.8, 95.0],
      [10.5, 84.0],
      [12.0, 72.0],
      [12.5, 52.0],
      [12.2, 44.0],
      [15.5, 42.0],
      [22.0, 38.5],
      [27.8, 33.8],
      [29.9668, 32.5498],
    ],
  },
  {
    id: 'demo-suez-rotterdam',
    origin: [29.9668, 32.5498],
    destination: [51.9519, 4.1454],
    active: true,
    path: [
      [29.9668, 32.5498],
      [31.2, 31.9],
      [34.8, 24.0],
      [36.0, 14.0],
      [36.0, 5.6],
      [36.0, -5.3],
      [43.0, -9.5],
      [48.0, -6.0],
      [50.6, -1.0],
      [51.2, 2.0],
      [51.9519, 4.1454],
    ],
  },
  {
    id: 'demo-rotterdam-newyork',
    origin: [51.9519, 4.1454],
    destination: [40.6677, -74.0419],
    active: true,
    path: [
      [51.9519, 4.1454],
      [51.2, -1.0],
      [49.0, -12.0],
      [47.0, -25.0],
      [44.5, -40.0],
      [42.5, -55.0],
      [41.2, -66.0],
      [40.6677, -74.0419],
    ],
  },
]

function getRoutePath(route: RouteLine): [number, number][] {
  if (route.path && route.path.length >= 2) {
    return route.path
  }

  return [route.origin, route.destination]
}

function getProgressPointOnPath(path: [number, number][], progress: number): [number, number] {
  if (path.length === 0) {
    return [20, 0]
  }

  if (path.length === 1) {
    return path[0]
  }

  const clamped = Math.max(0, Math.min(1, progress))
  const segmentLengths: number[] = []
  let totalLength = 0

  for (let index = 0; index < path.length - 1; index += 1) {
    const [fromLat, fromLon] = path[index]
    const [toLat, toLon] = path[index + 1]
    const segmentLength = Math.hypot(toLat - fromLat, toLon - fromLon)
    segmentLengths.push(segmentLength)
    totalLength += segmentLength
  }

  if (totalLength === 0) {
    return path[path.length - 1]
  }

  let remaining = totalLength * clamped

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index]

    if (remaining > segmentLength && index < segmentLengths.length - 1) {
      remaining -= segmentLength
      continue
    }

    const [fromLat, fromLon] = path[index]
    const [toLat, toLon] = path[index + 1]
    const segmentProgress = segmentLength === 0 ? 0 : remaining / segmentLength

    return [
      fromLat + (toLat - fromLat) * segmentProgress,
      fromLon + (toLon - fromLon) * segmentProgress,
    ]
  }

  return path[path.length - 1]
}

function getTraveledPath(path: [number, number][], progress: number): [number, number][] {
  if (path.length <= 1) {
    return path
  }

  const clamped = Math.max(0, Math.min(1, progress))
  const segmentLengths: number[] = []
  let totalLength = 0

  for (let index = 0; index < path.length - 1; index += 1) {
    const [fromLat, fromLon] = path[index]
    const [toLat, toLon] = path[index + 1]
    const segmentLength = Math.hypot(toLat - fromLat, toLon - fromLon)
    segmentLengths.push(segmentLength)
    totalLength += segmentLength
  }

  if (totalLength === 0) {
    return [path[0]]
  }

  let remaining = totalLength * clamped
  const traveled: [number, number][] = [path[0]]

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index]
    const segmentStart = path[index]
    const segmentEnd = path[index + 1]

    if (remaining >= segmentLength) {
      traveled.push(segmentEnd)
      remaining -= segmentLength
      continue
    }

    const segmentProgress = segmentLength === 0 ? 0 : remaining / segmentLength
    traveled.push([
      segmentStart[0] + (segmentEnd[0] - segmentStart[0]) * segmentProgress,
      segmentStart[1] + (segmentEnd[1] - segmentStart[1]) * segmentProgress,
    ])
    break
  }

  return traveled
}

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

const originIcon = L.divIcon({
  className: '',
  html: '<span class="flex h-3 w-3 rounded-full border border-white/70 bg-amber-400"></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

const destinationIcon = L.divIcon({
  className: '',
  html: '<span class="flex h-3 w-3 rounded-full border border-white/70 bg-teal-400"></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

const vesselIcon = L.divIcon({
  className: '',
  html: '<span class="flex h-3 w-3 rounded-full border border-white/70 bg-white"></span>',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
})

const demoVesselIcon = L.divIcon({
  className: '',
  html: '<span class="flex h-5 w-5 items-center justify-center rounded-full border border-cyan-200/90 bg-cyan-400/90 text-[11px] leading-none">🚢</span>',
  iconSize: [20, 20],
  iconAnchor: [10, 10],
})

function FitMapToPoints({ points }: { points: [number, number][] }) {
  const map = useMap()

  useEffect(() => {
    if (points.length === 0) {
      map.setView([20, 0], 2)
      return
    }

    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 6 })
  }, [map, points])

  return null
}

function RouteLayers({ routes }: { routes: RouteLine[] }) {
  const map = useMap()

  useEffect(() => {
    const layers: L.Layer[] = []
    const antPathFactory = (L.polyline as unknown as {
      antPath?: (
        latlngs: L.LatLngExpression[],
        options?: L.PolylineOptions & {
          delay?: number
          dashArray?: string | number[]
          pulseColor?: string
        }
      ) => L.Layer
    }).antPath

    const geodesicFactory = (L as unknown as {
      geodesic?: (latlngs: L.LatLngExpression[], options?: L.PolylineOptions) => L.Layer
    }).geodesic

    for (const route of routes) {
      const latLngs: L.LatLngExpression[] = [route.origin, route.destination]

      if (route.active && antPathFactory) {
        const routeLayer = antPathFactory(latLngs, {
          color: '#38bdf8',
          weight: 2,
          opacity: 0.9,
          delay: 850,
          dashArray: [10, 18],
          pulseColor: '#ffffff',
        })

        routeLayer.addTo(map)
        layers.push(routeLayer)
        continue
      }

      if (geodesicFactory) {
        const routeLayer = geodesicFactory(latLngs, {
          color: '#60a5fa',
          weight: 1.6,
          opacity: 0.65,
          dashArray: '5 10',
        })

        routeLayer.addTo(map)
        layers.push(routeLayer)
        continue
      }

      const fallbackRoute = L.polyline(latLngs, {
        color: '#60a5fa',
        weight: 1.6,
        opacity: 0.65,
        dashArray: '5 10',
      })

      fallbackRoute.addTo(map)
      layers.push(fallbackRoute)
    }

    return () => {
      for (const layer of layers) {
        map.removeLayer(layer)
      }
    }
  }, [map, routes])

  return null
}

export function CargoMap({ shipments }: CargoMapProps) {
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoLegIndex, setDemoLegIndex] = useState(0)
  const [demoProgress, setDemoProgress] = useState(0)

  const points = useMemo(() => {
    const coordinates: [number, number][] = []

    for (const shipment of shipments) {
      const origin = normalizeJoin(shipment.origin)
      const destination = normalizeJoin(shipment.destination)

      if (origin?.latitude != null && origin?.longitude != null) {
        coordinates.push([Number(origin.latitude), Number(origin.longitude)])
      }

      if (destination?.latitude != null && destination?.longitude != null) {
        coordinates.push([Number(destination.latitude), Number(destination.longitude)])
      }

      if (shipment.current_lat != null && shipment.current_lon != null) {
        coordinates.push([Number(shipment.current_lat), Number(shipment.current_lon)])
      }
    }

    return coordinates
  }, [shipments])

  const routes = useMemo<RouteLine[]>(() => {
    const nextRoutes: RouteLine[] = []

    for (const shipment of shipments) {
      const origin = normalizeJoin(shipment.origin)
      const destination = normalizeJoin(shipment.destination)

      if (
        origin?.latitude == null ||
        origin?.longitude == null ||
        destination?.latitude == null ||
        destination?.longitude == null
      ) {
        continue
      }

      nextRoutes.push({
        id: shipment.id,
        origin: [Number(origin.latitude), Number(origin.longitude)],
        destination: [Number(destination.latitude), Number(destination.longitude)],
        active: shipment.status === 'departed' || shipment.status === 'in_transit',
      })
    }

    return nextRoutes
  }, [shipments])

  const demoRoutes = useMemo(() => {
    return routes.length > 0 ? routes : FALLBACK_DEMO_ROUTES
  }, [routes])

  const mapPoints = useMemo<[number, number][]>(() => {
    if (points.length > 0) {
      return points
    }

    const demoPoints: [number, number][] = []
    for (const route of FALLBACK_DEMO_ROUTES) {
      demoPoints.push(route.origin)
      demoPoints.push(route.destination)
    }
    return demoPoints
  }, [points])

  useEffect(() => {
    if (!demoRunning || demoRoutes.length === 0) {
      return
    }

    const timer = window.setInterval(() => {
      setDemoProgress((current) => {
        const next = current + 0.02

        if (next < 1) {
          return next
        }

        setDemoLegIndex((currentIndex) => (currentIndex + 1) % demoRoutes.length)
        return 0
      })
    }, 120)

    return () => {
      window.clearInterval(timer)
    }
  }, [demoRunning, demoRoutes.length])

  useEffect(() => {
    if (demoRoutes.length === 0) {
      setDemoRunning(false)
      setDemoLegIndex(0)
      setDemoProgress(0)
      return
    }

    if (demoLegIndex >= demoRoutes.length) {
      setDemoLegIndex(0)
      setDemoProgress(0)
    }
  }, [demoLegIndex, demoRoutes.length])

  const activeDemoRoute = demoRoutes.length > 0 ? demoRoutes[demoLegIndex % demoRoutes.length] : null
  const activeDemoPath = activeDemoRoute ? getRoutePath(activeDemoRoute) : []

  const demoPosition = useMemo<[number, number] | null>(() => {
    if (!activeDemoRoute) {
      return null
    }

    return getProgressPointOnPath(activeDemoPath, demoProgress)
  }, [activeDemoPath, activeDemoRoute, demoProgress])

  const traveledDemoPath = useMemo(() => {
    if (!activeDemoRoute) {
      return [] as [number, number][]
    }

    return getTraveledPath(activeDemoPath, demoProgress)
  }, [activeDemoPath, activeDemoRoute, demoProgress])

  const toggleDemo = () => {
    if (demoRoutes.length === 0) {
      return
    }

    setDemoRunning((current) => {
      if (!current) {
        setDemoLegIndex(0)
        setDemoProgress(0)
      }

      return !current
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={toggleDemo}
          className="rounded border border-cyan-500/60 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-200 hover:bg-cyan-500/20"
        >
          {demoRunning ? 'Stop Demo Voyage' : 'Start Demo Voyage'}
        </button>
      </div>

      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom
        className="rounded-md border border-slate-800"
        style={{ height: '400px' }}
        worldCopyJump
      >
        <TileLayer
          attribution="&copy; OpenStreetMap contributors &copy; CARTO"
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />

        <FitMapToPoints points={mapPoints} />
        <RouteLayers routes={routes} />

        {demoRunning && activeDemoRoute && demoPosition ? (
          <>
            <Polyline
              positions={traveledDemoPath}
              pathOptions={{ color: '#22d3ee', weight: 3, opacity: 0.95 }}
            />
            <Marker position={demoPosition} icon={demoVesselIcon}>
              <Tooltip>
                Demo vessel · Leg {demoLegIndex + 1}/{demoRoutes.length}
              </Tooltip>
            </Marker>
          </>
        ) : null}

        {shipments.map((shipment) => {
          const origin = normalizeJoin(shipment.origin)
          const destination = normalizeJoin(shipment.destination)

          const originLat = origin?.latitude != null ? Number(origin.latitude) : null
          const originLon = origin?.longitude != null ? Number(origin.longitude) : null
          const destinationLat = destination?.latitude != null ? Number(destination.latitude) : null
          const destinationLon = destination?.longitude != null ? Number(destination.longitude) : null

          return (
            <Fragment key={shipment.id}>
              {originLat != null && originLon != null ? (
                <Marker key={`${shipment.id}-origin`} position={[originLat, originLon]} icon={originIcon}>
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

              {shipment.current_lat != null && shipment.current_lon != null ? (
                <Marker
                  key={`${shipment.id}-vessel`}
                  position={[Number(shipment.current_lat), Number(shipment.current_lon)]}
                  icon={vesselIcon}
                >
                  <Tooltip>Vessel · {shipment.id}</Tooltip>
                </Marker>
              ) : null}
            </Fragment>
          )
        })}
      </MapContainer>
    </div>
  )
}
