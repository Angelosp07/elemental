import { Router } from 'express'
import { supabase } from '../lib/supabase'

type AlertConditionType = 'above' | 'below' | 'pct_move'

type AlertConditionMeta = {
  type: AlertConditionType
  oneShot: boolean
}

function encodeAlertCondition(meta: AlertConditionMeta): string {
  return `${meta.type}:${meta.oneShot ? 'one_shot' : 'persistent'}`
}

function decodeAlertCondition(raw: string): AlertConditionMeta {
  const [typePart, modePart] = raw.split(':')
  const normalizedType: AlertConditionType =
    typePart === 'above' || typePart === 'below' || typePart === 'pct_move'
      ? typePart
      : 'above'

  return {
    type: normalizedType,
    oneShot: modePart === 'one_shot',
  }
}

function isAlertConditionType(value: unknown): value is AlertConditionType {
  return value === 'above' || value === 'below' || value === 'pct_move'
}

export const watchlistRoutes = Router()

watchlistRoutes.get('/', async (req, res) => {
  const userId = req.query.userId

  if (typeof userId !== 'string') {
    res.status(400).json({ error: 'Missing userId' })
    return
  }

  const { data, error } = await supabase
    .from('user_watchlist')
    .select('asset:assets(id, symbol, name)')
    .eq('user_id', userId)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})

watchlistRoutes.post('/', async (req, res) => {
  const { userId, assetId }: { userId?: string; assetId?: string } = req.body

  if (!userId || !assetId) {
    res.status(400).json({ error: 'Missing userId or assetId' })
    return
  }

  const { data, error } = await supabase
    .from('user_watchlist')
    .upsert(
      {
        user_id: userId,
        asset_id: assetId,
      },
      {
        onConflict: 'user_id,asset_id',
      }
    )
    .select('asset_id')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json({ data })
})

watchlistRoutes.delete('/:assetId', async (req, res) => {
  const userId = req.query.userId
  const { assetId } = req.params

  if (typeof userId !== 'string' || !assetId) {
    res.status(400).json({ error: 'Missing userId or assetId' })
    return
  }

  const { error } = await supabase
    .from('user_watchlist')
    .delete()
    .eq('user_id', userId)
    .eq('asset_id', assetId)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(204).send()
})

watchlistRoutes.get('/alerts', async (req, res) => {
  const userId = req.query.userId

  if (typeof userId !== 'string') {
    res.status(400).json({ error: 'Missing userId' })
    return
  }

  const { data, error } = await supabase
    .from('user_alerts')
    .select('id, condition, target_price, is_active, asset:assets(id, symbol, name)')
    .eq('user_id', userId)
    .order('id', { ascending: false })

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  const transformed = (data ?? []).map((row) => {
    const normalized = decodeAlertCondition(String(row.condition ?? 'above:persistent'))

    return {
      id: row.id,
      type: normalized.type,
      oneShot: normalized.oneShot,
      targetPrice: Number(row.target_price ?? 0),
      isActive: Boolean(row.is_active),
      asset: row.asset,
    }
  })

  res.json({ data: transformed })
})

watchlistRoutes.post('/alerts', async (req, res) => {
  const {
    userId,
    assetId,
    type,
    targetPrice,
    oneShot,
  }: {
    userId?: string
    assetId?: string
    type?: unknown
    targetPrice?: number
    oneShot?: boolean
  } = req.body

  if (!userId || !assetId || !isAlertConditionType(type) || typeof targetPrice !== 'number') {
    res.status(400).json({ error: 'Invalid alert payload' })
    return
  }

  const { data, error } = await supabase
    .from('user_alerts')
    .insert({
      user_id: userId,
      asset_id: assetId,
      condition: encodeAlertCondition({ type, oneShot: Boolean(oneShot) }),
      target_price: targetPrice,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(201).json({ data })
})

watchlistRoutes.patch('/alerts/:alertId', async (req, res) => {
  const { alertId } = req.params
  const {
    userId,
    type,
    targetPrice,
    oneShot,
    isActive,
  }: {
    userId?: string
    type?: unknown
    targetPrice?: number
    oneShot?: boolean
    isActive?: boolean
  } = req.body

  if (!alertId || !userId) {
    res.status(400).json({ error: 'Missing alertId or userId' })
    return
  }

  const updates: Record<string, unknown> = {}

  if (typeof targetPrice === 'number') {
    updates.target_price = targetPrice
  }

  if (typeof isActive === 'boolean') {
    updates.is_active = isActive
  }

  if (isAlertConditionType(type)) {
    updates.condition = encodeAlertCondition({ type, oneShot: Boolean(oneShot) })
  }

  const { data, error } = await supabase
    .from('user_alerts')
    .update(updates)
    .eq('id', alertId)
    .eq('user_id', userId)
    .select('id')
    .single()

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json({ data })
})

watchlistRoutes.delete('/alerts/:alertId', async (req, res) => {
  const userId = req.query.userId
  const { alertId } = req.params

  if (typeof userId !== 'string' || !alertId) {
    res.status(400).json({ error: 'Missing userId or alertId' })
    return
  }

  const { error } = await supabase
    .from('user_alerts')
    .delete()
    .eq('id', alertId)
    .eq('user_id', userId)

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.status(204).send()
})
