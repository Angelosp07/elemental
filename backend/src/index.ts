import express from 'express'
import cors from 'cors'
import { startPriceEngine } from './engine/scheduler'
import { tradeRoutes } from './routes/tradeRoutes'
import { watchlistRoutes } from './routes/watchlistRoutes'

const app = express()

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://localhost:5174'],
  })
)
app.use(express.json())

app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/trade', tradeRoutes)
app.use('/api/watchlist', watchlistRoutes)

const PORT = process.env.PORT || 3001
app.listen(PORT, async () => {
  console.log(`Backend running on port ${PORT}`)
  await startPriceEngine()
})
