import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDependencias } from '../../hooks/useTurnos'
import { useAuth } from '../../context/AuthContext'

// Tipos de dependencia que tienen su propio módulo top-level —
// se EXCLUYEN de la lista "Otras dependencias" para no duplicar
// el acceso desde el sidebar.
const TIPOS_CON_MODULO_PROPIO = new Set([
  'caps', 'salud',
  'juzgado',
  'sum', 'salon',
  'intendencia', 'admin', 'comuna',
])

// Etiqueta amigable por tipo — usada en el sidebar para que tipos
// con varias deps (ej: 'educacion' → Jardín + Escuela) aparezcan
// agrupados con un solo nombre. Si el tipo no está acá, cae al
// nombre de la primera dependencia con ese tipo.
const LABEL_BY_TIPO = {
  obras:          'Obras Públicas',
  obras_publicas: 'Obras Públicas',
  deporte:        'Polideportivo',
  polideportivo:  'Polideportivo',
  cementerio:     'Cementerio',
  velatorio:      'Velatorio',
  policia:        'Delegación Policial',
  educacion:      'Educación',
  jardin:         'Jardín de Infantes',
  primaria:       'Escuela Primaria',
  secundaria:     'Escuela Secundaria',
  bienes:         'Bienes',
  ayuda_social:   'Ayuda Social',
  social:         'Ayuda Social',
}

// Tipos que se agrupan bajo el acordeón "Educación" en lugar de
// listarse en el flat. Los demás tipos siguen apareciendo
// individualmente como antes.
const EDU_TIPOS = new Set(['jardin', 'primaria', 'secundaria', 'educacion'])

const NAV = [
  {
    to: '/admin',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l9-9 9 9M5 11v9h14v-9" />
      </svg>
    ),
  },
  {
    to: '/admin/usuarios',
    label: 'Usuarios',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <circle cx="12" cy="8" r="3.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 21a7 7 0 0 1 14 0" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 5l2 2 3-3" />
      </svg>
    ),
  },
  {
    to: '/admin/crm',
    label: 'CRM Vecinal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <circle cx="9" cy="8" r="3.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0 0-6M21.5 20a4.5 4.5 0 0 0-4-4.45" />
      </svg>
    ),
  },
  {
    to: '/admin/tablero',
    label: 'Tablero turnos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <rect x="3" y="3"  width="7" height="7"  rx="1" />
        <rect x="14" y="3" width="7" height="7"  rx="1" />
        <rect x="3" y="14" width="7" height="7"  rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/admin/mensajeria',
    label: 'Mensajería',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9z" />
      </svg>
    ),
  },
  {
    to: '/admin/sala',
    label: 'Sala',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    to: '/admin/juez',
    label: 'Juez de Paz',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    ),
  },
  {
    to: '/admin/sum',
    label: 'SUM',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    ),
  },
  // Portal Web — carpeta colapsable. Antes era un solo link a
  // /admin/noticias; ahora agrupa noticias + configuración RSS
  // bajo un acordeón anidado para que el sidebar sea más
  // explorable cuando crezcan las opciones del portal.
  {
    label: 'Portal Web',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
      </svg>
    ),
    subitems: [
      { to: '/admin/noticias', label: 'Noticias' },
      { to: '/admin/config',   label: 'Configuración RSS' },
    ],
  },
  {
    // Carpeta "Administración" con subitems: el módulo financiero
    // base (gastos/ingresos/presupuesto/partidas) y el módulo de
    // rendición al Tribunal de Cuentas, alineado SARC.
    label: 'Administración',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h13M8 12h13M8 17h13M3 7h.01M3 12h.01M3 17h.01" />
        <circle cx="3" cy="7"  r="0.6" fill="currentColor" />
        <circle cx="3" cy="12" r="0.6" fill="currentColor" />
        <circle cx="3" cy="17" r="0.6" fill="currentColor" />
      </svg>
    ),
    subitems: [
      { to: '/admin/administracion', label: 'Gastos e ingresos' },
      { to: '/admin/rendicion',      label: 'Rendición de cuentas' },
    ],
  },
  {
    to: '/admin/config-general',
    label: 'Config. General',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
      </svg>
    ),
  },
]

// Item plano del sidebar (usado tanto en "Otras" como en sub-items
// de Educación, con un nivel extra de indent en el segundo caso).
function SidebarDepLink({ tipo, label, indent = false }) {
  return (
    <NavLink
      to={`/admin/dependencia/${tipo}`}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
          indent ? 'pl-7' : ''
        } ${
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
        }`
      }
    >
      <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-50" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

// Sección colapsable que lista las dependencias activas del
// municipio que NO tienen un módulo propio. Cada entrada navega
// a /admin/dependencia/<tipo>. Los tipos educativos (jardin /
// primaria / secundaria / educacion) se agrupan bajo un acordeón
// "Educación" anidado para que el sidebar no se llene con varias
// líneas para una sola "área" del municipio.
function OtrasDependenciasSection() {
  const { data: deps = [], isLoading } = useDependencias()
  const [open, setOpen] = useState(true)
  const location = useLocation()

  // Dedupe por TIPO + bucketing en dos grupos: educativos vs el
  // resto. Los educativos van al acordeón anidado.
  const { eduSubItems, otrosItems } = useMemo(() => {
    const seenTipo = new Set()
    const edu = []
    const otros = []
    for (const d of (deps ?? [])) {
      if (d.activa === false) continue
      const t = (d.tipo ?? '').toLowerCase().trim()
      if (!t) continue
      if (TIPOS_CON_MODULO_PROPIO.has(t)) continue
      if (seenTipo.has(t)) continue
      seenTipo.add(t)
      const item = { tipo: t, label: LABEL_BY_TIPO[t] ?? d.nombre }
      if (EDU_TIPOS.has(t)) edu.push(item)
      else                  otros.push(item)
    }
    edu.sort((a, b) => a.label.localeCompare(b.label))
    otros.sort((a, b) => a.label.localeCompare(b.label))
    return { eduSubItems: edu, otrosItems: otros }
  }, [deps])

  // Si la URL actual es /admin/dependencia/<tipo-edu>, el acordeón
  // de Educación arranca expandido para mostrar el sub-item activo
  // sin que el usuario tenga que abrirlo manualmente.
  const eduPathActive = useMemo(() => {
    const m = location.pathname.match(/^\/admin\/dependencia\/([^/]+)/)
    return !!(m && EDU_TIPOS.has(m[1].toLowerCase()))
  }, [location.pathname])
  const [eduOpen, setEduOpen] = useState(eduPathActive || true)

  if (isLoading) return null
  if (eduSubItems.length === 0 && otrosItems.length === 0) return null

  return (
    <div className="mt-1 border-t border-border pt-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-500 transition-colors hover:bg-primary-50"
      >
        <span>Otras dependencias</span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={'h-3 w-3 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="mt-1 flex flex-col gap-0.5">
          {/* Items planos (un tipo = un link) */}
          {otrosItems.map(d => (
            <SidebarDepLink key={d.tipo} tipo={d.tipo} label={d.label} />
          ))}

          {/* Acordeón "Educación" si hay al menos un tipo educativo */}
          {eduSubItems.length > 0 && (
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => setEduOpen(v => !v)}
                aria-expanded={eduOpen}
                className="flex w-full items-center justify-between gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary"
              >
                <span className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                  <span>Educación</span>
                </span>
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                  className={'h-3 w-3 shrink-0 transition-transform ' + (eduOpen ? 'rotate-180' : '')}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {eduOpen && (
                <div className="mt-0.5 flex flex-col gap-0.5">
                  {eduSubItems.map(d => (
                    <SidebarDepLink key={d.tipo} tipo={d.tipo} label={d.label} indent />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Carpeta colapsable del NAV — el header no navega, solo abre/
// cierra. Si la URL actual coincide con uno de los sub-items, el
// grupo arranca abierto para que el ítem activo sea visible sin
// que el usuario tenga que clickear el chevron.
function NavGroup({ label, icon, subitems }) {
  const location = useLocation()
  const hasActive = subitems.some(s => location.pathname === s.to || location.pathname.startsWith(`${s.to}/`))
  const [open, setOpen] = useState(hasActive)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-primary-500 transition-colors hover:bg-primary-50 hover:text-primary"
      >
        <span aria-hidden="true">{icon}</span>
        <span className="flex-1 text-left">{label}</span>
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          className={'h-3 w-3 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {subitems.map(s => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 pl-7 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
                }`
              }
            >
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-50" />
              <span className="truncate">{s.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

// Sección "RECURSOS" — inventario y flota. Va siempre visible para
// cualquier rol staff; el superadmin/admin_comuna también la ve.
function RecursosSection() {
  const items = [
    {
      to: '/admin/inventario',
      label: 'Inventario',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
        </svg>
      ),
    },
    {
      to: '/admin/flota',
      label: 'Flota',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 14V9l3-4h7l3 5h4a1 1 0 0 1 1 1v3M3 14h18" />
          <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
        </svg>
      ),
    },
  ]

  return (
    <div className="mt-1 border-t border-border pt-2">
      <div className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-primary-500">
        Recursos
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
              }`
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

// Sección "SUPERADMIN" — visible solo cuando el usuario tiene ese
// rol. Se monta arriba del NAV principal y agrupa las pantallas
// cross-municipio (gestión de municipios, panel global). Visualmente
// usa la paleta navy/gold para diferenciarse del NAV regular y dejar
// claro que esas rutas operan a nivel sistema.
function SuperadminSection() {
  const { hasRole } = useAuth()
  if (!hasRole('superadmin')) return null

  const items = [
    {
      to: '/superadmin/municipios',
      label: 'Municipios',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V10l4-3 3 2 3-2 4 3v11M9 21v-5h6v5M10 13h.01M14 13h.01" />
        </svg>
      ),
    },
    {
      to: '/superadmin/panel',
      label: 'Panel global',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-6" />
        </svg>
      ),
    },
  ]

  return (
    <div className="mb-2 rounded-md border border-accent-200 bg-primary-50/60 p-1.5">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-700">
        Superadmin
      </div>
      <div className="flex flex-col gap-0.5">
        {items.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-primary-700 hover:bg-white hover:text-primary'
              }`
            }
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <nav className="sticky top-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-white p-2 shadow-card lg:flex-col lg:overflow-visible">
          <SuperadminSection />
          {NAV.map(item => (
            item.subitems
              ? <NavGroup key={item.label} label={item.label} icon={item.icon} subitems={item.subitems} />
              : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
                    }`
                  }
                >
                  <span aria-hidden="true">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              )
          ))}
          {/* En desktop la sección colapsable se ve naturalmente al pie
              del nav vertical. En mobile (overflow-x scroll) puede
              quedar mezclada con los íconos top-level — aceptamos esa
              degradación para no duplicar nav layout. */}
          <div className="hidden lg:block">
            <OtrasDependenciasSection />
            <RecursosSection />
          </div>
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
