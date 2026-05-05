import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { RoleBadge } from '../ui/Badge'

const NAV_BY_ROLE = {
  superadmin:   [{ to: '/superadmin', label: 'Panel super' }],
  admin_comuna: [{ to: '/admin',      label: 'Panel comuna' }],
  operador:     [{ to: '/admin',      label: 'Panel comuna' }],
  vecino:       [{ to: '/portal',     label: 'Mi portal' }],
}

export default function AppShell() {
  const { profile, comuna, role, signOut } = useAuth()
  const navigate = useNavigate()
  const nav = NAV_BY_ROLE[role] ?? []

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-card">
        <div className="flex items-center gap-6">
          <span className="text-lg font-bold text-primary">COMUNAS</span>
          {comuna?.nombre && (
            <span className="hidden text-sm text-primary-400 md:inline">{comuna.nombre}</span>
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
          <span className="hidden text-sm text-primary-700 md:inline">{profile?.full_name ?? profile?.email}</span>
          <button onClick={handleSignOut} className="btn-ghost">Salir</button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
