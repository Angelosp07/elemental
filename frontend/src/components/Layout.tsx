import { Link, useLocation, useNavigate } from 'react-router-dom'
import { NotificationBell } from './NotificationBell'
import { useAuth } from '../contexts/AuthContext'
import { Button } from './ui/Button'

const navItems = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/markets', label: 'Markets' },
  { path: '/trade', label: 'Trade' },
  { path: '/portfolio', label: 'Portfolio' },
  { path: '/watchlist', label: 'Watchlist' },
  { path: '/contracts', label: 'Contracts' },
  { path: '/cargo', label: 'Cargo' },
  { path: '/freight', label: 'Freight' },
  { path: '/chat', label: 'Chat' },
]

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col">
      <header className="h-14 border-b border-white/[0.08] bg-[var(--bg-base)]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="h-full px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8 min-w-0">
            <span className="text-white font-semibold tracking-tight text-lg">ELEMETAL</span>
            <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    pathname === item.path
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <span className="text-sm text-gray-400 hidden md:inline">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 max-w-[1400px] mx-auto w-full">{children}</main>
    </div>
  )
}
