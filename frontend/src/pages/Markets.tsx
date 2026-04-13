import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonRow } from '../components/ui/SkeletonRow'
import { formatUSD } from '../utils/formatNumber'
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

function PriceCell({
  value,
  flash,
  direction,
}: {
  value: number | null
  flash?: FlashState
  direction: FlashState
}) {
  const tdRef = useRef<HTMLTableCellElement>(null)

  useEffect(() => {
    if (!tdRef.current || flash === 'neutral' || !flash) {
      return
    }

    tdRef.current.classList.remove('flash-green', 'flash-red')
    void tdRef.current.offsetWidth
    tdRef.current.classList.add(flash === 'up' ? 'flash-green' : 'flash-red')
  }, [flash, value])

  const colorClass =
    direction === 'up' ? 'text-emerald-400' : direction === 'down' ? 'text-red-400' : 'text-gray-300'

  return (
    <td ref={tdRef} className={`px-4 py-3 text-right font-mono text-sm tabular-nums w-[180px] ${colorClass}`}>
      {typeof value === 'number' ? formatUSD(value) : '—'}
    </td>
  )
}

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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Markets</h1>
        <p className="text-sm text-gray-500 mb-6">Real-time critical minerals market overview.</p>
      </div>

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Market table</h2>
        <p className="text-sm text-gray-500">
          Click a metal row to open its chart and buy/sell page.
        </p>
      </Card>

      {error ? (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : null}

      <Card>
        <div className="overflow-hidden rounded-md border border-white/[0.08]">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-[var(--bg-elevated)] text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Symbol</th>
                <th className="px-4 py-3">Name</th>
                <th className="w-[180px] px-4 py-3 text-right">Current Price</th>
                <th className="w-32 px-4 py-3 text-right">Direction</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-2">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <SkeletonRow key={index} />
                    ))}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <EmptyState message="No market assets available" sub="Add assets in Supabase to populate this view." />
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                const direction = row.direction

                return (
                  <tr
                    key={row.id}
                    className="cursor-pointer transition-colors hover:bg-indigo-500/10"
                    onClick={() => navigate(`/markets/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-slate-100">{row.symbol}</td>
                    <td className="px-4 py-3 text-slate-300">{row.name}</td>
                    <PriceCell value={row.currentPrice} flash={row.flash} direction={direction} />
                    <td className="px-4 py-3 text-right text-xs font-semibold uppercase">
                      {direction === 'up' ? (
                        <Badge label="UP" variant="green" />
                      ) : direction === 'down' ? (
                        <Badge label="DOWN" variant="red" />
                      ) : (
                        <Badge label="FLAT" variant="gray" />
                      )}
                    </td>
                  </tr>
                )
              }))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  )
}
