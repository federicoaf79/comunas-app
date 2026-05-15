import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabasePublic } from '../../lib/supabase'
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

  // Logo institucional — query DIRECTA a configuracion_portal con
  // supabasePublic (anon, sin lock de auth), igual que el Header
  // del portal. No pasa por useDatosMunicipio()/bundle, que venía
  // fallando en devolver identidad_visual.
  const municipioId = municipio?.id ?? null
  const [logoUrl, setLogoUrl]     = useState(null)
  const [logoError, setLogoError] = useState(false)

  useEffect(() => {
    let cancel = false
    let q = supabasePublic
      .from('configuracion_portal')
      .select('valor')
      .eq('clave', 'identidad_visual')
      .limit(1)
    if (municipioId) q = q.eq('municipio_id', municipioId)
    q.maybeSingle().then(({ data }) => {
      if (cancel) return
      setLogoUrl(data?.valor?.logo_url || null)
      setLogoError(false)
    })
    return () => { cancel = true }
  }, [municipioId])

  const mostrarLogo = !!logoUrl && !logoError

  async function handleSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border bg-white px-6 py-3 shadow-card">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            {mostrarLogo && (
              // 40px de alto, object-contain, w-auto: el logo
              // municipal suele ser rectangular. max-w para no
              // empujar el nav del topbar. onError degrada a solo
              // "COMUNAS" si la imagen 404 (bucket no público).
              <img
                src={logoUrl}
                alt="Logo municipio"
                onError={() => setLogoError(true)}
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
