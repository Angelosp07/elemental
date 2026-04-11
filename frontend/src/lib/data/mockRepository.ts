import {
  mockContracts,
  mockDashboardData,
  mockFreightRoutes,
  mockFreightVessels,
  mockMarkets,
  mockShipments,
} from '../../mocks/data'
import type { DataRepository } from './repository'

export const mockRepository: DataRepository = {
  async getProfile() {
    return { username: 'Dani' }
  },
  async getDashboardData() {
    return mockDashboardData
  },
  async getMarkets() {
    return mockMarkets
  },
  async getContracts() {
    return mockContracts
  },
  async getCargoShipments() {
    return mockShipments
  },
  async getFreightRoutes() {
    return mockFreightRoutes
  },
  async getFreightVessels() {
    return mockFreightVessels
  },
}
