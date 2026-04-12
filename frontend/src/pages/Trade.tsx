import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { formatLondonDateTime } from '../lib/datetime'
import { backendApi } from '../lib/backendApi'

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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }

    let active = true

    const load = async () => {
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
  }, [assetId, user])

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

  return (
    <section className="space-y-4">
      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h2 className="text-lg font-semibold">Trading Terminal</h2>
        <p className="mt-1 text-xs text-slate-400">Backend-mediated market/limit order flow</p>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select
            value={assetId}
            onChange={(event) => setAssetId(event.target.value)}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.symbol} · {asset.name}
              </option>
            ))}
          </select>

          <select
            value={side}
            onChange={(event) => setSide(event.target.value as 'buy' | 'sell')}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>

          <select
            value={orderType}
            onChange={(event) => setOrderType(event.target.value as 'market' | 'limit')}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          >
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>

          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="Quantity"
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
          />

          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder={orderType === 'limit' ? 'Limit price' : 'Optional price'}
            disabled={orderType !== 'limit'}
            className="rounded-md border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm disabled:opacity-50"
          />

          <button
            type="button"
            disabled={submitting}
            onClick={submitOrder}
            className="rounded-md bg-indigo-500 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit Order'}
          </button>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Orders</h3>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {orders.map((order) => {
                const asset = normalizeAsset(order.asset)
                const canCancel = order.status === 'open' || order.status === 'pending'

                return (
                  <tr key={order.id}>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {formatLondonDateTime(order.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-100">{asset?.symbol ?? '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${order.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {order.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 uppercase text-slate-300">{order.order_type}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {Number(order.quantity).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {Number(order.price).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-slate-300">{order.status}</td>
                    <td className="px-3 py-2">
                      {canCancel ? (
                        <button
                          type="button"
                          onClick={() => cancelOrder(order.id)}
                          className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </article>

      <article className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-300">Fills</h3>
        <div className="overflow-hidden rounded-md border border-slate-800">
          <table className="min-w-full divide-y divide-slate-800 text-left text-sm">
            <thead className="bg-slate-950/60 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Asset</th>
                <th className="px-3 py-2">Side</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Execution</th>
                <th className="px-3 py-2 text-right">Fee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {fills.map((fill) => {
                const asset = normalizeAsset(fill.asset)

                return (
                  <tr key={fill.id}>
                    <td className="px-3 py-2 text-xs text-slate-400">
                      {formatLondonDateTime(fill.created_at)}
                    </td>
                    <td className="px-3 py-2 font-mono text-slate-100">{asset?.symbol ?? '—'}</td>
                    <td className={`px-3 py-2 font-semibold ${fill.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {fill.side.toUpperCase()}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {Number(fill.quantity).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {Number(fill.execution_price).toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-200">
                      {Number(fill.fee).toFixed(2)}
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
