import {
  mockContracts,
  mockDashboardData,
  mockFreightRoutes,
  mockFreightVessels,
  mockMarkets,
  mockShipments,
} from '../../mocks/data'
import { supabase } from '../supabase'
import type { DataRepository } from './repository'

export const supabaseRepository: DataRepository = {
  async getProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', userId)
      .single()

    return data ?? null
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
