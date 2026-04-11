import { createContext, type PropsWithChildren, useContext, useMemo } from 'react'
import { createRepository } from '../lib/data/createRepository'
import type { DataRepository } from '../lib/data/repository'

const DataContext = createContext<DataRepository | undefined>(undefined)

export function DataProvider({ children }: PropsWithChildren) {
  const repository = useMemo(() => createRepository(), [])

  return <DataContext.Provider value={repository}>{children}</DataContext.Provider>
}

export function useDataRepository() {
  const repository = useContext(DataContext)

  if (!repository) {
    throw new Error('useDataRepository must be used within a DataProvider')
  }

  return repository
}
