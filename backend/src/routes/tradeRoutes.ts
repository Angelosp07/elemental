import { Router } from 'express'
import { supabase } from '../lib/supabase'

type OrderSide = 'buy' | 'sell'
type OrderType = 'market' | 'limit'
type CandleInterval = '1m' | '5m' | '15m' | '1h'

type ProfileRow = {
  id: string
  balance: number
}

type PositionRow = {
  quantity: number
  avg_entry_price: number
  realized_pnl: number | null
}

type MarketExecutionPlan = {
  nextBalance: number
  nextPositionQuantity: number
  nextAvgEntryPrice: number
  nextRealizedPnl: number
  hasExistingPosition: boolean
}

function isOrderSide(value: unknown): value is OrderSide {
  return value === 'buy' || value === 'sell'
}

function isOrderType(value: unknown): value is OrderType {
  return value === 'market' || value === 'limit'
}

function isCandleInterval(value: unknown): value is CandleInterval {
  return value === '1m' || value === '5m' || value === '15m' || value === '1h'
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

export const tradeRoutes = Router()

tradeRoutes.get('/candles', async (req, res) => {
  const assetId = req.query.assetId
  const interval = req.query.interval
  const rangeHoursRaw = req.query.rangeHours

  if (typeof assetId !== 'string' || !assetId) {
    res.status(400).json({ error: 'Missing assetId' })
    return
  }

  if (!isCandleInterval(interval)) {
    res.status(400).json({ error: 'Invalid interval' })
    return
  }

  const parsedRangeHours = Number(rangeHoursRaw)
  const rangeHours = Number.isFinite(parsedRangeHours) && parsedRangeHours > 0
    ? Math.min(parsedRangeHours, 24 * 30)
    : 12

  const fromIso = new Date(Date.now() - rangeHours * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('price_history')
    .select('price, created_at')
    .eq('asset_id', assetId)
    .gte('created_at', fromIso)
    .order('created_at', { ascending: true })
    .limit(20000)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const intervalSeconds = intervalToSeconds(interval)
  const byBucket = new Map<number, { open: number; high: number; low: number; close: number }>()

  for (const row of data ?? []) {
    const price = Number(row.price)
    const unixSeconds = Math.floor(new Date(String(row.created_at)).getTime() / 1000)

    if (!Number.isFinite(price) || !Number.isFinite(unixSeconds)) {
      continue
    }

    const bucket = Math.floor(unixSeconds / intervalSeconds) * intervalSeconds
    const existing = byBucket.get(bucket)

    if (!existing) {
      byBucket.set(bucket, { open: price, high: price, low: price, close: price })
      continue
    }

    byBucket.set(bucket, {
      open: existing.open,
      high: Math.max(existing.high, price),
      low: Math.min(existing.low, price),
      close: price,
    })
  }

  const candles = Array.from(byBucket.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([time, value]) => ({
      time,
      open: value.open,
      high: value.high,
      low: value.low,
      close: value.close,
    }))

  res.json({ data: candles })
})

tradeRoutes.get('/assets', async (_req, res) => {
  const { data, error } = await supabase
    .from('assets')
    .select('id, symbol, name')
    .order('symbol')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})

tradeRoutes.get('/orders', async (req, res) => {
  const userId = req.query.userId

  if (typeof userId !== 'string') {
    res.status(400).json({ error: 'Missing userId' })
    return
  }

  const { data, error } = await supabase
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
      asset:assets(id, symbol, name)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})

tradeRoutes.get('/fills', async (req, res) => {
  const userId = req.query.userId

  if (typeof userId !== 'string') {
    res.status(400).json({ error: 'Missing userId' })
    return
  }

  const { data, error } = await supabase
    .from('fills')
    .select(
      `
      id,
      side,
      quantity,
      execution_price,
      fee,
      created_at,
      asset:assets(id, symbol, name)
    `
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})

tradeRoutes.post('/orders', async (req, res) => {
  const {
    userId,
    assetId,
    side,
    orderType,
    quantity,
    price,
  }: {
    userId?: string
    assetId?: string
    side?: unknown
    orderType?: unknown
    quantity?: number
    price?: number
  } = req.body

  if (!userId || !assetId || !isOrderSide(side) || !isOrderType(orderType)) {
    res.status(400).json({ error: 'Invalid order payload' })
    return
  }

  if (typeof quantity !== 'number' || quantity <= 0) {
    res.status(400).json({ error: 'Quantity must be positive' })
    return
  }

  if (orderType === 'limit' && (typeof price !== 'number' || price <= 0)) {
    res.status(400).json({ error: 'Limit orders require a positive price' })
    return
  }

  let executionPrice = typeof price === 'number' ? price : 0
  const fee = 0
  let marketExecutionPlan: MarketExecutionPlan | null = null

  if (orderType === 'market') {
    const { data: latestPriceRow } = await supabase
      .from('price_history')
      .select('price')
      .eq('asset_id', assetId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    executionPrice = Number(latestPriceRow?.price ?? executionPrice)

    if (!Number.isFinite(executionPrice) || executionPrice <= 0) {
      res.status(400).json({ error: 'No valid live price available for market order' })
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, balance')
      .eq('id', userId)
      .single()

    if (profileError || !profileData) {
      res.status(500).json({ error: profileError?.message ?? 'Failed to load profile balance' })
      return
    }

    const profile = profileData as ProfileRow
    const currentBalance = Number(profile.balance ?? 0)

    const { data: existingPositionData, error: existingPositionError } = await supabase
      .from('positions')
      .select('quantity, avg_entry_price, realized_pnl')
      .eq('user_id', userId)
      .eq('asset_id', assetId)
      .maybeSingle()

    if (existingPositionError) {
      res.status(500).json({ error: existingPositionError.message })
      return
    }

    const existingPosition = (existingPositionData as PositionRow | null) ?? null
    const existingQuantity = Number(existingPosition?.quantity ?? 0)
    const existingAvgEntryPrice = Number(existingPosition?.avg_entry_price ?? 0)
    const existingRealizedPnl = Number(existingPosition?.realized_pnl ?? 0)

    if (side === 'buy') {
      const grossCost = quantity * executionPrice + fee

      if (currentBalance < grossCost) {
        res.status(400).json({ error: 'Insufficient balance for buy order' })
        return
      }

      const nextQuantity = existingQuantity + quantity
      const nextAvgEntryPrice =
        nextQuantity > 0
          ? (existingQuantity * existingAvgEntryPrice + quantity * executionPrice) / nextQuantity
          : 0

      marketExecutionPlan = {
        nextBalance: currentBalance - grossCost,
        nextPositionQuantity: nextQuantity,
        nextAvgEntryPrice,
        nextRealizedPnl: existingRealizedPnl,
        hasExistingPosition: existingPosition !== null,
      }
    } else {
      if (existingQuantity <= 0 || existingQuantity < quantity) {
        res.status(400).json({ error: 'Insufficient holdings for sell order' })
        return
      }

      const netProceeds = quantity * executionPrice - fee
      const nextQuantity = existingQuantity - quantity
      const realizedDelta = (executionPrice - existingAvgEntryPrice) * quantity

      marketExecutionPlan = {
        nextBalance: currentBalance + netProceeds,
        nextPositionQuantity: nextQuantity,
        nextAvgEntryPrice: nextQuantity > 0 ? existingAvgEntryPrice : 0,
        nextRealizedPnl: existingRealizedPnl + realizedDelta,
        hasExistingPosition: existingPosition !== null,
      }
    }
  }

  const status = orderType === 'market' ? 'filled' : 'open'

  const { data: insertedOrder, error: orderError } = await supabase
    .from('orders')
    .insert({
      user_id: userId,
      asset_id: assetId,
      side,
      order_type: orderType,
      price: executionPrice,
      quantity,
      status,
    })
    .select('id, user_id, asset_id, side, order_type, price, quantity, status, created_at')
    .single()

  if (orderError || !insertedOrder) {
    res.status(500).json({ error: orderError?.message ?? 'Failed to place order' })
    return
  }

  if (orderType === 'market') {
    const { error: fillError } = await supabase.from('fills').insert({
      user_id: userId,
      asset_id: assetId,
      side,
      quantity,
      execution_price: executionPrice,
      fee,
    })

    if (fillError) {
      res.status(500).json({ error: fillError.message })
      return
    }

    if (!marketExecutionPlan) {
      res.status(500).json({ error: 'Market execution plan missing' })
      return
    }

    const { error: balanceUpdateError } = await supabase
      .from('profiles')
      .update({ balance: marketExecutionPlan.nextBalance })
      .eq('id', userId)

    if (balanceUpdateError) {
      res.status(500).json({ error: balanceUpdateError.message })
      return
    }

    if (marketExecutionPlan.hasExistingPosition) {
      const { error: positionUpdateError } = await supabase
        .from('positions')
        .update({
          quantity: marketExecutionPlan.nextPositionQuantity,
          avg_entry_price: marketExecutionPlan.nextAvgEntryPrice,
          realized_pnl: marketExecutionPlan.nextRealizedPnl,
        })
        .eq('user_id', userId)
        .eq('asset_id', assetId)

      if (positionUpdateError) {
        res.status(500).json({ error: positionUpdateError.message })
        return
      }
    } else {
      const { error: positionInsertError } = await supabase.from('positions').insert({
        user_id: userId,
        asset_id: assetId,
        quantity: marketExecutionPlan.nextPositionQuantity,
        avg_entry_price: marketExecutionPlan.nextAvgEntryPrice,
        realized_pnl: marketExecutionPlan.nextRealizedPnl,
      })

      if (positionInsertError) {
        res.status(500).json({ error: positionInsertError.message })
        return
      }
    }
  }

  res.status(201).json({ data: insertedOrder })
})

tradeRoutes.patch('/orders/:orderId/cancel', async (req, res) => {
  const { orderId } = req.params
  const { userId }: { userId?: string } = req.body

  if (!orderId || !userId) {
    res.status(400).json({ error: 'Missing orderId or userId' })
    return
  }

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)
    .eq('user_id', userId)
    .in('status', ['open', 'pending'])
    .select('id, status')
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})
