import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.tsx'

export function ProtectedRoute() {
  const { loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">
        Loading session…
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
