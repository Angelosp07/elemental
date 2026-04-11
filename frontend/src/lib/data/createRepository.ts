import { mockRepository } from './mockRepository'
import type { DataRepository } from './repository'
import { supabaseRepository } from './supabaseRepository'

export function createRepository(): DataRepository {
  const source = import.meta.env.VITE_DATA_SOURCE ?? 'mock'

  if (source === 'supabase') {
    return supabaseRepository
  }

  return mockRepository
}
