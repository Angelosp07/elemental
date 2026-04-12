import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'

export type CandleInterval = '1m' | '5m' | '15m' | '1h'

export type PriceTick = {
  createdAt: string
  price: number
}

const intervalSecondsMap: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
}

function toBucketTime(timestamp: string, interval: CandleInterval): UTCTimestamp {
  const unixSeconds = Math.floor(new Date(timestamp).getTime() / 1000)
  const intervalSeconds = intervalSecondsMap[interval]
  return Math.floor(unixSeconds / intervalSeconds) * intervalSeconds as UTCTimestamp
}

export function buildCandlesFromTicks(
  ticks: PriceTick[],
  interval: CandleInterval
): CandlestickData[] {
  const byBucket = new Map<UTCTimestamp, CandlestickData>()

  for (const tick of ticks) {
    if (!Number.isFinite(tick.price)) {
      continue
    }

    const bucketTime = toBucketTime(tick.createdAt, interval)
    const existing = byBucket.get(bucketTime)

    if (!existing) {
      byBucket.set(bucketTime, {
        time: bucketTime,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
      })
      continue
    }

    byBucket.set(bucketTime, {
      ...existing,
      high: Math.max(existing.high, tick.price),
      low: Math.min(existing.low, tick.price),
      close: tick.price,
    })
  }

  return Array.from(byBucket.values()).sort((a, b) => Number(a.time) - Number(b.time))
}

export function upsertCandleWithTick(
  candles: CandlestickData[],
  tick: PriceTick,
  interval: CandleInterval
): CandlestickData[] {
  if (!Number.isFinite(tick.price)) {
    return candles
  }

  const next = [...candles]
  const bucketTime = toBucketTime(tick.createdAt, interval)
  const last = next[next.length - 1]

  if (!last || Number(last.time) < Number(bucketTime)) {
    next.push({
      time: bucketTime,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
    })
    return next
  }

  if (Number(last.time) === Number(bucketTime)) {
    next[next.length - 1] = {
      ...last,
      high: Math.max(last.high, tick.price),
      low: Math.min(last.low, tick.price),
      close: tick.price,
    }
    return next
  }

  return next
}
