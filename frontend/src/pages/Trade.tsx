import { useEffect, useState } from 'react'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { EmptyState } from '../components/ui/EmptyState'
import { Input } from '../components/ui/Input'
import { Select } from '../components/ui/Select'
import { SkeletonRow } from '../components/ui/SkeletonRow'
import { StatCard } from '../components/ui/StatCard'
import { Table } from '../components/ui/Table'
import { useAuth } from '../contexts/AuthContext'
import { formatLondonDateTime } from '../lib/datetime'
import { backendApi } from '../lib/backendApi'
import { formatNumber, formatUSD } from '../utils/formatNumber'

type Asset = {
  id: string
  symbol: string
  name: string
}

type Order = {
  id: string
  side: 'buy' | 'sell'
  order_type: 'market' | 'limit'
  price: number
  quantity: number
  status: string
  created_at: string
  asset: Asset | Asset[]
}

type Fill = {
  id: string
  side: 'buy' | 'sell'
  quantity: number
  execution_price: number
  fee: number
  created_at: string
  asset: Asset | Asset[]
}

function normalizeAsset<T extends { symbol: string; name: string }>(
  value: T | T[] | null | undefined
): T | null {
  if (!value) {
    return null
  }

  return Array.isArray(value) ? value[0] ?? null : value
}

export function Trade() {
  const { user } = useAuth()

  const [assets, setAssets] = useState<Asset[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [fills, setFills] = useState<Fill[]>([])

  const [assetId, setAssetId] = useState('')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market')
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const load = async () => {
      setLoading(true)
      try {
        const [assetData, orderData, fillData] = await Promise.all([
          backendApi.get<Asset[]>('/api/trade/assets'),
          backendApi.get<Order[]>(`/api/trade/orders?userId=${encodeURIComponent(user.id)}`),
          backendApi.get<Fill[]>(`/api/trade/fills?userId=${encodeURIComponent(user.id)}`),
        ])

        if (!active) {
          return
        }

        setAssets(assetData ?? [])
        setOrders(orderData ?? [])
        setFills(fillData ?? [])
        if (!assetId && assetData?.length) {
          setAssetId(assetData[0].id)
        }
      } catch (caughtError) {
        if (!active) {
          return
        }

        const message =
          caughtError instanceof Error ? caughtError.message : 'Failed to load trade data'
        setError(message)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void load()

    const intervalId = window.setInterval(() => {
      void load()
    }, 4000)

    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [user])

  const submitOrder = async () => {
    if (!user) {
      return
    }

    const quantityNumber = Number(quantity)
    const priceNumber = Number(price)

    if (!assetId || !Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      setError('Please provide a valid asset and quantity')
      return
    }

    if (orderType === 'limit' && (!Number.isFinite(priceNumber) || priceNumber <= 0)) {
      setError('Please provide a valid limit price')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      await backendApi.post('/api/trade/orders', {
        userId: user.id,
        assetId,
        side,
        orderType,
        quantity: quantityNumber,
        price: orderType === 'limit' ? priceNumber : undefined,
      })

      setQuantity('')
      setPrice('')

      const [orderData, fillData] = await Promise.all([
        backendApi.get<Order[]>(`/api/trade/orders?userId=${encodeURIComponent(user.id)}`),
        backendApi.get<Fill[]>(`/api/trade/fills?userId=${encodeURIComponent(user.id)}`),
      ])

      setOrders(orderData ?? [])
      setFills(fillData ?? [])
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to submit order'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const cancelOrder = async (orderId: string) => {
    if (!user) {
      return
    }

    try {
      await backendApi.patch(`/api/trade/orders/${orderId}/cancel`, {
        userId: user.id,
      })

      const orderData = await backendApi.get<Order[]>(
        `/api/trade/orders?userId=${encodeURIComponent(user.id)}`
      )
      setOrders(orderData ?? [])
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Failed to cancel order'
      setError(message)
    }
  }

  const openOrders = orders.filter((order) => order.status === 'open' || order.status === 'pending').length

  const selectedAsset = assets.find((asset) => asset.id === assetId) ?? null

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-1">Trade</h1>
        <p className="text-sm text-gray-500 mb-6">Backend-mediated market and limit order execution.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Assets" value={assets.length} sub="Tradable minerals" />
        <StatCard label="Open orders" value={openOrders} sub="Pending + open" valueColor="amber" />
        <StatCard label="Total orders" value={orders.length} sub="Recent order book" />
        <StatCard label="Total fills" value={fills.length} sub="Executed trades" valueColor="green" />
      </div>

      {error ? (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Order ticket</h2>

        {selectedAsset ? (
          <div className="mb-4 inline-flex items-center gap-2 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs text-indigo-200">
            <span className="font-mono">{selectedAsset.symbol}</span>
            <span>{selectedAsset.name}</span>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Select
            label="Asset"
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            options={assets.map((asset) => ({ value: asset.id, label: `${asset.symbol} · ${asset.name}` }))}
          />

          <Select
            label="Side"
            value={side}
            onChange={(event) => setSide(event.target.value as 'buy' | 'sell')}
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />

          <Select
            label="Order type"
            value={orderType}
            onChange={(event) => setOrderType(event.target.value as 'market' | 'limit')}
            options={[
              { value: 'market', label: 'Market' },
              { value: 'limit', label: 'Limit' },
            ]}
          />

          <Input
            label="Quantity"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />

          <Input
            label="Limit price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={orderType === 'limit' ? '0.00' : 'Market order'}
            disabled={orderType !== 'limit'}
            inputMode="decimal"
          />

          <div className="flex items-end">
            <Button type="button" className="w-full" onClick={submitOrder} loading={submitting}>
              Submit order
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Orders</h2>

        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)
        ) : orders.length === 0 ? (
          <EmptyState message="No orders yet" sub="Submit your first market or limit order above." />
        ) : (
          <Table<Order>
            data={orders}
            getRowKey={(order) => order.id}
            columns={[
              { key: 'time', header: 'Time', render: (order) => formatLondonDateTime(order.created_at) },
              {
                key: 'asset',
                header: 'Asset',
                render: (order) => <span className="font-mono text-white">{normalizeAsset(order.asset)?.symbol ?? '—'}</span>,
              },
              {
                key: 'side',
                header: 'Side',
                render: (order) => (
                  <Badge label={order.side.toUpperCase()} variant={order.side === 'buy' ? 'green' : 'red'} />
                ),
              },
              {
                key: 'type',
                header: 'Type',
                render: (order) => <span className="uppercase text-xs text-gray-300">{order.order_type}</span>,
              },
              {
                key: 'qty',
                header: 'Qty',
                align: 'right',
                render: (order) => <span className="font-mono">{formatNumber(Number(order.quantity))}</span>,
              },
              {
                key: 'price',
                header: 'Price',
                align: 'right',
                render: (order) => <span className="font-mono">{formatUSD(Number(order.price))}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (order) => {
                  const variant =
                    order.status === 'filled'
                      ? 'green'
                      : order.status === 'cancelled'
                        ? 'red'
                        : order.status === 'pending'
                          ? 'amber'
                          : 'gray'
                  return <Badge label={order.status} variant={variant} />
                },
              },
              {
                key: 'action',
                header: 'Action',
                render: (order) => {
                  const canCancel = order.status === 'open' || order.status === 'pending'
                  return canCancel ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => cancelOrder(order.id)}>
                      Cancel
                    </Button>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )
                },
              },
            ]}
          />
        )}
      </Card>

      <Card>
        <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Fills</h2>

        {loading ? (
          Array.from({ length: 5 }).map((_, index) => <SkeletonRow key={index} />)
        ) : fills.length === 0 ? (
          <EmptyState message="No fills yet" sub="Executed trades will appear here in real time." />
        ) : (
          <Table<Fill>
            data={fills}
            getRowKey={(fill) => fill.id}
            columns={[
              { key: 'time', header: 'Time', render: (fill) => formatLondonDateTime(fill.created_at) },
              {
                key: 'asset',
                header: 'Asset',
                render: (fill) => <span className="font-mono text-white">{normalizeAsset(fill.asset)?.symbol ?? '—'}</span>,
              },
              {
                key: 'side',
                header: 'Side',
                render: (fill) => (
                  <Badge label={fill.side.toUpperCase()} variant={fill.side === 'buy' ? 'green' : 'red'} />
                ),
              },
              {
                key: 'qty',
                header: 'Qty',
                align: 'right',
                render: (fill) => <span className="font-mono">{formatNumber(Number(fill.quantity))}</span>,
              },
              {
                key: 'execution',
                header: 'Execution',
                align: 'right',
                render: (fill) => <span className="font-mono">{formatUSD(Number(fill.execution_price))}</span>,
              },
              {
                key: 'fee',
                header: 'Fee',
                align: 'right',
                render: (fill) => <span className="font-mono">{formatUSD(Number(fill.fee))}</span>,
              },
            ]}
          />
        )}
      </Card>
    </section>
  )
}
