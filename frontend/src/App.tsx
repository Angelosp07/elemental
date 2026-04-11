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
import { Freight } from './pages/Freight.tsx'
import { Login } from './pages/Login.tsx'
import { Markets } from './pages/Markets.tsx'
import { Signup } from './pages/Signup.tsx'

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
            path: 'contracts',
            element: <Contracts />,
          },
          {
            path: 'cargo',
            element: <Cargo />,
          },
          {
            path: 'freight',
            element: <Freight />,
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
