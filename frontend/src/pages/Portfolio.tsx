import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { formatLondonDateTime } from '../lib/datetime'
import { supabase } from '../lib/supabase'

type Asset = {
  id: string
  symbol: string
  name: string
}

type Position = {
  quantity: number
  avgEntryPrice: number
  realizedPnl: number
  asset: Asset
}

type Order = {
  id: string
  side: 'buy' | 'sell'
  orderType: string
  price: number
  quantity: number
  status: string
  createdAt: string
  asset: Pick<Asset, 'symbol' | 'name'>
}

type Fill = {
  id: string
  side: 'buy' | 'sell'
  quantity: number
  executionPrice: number
  fee: number
  createdAt: string
  asset: Pick<Asset, 'symbol' | 'name'>
}

function normalizeAsset<T extends { symbol: string; name: string }>(
  value: T | T[] | null
): T | null {
  if (!value) {
    return null
  }

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('en-GB', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function Portfolio() {
  const { user } = useAuth()

  const [balance, setBalance] = useState(0)
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [fills, setFills] = useState<Fill[]>([])
  const [latestPricesByAsset, setLatestPricesByAsset] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true
    let trackedAssetIds = new Set<string>()

    const loadPortfolio = async () => {
      setLoading(true)
      setError(null)

      const [profileResult, positionsResult, ordersResult, fillsResult] = await Promise.all([
        supabase.from('profiles').select('balance').eq('id', user.id).single(),
        supabase
          .from('positions')
          .select(
            `
              quantity,
              avg_entry_price,
              realized_pnl,
              asset:assets(id, symbol, name)
            `
          )
          .eq('user_id', user.id)
          .gt('quantity', 0),
        supabase
          .from('orders')
          .select(
            `
              id,
              side,
              order_type,
              price,
              quantity,
              status,
              created_at,
              asset:assets(symbol, name)
            `
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('fills')
          .select(
            `
              id,
              side,
              quantity,
              execution_price,
              fee,
              created_at,
              asset:assets(symbol, name)
            `
          )
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ])

      if (!active) {
        return
      }

      if (profileResult.error || positionsResult.error || ordersResult.error || fillsResult.error) {
        setError(
          profileResult.error?.message ??
            positionsResult.error?.message ??
            ordersResult.error?.message ??
            fillsResult.error?.message ??
            'Failed to load portfolio'
        )
        setLoading(false)
        return
      }

      const normalizedPositions: Position[] = (positionsResult.data ?? [])
        .map((row) => {
          const rowWithAsset = row as {
            quantity: number
            avg_entry_price: number
            realized_pnl: number | null
            asset: Asset | Asset[] | null
          }
          const asset = normalizeAsset(rowWithAsset.asset)

          if (!asset?.id) {
            return null
          }

          return {
            quantity: Number(rowWithAsset.quantity),
            avgEntryPrice: Number(rowWithAsset.avg_entry_price),
            realizedPnl: Number(rowWithAsset.realized_pnl ?? 0),
            asset,
          }
        })
        .filter((row): row is Position => row !== null)

      const normalizedOrders: Order[] = (ordersResult.data ?? [])
        .map((row) => {
          const rowWithAsset = row as {
            id: string
            side: 'buy' | 'sell'
            order_type: string
            price: number
            quantity: number
            status: string
            created_at: string
            asset: { symbol: string; name: string } | { symbol: string; name: string }[] | null
          }

          const asset = normalizeAsset(rowWithAsset.asset)
          if (!asset) {
            return null
          }

          return {
            id: rowWithAsset.id,
            side: rowWithAsset.side,
            orderType: rowWithAsset.order_type,
            price: Number(rowWithAsset.price),
            quantity: Number(rowWithAsset.quantity),
            status: rowWithAsset.status,
            createdAt: rowWithAsset.created_at,
            asset,
          }
        })
        .filter((row): row is Order => row !== null)

      const normalizedFills: Fill[] = (fillsResult.data ?? [])
        .map((row) => {
          const rowWithAsset = row as {
            id: string
            side: 'buy' | 'sell'
            quantity: number
            execution_price: number
            fee: number
            created_at: string
            asset: { symbol: string; name: string } | { symbol: string; name: string }[] | null
          }

          const asset = normalizeAsset(rowWithAsset.asset)
          if (!asset) {
            return null
          }

          return {
            id: rowWithAsset.id,
            side: rowWithAsset.side,
            quantity: Number(rowWithAsset.quantity),
            executionPrice: Number(rowWithAsset.execution_price),
            fee: Number(rowWithAsset.fee),
            createdAt: rowWithAsset.created_at,
            asset,
          }
        })
        .filter((row): row is Fill => row !== null)

      trackedAssetIds = new Set(normalizedPositions.map((position) => position.asset.id))

      setBalance(Number(profileResult.data?.balance ?? 0))
      setPositions(normalizedPositions)
      setOrders(normalizedOrders)
      setFills(normalizedFills)

      if (trackedAssetIds.size > 0) {
        const { data: latestPricesData } = await supabase
          .from('price_history')
          .select('asset_id, price, created_at')
          .in('asset_id', Array.from(trackedAssetIds))
          .order('created_at', { ascending: false })
          .limit(500)

        if (active && latestPricesData) {
          const snapshot: Record<string, number> = {}

          for (const row of latestPricesData) {
            const assetId = row.asset_id as string
            const price = Number(row.price)
            if (!trackedAssetIds.has(assetId) || !Number.isFinite(price) || snapshot[assetId] !== undefined) {
              continue
            }
            snapshot[assetId] = price
          }

          setLatestPricesByAsset(snapshot)
        }
      }

      if (active) {
        setLoading(false)
      }
    }

    void loadPortfolio()

    const channel = supabase
      .channel('price_history_portfolio')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_history' },
        (payload) => {
          const inserted = payload.new as { asset_id?: string; price?: number | string }
          const assetId = inserted.asset_id
          const price = Number(inserted.price)

          if (!assetId || !trackedAssetIds.has(assetId) || !Number.isFinite(price)) {
            return
          }

          setLatestPricesByAsset((current) => ({
            ...current,
            [assetId]: price,
          }))
        }
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [user])

  const holdingsValue = useMemo(
    () =>
      positions.reduce((total, position) => {
        const livePrice = latestPricesByAsset[position.asset.id] ?? 0
        return total + position.quantity * livePrice
      }, 0),
    [latestPricesByAsset, positions]
  )

  const totalEquity = balance + holdingsValue
  const totalReturn = ((totalEquity - 100000) / 100000) * 100

  if (loading) {
    return <p className="text-slate-400">Loading portfolio…</p>
  }

  if (error) {
    return <p className="text-rose-400">{error}</p>
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Cash Balance</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">£{formatMoney(balance)}</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Holdings Value</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">£{formatMoney(holdingsValue)}</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Equity</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">£{formatMoney(totalEquity)}</p>
        </article>
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Return</p>
          <p className={`mt-1 text-2xl font-bold ${totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totalReturn.toFixed(2)}%
          </p>
        </article>
      </div>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Open Positions</h2>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Avg Entry</th>
                <th className="px-4 py-3 text-right">Live</th>
                <th className="px-4 py-3 text-right">Unrealised P&L</th>
                <th className="px-4 py-3 text-right">Unrealised %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {positions.map((position) => {
                const livePrice = latestPricesByAsset[position.asset.id] ?? 0
                const unrealised = (livePrice - position.avgEntryPrice) * position.quantity
                const unrealisedPct =
                  position.avgEntryPrice > 0
                    ? ((livePrice - position.avgEntryPrice) / position.avgEntryPrice) * 100
                    : 0
                const pnlClass = unrealised >= 0 ? 'text-green-400' : 'text-red-400'

                return (
                  <tr key={position.asset.id}>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-100">{position.asset.symbol}</td>
                    <td className="px-4 py-3 text-slate-300">{position.asset.name}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {position.quantity.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                      {position.avgEntryPrice.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-cyan-300">
                      {livePrice.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${pnlClass}`}>
                      {unrealised.toFixed(2)}
                    </td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${pnlClass}`}>
                      {unrealisedPct.toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Order History</h2>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="px-4 py-3 text-slate-300">{formatLondonDateTime(order.createdAt)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-100">{order.asset.symbol}</td>
                  <td
                    className={`px-4 py-3 font-semibold uppercase ${
                      order.side === 'buy' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {order.side}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.orderType}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    {order.quantity.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    {order.price.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{order.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="mb-3 text-lg font-semibold">Trade History</h2>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3 text-right">Quantity</th>
                <th className="px-4 py-3 text-right">Execution Price</th>
                <th className="px-4 py-3 text-right">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {fills.map((fill) => (
                <tr key={fill.id}>
                  <td className="px-4 py-3 text-slate-300">{formatLondonDateTime(fill.createdAt)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-100">{fill.asset.symbol}</td>
                  <td
                    className={`px-4 py-3 font-semibold uppercase ${
                      fill.side === 'buy' ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {fill.side}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    {fill.quantity.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    {fill.executionPrice.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-200">
                    {fill.fee.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
