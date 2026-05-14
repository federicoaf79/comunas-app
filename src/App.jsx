import { createBrowserRouter, Navigate, Outlet, RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider }   from './context/AuthContext'
import { VecinoProvider } from './context/VecinoContext'

import AuthGuard   from './components/guards/AuthGuard'
import RoleGuard   from './components/guards/RoleGuard'
import VecinoGuard from './components/guards/VecinoGuard'
import AppShell    from './components/layout/AppShell'
import AdminLayout from './components/layout/AdminLayout'
import ScrollToTop from './components/utils/ScrollToTop'

import NotFound from './pages/NotFound'
import Login    from './pages/auth/Login'
import Acceso   from './pages/auth/Acceso'
import Register from './pages/auth/Register'

import AdminDashboard      from './pages/admin/AdminDashboard'
import Usuarios            from './pages/admin/Usuarios'
import CrmVecinos          from './pages/admin/CrmVecinos'
import VecinoDetail        from './pages/admin/VecinoDetail'
import TablazoCross        from './pages/admin/TablazoCross'
import Mensajeria          from './pages/admin/Mensajeria'
import SalaPrimerosAuxilios from './pages/admin/SalaPrimerosAuxilios'
import AtencionDetalle      from './pages/admin/AtencionDetalle'
import JuezDePaz           from './pages/admin/JuezDePaz'
import SUM                 from './pages/admin/SUM'
import DependenciaGeneral  from './pages/admin/DependenciaGeneral'
import Inventario          from './pages/admin/Inventario'
import Flota               from './pages/admin/Flota'
import Patrimonio          from './pages/admin/Patrimonio'
import ObrasPublicas       from './pages/admin/ObrasPublicas'
import Noticias            from './pages/admin/Noticias'
import Administracion      from './pages/admin/Administracion'
import Auditoria           from './pages/admin/Auditoria'
import Rendicion           from './pages/admin/Rendicion'
import ConfigPortal        from './pages/admin/ConfigPortal'
import ConfigGeneral       from './pages/admin/ConfigGeneral'
import PortalPublico       from './pages/portal/PortalPublico'
import NoticiasListado     from './pages/portal/NoticiasListado'
import NoticiaDetalle      from './pages/portal/NoticiaDetalle'
import DependenciaPublica  from './pages/portal/DependenciaPublica'
import SacarTurno          from './pages/portal/SacarTurno'
import MiTurno             from './pages/portal/MiTurno'
import MiSalud             from './pages/portal/MiSalud'
import VideosPage          from './pages/portal/VideosPage'
import TramitesPortal      from './pages/portal/TramitesPortal'
import HistoriaPage        from './pages/portal/HistoriaPage'
import VecinoAcceso        from './pages/portal/VecinoAcceso'
import VecinoDashboard     from './pages/portal/VecinoDashboard'
import SuperadminDashboard from './pages/superadmin/SuperadminDashboard'
import SuperadminMunicipios from './pages/superadmin/Municipios'
import SuperadminPanelGlobal from './pages/superadmin/PanelGlobal'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
})

// Wrapper top-level del árbol de rutas. ScrollToTop usa useLocation,
// que requiere estar dentro del RouterProvider — montarlo acá lo
// activa una sola vez para toda la app y resetea el scroll a 0
// en cada cambio de pathname.
function RootLayout() {
  return (
    <>
      <ScrollToTop />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
  // Rutas públicas — sin AuthGuard.
  // La raíz redirige al Portal Ciudadano — la Landing legacy
  // dejó de ser el primer punto de contacto.
  { path: '/',         element: <Navigate to="/portal" replace /> },
  { path: '/acceso',   element: <Acceso /> },
  { path: '/login',    element: <Login /> },
  { path: '/register', element: <Register /> },
  { path: '/portal',                element: <PortalPublico /> },
  // OJO: /portal/noticias va ANTES de /portal/noticias/:id para que
  // el matcher prefiera la ruta estática sobre el segmento dinámico.
  { path: '/portal/noticias',       element: <NoticiasListado /> },
  { path: '/portal/noticias/:id',   element: <NoticiaDetalle /> },
  { path: '/portal/dependencia/:tipo', element: <DependenciaPublica /> },
  { path: '/portal/turno',          element: <SacarTurno /> },
  { path: '/portal/mi-turno',       element: <MiTurno /> },
  { path: '/portal/mi-salud',       element: <MiSalud /> },
  { path: '/portal/videos',         element: <VideosPage /> },
  { path: '/portal/tramites',       element: <TramitesPortal /> },
  { path: '/portal/historia',       element: <HistoriaPage /> },

  // Portal del Vecino — área personal con sesión propia (DNI + tel)
  // independiente del auth de Supabase. La sesión vive en sessionStorage.
  { path: '/mi-cuenta/acceso', element: <VecinoAcceso /> },
  {
    element: <VecinoGuard />,
    children: [
      { path: '/mi-cuenta', element: <VecinoDashboard /> },
    ],
  },

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
                  { path: '/admin/usuarios',   element: <Usuarios /> },
                  { path: '/admin/crm',        element: <CrmVecinos /> },
                  { path: '/admin/crm/:id',    element: <VecinoDetail /> },
                  // /admin/turnos se unificó dentro del Tablero
                  // (que ya tiene filtros y vistas día/semana).
                  // Mantenemos la ruta como redirect para no romper
                  // bookmarks o links del producto anterior.
                  { path: '/admin/turnos',     element: <Navigate to="/admin/tablero" replace /> },
                  { path: '/admin/tablero',    element: <TablazoCross /> },
                  { path: '/admin/mensajeria', element: <Mensajeria /> },
                  { path: '/admin/sala',                       element: <SalaPrimerosAuxilios /> },
                  { path: '/admin/sala/atencion/:turnoId',     element: <AtencionDetalle /> },
                  { path: '/admin/juez',       element: <JuezDePaz /> },
                  { path: '/admin/sum',                  element: <SUM /> },
                  { path: '/admin/dependencia/:tipo',    element: <DependenciaGeneral /> },
                  { path: '/admin/inventario',           element: <Inventario /> },
                  { path: '/admin/flota',                element: <Flota /> },
                  { path: '/admin/patrimonio',           element: <Patrimonio /> },
                  { path: '/admin/obras-publicas',       element: <ObrasPublicas /> },
                  { path: '/admin/noticias',             element: <Noticias /> },
                  { path: '/admin/administracion', element: <Administracion /> },
                  { path: '/admin/auditoria',      element: <Auditoria /> },
                  { path: '/admin/rendicion',      element: <Rendicion /> },
                  { path: '/admin/config',         element: <ConfigPortal /> },
                  { path: '/admin/config-general', element: <ConfigGeneral /> },
                ],
              },
            ],
          },
          {
            element: <RoleGuard roles={['superadmin']} />,
            children: [
              // Las pantallas de superadmin comparten el chrome de
              // AdminLayout para tener sidebar consistente — la
              // sección "SUPERADMIN" del sidebar se muestra solo
              // cuando hasRole('superadmin') es true.
              {
                element: <AdminLayout />,
                children: [
                  { path: '/superadmin',            element: <SuperadminDashboard /> },
                  { path: '/superadmin/municipios', element: <SuperadminMunicipios /> },
                  { path: '/superadmin/panel',      element: <SuperadminPanelGlobal /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFound /> },
    ],
  },
])

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VecinoProvider>
          <RouterProvider router={router} />
        </VecinoProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
