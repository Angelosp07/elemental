import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonRow } from '../components/ui/SkeletonRow'
import { StatCard } from '../components/ui/StatCard'
import { useAuth } from '../contexts/AuthContext'
import { formatLondonDateTime } from '../lib/datetime'
import { supabase } from '../lib/supabase'
import { formatNumber, formatPercent, formatPnl, formatUSD } from '../utils/formatNumber'

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

type Fill = {
  id: string
  side: 'buy' | 'sell'
  quantity: number
  executionPrice: number
  createdAt: string
  asset: Pick<Asset, 'symbol' | 'name'>
}

type Alert = {
  id: string
  condition: string
  targetPrice: number
  assetSymbol: string
}

function normalizeAsset<T extends { symbol: string; name?: string; id?: string }>(
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

export function Dashboard() {
  const { user } = useAuth()

  const [username, setUsername] = useState('Trader')
  const [balance, setBalance] = useState(0)
  const [positions, setPositions] = useState<Position[]>([])
  const [fills, setFills] = useState<Fill[]>([])
  const [watchlistAssets, setWatchlistAssets] = useState<Asset[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [latestPricesByAsset, setLatestPricesByAsset] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true
    let trackedAssetIds = new Set<string>()

    const loadDashboard = async (silent = false) => {
      if (!silent) {
        setLoading(true)
      }
      setError(null)

      const [profileResult, positionsResult, fillsResult, watchlistResult, alertsResult] =
        await Promise.all([
          supabase
            .from('profiles')
            .select('username, balance')
            .eq('id', user.id)
            .single(),
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
            .from('fills')
            .select(
              `
                id,
                side,
                quantity,
                execution_price,
                created_at,
                asset:assets(symbol, name)
              `
            )
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase
            .from('user_watchlist')
            .select('asset:assets(id, symbol, name)')
            .eq('user_id', user.id),
          supabase
            .from('user_alerts')
            .select('id, condition, target_price, asset:assets(symbol)')
            .eq('user_id', user.id)
            .eq('is_active', true),
        ])

      if (!active) {
        return
      }

      if (
        profileResult.error ||
        positionsResult.error ||
        fillsResult.error ||
        watchlistResult.error ||
        alertsResult.error
      ) {
        setError(
          profileResult.error?.message ??
            positionsResult.error?.message ??
            fillsResult.error?.message ??
            watchlistResult.error?.message ??
            alertsResult.error?.message ??
            'Failed to load dashboard'
        )
        if (!silent) {
          setLoading(false)
        }
        return
      }

      setUsername(profileResult.data?.username ?? 'Trader')
      setBalance(Number(profileResult.data?.balance ?? 0))

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

      setPositions(normalizedPositions)

      const normalizedFills: Fill[] = (fillsResult.data ?? [])
        .map((row) => {
          const rowWithAsset = row as {
            id: string
            side: 'buy' | 'sell'
            quantity: number
            execution_price: number
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
            createdAt: rowWithAsset.created_at,
            asset,
          }
        })
        .filter((row): row is Fill => row !== null)

      setFills(normalizedFills)

      const normalizedWatchlistAssets: Asset[] = (watchlistResult.data ?? [])
        .map((row) => {
          const rowWithAsset = row as {
            asset: Asset | Asset[] | null
          }
          const asset = normalizeAsset(rowWithAsset.asset)
          if (!asset?.id) {
            return null
          }

          return asset
        })
        .filter((row): row is Asset => row !== null)

      setWatchlistAssets(normalizedWatchlistAssets)

      const normalizedAlerts: Alert[] = (alertsResult.data ?? [])
        .map((row) => {
          const rowWithAsset = row as {
            id: string
            condition: string
            target_price: number
            asset: { symbol: string } | { symbol: string }[] | null
          }
          const asset = normalizeAsset(rowWithAsset.asset)
          if (!asset?.symbol) {
            return null
          }

          return {
            id: rowWithAsset.id,
            condition: rowWithAsset.condition,
            targetPrice: Number(rowWithAsset.target_price),
            assetSymbol: asset.symbol,
          }
        })
        .filter((row): row is Alert => row !== null)

      setAlerts(normalizedAlerts)

      trackedAssetIds = new Set([
        ...normalizedPositions.map((position) => position.asset.id),
        ...normalizedWatchlistAssets.map((asset) => asset.id),
      ])

      if (trackedAssetIds.size > 0) {
        const { data: latestPricesData } = await supabase
          .from('price_history')
          .select('asset_id, price, created_at')
          .in('asset_id', Array.from(trackedAssetIds))
          .order('created_at', { ascending: false })
          .limit(600)

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

      if (active && !silent) {
        setLoading(false)
      }
    }

    void loadDashboard()

    const intervalId = window.setInterval(() => {
      void loadDashboard(true)
    }, 8000)

    const dashboardDataChannel = supabase
      .channel(`dashboard_data_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => {
          void loadDashboard(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'positions', filter: `user_id=eq.${user.id}` },
        () => {
          void loadDashboard(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fills', filter: `user_id=eq.${user.id}` },
        () => {
          void loadDashboard(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_watchlist', filter: `user_id=eq.${user.id}` },
        () => {
          void loadDashboard(true)
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_alerts', filter: `user_id=eq.${user.id}` },
        () => {
          void loadDashboard(true)
        }
      )
      .subscribe()

    const channel = supabase
      .channel('price_history_dashboard')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_history' },
        (payload) => {
          const inserted = payload.new as {
            asset_id?: string
            price?: number | string
          }

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
      window.clearInterval(intervalId)
      void supabase.removeChannel(dashboardDataChannel)
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
  const isProfit = totalReturn >= 0

  const allocationRows = useMemo(() => {
    const rows = positions.map((position) => {
      const livePrice = latestPricesByAsset[position.asset.id] ?? 0
      const marketValue = position.quantity * livePrice
      const unrealisedPnl = (livePrice - position.avgEntryPrice) * position.quantity
      const weightPct = holdingsValue > 0 ? (marketValue / holdingsValue) * 100 : 0

      return {
        assetId: position.asset.id,
        symbol: position.asset.symbol,
        marketValue,
        unrealisedPnl,
        weightPct,
      }
    })

    return rows.sort((a, b) => b.marketValue - a.marketValue)
  }, [holdingsValue, latestPricesByAsset, positions])

  const heldAssetIds = useMemo(
    () => new Set(positions.map((position) => position.asset.id)),
    [positions]
  )

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Dashboard</h1>
        <p className="text-sm text-gray-500 mb-6">Portfolio health, allocation, and watchlist pulse.</p>
      </div>

      {error ? (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : null}

      <Card>
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-2xl font-semibold">Welcome back, {username}</h2>
            <p className="mt-1 text-sm text-slate-400">
              {isProfit ? 'Your strategy is in profit today' : 'Your portfolio is down today'}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link
          to="/trade"
          className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-4 transition hover:border-indigo-400/70 hover:bg-indigo-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-indigo-300">Trading</p>
          <p className="mt-1 text-lg font-semibold text-indigo-100">Open Trading Terminal</p>
          <p className="mt-1 text-xs text-indigo-200/80">Place market and limit orders</p>
        </Link>

        <Link
          to="/portfolio"
          className="rounded-xl border border-cyan-500/40 bg-cyan-500/10 p-4 transition hover:border-cyan-400/70 hover:bg-cyan-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-cyan-300">Portfolio</p>
          <p className="mt-1 text-lg font-semibold text-cyan-100">View Portfolio</p>
          <p className="mt-1 text-xs text-cyan-200/80">Check positions and performance</p>
        </Link>

        <Link
          to="/watchlist"
          className="rounded-xl border border-slate-500/40 bg-slate-500/10 p-4 transition hover:border-slate-400/70 hover:bg-slate-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-slate-300">Watchlist</p>
          <p className="mt-1 text-lg font-semibold text-slate-100">Manage Watchlist</p>
          <p className="mt-1 text-xs text-slate-300/80">Track assets and configure alerts</p>
        </Link>

        <Link
          to="/markets"
          className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 transition hover:border-emerald-400/70 hover:bg-emerald-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-emerald-300">Markets</p>
          <p className="mt-1 text-lg font-semibold text-emerald-100">Open Markets</p>
          <p className="mt-1 text-xs text-emerald-200/80">Browse metals, charts, and prices</p>
        </Link>

        <Link
          to="/freight"
          className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 transition hover:border-violet-400/70 hover:bg-violet-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-violet-300">Freight</p>
          <p className="mt-1 text-lg font-semibold text-violet-100">Open Freight Desk</p>
          <p className="mt-1 text-xs text-violet-200/80">Evaluate routes, rates, and vessel fit</p>
        </Link>

        <Link
          to="/cargo"
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 transition hover:border-amber-400/70 hover:bg-amber-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-amber-300">Cargo</p>
          <p className="mt-1 text-lg font-semibold text-amber-100">Open Live Cargo</p>
          <p className="mt-1 text-xs text-amber-200/80">Track shipments and route progress</p>
        </Link>

        <Link
          to="/chat"
          className="rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 transition hover:border-blue-400/70 hover:bg-blue-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-blue-300">Chat</p>
          <p className="mt-1 text-lg font-semibold text-blue-100">Open Messaging</p>
          <p className="mt-1 text-xs text-blue-200/80">Direct message counterparties and users</p>
        </Link>

        <Link
          to="/settings"
          className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 p-4 transition hover:border-fuchsia-400/70 hover:bg-fuchsia-500/20"
        >
          <p className="text-xs uppercase tracking-wide text-fuchsia-300">Settings</p>
          <p className="mt-1 text-lg font-semibold text-fuchsia-100">Open Settings</p>
          <p className="mt-1 text-xs text-fuchsia-200/80">Manage account and preferences</p>
        </Link>

        <StatCard label="Total equity" value={formatUSD(totalEquity)} sub="Cash + holdings" />
        <StatCard label="Holdings value" value={formatUSD(holdingsValue)} valueColor="amber" sub="Live marked-to-market" />
        <StatCard
          label="Total return"
          value={formatPercent(totalReturn)}
          valueColor={isProfit ? 'green' : 'red'}
          sub="Starting balance: $100,000"
        />
        <StatCard label="Watchlist / alerts" value={`${watchlistAssets.length} / ${alerts.length}`} sub="Assets tracked / active alerts" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-3 xl:col-span-2">
          <Card>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Portfolio allocation</h2>
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <SkeletonRow key={index} />)
            ) : allocationRows.length === 0 ? (
              <EmptyState message="No allocations yet" sub="Positions will appear once you have holdings." />
            ) : (
            <div className="space-y-4">
              {allocationRows.map((item) => {
                const pnlClass = item.unrealisedPnl >= 0 ? 'text-green-400' : 'text-red-400'

                return (
                  <div key={item.assetId}>
                    <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                      <span className="font-mono font-semibold">{item.symbol}</span>
                      <span>{formatNumber(item.weightPct, 1)}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min(100, Math.max(0, item.weightPct))}%` }}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-slate-400">
                      <span>{formatUSD(item.marketValue)}</span>
                      <span className={pnlClass}>{formatPnl(item.unrealisedPnl)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
            )}
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Recent activity</h2>
            <div className="space-y-2">
              {fills.length === 0 ? (
                <EmptyState message="No recent fills" />
              ) : (
                fills.map((fill) => (
                  <div
                    key={fill.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs"
                  >
                    <span className="text-slate-400">{formatLondonDateTime(fill.createdAt)}</span>
                    <span className="font-mono font-semibold text-slate-100">{fill.asset.symbol}</span>
                    <Badge label={fill.side.toUpperCase()} variant={fill.side === 'buy' ? 'green' : 'red'} />
                    <span className="font-mono tabular-nums text-slate-300">{formatNumber(fill.quantity)}</span>
                    <span className="font-mono tabular-nums text-cyan-300">{formatUSD(fill.executionPrice)}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-3">
          <Card>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Watchlist pulse</h2>
            <div className="space-y-2">
              {watchlistAssets.length === 0 ? (
                <EmptyState message="No watchlist assets" />
              ) : (
                watchlistAssets.map((asset) => {
                  const live = latestPricesByAsset[asset.id]
                  const inPortfolio = heldAssetIds.has(asset.id)

                  return (
                    <div
                      key={asset.id}
                      className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-mono font-semibold text-slate-100">{asset.symbol}</p>
                        <p className="text-xs text-slate-400">{asset.name}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono tabular-nums text-cyan-300">
                          {typeof live === 'number' ? formatUSD(live) : '—'}
                        </p>
                        {inPortfolio ? (
                          <Badge label="In portfolio" variant="blue" />
                        ) : null}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </Card>

          <Card>
            <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Alerts centre</h2>
            <div className="space-y-2">
              {alerts.length === 0 ? (
                <EmptyState message="No active alerts" />
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-300"
                  >
                    <p className="font-mono font-semibold text-slate-100">{alert.assetSymbol}</p>
                    <p className="text-xs text-slate-400">
                      {alert.condition} {formatUSD(alert.targetPrice)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
