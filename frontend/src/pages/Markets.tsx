import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

type Asset = {
  id: string
  symbol: string
  name: string
}

type PriceState = {
  current: number | null
  previous: number | null
}

type FlashState = 'up' | 'down' | 'neutral'

export function Markets() {
  const navigate = useNavigate()
  const [assets, setAssets] = useState<Asset[]>([])
  const [pricesByAsset, setPricesByAsset] = useState<Record<string, PriceState>>({})
  const [flashByAsset, setFlashByAsset] = useState<Record<string, FlashState>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const loadInitialData = async () => {
      setLoading(true)
      setError(null)

      const { data: assetsData, error: assetsError } = await supabase
        .from('assets')
        .select('id, symbol, name')
        .order('symbol')

      if (!active) {
        return
      }

      if (assetsError || !assetsData) {
        setError(assetsError?.message ?? 'Failed to load assets')
        setLoading(false)
        return
      }

      setAssets(assetsData)

      const { data: latestPricesData, error: pricesError } = await supabase
        .from('price_history')
        .select('asset_id, price, created_at')
        .order('created_at', { ascending: false })
        .limit(200)

      if (!active) {
        return
      }

      if (pricesError || !latestPricesData) {
        setError(pricesError?.message ?? 'Failed to load prices')
        setLoading(false)
        return
      }

      const snapshot: Record<string, PriceState> = {}

      for (const row of latestPricesData) {
        const assetId = row.asset_id as string
        const price = Number(row.price)

        if (!Number.isFinite(price)) {
          continue
        }

        if (!snapshot[assetId]) {
          snapshot[assetId] = { current: price, previous: null }
          continue
        }

        if (snapshot[assetId].previous === null) {
          snapshot[assetId].previous = price
        }
      }

      setPricesByAsset(snapshot)
      setLoading(false)
    }

    void loadInitialData()

    const channel = supabase
      .channel('price_history')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'price_history' },
        (payload) => {
          const inserted = payload.new as {
            asset_id?: string
            price?: number | string
          }

          const assetId = inserted.asset_id
          const nextPrice = Number(inserted.price)

          if (!assetId || !Number.isFinite(nextPrice)) {
            return
          }

          let direction: FlashState = 'neutral'

          setPricesByAsset((current) => {
            const existing = current[assetId]
            const previous = existing?.current ?? null

            if (typeof previous === 'number') {
              if (nextPrice > previous) {
                direction = 'up'
              } else if (nextPrice < previous) {
                direction = 'down'
              }
            }

            return {
              ...current,
              [assetId]: {
                current: nextPrice,
                previous,
              },
            }
          })

          setFlashByAsset((current) => {
            return { ...current, [assetId]: direction }
          })

          window.setTimeout(() => {
            if (!active) {
              return
            }

            setFlashByAsset((current) => {
              const clone = { ...current }
              delete clone[assetId]
              return clone
            })
          }, 650)
        }
      )
      .subscribe()

    return () => {
      active = false
      void supabase.removeChannel(channel)
    }
  }, [])

  const rows = useMemo(
    () =>
      assets.map((asset) => {
        const priceState = pricesByAsset[asset.id] ?? { current: null, previous: null }
        const currentPrice = priceState.current
        const previousPrice = priceState.previous

        let direction: FlashState = 'neutral'
        if (typeof currentPrice === 'number' && typeof previousPrice === 'number') {
          if (currentPrice > previousPrice) {
            direction = 'up'
          } else if (currentPrice < previousPrice) {
            direction = 'down'
          }
        }

        return {
          ...asset,
          currentPrice,
          direction,
          flash: flashByAsset[asset.id],
        }
      }),
    [assets, flashByAsset, pricesByAsset]
  )

  if (loading) {
    return <p className="text-slate-400">Loading markets…</p>
  }

  if (error) {
    return <p className="text-rose-400">{error}</p>
  }

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold">Markets</h2>
        <p className="mt-1 text-xs text-slate-400">
          Click a metal row to open its chart and buy/sell page.
        </p>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="w-36 px-4 py-3 text-right">Current Price</th>
                <th className="w-32 px-4 py-3 text-right">Direction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {rows.map((row) => {
                const direction = row.direction

                const colorClass =
                  direction === 'up'
                    ? 'text-green-400'
                    : direction === 'down'
                      ? 'text-red-400'
                      : 'text-slate-300'

                const flashClass =
                  row.flash === 'up'
                    ? 'bg-green-500/10'
                    : row.flash === 'down'
                      ? 'bg-red-500/10'
                      : ''

                return (
                  <tr
                    key={row.id}
                    className={`cursor-pointer transition-colors ${flashClass} hover:bg-indigo-500/10`}
                    onClick={() => navigate(`/markets/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-slate-100">{row.symbol}</td>
                    <td className="px-4 py-3 text-slate-300">{row.name}</td>
                    <td className={`px-4 py-3 text-right font-mono tabular-nums ${colorClass}`}>
                      {typeof row.currentPrice === 'number' ? row.currentPrice.toFixed(2) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right text-xs font-semibold uppercase ${colorClass}`}>
                      {direction === 'up' ? 'UP' : direction === 'down' ? 'DOWN' : 'FLAT'}
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
