import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { backendApi } from '../lib/backendApi'

type Asset = {
  id: string
  symbol: string
  name: string
}

type WatchlistRow = {
  asset: Asset | Asset[]
}

type AlertType = 'above' | 'below' | 'pct_move'

type Alert = {
  id: number
  type: AlertType
  oneShot: boolean
  targetPrice: number
  isActive: boolean
  asset: Asset | Asset[]
}

function normalizeAsset(value: Asset | Asset[] | null | undefined): Asset | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export function Watchlist() {
  const { user } = useAuth()

  const [assets, setAssets] = useState<Asset[]>([])
  const [watchlist, setWatchlist] = useState<WatchlistRow[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])

  const [selectedAssetId, setSelectedAssetId] = useState('')
  const [alertAssetId, setAlertAssetId] = useState('')
  const [alertType, setAlertType] = useState<AlertType>('above')
  const [alertPrice, setAlertPrice] = useState('')
  const [oneShot, setOneShot] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const watchlistAssetIds = useMemo(() => {
    return new Set(
      watchlist
        .map((row) => normalizeAsset(row.asset)?.id)
        .filter((value): value is string => Boolean(value))
    )
  }, [watchlist])

  const refreshAll = async () => {
    if (!user) {
      return
    }

    const [assetData, watchlistData, alertData] = await Promise.all([
      backendApi.get<Asset[]>('/api/trade/assets'),
      backendApi.get<WatchlistRow[]>(`/api/watchlist?userId=${encodeURIComponent(user.id)}`),
      backendApi.get<Alert[]>(`/api/watchlist/alerts?userId=${encodeURIComponent(user.id)}`),
    ])

    setAssets(assetData ?? [])
    setWatchlist(watchlistData ?? [])
    setAlerts(alertData ?? [])

    if (!selectedAssetId && assetData?.length) {
      setSelectedAssetId(assetData[0].id)
    }

    if (!alertAssetId && assetData?.length) {
      setAlertAssetId(assetData[0].id)
    }
  }

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const load = async () => {
      try {
        await refreshAll()
      } catch (caughtError) {
        if (!active) {
          return
        }

        const message =
          caughtError instanceof Error ? caughtError.message : 'Failed to load watchlist data'
        setError(message)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [user])

  const addToWatchlist = async () => {
    if (!user || !selectedAssetId) {
      return
    }

    setError(null)

    try {
      await backendApi.post('/api/watchlist', {
        userId: user.id,
        assetId: selectedAssetId,
      })
      await refreshAll()
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to add watchlist item'
      setError(message)
    }
  }

  const removeFromWatchlist = async (assetId: string) => {
    if (!user) {
      return
    }

    try {
      await backendApi.delete(`/api/watchlist/${assetId}?userId=${encodeURIComponent(user.id)}`)
      await refreshAll()
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to remove watchlist item'
      setError(message)
    }
  }

  const createAlert = async () => {
    if (!user || !alertAssetId) {
      return
    }

    const targetPrice = Number(alertPrice)

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      setError('Please provide a valid alert target price')
      return
    }

    try {
      await backendApi.post('/api/watchlist/alerts', {
        userId: user.id,
        assetId: alertAssetId,
        type: alertType,
        targetPrice,
        oneShot,
      })

      setAlertPrice('')
      await refreshAll()
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to create alert'
      setError(message)
    }
  }

  const patchAlert = async (alert: Alert, patch: Partial<Alert>) => {
    if (!user) {
      return
    }

    try {
      await backendApi.patch(`/api/watchlist/alerts/${alert.id}`, {
        userId: user.id,
        type: patch.type ?? alert.type,
        targetPrice: patch.targetPrice ?? alert.targetPrice,
        oneShot: patch.oneShot ?? alert.oneShot,
        isActive: patch.isActive ?? alert.isActive,
      })
      await refreshAll()
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to update alert'
      setError(message)
    }
  }

  const deleteAlert = async (alertId: number) => {
    if (!user) {
      return
    }

    try {
      await backendApi.delete(`/api/watchlist/alerts/${alertId}?userId=${encodeURIComponent(user.id)}`)
      await refreshAll()
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to delete alert'
      setError(message)
    }
  }

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold text-slate-100">Watchlist</h2>
        <p className="mt-1 text-xs text-slate-400">Backend-mediated watchlist and alert management</p>

        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <select
            value={selectedAssetId}
            onChange={(event) => setSelectedAssetId(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.symbol} · {asset.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={addToWatchlist}
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Add to Watchlist
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Tracked Assets</h3>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {watchlist.map((row, index) => {
            const asset = normalizeAsset(row.asset)
            if (!asset) {
              return null
            }

            return (
              <div
                key={`${asset.id}-${index}`}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"
              >
                <div>
                  <p className="font-mono text-sm text-slate-100">{asset.symbol}</p>
                  <p className="text-xs text-slate-400">{asset.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFromWatchlist(asset.id)}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                >
                  Remove
                </button>
              </div>
            )
          })}
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Create Alert</h3>
        <div className="grid gap-3 md:grid-cols-5">
          <select
            value={alertAssetId}
            onChange={(event) => setAlertAssetId(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            {assets
              .filter((asset) => watchlistAssetIds.has(asset.id))
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol}
                </option>
              ))}
          </select>

          <select
            value={alertType}
            onChange={(event) => setAlertType(event.target.value as AlertType)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="pct_move">% Move</option>
          </select>

          <input
            value={alertPrice}
            onChange={(event) => setAlertPrice(event.target.value)}
            placeholder="Target"
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          />

          <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={oneShot}
              onChange={(event) => setOneShot(event.target.checked)}
            />
            One-shot
          </label>

          <button
            type="button"
            onClick={createAlert}
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Create Alert
          </button>
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Alerts</h3>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Target</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {alerts.map((alert) => {
                const asset = normalizeAsset(alert.asset)

                return (
                  <tr key={alert.id}>
                    <td className="px-3 py-2 font-mono text-slate-100">{asset?.symbol ?? '—'}</td>
                    <td className="px-3 py-2 uppercase text-slate-300">{alert.type}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {Number(alert.targetPrice).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{alert.oneShot ? 'One-shot' : 'Persistent'}</td>
                    <td className="px-3 py-2 text-slate-300">{alert.isActive ? 'Yes' : 'No'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => patchAlert(alert, { isActive: !alert.isActive })}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          {alert.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          type="button"
                          onClick={() => patchAlert(alert, { oneShot: !alert.oneShot })}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Toggle Mode
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAlert(alert.id)}
                          className="rounded border border-rose-700 px-2 py-1 text-xs text-rose-300 hover:bg-rose-950/40"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}
