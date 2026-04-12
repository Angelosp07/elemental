import { useEffect, useMemo, useRef, useState } from 'react'
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'
import { Link, useParams } from 'react-router-dom'
import { CandlestickChart, type ChartMarker } from '../components/markets/CandlestickChart'
import { useAuth } from '../contexts/AuthContext'
import { backendApi } from '../lib/backendApi'
import { formatLondonDateTime } from '../lib/datetime'
import {
  type CandleInterval,
  upsertCandleWithTick,
} from '../lib/charts/candles'
import { supabase } from '../lib/supabase'

type Asset = {
  id: string
  symbol: string
  name: string
}

type CandleApiRow = {
  time: number
  open: number
  high: number
  low: number
  close: number
}

type TradeAsset = {
  id: string
  symbol: string
  name: string
}

type OrderRow = {
  id: string
  side: 'buy' | 'sell'
  order_type: 'market' | 'limit'
  price: number
  quantity: number
  status: string
  created_at: string
  asset: TradeAsset | TradeAsset[]
}

type FillRow = {
  id: string
  side: 'buy' | 'sell'
  quantity: number
  execution_price: number
  fee: number
  created_at: string
  asset: TradeAsset | TradeAsset[]
}

type ChartRange = '2h' | '12h' | '24h' | '72h'

const chartRangeHours: Record<ChartRange, number> = {
  '2h': 2,
  '12h': 12,
  '24h': 24,
  '72h': 72,
}

function intervalToSeconds(interval: CandleInterval): number {
  if (interval === '1m') {
    return 60
  }

  if (interval === '5m') {
    return 300
  }

  if (interval === '15m') {
    return 900
  }

  return 3600
}

function toBucketTime(timestamp: string, interval: CandleInterval): UTCTimestamp {
  const unix = Math.floor(new Date(timestamp).getTime() / 1000)
  const bucket = Math.floor(unix / intervalToSeconds(interval)) * intervalToSeconds(interval)
  return bucket as UTCTimestamp
}

export function MetalDetail() {
  const { user } = useAuth()
  const { assetId } = useParams()

  const [asset, setAsset] = useState<Asset | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [candleInterval, setCandleInterval] = useState<CandleInterval>('5m')
  const [chartRange, setChartRange] = useState<ChartRange>('12h')
  const [candles, setCandles] = useState<CandlestickData[]>([])
  const [chartLoading, setChartLoading] = useState(true)
  const [chartError, setChartError] = useState<string | null>(null)

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [tradeError, setTradeError] = useState<string | null>(null)
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null)

  const [orders, setOrders] = useState<OrderRow[]>([])
  const [fills, setFills] = useState<FillRow[]>([])
  const [activityLoading, setActivityLoading] = useState(false)

  const candleIntervalRef = useRef<CandleInterval>('5m')

  useEffect(() => {
    candleIntervalRef.current = candleInterval
  }, [candleInterval])

  useEffect(() => {
    if (!assetId) {
      return
    }

    let active = true

    const loadAsset = async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('id, symbol, name')
        .eq('id', assetId)
        .maybeSingle()

      if (!active) {
        return
      }

      if (error || !data) {
        setChartError(error?.message ?? 'Asset not found')
        return
      }

      setAsset(data)
    }

    void loadAsset()

    return () => {
      active = false
    }
  }, [assetId])

  useEffect(() => {
    if (!assetId || !user) {
      return
    }

    let active = true

    const normalizeAssetId = (value: TradeAsset | TradeAsset[] | null | undefined): string | null => {
      if (!value) {
        return null
      }

      const row = Array.isArray(value) ? value[0] : value
      return row?.id ?? null
    }

    const loadActivity = async (silent = false) => {
      if (!silent) {
        setActivityLoading(true)
      }

      const [ordersData, fillsData] = await Promise.all([
        backendApi.get<OrderRow[]>(`/api/trade/orders?userId=${encodeURIComponent(user.id)}`),
        backendApi.get<FillRow[]>(`/api/trade/fills?userId=${encodeURIComponent(user.id)}`),
      ])

      if (!active) {
        return
      }

      const filteredOrders = (ordersData ?? []).filter(
        (row) => normalizeAssetId(row.asset) === assetId
      )
      const filteredFills = (fillsData ?? []).filter(
        (row) => normalizeAssetId(row.asset) === assetId
      )

      setOrders(filteredOrders)
      setFills(filteredFills)

      if (!silent) {
        setActivityLoading(false)
      }
    }

    void loadActivity().catch(() => {
      if (active) {
        setActivityLoading(false)
      }
    })

    const intervalId = window.setInterval(() => {
      void loadActivity(true)
    }, 7000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [assetId, user])

  useEffect(() => {
    if (!assetId) {
      return
    }

    let active = true

    const loadCandles = async () => {
      setChartLoading(true)
      setChartError(null)

      const data = await backendApi.get<CandleApiRow[]>(
        `/api/trade/candles?assetId=${encodeURIComponent(assetId)}&interval=${encodeURIComponent(
          candleInterval
        )}&rangeHours=${chartRangeHours[chartRange]}`
      )

      if (!active) {
        return
      }

      const nextCandles: CandlestickData[] = (data ?? []).flatMap((row) => {
          const time = Number(row.time)
          const open = Number(row.open)
          const high = Number(row.high)
          const low = Number(row.low)
          const close = Number(row.close)

          if (
            !Number.isFinite(time) ||
            !Number.isFinite(open) ||
            !Number.isFinite(high) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close)
          ) {
            return []
          }

          return [
            {
              time: time as UTCTimestamp,
              open,
              high,
              low,
              close,
            },
          ]
        })

      setCandles(nextCandles)
      setCurrentPrice(nextCandles[nextCandles.length - 1]?.close ?? null)
      setChartLoading(false)
    }

    void loadCandles().catch((caughtError) => {
      if (!active) {
        return
      }

      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to load candles'
      setChartError(message)
      setChartLoading(false)
    })

    return () => {
      active = false
    }
  }, [assetId, candleInterval, chartRange])

  useEffect(() => {
    if (!assetId) {
      return
    }

    const channel = supabase
      .channel(`price_history_asset_${assetId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_history' },
        (payload) => {
          const inserted = payload.new as {
            asset_id?: string
            price?: string | number
            created_at?: string
          }

          if (inserted.asset_id !== assetId) {
            return
          }

          const tickPrice = Number(inserted.price)
          const createdAt = String(inserted.created_at ?? '')

          if (!Number.isFinite(tickPrice) || !createdAt) {
            return
          }

          setCurrentPrice(tickPrice)
          setCandles((current) =>
            upsertCandleWithTick(
              current,
              {
                createdAt,
                price: tickPrice,
              },
              candleIntervalRef.current
            )
          )
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [assetId])

  const canSubmit = useMemo(() => {
    const quantityNumber = Number(quantity)
    const priceNumber = Number(price)

    if (!user || !assetId || !Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      return false
    }

    if (orderType === 'limit' && (!Number.isFinite(priceNumber) || priceNumber <= 0)) {
      return false
    }

    return true
  }, [assetId, orderType, price, quantity, user])

  const effectivePrice = useMemo(() => {
    if (orderType === 'limit') {
      const limitPrice = Number(price)
      return Number.isFinite(limitPrice) && limitPrice > 0 ? limitPrice : null
    }

    return typeof currentPrice === 'number' ? currentPrice : null
  }, [currentPrice, orderType, price])

  const estimatedNotional = useMemo(() => {
    const quantityNumber = Number(quantity)

    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0 || !effectivePrice) {
      return null
    }

    return quantityNumber * effectivePrice
  }, [effectivePrice, quantity])

  const sessionStats = useMemo(() => {
    const last = candles[candles.length - 1]
    const first = candles[0]

    if (!last || !first) {
      return {
        high: null,
        low: null,
        change: null,
        changePct: null,
      }
    }

    const high = candles.reduce((best, candle) => Math.max(best, candle.high), Number.NEGATIVE_INFINITY)
    const low = candles.reduce((best, candle) => Math.min(best, candle.low), Number.POSITIVE_INFINITY)
    const change = last.close - first.open
    const changePct = first.open > 0 ? (change / first.open) * 100 : 0

    return {
      high,
      low,
      change,
      changePct,
    }
  }, [candles])

  const chartMarkers = useMemo(() => {
    const orderMarkers: ChartMarker[] = orders.slice(0, 20).map((order) => ({
      id: `order-${order.id}`,
      time: toBucketTime(order.created_at, candleInterval),
      price: Number(order.price),
      side: order.side,
      kind: 'order',
      label: `${order.side === 'buy' ? 'B' : 'S'} O`,
    }))

    const fillMarkers: ChartMarker[] = fills.slice(0, 30).map((fill) => ({
      id: `fill-${fill.id}`,
      time: toBucketTime(fill.created_at, candleInterval),
      price: Number(fill.execution_price),
      side: fill.side,
      kind: 'fill',
      label: `${fill.side === 'buy' ? 'B' : 'S'} F`,
    }))

    return [...orderMarkers, ...fillMarkers]
  }, [candleInterval, fills, orders])

  const orderSummary = useMemo(() => {
    const total = orders.length
    const open = orders.filter((order) => order.status === 'open' || order.status === 'pending').length
    const filled = orders.filter((order) => order.status === 'filled').length
    const cancelled = orders.filter((order) => order.status === 'cancelled').length

    return { total, open, filled, cancelled }
  }, [orders])

  const fillSummary = useMemo(() => {
    const count = fills.length
    const grossQty = fills.reduce((total, fill) => total + Number(fill.quantity), 0)
    const weightedNotional = fills.reduce(
      (total, fill) => total + Number(fill.quantity) * Number(fill.execution_price),
      0
    )
    const totalFees = fills.reduce((total, fill) => total + Number(fill.fee), 0)
    const avgExecution = grossQty > 0 ? weightedNotional / grossQty : 0

    return {
      count,
      grossQty,
      avgExecution,
      totalFees,
    }
  }, [fills])

  const getStatusClasses = (status: string): string => {
    if (status === 'filled') {
      return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
    }

    if (status === 'open' || status === 'pending') {
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300'
    }

    if (status === 'cancelled') {
      return 'border-slate-500/40 bg-slate-500/10 text-slate-300'
    }

    return 'border-slate-500/40 bg-slate-500/10 text-slate-300'
  }

  const submitOrder = async () => {
    if (!user || !assetId) {
      return
    }

    setSubmitting(true)
    setTradeError(null)
    setTradeSuccess(null)

    try {
      await backendApi.post('/api/trade/orders', {
        userId: user.id,
        assetId,
        side,
        orderType,
        quantity: Number(quantity),
        price: orderType === 'limit' ? Number(price) : undefined,
      })

      setTradeSuccess(`${side.toUpperCase()} order submitted successfully.`)
      setQuantity('')
      setPrice('')

      const [ordersData, fillsData] = await Promise.all([
        backendApi.get<OrderRow[]>(`/api/trade/orders?userId=${encodeURIComponent(user.id)}`),
        backendApi.get<FillRow[]>(`/api/trade/fills?userId=${encodeURIComponent(user.id)}`),
      ])

      const normalizeAssetId = (value: TradeAsset | TradeAsset[] | null | undefined): string | null => {
        if (!value) {
          return null
        }

        const row = Array.isArray(value) ? value[0] : value
        return row?.id ?? null
      }

      setOrders((ordersData ?? []).filter((row) => normalizeAssetId(row.asset) === assetId))
      setFills((fillsData ?? []).filter((row) => normalizeAssetId(row.asset) === assetId))
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to submit order'
      setTradeError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!assetId) {
    return <p className="text-rose-400">Missing metal identifier.</p>
  }

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Metal Market</p>
            <h2 className="text-lg font-semibold text-slate-100">
              {asset ? `${asset.symbol} · ${asset.name}` : 'Loading metal…'}
            </h2>
          </div>
          <Link
            to="/markets"
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
          >
            Back to Markets
          </Link>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Last Price</p>
            <p className="font-mono text-sm text-slate-100">
              {typeof currentPrice === 'number' ? currentPrice.toFixed(2) : '—'}
            </p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Range High</p>
            <p className="font-mono text-sm text-slate-100">
              {typeof sessionStats.high === 'number' ? sessionStats.high.toFixed(2) : '—'}
            </p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Range Low</p>
            <p className="font-mono text-sm text-slate-100">
              {typeof sessionStats.low === 'number' ? sessionStats.low.toFixed(2) : '—'}
            </p>
          </div>
          <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Range Change</p>
            <p
              className={`font-mono text-sm ${
                typeof sessionStats.change === 'number' && sessionStats.change >= 0
                  ? 'text-emerald-300'
                  : 'text-rose-300'
              }`}
            >
              {typeof sessionStats.change === 'number' && typeof sessionStats.changePct === 'number'
                ? `${sessionStats.change >= 0 ? '+' : ''}${sessionStats.change.toFixed(2)} (${sessionStats.changePct.toFixed(2)}%)`
                : '—'}
            </p>
          </div>
        </div>
      </article>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-300">Candlestick Chart</h3>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={candleInterval}
                onChange={(event) => setCandleInterval(event.target.value as CandleInterval)}
                className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
              >
                <option value="1m">1m</option>
                <option value="5m">5m</option>
                <option value="15m">15m</option>
                <option value="1h">1h</option>
              </select>

              <select
                value={chartRange}
                onChange={(event) => setChartRange(event.target.value as ChartRange)}
                className="rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs"
              >
                <option value="2h">2h</option>
                <option value="12h">12h</option>
                <option value="24h">24h</option>
                <option value="72h">72h</option>
              </select>
            </div>
          </div>

          {chartLoading ? <p className="text-sm text-slate-400">Loading chart…</p> : null}
          {chartError ? <p className="text-sm text-rose-400">{chartError}</p> : null}

          {!chartLoading && !chartError && asset ? (
            <CandlestickChart
              key={asset.id}
              candles={candles}
              symbol={asset.symbol}
              height={600}
              autoResetOnMount
              markers={chartMarkers}
            />
          ) : null}
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="text-sm font-semibold text-slate-300">Buy / Sell Mineral</h3>
          <p className="mt-1 text-xs text-slate-400">Place market or limit orders for this metal</p>

          <div className="mt-4 space-y-3">
            <select
              value={side}
              onChange={(event) => setSide(event.target.value as 'buy' | 'sell')}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>

            <select
              value={orderType}
              onChange={(event) => setOrderType(event.target.value as 'market' | 'limit')}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>

            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Quantity"
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            />

            <div className="flex flex-wrap gap-2">
              {[1, 5, 10, 25].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setQuantity(String(value))}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                >
                  {value}
                </button>
              ))}
            </div>

            <input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder={orderType === 'limit' ? 'Limit price' : 'Optional price'}
              disabled={orderType !== 'limit'}
              className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm disabled:opacity-50"
            />

            <button
              type="button"
              disabled={!canSubmit || submitting}
              onClick={submitOrder}
              className="w-full rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : `${side === 'buy' ? 'Buy' : 'Sell'} ${asset?.symbol ?? ''}`}
            </button>

            <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-300">
              <p>
                Est. Price: <span className="font-mono">{typeof effectivePrice === 'number' ? effectivePrice.toFixed(2) : '—'}</span>
              </p>
              <p>
                Est. Notional: <span className="font-mono">{typeof estimatedNotional === 'number' ? estimatedNotional.toFixed(2) : '—'}</span>
              </p>
            </div>

            {tradeError ? <p className="text-sm text-rose-300">{tradeError}</p> : null}
            {tradeSuccess ? <p className="text-sm text-emerald-300">{tradeSuccess}</p> : null}
          </div>
        </article>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">Recent Orders ({asset?.symbol ?? 'Asset'})</h3>
            {activityLoading ? <span className="text-xs text-slate-500">Refreshing…</span> : null}
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Total</p>
              <p className="text-sm font-semibold text-slate-100">{orderSummary.total}</p>
            </div>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-amber-300">Open</p>
              <p className="text-sm font-semibold text-amber-200">{orderSummary.open}</p>
            </div>
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-emerald-300">Filled</p>
              <p className="text-sm font-semibold text-emerald-200">{orderSummary.filled}</p>
            </div>
            <div className="rounded-md border border-slate-500/30 bg-slate-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-300">Cancelled</p>
              <p className="text-sm font-semibold text-slate-200">{orderSummary.cancelled}</p>
            </div>
          </div>

          <div className="max-h-72 overflow-auto rounded-md border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950/95 uppercase tracking-wide text-slate-400 backdrop-blur">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Price</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-3 text-center text-slate-500">
                      No orders yet for this asset.
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 12).map((order) => (
                    <tr key={order.id} className="hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-400">{formatLondonDateTime(order.created_at)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${
                            order.side === 'buy'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                          }`}
                        >
                          {order.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-300 uppercase">{order.order_type}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{Number(order.quantity).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{Number(order.price).toFixed(2)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 ${getStatusClasses(order.status)}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Recent Fills ({asset?.symbol ?? 'Asset'})</h3>

          <div className="mb-3 grid gap-2 sm:grid-cols-4">
            <div className="rounded-md border border-slate-800 bg-slate-950/50 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Trades</p>
              <p className="text-sm font-semibold text-slate-100">{fillSummary.count}</p>
            </div>
            <div className="rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-cyan-300">Gross Qty</p>
              <p className="font-mono text-sm font-semibold text-cyan-200">{fillSummary.grossQty.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-indigo-300">Avg Exec</p>
              <p className="font-mono text-sm font-semibold text-indigo-200">{fillSummary.avgExecution.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-rose-300">Fees</p>
              <p className="font-mono text-sm font-semibold text-rose-200">{fillSummary.totalFees.toFixed(2)}</p>
            </div>
          </div>

          <div className="max-h-72 overflow-auto rounded-md border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-950/95 uppercase tracking-wide text-slate-400 backdrop-blur">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Side</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Execution</th>
                  <th className="px-3 py-2 text-right">Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {fills.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-3 text-center text-slate-500">
                      No fills yet for this asset.
                    </td>
                  </tr>
                ) : (
                  fills.slice(0, 12).map((fill) => (
                    <tr key={fill.id} className="hover:bg-slate-800/50">
                      <td className="px-3 py-2 text-slate-400">{formatLondonDateTime(fill.created_at)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 font-semibold ${
                            fill.side === 'buy'
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                          }`}
                        >
                          {fill.side.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{Number(fill.quantity).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{Number(fill.execution_price).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-200">{Number(fill.fee).toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  )
}
