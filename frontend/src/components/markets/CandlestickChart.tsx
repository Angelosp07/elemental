import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CandlestickSeries,
  type CandlestickData,
  type Coordinate,
  ColorType,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  LineSeries,
  type LineData,
  type MouseEventParams,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'

type CandlestickChartProps = {
  candles: CandlestickData[]
  symbol: string
  height?: number
  autoResetOnMount?: boolean
  markers?: ChartMarker[]
}

export type ChartMarker = {
  id: string
  time: UTCTimestamp
  price: number
  side: 'buy' | 'sell'
  kind: 'order' | 'fill'
  label?: string
}

type DrawingMode = 'none' | 'hline' | 'trend'

type TrendPoint = {
  time: UTCTimestamp
  price: number
}

type TrendLine = {
  id: string
  start: TrendPoint
  end: TrendPoint
}

type OhlcSnapshot = {
  open: number
  high: number
  low: number
  close: number
}

type ProjectedTrendLine = {
  id: string
  x1: Coordinate
  y1: Coordinate
  x2: Coordinate
  y2: Coordinate
}

type ProjectedMarker = {
  id: string
  x: Coordinate
  y: Coordinate
  side: 'buy' | 'sell'
  kind: 'order' | 'fill'
  label?: string
}

export function CandlestickChart({
  candles,
  symbol,
  height = 520,
  autoResetOnMount = true,
  markers = [],
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const maFastSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const maSlowSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const hasAutoFittedRef = useRef(false)

  const [drawingMode, setDrawingMode] = useState<DrawingMode>('none')
  const [horizontalLevels, setHorizontalLevels] = useState<number[]>([])
  const [trendLines, setTrendLines] = useState<TrendLine[]>([])
  const [trendDraft, setTrendDraft] = useState<TrendPoint | null>(null)
  const [chartSize, setChartSize] = useState({ width: 0, height })
  const [hoverOhlc, setHoverOhlc] = useState<OhlcSnapshot | null>(null)
  const [showMaFast, setShowMaFast] = useState(true)
  const [showMaSlow, setShowMaSlow] = useState(true)
  const [projectionRevision, setProjectionRevision] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const drawingModeRef = useRef<DrawingMode>('none')
  const trendDraftRef = useRef<TrendPoint | null>(null)

  useEffect(() => {
    drawingModeRef.current = drawingMode
  }, [drawingMode])

  useEffect(() => {
    trendDraftRef.current = trendDraft
  }, [trendDraft])

  const onChartClickRef = useRef<(param: MouseEventParams<Time>) => void>(() => undefined)

  onChartClickRef.current = (param: MouseEventParams<Time>) => {
    const mode = drawingModeRef.current
    const chart = chartRef.current
    const series = seriesRef.current

    if (mode === 'none' || !chart || !series || !param.point) {
      return
    }

    const price = series.coordinateToPrice(param.point.y)

    if (!Number.isFinite(price)) {
      return
    }

    if (mode === 'hline') {
      setHorizontalLevels((current) => [...current, Number(price)])
      return
    }

    const timeFromPoint = chart.timeScale().coordinateToTime(param.point.x)
    const normalizedTime =
      typeof param.time === 'number'
        ? (param.time as UTCTimestamp)
        : typeof timeFromPoint === 'number'
          ? (timeFromPoint as UTCTimestamp)
          : null

    if (!normalizedTime) {
      return
    }

    const start = trendDraftRef.current

    if (!start) {
      const nextPoint = {
        time: normalizedTime,
        price: Number(price),
      }
      setTrendDraft(nextPoint)
      trendDraftRef.current = nextPoint
      return
    }

    setTrendLines((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random()}`,
        start,
        end: {
          time: normalizedTime,
          price: Number(price),
        },
      },
    ])
    setTrendDraft(null)
    trendDraftRef.current = null
  }

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#020617' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      rightPriceScale: {
        borderColor: '#334155',
      },
      timeScale: {
        borderColor: '#334155',
        timeVisible: true,
        barSpacing: 10,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        vertTouchDrag: true,
        horzTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      width: containerRef.current.clientWidth,
      height,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      borderUpColor: '#22c55e',
      wickUpColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      wickDownColor: '#ef4444',
    })

    const maFastSeries = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    const maSlowSeries = chart.addSeries(LineSeries, {
      color: '#38bdf8',
      lineWidth: 2,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    })

    chartRef.current = chart
    seriesRef.current = series
    maFastSeriesRef.current = maFastSeries
    maSlowSeriesRef.current = maSlowSeries

    const onClick = (param: MouseEventParams<Time>) => {
      onChartClickRef.current(param)
    }

    const onCrosshairMove = (param: MouseEventParams<Time>) => {
      if (!seriesRef.current || !param.point) {
        setHoverOhlc(null)
        return
      }

      const value = param.seriesData.get(seriesRef.current)

      if (
        value &&
        typeof value === 'object' &&
        'open' in value &&
        'high' in value &&
        'low' in value &&
        'close' in value
      ) {
        setHoverOhlc({
          open: Number(value.open),
          high: Number(value.high),
          low: Number(value.low),
          close: Number(value.close),
        })
        return
      }

      setHoverOhlc(null)
    }

    const onVisibleRangeChange = () => {
      setProjectionRevision((current) => current + 1)
    }

    chart.subscribeClick(onClick)
    chart.subscribeCrosshairMove(onCrosshairMove)
    chart.timeScale().subscribeVisibleLogicalRangeChange(onVisibleRangeChange)

    const resizeObserver = new ResizeObserver((entries) => {
      const [entry] = entries
      if (!entry || !chartRef.current) {
        return
      }

      chartRef.current.applyOptions({ width: entry.contentRect.width, height })
      setChartSize({ width: entry.contentRect.width, height })
    })

    resizeObserver.observe(containerRef.current)
    setChartSize({ width: containerRef.current.clientWidth, height })

    return () => {
      chart.unsubscribeClick(onClick)
      chart.unsubscribeCrosshairMove(onCrosshairMove)
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onVisibleRangeChange)
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      maFastSeriesRef.current = null
      maSlowSeriesRef.current = null
    }
  }, [height])

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) {
      return
    }

    seriesRef.current.setData(candles)

    if (autoResetOnMount && !hasAutoFittedRef.current) {
      chartRef.current.timeScale().fitContent()
      hasAutoFittedRef.current = true
    }
  }, [autoResetOnMount, candles])

  const ma20Data = useMemo(() => {
    const output: LineData[] = []
    const period = 20

    for (let index = period - 1; index < candles.length; index += 1) {
      let sum = 0

      for (let offset = index - period + 1; offset <= index; offset += 1) {
        sum += candles[offset].close
      }

      output.push({
        time: candles[index].time,
        value: Number((sum / period).toFixed(4)),
      })
    }

    return output
  }, [candles])

  const ma50Data = useMemo(() => {
    const output: LineData[] = []
    const period = 50

    for (let index = period - 1; index < candles.length; index += 1) {
      let sum = 0

      for (let offset = index - period + 1; offset <= index; offset += 1) {
        sum += candles[offset].close
      }

      output.push({
        time: candles[index].time,
        value: Number((sum / period).toFixed(4)),
      })
    }

    return output
  }, [candles])

  useEffect(() => {
    if (!maFastSeriesRef.current) {
      return
    }

    maFastSeriesRef.current.setData(showMaFast ? ma20Data : [])
  }, [ma20Data, showMaFast])

  useEffect(() => {
    if (!maSlowSeriesRef.current) {
      return
    }

    maSlowSeriesRef.current.setData(showMaSlow ? ma50Data : [])
  }, [ma50Data, showMaSlow])

  useEffect(() => {
    const series = seriesRef.current

    if (!series) {
      return
    }

    for (const line of priceLinesRef.current) {
      series.removePriceLine(line)
    }

    priceLinesRef.current = horizontalLevels.map((price, index) =>
      series.createPriceLine({
        price,
        color: '#f59e0b',
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `H${index + 1}`,
      })
    )
  }, [horizontalLevels])

  const projectedTrendLines = useMemo(() => {
    const chart = chartRef.current
    const series = seriesRef.current

    if (!chart || !series) {
      return [] as ProjectedTrendLine[]
    }

    const projected: ProjectedTrendLine[] = []

    for (const line of trendLines) {
      const x1 = chart.timeScale().timeToCoordinate(line.start.time)
      const y1 = series.priceToCoordinate(line.start.price)
      const x2 = chart.timeScale().timeToCoordinate(line.end.time)
      const y2 = series.priceToCoordinate(line.end.price)

      if (x1 === null || y1 === null || x2 === null || y2 === null) {
        continue
      }

      projected.push({
        id: line.id,
        x1,
        y1,
        x2,
        y2,
      })
    }

    return projected
  }, [candles, chartSize, trendLines, projectionRevision])

  const projectedMarkers = useMemo(() => {
    const chart = chartRef.current
    const series = seriesRef.current

    if (!chart || !series) {
      return [] as ProjectedMarker[]
    }

    const projected: ProjectedMarker[] = []

    for (const marker of markers) {
      const x = chart.timeScale().timeToCoordinate(marker.time)
      const y = series.priceToCoordinate(marker.price)

      if (x === null || y === null) {
        continue
      }

      projected.push({
        id: marker.id,
        x,
        y,
        side: marker.side,
        kind: marker.kind,
        label: marker.label,
      })
    }

    return projected
  }, [markers, candles, chartSize, projectionRevision])

  const clearDrawings = () => {
    setHorizontalLevels([])
    setTrendLines([])
    setTrendDraft(null)
    trendDraftRef.current = null
  }

  const undoLastDrawing = () => {
    if (trendLines.length > 0) {
      setTrendLines((current) => current.slice(0, -1))
      return
    }

    if (horizontalLevels.length > 0) {
      setHorizontalLevels((current) => current.slice(0, -1))
    }
  }

  const toggleFullscreen = async () => {
    if (!hostRef.current) {
      return
    }

    if (!document.fullscreenElement) {
      await hostRef.current.requestFullscreen()
      setIsFullscreen(true)
      return
    }

    await document.exitFullscreen()
    setIsFullscreen(false)
  }

  const exportSnapshot = () => {
    const chart = chartRef.current

    if (!chart) {
      return
    }

    const canvas = chart.takeScreenshot()
    const url = canvas.toDataURL('image/png')
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${symbol.toLowerCase()}-chart.png`
    anchor.click()
  }

  const latest = candles[candles.length - 1] ?? null
  const ohlc = hoverOhlc ??
    (latest
      ? {
          open: latest.open,
          high: latest.high,
          low: latest.low,
          close: latest.close,
        }
      : null)

  return (
    <div ref={hostRef} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-400">{symbol} candlestick chart</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              chartRef.current?.timeScale().fitContent()
              hasAutoFittedRef.current = true
            }}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Reset View
          </button>
          <button
            type="button"
            onClick={() => setShowMaFast((current) => !current)}
            className={`rounded border px-2 py-1 text-xs transition ${
              showMaFast
                ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            MA20
          </button>
          <button
            type="button"
            onClick={() => setShowMaSlow((current) => !current)}
            className={`rounded border px-2 py-1 text-xs transition ${
              showMaSlow
                ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                : 'border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            MA50
          </button>
          <button
            type="button"
            onClick={() => setDrawingMode((current) => (current === 'hline' ? 'none' : 'hline'))}
            className={`rounded border px-2 py-1 text-xs transition ${
              drawingMode === 'hline'
                ? 'border-amber-400 bg-amber-500/20 text-amber-200'
                : 'border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            Draw H-Line
          </button>
          <button
            type="button"
            onClick={() => {
              setTrendDraft(null)
              trendDraftRef.current = null
              setDrawingMode((current) => (current === 'trend' ? 'none' : 'trend'))
            }}
            className={`rounded border px-2 py-1 text-xs transition ${
              drawingMode === 'trend'
                ? 'border-blue-400 bg-blue-500/20 text-blue-200'
                : 'border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            Draw Trend
          </button>
          <button
            type="button"
            onClick={undoLastDrawing}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={clearDrawings}
            className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
          >
            Clear Drawings
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          </button>
          <button
            type="button"
            onClick={exportSnapshot}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
          >
            Snapshot
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span>
          O: {ohlc ? ohlc.open.toFixed(2) : '—'}
        </span>
        <span>
          H: {ohlc ? ohlc.high.toFixed(2) : '—'}
        </span>
        <span>
          L: {ohlc ? ohlc.low.toFixed(2) : '—'}
        </span>
        <span>
          C: {ohlc ? ohlc.close.toFixed(2) : '—'}
        </span>
      </div>

      <p className="text-[11px] text-slate-500">
        Scroll/pinch to zoom naturally. In draw modes, click the chart to place drawings.
      </p>

      <div
        className="relative w-full overflow-hidden rounded-md border border-slate-800"
        style={{ height: `${height}px` }}
      >
        <div ref={containerRef} className="h-full w-full" />
        <svg className="pointer-events-none absolute inset-0 h-full w-full">
          {projectedTrendLines.map((line) => (
            <line
              key={line.id}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              stroke="#38bdf8"
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}

          {projectedMarkers.map((marker) => {
            const color = marker.side === 'buy' ? '#22c55e' : '#ef4444'
            const yOffset = marker.kind === 'order' ? -16 : 16
            const y = marker.y + yOffset

            return (
              <g key={marker.id}>
                <circle cx={marker.x} cy={y} r="4" fill={color} />
                {marker.label ? (
                  <text
                    x={marker.x + 6}
                    y={y + 3}
                    fill={color}
                    fontSize="10"
                    fontWeight="600"
                  >
                    {marker.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span>Draw mode: {drawingMode}</span>
        <span>Horizontal lines: {horizontalLevels.length}</span>
        <span>Trend lines: {trendLines.length}</span>
        {trendDraft ? <span>Trend start selected</span> : null}
      </div>
    </div>
  )
}
