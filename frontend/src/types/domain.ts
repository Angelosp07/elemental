export type Profile = {
  username: string
}

export type SummaryCard = {
  label: string
  value: string
  note: string
}

export type AllocationItem = {
  symbol: string
  value: string
  percentage: number
  pnl: string
}

export type MarketRow = {
  symbol: string
  name: string
  price: string
  change: string
}

export type ContractItem = {
  id: string
  title: string
  counterparties: string
  status: 'draft' | 'signed' | 'pending'
  details: string
}

export type CargoShipment = {
  id: string
  contract: string
  route: string
  progress: number
  status: string
}

export type FreightRoute = {
  route: string
  rate: string
}

export type FreightVessel = {
  vessel: string
  class: string
  capacity: string
  eligibility: string
}

export type DashboardData = {
  summaryCards: SummaryCard[]
  allocations: AllocationItem[]
}
