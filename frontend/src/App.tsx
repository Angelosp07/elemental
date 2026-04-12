import {
  Navigate,
  RouterProvider,
  createBrowserRouter,
} from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute.tsx'
import { AppShell } from './components/layout/AppShell.tsx'
import { Cargo } from './pages/Cargo.tsx'
import { Contracts } from './pages/Contracts.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { FreightDesk } from './pages/FreightDesk.tsx'
import { Login } from './pages/Login.tsx'
import { MetalDetail } from './pages/MetalDetail.tsx'
import { Markets } from './pages/Markets.tsx'
import { Portfolio } from './pages/Portfolio.tsx'
import { Signup } from './pages/Signup.tsx'
import { Trade } from './pages/Trade.tsx'
import { Watchlist } from './pages/Watchlist.tsx'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: <Signup />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <Dashboard />,
          },
          {
            path: 'markets',
            element: <Markets />,
          },
          {
            path: 'markets/:assetId',
            element: <MetalDetail />,
          },
          {
            path: 'portfolio',
            element: <Portfolio />,
          },
          {
            path: 'trade',
            element: <Trade />,
          },
          {
            path: 'watchlist',
            element: <Watchlist />,
          },
          {
            path: 'contracts',
            element: <Contracts />,
          },
          {
            path: 'cargo',
            element: <Cargo />,
          },
          {
            path: 'freight',
            element: <FreightDesk />,
          },
        ],
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
])

function App() {
  return <RouterProvider router={router} />
}

export default App
