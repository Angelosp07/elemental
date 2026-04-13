import { Outlet } from 'react-router-dom'
import { Layout } from '../Layout'

export function AppShell() {
  return <Layout><Outlet /></Layout>
}
