import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.tsx'

export function ProtectedRoute() {
  const { loading, user } = useAuth()
  const location = useLocation()
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false)
      return
    }

    const timeoutId = setTimeout(() => {
      setLoadingTimedOut(true)
    }, 2500)

    return () => clearTimeout(timeoutId)
  }, [loading])

  if (loading && !loadingTimedOut) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
