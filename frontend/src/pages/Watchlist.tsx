import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { formatLondonDateTime } from '../lib/datetime'
import { supabase } from '../lib/supabase'
import { createNotification } from '../utils/notifications'

type Asset = {
  id: string
  symbol: string
  name: string
}

type WatchlistRow = {
  asset_id: string
  asset: Asset | Asset[] | null
}

type PositionRow = {
  asset_id: string
  quantity: number
}

type AlertCondition = 'above' | 'below'

type AlertRow = {
  id: string
  asset_id: string
  condition: AlertCondition
  target_price: number
  is_active: boolean
  triggered_at: string | null
  asset: Pick<Asset, 'symbol' | 'name'> | Array<Pick<Asset, 'symbol' | 'name'>> | null
}

function normalizeAsset<T>(value: T | T[] | null | undefined): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export function Watchlist() {
  const { user } = useAuth()

  const [assets, setAssets] = useState<Asset[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([])
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [livePrices, setLivePrices] = useState<Record<string, number>>({})

  const [addOpen, setAddOpen] = useState(false)
  const [selectedAssetId, setSelectedAssetId] = useState('')

  const [alertAssetId, setAlertAssetId] = useState('')
  const [alertCondition, setAlertCondition] = useState<AlertCondition>('above')
  const [alertTargetPrice, setAlertTargetPrice] = useState('')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const pendingTriggerRef = useRef<Set<string>>(new Set())

  const loadPageData = async () => {
    if (!user) {
      return
    }

    const [assetsResult, watchlistResult, positionsResult, alertsResult] = await Promise.all([
      supabase.from('assets').select('id, symbol, name').order('symbol'),
      supabase
        .from('user_watchlist')
        .select(
          `
            asset_id,
            asset:assets(id, symbol, name)
          `
        )
        .eq('user_id', user.id),
      supabase
        .from('positions')
        .select('asset_id, quantity')
        .eq('user_id', user.id)
        .gt('quantity', 0),
      supabase
        .from('user_alerts')
        .select(
          `
            id,
            asset_id,
            condition,
            target_price,
            is_active,
            triggered_at,
            asset:assets(symbol, name)
          `
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
    ])

    const firstError =
      assetsResult.error ?? watchlistResult.error ?? positionsResult.error ?? alertsResult.error

    if (firstError) {
      throw new Error(firstError.message)
    }

    const nextAssets = (assetsResult.data ?? []) as Asset[]
    setAssets(nextAssets)
    setWatchlist((watchlistResult.data ?? []) as WatchlistRow[])
    setPositions((positionsResult.data ?? []) as PositionRow[])
    setAlerts((alertsResult.data ?? []) as AlertRow[])

    if (!selectedAssetId && nextAssets.length > 0) {
      setSelectedAssetId(nextAssets[0].id)
    }

    if (!alertAssetId && nextAssets.length > 0) {
      setAlertAssetId(nextAssets[0].id)
    }
  }

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        await loadPageData()
      } catch (caughtError) {
        if (!active) {
          return
        }

        const message =
          caughtError instanceof Error ? caughtError.message : 'Failed to load watchlist page'
        setError(message)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      return
    }

    const channel = supabase
      .channel(`price_history_watchlist_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_history' },
        (payload) => {
          const inserted = payload.new as {
            asset_id?: string
            price?: string | number
          }

          const assetId = inserted.asset_id
          const price = Number(inserted.price)

          if (!assetId || !Number.isFinite(price)) {
            return
          }

          setLivePrices((current) => ({
            ...current,
            [assetId]: price,
          }))
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user])

  useEffect(() => {
    if (!user || watchlist.length === 0) {
      return
    }

    const watchlistedIds = watchlist.map((row) => row.asset_id)

    const loadLatestPrices = async () => {
      const { data, error: latestError } = await supabase
        .from('price_history')
        .select('asset_id, price, created_at')
        .in('asset_id', watchlistedIds)
        .order('created_at', { ascending: false })
        .limit(3000)

      if (latestError || !data) {
        return
      }

      const snapshot: Record<string, number> = {}

      for (const row of data) {
        const assetId = row.asset_id as string
        const price = Number(row.price)

        if (!Number.isFinite(price) || snapshot[assetId] !== undefined) {
          continue
        }

        snapshot[assetId] = price
      }

      setLivePrices((current) => ({
        ...snapshot,
        ...current,
      }))
    }

    void loadLatestPrices()
  }, [user, watchlist])

  useEffect(() => {
    if (!user || alerts.length === 0) {
      return
    }

    const runChecks = async () => {
      for (const alert of alerts) {
        if (!alert.is_active) {
          continue
        }

        if (pendingTriggerRef.current.has(alert.id)) {
          continue
        }

        const currentPrice = livePrices[alert.asset_id]

        if (!Number.isFinite(currentPrice)) {
          continue
        }

        const triggered =
          (alert.condition === 'above' && currentPrice >= Number(alert.target_price)) ||
          (alert.condition === 'below' && currentPrice <= Number(alert.target_price))

        if (!triggered) {
          continue
        }

        pendingTriggerRef.current.add(alert.id)

        const { error: updateError } = await supabase
          .from('user_alerts')
          .update({
            is_active: false,
            triggered_at: new Date().toISOString(),
          })
          .eq('id', alert.id)
          .eq('user_id', user.id)

        pendingTriggerRef.current.delete(alert.id)

        if (!updateError) {
          const assetSymbol = normalizeAsset(alert.asset)?.symbol ?? 'Asset'
          try {
            await createNotification(
              user.id,
              'alert_triggered',
              'Price alert triggered',
              `${assetSymbol} is now ${alert.condition} ${Number(alert.target_price).toFixed(2)}`,
              alert.id
            )
          } catch {
            setError('Notification setup is not available yet. Please run notification SQL setup.')
          }

          setAlerts((current) =>
            current.map((item) =>
              item.id === alert.id
                ? {
                    ...item,
                    is_active: false,
                    triggered_at: new Date().toISOString(),
                  }
                : item
            )
          )
        }
      }
    }

    void runChecks()
  }, [alerts, livePrices, user])

  const inPortfolioIds = useMemo(
    () => new Set(positions.map((row) => row.asset_id)),
    [positions]
  )

  const inPortfolioCount = useMemo(
    () => watchlist.filter((row) => inPortfolioIds.has(row.asset_id)).length,
    [inPortfolioIds, watchlist]
  )

  const activeAlerts = useMemo(
    () => alerts.filter((alert) => alert.is_active),
    [alerts]
  )

  const triggeredAlerts = useMemo(
    () => alerts.filter((alert) => !alert.is_active && alert.triggered_at),
    [alerts]
  )

  const availableToAdd = useMemo(() => {
    const trackedIds = new Set(watchlist.map((row) => row.asset_id))
    return assets.filter((asset) => !trackedIds.has(asset.id))
  }, [assets, watchlist])

  const addToWatchlist = async () => {
    if (!user || !selectedAssetId) {
      return
    }

    setSubmitting(true)
    setError(null)

    const { error: addError } = await supabase
      .from('user_watchlist')
      .insert({ user_id: user.id, asset_id: selectedAssetId })

    if (addError) {
      setError(addError.message)
      setSubmitting(false)
      return
    }

    await loadPageData()
    setSubmitting(false)
    setAddOpen(false)
  }

  const removeFromWatchlist = async (assetId: string) => {
    if (!user) {
      return
    }

    const { error: removeError } = await supabase
      .from('user_watchlist')
      .delete()
      .eq('user_id', user.id)
      .eq('asset_id', assetId)

    if (removeError) {
      setError(removeError.message)
      return
    }

    await loadPageData()
  }

  const createAlert = async () => {
    if (!user || !alertAssetId) {
      return
    }

    const targetPrice = Number(alertTargetPrice)

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError('Please provide a valid target price')
      return
    }

    const { error: createError } = await supabase
      .from('user_alerts')
      .insert({
        user_id: user.id,
        asset_id: alertAssetId,
        condition: alertCondition,
        target_price: targetPrice,
        is_active: true,
      })

    if (createError) {
      setError(createError.message)
      return
    }

    setAlertTargetPrice('')
    await loadPageData()
  }

  const deleteAlert = async (alertId: string) => {
    const { error: deleteError } = await supabase
      .from('user_alerts')
      .delete()
      .eq('id', alertId)

    if (deleteError) {
      setError(deleteError.message)
      return
    }

    setAlerts((current) => current.filter((alert) => alert.id !== alertId))
  }

  if (loading) {
    return <p className="text-slate-400">Loading watchlist…</p>
  }

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Tracked Assets</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{watchlist.length}</p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">In Portfolio</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{inPortfolioCount}</p>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Alerts</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">
            {activeAlerts.length} / {triggeredAlerts.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">Active / Triggered</p>
        </article>
      </div>

      {error ? (
        <p className="rounded-md border border-rose-800 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">My Watchlist</h3>
            <button
              type="button"
              onClick={() => setAddOpen((current) => !current)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
            >
              Add Asset
            </button>
          </div>

          {addOpen ? (
            <div className="mb-3 flex flex-col gap-2 md:flex-row">
              <select
                value={selectedAssetId}
                onChange={(event) => setSelectedAssetId(event.target.value)}
                className="w-full rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
              >
                {availableToAdd.length === 0 ? (
                  <option value="">All assets are already in your watchlist</option>
                ) : (
                  availableToAdd.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.symbol} · {asset.name}
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                disabled={submitting || availableToAdd.length === 0 || !selectedAssetId}
                onClick={addToWatchlist}
                className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          ) : null}

          {addOpen && availableToAdd.length === 0 ? (
            <p className="mb-3 text-xs text-slate-500">All assets are already in your watchlist</p>
          ) : null}

          <div className="overflow-hidden rounded-md border border-slate-800">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
              <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Live Price</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {watchlist.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-center text-slate-500" colSpan={5}>
                      No tracked assets yet.
                    </td>
                  </tr>
                ) : (
                  watchlist.map((row) => {
                    const asset = normalizeAsset(row.asset)
                    const isInPortfolio = inPortfolioIds.has(row.asset_id)
                    const live = livePrices[row.asset_id]

                    return (
                      <tr key={row.asset_id}>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-100">
                          {asset?.symbol ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-300">{asset?.name ?? 'Unknown'}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-cyan-300">
                          {typeof live === 'number' ? live.toFixed(2) : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {isInPortfolio ? (
                            <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">
                              In Portfolio
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-2">
                            <Link
                              to="/markets"
                              className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                            >
                              Open
                            </Link>
                            <button
                              type="button"
                              onClick={() => removeFromWatchlist(row.asset_id)}
                              className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Alert Manager</h3>

          <div className="grid gap-2 md:grid-cols-4">
            <select
              value={alertAssetId}
              onChange={(event) => setAlertAssetId(event.target.value)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            >
              {assets.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol}
                </option>
              ))}
            </select>

            <select
              value={alertCondition}
              onChange={(event) => setAlertCondition(event.target.value as AlertCondition)}
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            >
              <option value="above">above</option>
              <option value="below">below</option>
            </select>

            <input
              value={alertTargetPrice}
              onChange={(event) => setAlertTargetPrice(event.target.value)}
              placeholder="Target price"
              type="number"
              className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
            />

            <button
              type="button"
              onClick={createAlert}
              className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
            >
              Create Alert
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Active
              </h4>
              <div className="space-y-2">
                {activeAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500">No active alerts.</p>
                ) : (
                  activeAlerts.map((alert) => {
                    const asset = normalizeAsset(alert.asset)

                    return (
                      <div
                        key={alert.id}
                        className="rounded-md border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
                      >
                        <p className="font-mono font-semibold text-slate-100">{asset?.symbol ?? '—'}</p>
                        <p className="text-xs text-slate-300">
                          {alert.condition} {Number(alert.target_price).toFixed(2)}
                        </p>
                        <button
                          type="button"
                          onClick={() => deleteAlert(alert.id)}
                          className="mt-2 rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
                        >
                          Delete
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-950/40 p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Triggered
              </h4>
              <div className="space-y-2">
                {triggeredAlerts.length === 0 ? (
                  <p className="text-xs text-slate-500">No triggered alerts.</p>
                ) : (
                  triggeredAlerts.map((alert) => {
                    const asset = normalizeAsset(alert.asset)

                    return (
                      <div
                        key={alert.id}
                        className="rounded-md border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm"
                      >
                        <p className="font-mono font-semibold text-slate-300">{asset?.symbol ?? '—'}</p>
                        <p className="text-xs text-slate-500">
                          {alert.condition} {Number(alert.target_price).toFixed(2)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          Triggered: {alert.triggered_at ? formatLondonDateTime(alert.triggered_at) : '—'}
                        </p>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
