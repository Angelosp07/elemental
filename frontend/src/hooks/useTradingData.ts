import { useQuery } from '@tanstack/react-query'
import { useDataRepository } from '../contexts/DataContext'
import { useAuth } from '../contexts/AuthContext'

export function useProfile() {
  const repository = useDataRepository()
  const { user } = useAuth()

  return useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) {
        return null
      }

      return repository.getProfile(user.id)
    },
    enabled: Boolean(user),
  })
}

export function useDashboardData() {
  const repository = useDataRepository()

  return useQuery({
    queryKey: ['dashboard-data'],
    queryFn: repository.getDashboardData,
  })
}

export function useMarketsData() {
  const repository = useDataRepository()

  return useQuery({
    queryKey: ['markets-data'],
    queryFn: repository.getMarkets,
  })
}

export function useContractsData() {
  const repository = useDataRepository()

  return useQuery({
    queryKey: ['contracts-data'],
    queryFn: repository.getContracts,
  })
}

export function useCargoData() {
  const repository = useDataRepository()

  return useQuery({
    queryKey: ['cargo-data'],
    queryFn: repository.getCargoShipments,
  })
}

export function useFreightData() {
  const repository = useDataRepository()

  const routesQuery = useQuery({
    queryKey: ['freight-routes'],
    queryFn: repository.getFreightRoutes,
  })

  const vesselsQuery = useQuery({
    queryKey: ['freight-vessels'],
    queryFn: repository.getFreightVessels,
  })

  return { routesQuery, vesselsQuery }
}
