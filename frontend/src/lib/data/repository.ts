import type {
  CargoShipment,
  ContractItem,
  DashboardData,
  FreightRoute,
  FreightVessel,
  MarketRow,
  Profile,
} from '../../types/domain'

export type DataRepository = {
  getProfile: (userId: string) => Promise<Profile | null>
  getDashboardData: () => Promise<DashboardData>
  getMarkets: () => Promise<MarketRow[]>
  getContracts: () => Promise<ContractItem[]>
  getCargoShipments: () => Promise<CargoShipment[]>
  getFreightRoutes: () => Promise<FreightRoute[]>
  getFreightVessels: () => Promise<FreightVessel[]>
}
