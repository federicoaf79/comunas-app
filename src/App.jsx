import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'

import AuthGuard   from './components/guards/AuthGuard'
import RoleGuard   from './components/guards/RoleGuard'
import AppShell    from './components/layout/AppShell'
import AdminLayout from './components/layout/AdminLayout'

import Landing  from './pages/Landing'
import NotFound from './pages/NotFound'
import Login    from './pages/auth/Login'
import Register from './pages/auth/Register'

import AdminDashboard      from './pages/admin/AdminDashboard'
import CrmVecinos          from './pages/admin/CrmVecinos'
import VecinoDetail        from './pages/admin/VecinoDetail'
import TurnosDia           from './pages/admin/Turnos'
import Mensajeria          from './pages/admin/Mensajeria'
import SalaPrimerosAuxilios from './pages/admin/SalaPrimerosAuxilios'
import Noticias            from './pages/admin/Noticias'
import PortalPublico       from './pages/portal/PortalPublico'
import NoticiasListado     from './pages/portal/NoticiasListado'
import NoticiaDetalle      from './pages/portal/NoticiaDetalle'
import SacarTurno          from './pages/portal/SacarTurno'
import MiTurno             from './pages/portal/MiTurno'
import MiSalud             from './pages/portal/MiSalud'
import SuperadminDashboard from './pages/superadmin/SuperadminDashboard'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

const router = createBrowserRouter([
  // Rutas públicas — sin AuthGuard.
  { path: '/',         element: <Landing /> },
  { path: '/login',    element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/portal',                element: <PortalPublico /> },
  // OJO: /portal/noticias va ANTES de /portal/noticias/:id para que
  // el matcher prefiera la ruta estática sobre el segmento dinámico.
  { path: '/portal/noticias',       element: <NoticiasListado /> },
  { path: '/portal/noticias/:id',   element: <NoticiaDetalle /> },
  { path: '/portal/turno',          element: <SacarTurno /> },
  { path: '/portal/mi-turno',       element: <MiTurno /> },
  { path: '/portal/mi-salud',       element: <MiSalud /> },

  // Rutas protegidas.
  {
    element: <AuthGuard />,
    children: [
      {
        element: <AppShell />,
        children: [
          {
            element: <RoleGuard roles={['admin_comuna', 'operador']} />,
            children: [
              {
                element: <AdminLayout />,
                children: [
                  { path: '/admin',            element: <AdminDashboard /> },
                  { path: '/admin/crm',        element: <CrmVecinos /> },
                  { path: '/admin/crm/:id',    element: <VecinoDetail /> },
                  { path: '/admin/turnos',     element: <TurnosDia /> },
                  { path: '/admin/mensajeria', element: <Mensajeria /> },
                  { path: '/admin/sala',       element: <SalaPrimerosAuxilios /> },
                  { path: '/admin/noticias',   element: <Noticias /> },
                ],
              },
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
