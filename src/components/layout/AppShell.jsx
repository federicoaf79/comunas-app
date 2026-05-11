import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useDatosMunicipio } from '../../hooks/useConfigPortal'
import { RoleBadge } from '../ui/Badge'

const ROLE_PRIORITY = ['superadmin', 'admin_comuna', 'operador', 'vecino']

function primaryRole(roles) {
  if (!roles?.length) return null
  return ROLE_PRIORITY.find(r => roles.includes(r)) ?? roles[0]
}

// Top-nav del header. El superadmin obtiene AMBOS atajos —
// "Panel super" (su home) y "Panel comuna" (las rutas /admin/* que
// usa para ver los módulos operativos de un municipio). Sin el
// segundo el superadmin queda atrapado en /superadmin/* y solo
// puede saltar a /admin tipeando la URL a mano.
function navFor(roles) {
  const items = []
  if (roles?.includes('superadmin')) items.push({ to: '/superadmin', label: 'Panel super' })
  if (roles?.some(r => ['admin_comuna', 'operador', 'superadmin'].includes(r))) {
    items.push({ to: '/admin', label: 'Panel comuna' })
  }
  if (roles?.includes('vecino')) items.push({ to: '/portal', label: 'Mi portal' })
  return items
}

export default function AppShell() {
  const { perfil, municipio, signOut } = useAuth()
  const { identidad } = useDatosMunicipio()
  const logoUrl = identidad?.logo_url || null
  const navigate = useNavigate()
  const role = primaryRole(perfil?.roles)
  const nav = navFor(perfil?.roles)

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-card">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            {logoUrl && (
              <img
                src={logoUrl}
                alt="Logo municipio"
                className="h-8 w-8 shrink-0 rounded-full bg-primary-50 object-cover ring-1 ring-inset ring-border"
              />
            )}
            <span className="text-lg font-bold text-primary">COMUNAS</span>
          </div>
          {municipio?.nombre && (
            <span className="hidden text-sm text-primary-400 md:inline">{municipio.nombre}</span>
          )}
          <nav className="flex items-center gap-1">
            {nav.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {role && <RoleBadge role={role} />}
          <span className="hidden text-sm text-primary-700 md:inline">
            {perfil?.nombre ?? perfil?.email}
          </span>
          <button onClick={handleSignOut} className="btn-ghost">Salir</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        {/* Sin max-w fijo — el sidebar de AdminLayout queda en 224px
            (lg:w-56) y el contenido principal usa flex-1 + min-w-0
            para ocupar todo el ancho disponible. Los breakpoints muy
            anchos (>1600px) ahora aprovechan el viewport en lugar de
            dejar dos franjas grises a los costados. */}
        <div className="w-full p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
