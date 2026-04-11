import type {
  CargoShipment,
  ContractItem,
  DashboardData,
  FreightRoute,
  FreightVessel,
  MarketRow,
} from '../types/domain'

export const mockDashboardData: DashboardData = {
  summaryCards: [
    { label: 'Total Equity', value: '$114,177.29', note: '+$14,177.29 P&L' },
    { label: 'Holdings Value', value: '$23,300.47', note: '7 active positions' },
    { label: 'Total Return', value: '155.41%', note: 'Realized: -$0.64' },
    { label: 'Watchlist', value: '1', note: '1 active alert' },
  ],
  allocations: [
    { symbol: 'GERM', value: '$15,201.76', percentage: 65.2, pnl: '+$14,771.17' },
    { symbol: 'DYOX', value: '$3,689.01', percentage: 15.8, pnl: '+$3,626.67' },
    { symbol: 'TANT', value: '$2,404.92', percentage: 10.3, pnl: '+$805.69' },
    { symbol: 'PROX', value: '$1,026.88', percentage: 4.4, pnl: '+$509.22' },
    { symbol: 'NDOX', value: '$460.99', percentage: 2.0, pnl: '+$449.28' },
    { symbol: 'SN99', value: '$312.99', percentage: 1.3, pnl: '+$40.62' },
  ],
}

export const mockMarkets: MarketRow[] = [
  { symbol: 'NDOX', name: 'Neodymium Oxide', price: '91.78', change: '-' },
  { symbol: 'PROX', name: 'Praseodymium Oxide', price: '101.98', change: '-' },
  { symbol: 'DYOX', name: 'Dysprosium Oxide', price: '371.55', change: '-' },
  { symbol: 'LICO3', name: 'Lithium Carbonate', price: '20.60', change: '-' },
  { symbol: 'COBM', name: 'Cobalt Metal', price: '40.51', change: '-' },
  { symbol: 'SN99', name: 'Tin 99.9%', price: '31.31', change: '-' },
  { symbol: 'GALL', name: 'Gallium 99.99%', price: '288.34', change: '-' },
]

export const mockContracts: ContractItem[] = [
  {
    id: 'CON-001',
    title: 'GALL · 350kg',
    counterparties: 'Dani ↔ Bob',
    status: 'draft',
    details: 'Purity 99.99% · $315.00/kg',
  },
  {
    id: 'CON-002',
    title: 'MNS04 · 1,000kg',
    counterparties: 'Dani ↔ Martin',
    status: 'pending',
    details: 'Purity 99.50% · $50.00/kg',
  },
  {
    id: 'CON-003',
    title: 'NDOX · 1,000kg',
    counterparties: 'Dani ↔ Angelos',
    status: 'signed',
    details: 'Purity 99.50% · $50.00/kg',
  },
]

export const mockShipments: CargoShipment[] = [
  {
    id: 'SHIP-003',
    contract: 'NDOX · Contract #3',
    route: 'NLRTM → SGSIN',
    progress: 28,
    status: 'departed',
  },
]

export const mockFreightRoutes: FreightRoute[] = [
  { route: 'NLRTM → SGSIN', rate: '$84.00 / ton' },
]

export const mockFreightVessels: FreightVessel[] = [
  {
    vessel: 'MV Rare Venture',
    class: 'Handysize',
    capacity: '28,000t',
    eligibility: 'Eligible',
  },
  {
    vessel: 'MV Cobalt Arrow',
    class: 'Supramax',
    capacity: '52,000t',
    eligibility: 'Eligible',
  },
  {
    vessel: 'MV Lithium Dawn',
    class: 'Panamax',
    capacity: '76,000t',
    eligibility: 'Eligible',
  },
]
