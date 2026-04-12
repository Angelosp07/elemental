import { PriceEngine } from './priceEngine'
import { BrownianMotion } from './brownian'
import { BirthDeathProcess } from './birthDeath'
import { JumpProcess } from './jumpProcess'
import { ASSET_CONFIGS } from './assetConfigs'
import { supabase } from '../lib/supabase'

const DT = 0.5
const INTERVAL_MS = 2000

interface AssetEngine {
  assetId: string
  symbol: string
  engine: PriceEngine
}

let engines: AssetEngine[] = []
let intervalHandle: NodeJS.Timeout | null = null

async function loadAssetIds(): Promise<void> {
  const { data, error } = await supabase
    .from('assets')
    .select('id, symbol')

  if (error || !data) {
    console.error('[PriceEngine] Failed to load assets:', error)
    return
  }

  engines = data
    .map((row: { id: string; symbol: string }) => {
      const config = ASSET_CONFIGS.find(c => c.symbol === row.symbol)
      if (!config) return null

      const engine = new PriceEngine(
        config.initialPrice,
        new BrownianMotion(config.mu, config.sigma),
        new BirthDeathProcess(config.lambdaBirth, config.lambdaDeath),
        new JumpProcess(config.jumpUp, config.jumpDown),
      )

      return { assetId: row.id, symbol: row.symbol, engine }
    })
    .filter(Boolean) as AssetEngine[]

  console.log(`[PriceEngine] Loaded ${engines.length} asset engines`)
}

async function tick(): Promise<void> {
  if (engines.length === 0) return

  const rows = engines.map(({ assetId, engine }) => ({
    asset_id: assetId,
    price: parseFloat(engine.step(DT).toFixed(4)),
  }))

  const { error } = await supabase.from('price_history').insert(rows)
  if (error) console.error('[PriceEngine] Insert error:', error.message)
}

export async function startPriceEngine(): Promise<void> {
  await loadAssetIds()
  if (engines.length === 0) {
    console.warn('[PriceEngine] No engines loaded — skipping start')
    return
  }
  intervalHandle = setInterval(tick, INTERVAL_MS)
  console.log(`[PriceEngine] Running — ticking every ${INTERVAL_MS}ms`)
}

export function stopPriceEngine(): void {
  if (intervalHandle) clearInterval(intervalHandle)
  console.log('[PriceEngine] Stopped')
}
