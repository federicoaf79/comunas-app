import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLogoMunicipio } from '../../hooks/useLogoMunicipio'
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
  const navigate = useNavigate()
  const role = primaryRole(perfil?.roles)
  const nav = navFor(perfil?.roles)

  // Logo institucional — hook compartido (mismo que el Header del
  // portal y PortalFormPage). Query directa con supabasePublic,
  // independiente del bundle/useDatosMunicipio que venían fallando.
  const { logoUrl } = useLogoMunicipio()

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-white px-6 py-3 shadow-card">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            {logoUrl && (
              // 40px de alto, object-contain, w-auto: el logo
              // municipal suele ser rectangular. max-w para no
              // empujar el nav del topbar. onError lo oculta si la
              // imagen 404 — queda solo el texto "COMUNAS" (el
              // admin no tiene Escudo de fallback).
              <img
                src={logoUrl}
                alt="Logo municipio"
                onError={(e) => { e.currentTarget.style.display = 'none' }}
                className="h-10 w-auto max-w-[140px] shrink-0 object-contain"
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

      <div
        className="flex flex-1"
        style={{
          display: 'flex',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}
      >
        <Outlet />
      </div>
    </div>
  )
}
