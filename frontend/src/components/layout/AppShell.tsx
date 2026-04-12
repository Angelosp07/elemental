import { useEffect, useState } from 'react'
import {
  Box,
  ChartCandlestick,
  Crosshair,
  Eye,
  FileText,
  LogOut,
  Ship,
  Truck,
  Wallet,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: ChartCandlestick },
  { to: '/trade', label: 'Trade', icon: Crosshair },
  { to: '/markets', label: 'Markets', icon: Box },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet },
  { to: '/watchlist', label: 'Watchlist', icon: Eye },
  { to: '/contracts', label: 'Contracts', icon: FileText },
  { to: '/cargo', label: 'Live Cargo', icon: Ship },
  { to: '/freight', label: 'Freight Desk', icon: Truck },
]

export function AppShell() {
  const navigate = useNavigate()
  const { signOut, user } = useAuth()
  const [username, setUsername] = useState('Trader')

  useEffect(() => {
    if (!user) {
      setUsername('Trader')
      return
    }

    let active = true

    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .maybeSingle()

      if (!active || error) {
        return
      }

      setUsername(data?.username ?? 'Trader')
    }

    void loadProfile()

    return () => {
      active = false
    }
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="grid min-h-screen grid-cols-[76px_1fr]">
        <aside className="border-r border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold">
            EX
          </div>

          <nav className="space-y-2">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `group flex h-10 w-10 items-center justify-center rounded-md border text-slate-300 transition ${
                    isActive
                      ? 'border-indigo-400/70 bg-indigo-500/20 text-indigo-200'
                      : 'border-slate-800 bg-slate-900 hover:border-slate-700'
                  }`
                }
                title={label}
              >
                <Icon className="h-4 w-4" />
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="flex min-h-screen flex-col">
          <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/50 px-6 py-3">
            <h1 className="text-sm font-semibold text-slate-300">ElementalX</h1>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-sm text-slate-200">
                {username}
              </span>
              <button
                onClick={handleSignOut}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
