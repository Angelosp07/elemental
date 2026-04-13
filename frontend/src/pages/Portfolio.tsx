import { useEffect, useMemo, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { SkeletonRow } from '../components/ui/SkeletonRow'
import { StatCard } from '../components/ui/StatCard'
import { Table } from '../components/ui/Table'
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

export function Portfolio() {
  const { user } = useAuth()

  const [balance, setBalance] = useState(0)
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [fills, setFills] = useState<Fill[]>([])
  const [latestPricesByAsset, setLatestPricesByAsset] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

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

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Portfolio</h1>
        <p className="text-sm text-gray-500 mb-6">Positions, equity, and execution history.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Cash balance" value={formatUSD(balance)} />
        <StatCard label="Holdings value" value={formatUSD(holdingsValue)} valueColor="amber" />
        <StatCard label="Total equity" value={formatUSD(totalEquity)} />
        <StatCard
          label="Total return"
          value={formatPercent(totalReturn)}
          valueColor={totalReturn > 0 ? 'green' : totalReturn < 0 ? 'red' : 'default'}
          sub="Baseline: $100,000"
        />
      </div>

      {error ? (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Open positions</h2>
        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)
        ) : positions.length === 0 ? (
          <EmptyState message="No open positions" sub="Place orders in Trade to build your book." />
        ) : (
          <Table<Position>
            data={positions}
            getRowKey={(position) => position.asset.id}
            columns={[
              {
                key: 'symbol',
                header: 'Symbol',
                render: (position) => <span className="font-mono text-white">{position.asset.symbol}</span>,
              },
              { key: 'name', header: 'Name', render: (position) => position.asset.name },
              {
                key: 'quantity',
                header: 'Quantity',
                align: 'right',
                render: (position) => <span className="font-mono">{formatNumber(position.quantity)}</span>,
              },
              {
                key: 'avg',
                header: 'Avg entry',
                align: 'right',
                render: (position) => <span className="font-mono">{formatUSD(position.avgEntryPrice)}</span>,
              },
              {
                key: 'live',
                header: 'Live',
                align: 'right',
                render: (position) => (
                  <span className="font-mono text-cyan-300">{formatUSD(latestPricesByAsset[position.asset.id] ?? 0)}</span>
                ),
              },
              {
                key: 'pnl',
                header: 'Unrealised',
                align: 'right',
                render: (position) => {
                  const livePrice = latestPricesByAsset[position.asset.id] ?? 0
                  const unrealised = (livePrice - position.avgEntryPrice) * position.quantity
                  const unrealisedPct =
                    position.avgEntryPrice > 0
                      ? ((livePrice - position.avgEntryPrice) / position.avgEntryPrice) * 100
                      : 0
                  const pnlClass =
                    unrealised > 0 ? 'text-emerald-400' : unrealised < 0 ? 'text-red-400' : 'text-gray-500'

                  return (
                    <span className={`font-mono ${pnlClass}`}>
                      {formatPnl(unrealised)} ({formatPercent(unrealisedPct)})
                    </span>
                  )
                },
              },
            ]}
          />
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">History</h2>
          <Button variant="secondary" size="sm" onClick={() => setShowHistory((current) => !current)}>
            {showHistory ? 'Hide history' : 'Show history'}
          </Button>
        </div>

        {!showHistory ? (
          <EmptyState message="History is collapsed" sub="Use Show history to view orders and fills." />
        ) : (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Order history</h2>
              <Table<Order>
                data={orders}
                getRowKey={(order) => order.id}
                emptyMessage="No orders yet"
                columns={[
                  { key: 'time', header: 'Time', render: (order) => formatLondonDateTime(order.createdAt) },
                  { key: 'symbol', header: 'Symbol', render: (order) => <span className="font-mono">{order.asset.symbol}</span> },
                  {
                    key: 'side',
                    header: 'Side',
                    render: (order) => <Badge label={order.side.toUpperCase()} variant={order.side === 'buy' ? 'green' : 'red'} />,
                  },
                  { key: 'type', header: 'Type', render: (order) => order.orderType },
                  { key: 'quantity', header: 'Quantity', align: 'right', render: (order) => <span className="font-mono">{formatNumber(order.quantity)}</span> },
                  { key: 'price', header: 'Price', align: 'right', render: (order) => <span className="font-mono">{formatUSD(order.price)}</span> },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (order) => (
                      <Badge
                        label={order.status}
                        variant={order.status === 'filled' ? 'green' : order.status === 'cancelled' ? 'red' : 'gray'}
                      />
                    ),
                  },
                ]}
              />
            </div>

            <div>
              <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Trade history</h2>
              <Table<Fill>
                data={fills}
                getRowKey={(fill) => fill.id}
                emptyMessage="No fills yet"
                columns={[
                  { key: 'time', header: 'Time', render: (fill) => formatLondonDateTime(fill.createdAt) },
                  { key: 'symbol', header: 'Symbol', render: (fill) => <span className="font-mono">{fill.asset.symbol}</span> },
                  {
                    key: 'side',
                    header: 'Side',
                    render: (fill) => <Badge label={fill.side.toUpperCase()} variant={fill.side === 'buy' ? 'green' : 'red'} />,
                  },
                  { key: 'quantity', header: 'Quantity', align: 'right', render: (fill) => <span className="font-mono">{formatNumber(fill.quantity)}</span> },
                  {
                    key: 'execution',
                    header: 'Execution',
                    align: 'right',
                    render: (fill) => <span className="font-mono">{formatUSD(fill.executionPrice)}</span>,
                  },
                  { key: 'fee', header: 'Fee', align: 'right', render: (fill) => <span className="font-mono">{formatUSD(fill.fee)}</span> },
                ]}
              />
            </div>
          </div>
        )}
      </Card>
    </section>
  )
}
