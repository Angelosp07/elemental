# ELEMETAL

![ELEMETAL](https://img.shields.io/badge/ELEMETAL-Critical%20Minerals%20Trade-0f172a?style=for-the-badge)

A B2B workflow and market-infrastructure platform for physical critical minerals trade.

![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?logo=react&logoColor=0b1020)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=node.js&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Overview

ELEMETAL digitises the end-to-end physical critical minerals trade workflow, from sourcing and price discovery to contracting, quality verification, freight coordination, and shipment tracking.

Critical minerals such as Neodymium, Dysprosium, Germanium, and Gallium are still frequently traded over the phone with fragmented data, limited transparency, and weak operational visibility. ELEMETAL exists to provide a shared digital operating layer for this market.

The platform is built for mineral traders, procurement teams, and logistics brokers who need faster execution, clearer counterpart workflows, and better real-time coordination.

## Features

- **Live markets**: Real-time prices for 15 critical minerals powered by a stochastic simulation engine.
- **Trading terminal**: Buy and sell workflows supporting market and limit order types.
- **Portfolio**: Position tracking with quantity, average entry, P&L, order history, and fill history.
- **Dashboard**: Equity summary, asset allocation view, watchlist pulse, and recent activity feed.
- **Watchlist and alerts**: User watchlists with configurable price conditions and automatic alert triggers.
- **Contract suite**: Digital contracts with dual signatures, inspection milestones, document uploads, and audit events.
- **Live cargo**: Shipment tracking with an interactive Leaflet map, route progress, and milestone updates.
- **Freight desk**: Route intelligence with vessel eligibility checks and port constraint awareness.
- **User chat**: Real-time direct messaging between platform users.
- **Notifications**: In-app real-time notifications for operational and trading events.

## Architecture

```text
┌─────────────────────────────────────────────┐
│              React Frontend                  │
│         (Vite + TypeScript + Tailwind)       │
└────────────────────┬────────────────────────┘
                     │ REST + Supabase Realtime
          ┌──────────┴──────────┐
          │                     │
┌─────────▼──────────┐ ┌───────▼────────────┐
│   Express Backend   │ │      Supabase       │
│  (Node + TypeScript)│ │  Postgres + Auth    │
│  Price Engine       │ │  Realtime + Storage │
│  Order Matching     │ │  Row Level Security │
└────────────────────┘ └────────────────────┘
```

Both frontend and backend run locally in development. The frontend communicates with the Express backend via REST on `localhost:3001` and directly with Supabase via the JS client for realtime subscriptions and database reads. The backend uses the Supabase service role key for privileged operations such as price engine writes and trade-side data mutations.

### Tech stack

- **Frontend**: React 18 + TypeScript, Vite, TailwindCSS, TanStack Query, React Router DOM, Supabase JS client, Leaflet + react-leaflet + leaflet-ant-path + leaflet-geodesic, Recharts.
- **Backend**: Node.js + Express + TypeScript, Supabase (Postgres + Auth + Realtime + Storage), custom stochastic price engine (Brownian motion + Birth-Death process + Jump process), nodemon + ts-node for development.
- **Infrastructure**: Supabase for database/auth/realtime/storage, Vite for frontend local runtime, Node.js + ts-node + nodemon for backend local runtime, deployment planned post-MVP.

## Price engine

ELEMETAL uses a composite stochastic model to generate realistic market ticks for critical minerals.

- **Geometric Brownian motion** models continuous diffusion in baseline price movement.
- **Birth-death process** introduces discrete market state transitions and event-driven pressure.
- **Jump process** captures sudden discontinuities such as shocks and repricing events.
- **Scheduler cadence** runs every 2 seconds and writes ticks to `price_history`.
- **Per-asset calibration** allows each of the 15 assets to use distinct volatility and jump parameters.

## Database schema

| Table | Description |
| --- | --- |
| `profiles` | User accounts and cash balances, linked to Supabase Auth |
| `assets` | The 15 tradeable critical minerals with symbol and name |
| `price_history` | Tick-by-tick price data written by the stochastic engine |
| `orders` | Open and historical orders with type, side, and status |
| `fills` | Executed trade records with execution price and fees |
| `positions` | User holdings with quantity, avg entry price, and P&L |
| `user_watchlist` | Per-user asset watchlists |
| `user_alerts` | Price alerts with condition, target price, and auto-trigger |
| `chat_messages` | Direct messages between platform users |
| `contracts` | Physical trade contracts with dual signing and inspection |
| `contract_events` | Full audit trail of every action on a contract |
| `contract_documents` | Uploaded trade documents (CoA, BoL, Invoice etc.) |
| `notifications` | In-app notification system with realtime delivery |
| `ports` | 5 global ports with physical draft, beam, and LOA constraints |
| `freight_rates` | Indicative USD/ton rates between port pairs |
| `vessels` | 3 vessels with class, dimensions, and cargo capacity |
| `shipments` | Cargo shipments linked to contracts with live position |
| `shipment_events` | Milestone and position update history per shipment |

## Getting started

### Prerequisites

- Node.js 18+
- npm
- A Supabase account (free tier is sufficient)

### Clone the repository

```bash
git clone https://github.com/Angelosp07/stochastic-trading-engine.git
cd elemental
```

### Frontend setup

```bash
cd frontend
npm install
cp .env.example .env
# Fill in your Supabase credentials in .env
npm run dev
# Runs on localhost:5173
```

### Backend setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in your Supabase credentials in .env
npm run dev
# Runs on localhost:3001
```

### Run both together

Open two terminal windows:

```bash
# Terminal 1 — backend
cd backend && npm run dev

# Terminal 2 — frontend
cd frontend && npm run dev
```

### Supabase setup

- Create a new project at `supabase.com`.
- Run the full schema SQL from `backend/schema.sql` in the SQL Editor.
- Disable email confirmation in Authentication settings.
- The price engine starts when the backend boots and writes to `price_history` every 2 seconds.

## Environment variables

### Frontend `.env`

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Backend `.env`

```bash
PORT=3001
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

Never commit `.env` files. Use `.env.example` files as templates.

## Project structure

```text
elemental/
├── frontend/
│   ├── src/
│   │   ├── components/       # Reusable components (CargoMap, NotificationBell, ProtectedRoute)
│   │   ├── contexts/         # AuthContext
│   │   ├── lib/              # Supabase client, Leaflet icon fix
│   │   ├── pages/            # One file per route
│   │   └── utils/            # formatTime, notifications helper
│   ├── .env.example
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── engine/           # Price engine (Brownian, BirthDeath, Jump, Scheduler)
│   │   ├── routes/           # Express route handlers
│   │   └── index.ts          # Entry point
│   ├── .env.example
│   └── package.json
└── README.md
```

## API routes

### Current implemented Express routes

```text
GET    /health                                   — Health check
GET    /api/trade/assets                         — List assets
GET    /api/trade/candles                        — OHLC candles by asset and interval
GET    /api/trade/orders?userId=...              — List user orders
GET    /api/trade/fills?userId=...               — List user fills
POST   /api/trade/orders                         — Place order
POST   /api/trade/orders/:orderId/cancel         — Cancel open order
GET    /api/trade/positions?userId=...           — List positions
POST   /api/trade/positions/:positionId/close    — Close position
GET    /api/watchlist?userId=...                 — Get watchlist
POST   /api/watchlist                            — Add watchlist asset
DELETE /api/watchlist/:assetId?userId=...        — Remove watchlist asset
GET    /api/watchlist/alerts?userId=...          — Get alerts
POST   /api/watchlist/alerts                     — Create alert
PATCH  /api/watchlist/alerts/:alertId            — Update alert
DELETE /api/watchlist/alerts/:alertId?userId=... — Delete alert
```

### Public API surface targeted for post-MVP compatibility

```text
GET  /api/markets                 — All assets with latest prices (planned)
POST /api/orders                  — Place a new order (planned)
GET  /api/orders/:userId          — Get orders for a user (planned)
GET  /api/positions/:userId       — Get positions for a user (planned)
POST /api/orders/:id/close        — Close a position (planned)
```

## Roadmap

### Current MVP

- [x] Stochastic price engine with per-asset calibration
- [x] Supabase schema with row-level security on core tables
- [x] Auth with login, signup, protected routes, and auto-profile creation
- [x] Live markets page with realtime price updates
- [x] Portfolio page with positions, P&L, orders, and fills
- [x] Dashboard with equity summary, allocation, and watchlist signal
- [x] Watchlist and alerts with auto-trigger on price condition
- [x] Contract suite with dual signing, inspection milestones, document uploads, and audit trail
- [x] Live cargo with interactive Leaflet map, animated routes, and milestone tracking
- [x] Freight desk with route intelligence and vessel eligibility
- [x] User chat with realtime messaging
- [x] In-app notification system with realtime delivery

### Planned post-MVP

- [ ] Trading terminal with order placement and order matching engine
- [ ] RFQ and demand posting for buyer requirements and seller responses
- [ ] Real price data feed integration (Argus Media or SMM)
- [ ] PDF contract generation
- [ ] Counterparty reputation and trade history indicators
- [ ] Deploy frontend to Vercel
- [ ] Deploy backend to Railway
- [ ] Mobile app

## Contributing

```bash
1. Fork the repo
2. Create a feature branch: git checkout -b feature/your-feature
3. Commit your changes: git commit -m 'add your feature'
4. Push to the branch: git push origin feature/your-feature
5. Open a pull request
```

## Team

- Gupen — Co-founder, Product Lead
- Danii — Co-founder, Design & Operations Lead
- Angelo — Co-founder, Technical Lead

ELEMETAL is currently at MVP stage, built as part of a university venture.

## License

MIT
