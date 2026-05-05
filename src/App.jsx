import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'

import AuthGuard  from './components/guards/AuthGuard'
import RoleGuard  from './components/guards/RoleGuard'
import AppShell   from './components/layout/AppShell'

import Landing  from './pages/Landing'
import NotFound from './pages/NotFound'
import Login    from './pages/auth/Login'
import Register from './pages/auth/Register'

import AdminDashboard      from './pages/admin/AdminDashboard'
import PortalDashboard     from './pages/portal/PortalDashboard'
import SuperadminDashboard from './pages/superadmin/SuperadminDashboard'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

const router = createBrowserRouter([
  { path: '/',         element: <Landing /> },
  { path: '/login',    element: <Login /> },
  { path: '/register', element: <Register /> },

  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <RoleGuard roles={['admin_comuna', 'operador']} />,
            children: [
              { path: '/admin', element: <AdminDashboard /> },
            ],
          },
          {
            element: <RoleGuard roles={['vecino']} />,
            children: [
              { path: '/portal', element: <PortalDashboard /> },
            ],
          },
          {
            element: <RoleGuard roles={['superadmin']} />,
            children: [
              { path: '/superadmin', element: <SuperadminDashboard /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFound /> },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
