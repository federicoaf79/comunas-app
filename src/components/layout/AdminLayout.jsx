import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useDependencias } from '../../hooks/useTurnos'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useModulosActivos } from '../../hooks/useModulos'

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
    modulo: 'usuarios',
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
    modulo: 'crm_vecinal',
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
    modulo: 'tablero_turnos',
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
    modulo: 'mensajeria',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9z" />
      </svg>
    ),
  },
  {
    to: '/admin/sala',
    label: 'Sala',
    modulo: 'sala_pa',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    to: '/admin/juez',
    label: 'Juez de Paz',
    modulo: 'juez_paz',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    ),
  },
  {
    to: '/admin/sum',
    label: 'SUM',
    modulo: 'sum',
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
    modulo: 'portal_web',
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
]

// Sección "pie" del sidebar — va después de las dependencias y la
// sección Recursos, separada por una línea fina. Concentra las
// operaciones cross-municipales (Administración consolidada y
// configuración global) que NO son específicas de una dependencia.
const NAV_FOOTER = [
  {
    // Carpeta "Administración" con subitems: el módulo financiero
    // base (gastos/ingresos/presupuesto/partidas) y el módulo de
    // rendición al Tribunal de Cuentas, alineado SARC.
    label: 'Administración',
    modulo: 'administracion',
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
      { to: '/admin/rendicion',      label: 'Rendición de cuentas', modulo: 'rendicion' },
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

// Ícono por tipo de dependencia para el sidebar. Cada tipo tiene su
// glifo propio; los que no matchean caen al cuadrado genérico. El
// criterio es el mismo que el del Portal Público (ServiciosSection)
// para que la identidad visual sea consistente entre admin y portal.
function iconForDepTipo(tipo) {
  const t = (tipo ?? '').toLowerCase()
  const cls = 'h-4 w-4'
  const base = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: '2', 'aria-hidden': 'true', className: cls,
  }

  // Salud / Sala — cruz dentro de círculo.
  if (/caps|salud|sala/.test(t)) return (
    <svg {...base}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 8v8M8 12h8" /></svg>
  )
  // Juzgado / Juez de Paz — balanza.
  if (/juzgado|paz|justicia/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" /></svg>
  )
  // SUM / salón — edificio con techo a dos aguas.
  if (/sum|sal[oó]n|cultural/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>
  )
  // Social / Ayuda Social — manos abiertas / corazón.
  if (/social|ayuda|familia|comunidad|asisten/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" /></svg>
  )
  // Obras Públicas — casco de construcción con herramienta.
  if (/obra|construc|infra|catastro/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M9 7v4M15 7v4M9 11h6" /></svg>
  )
  // Deporte / Polideportivo — pelota.
  if (/deport|polideport|recreaci/.test(t)) return (
    <svg {...base}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
  )
  // Cementerio — cruz/lápida.
  if (/cementerio|necr/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M8 21v-9a4 4 0 0 1 8 0v9M12 8V4M10 6h4M5 21h14" /></svg>
  )
  // Velatorio — llama de vela.
  if (/velatorio|despedida|f[uú]nebre/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3c2 3 4 5 4 8a4 4 0 0 1-8 0c0-3 2-5 4-8zM8 21h8M10 18h4" /></svg>
  )
  // Educación — libro abierto.
  if (/educ|escuel|jardi|primaria|secundaria|biblioteca/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H3V5zM21 5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7V5z" /></svg>
  )
  // Alumbrado Público — rayo / electricidad.
  if (/alumbrado|elect/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
  )
  // Espacios Verdes / jardín — hoja.
  if (/verde|jardin|parque|plaza/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 6-3 16-9 16zM4 20l6-6" /></svg>
  )
  // Policía / Delegación Policial — escudo.
  if (/polic|seguridad|defensa/.test(t)) return (
    <svg {...base}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" /></svg>
  )
  // Bienes / catastro — edificio con ventanas.
  if (/bienes|inmueble|patrim/.test(t)) return (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="1.5" /><path strokeLinecap="round" d="M9 9h.01M15 9h.01M9 13h.01M15 13h.01M9 17h.01M15 17h.01" /></svg>
  )
  // Default — cuadrado genérico (edificio simple).
  return (
    <svg {...base}><rect x="4" y="4" width="16" height="16" rx="2" /><path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" /></svg>
  )
}

// Item del sidebar para una dependencia dinámica — visualmente
// idéntico a los NavLinks fijos del NAV (Sala, Juez de Paz, SUM):
// mismo padding (py-2), ícono propio según el tipo, y sin bullet.
function SidebarDepLink({ tipo, label }) {
  return (
    <NavLink
      to={`/admin/dependencia/${tipo}`}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
        }`
      }
    >
      <span aria-hidden="true">{iconForDepTipo(tipo)}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

// Lista plana de dependencias activas del municipio que NO tienen
// un módulo propio. Sin header, sin separador previo y sin grupos
// anidados — todas las dependencias aparecen como NavLinks
// consecutivos en el nav principal, al mismo nivel que el resto.
function DependenciasFlat() {
  const { data: deps = [], isLoading } = useDependencias()

  // Dedupe por TIPO + orden alfabético. Mantenemos la exclusión de
  // los tipos que ya tienen módulo top-level (Sala/Juez/SUM/etc).
  const items = useMemo(() => {
    const seenTipo = new Set()
    const out = []
    for (const d of (deps ?? [])) {
      if (d.activa === false) continue
      const t = (d.tipo ?? '').toLowerCase().trim()
      if (!t) continue
      if (TIPOS_CON_MODULO_PROPIO.has(t)) continue
      if (seenTipo.has(t)) continue
      seenTipo.add(t)
      out.push({ tipo: t, label: LABEL_BY_TIPO[t] ?? d.nombre })
    }
    out.sort((a, b) => a.label.localeCompare(b.label))
    return out
  }, [deps])

  if (isLoading || items.length === 0) return null

  return (
    <div className="flex flex-col gap-0.5">
      {items.map(d => (
        <SidebarDepLink key={d.tipo} tipo={d.tipo} label={d.label} />
      ))}
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

// Sección "RECURSOS" — inventario y flota. Gateada por modulos_config
// (`inventario` / `flota`) — si ninguno está activo la sección
// completa se oculta para no dejar un header solitario.
function RecursosSection({ tieneModulo }) {
  const allItems = [
    {
      to: '/admin/inventario',
      label: 'Inventario',
      modulo: 'inventario',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8" />
        </svg>
      ),
    },
    {
      to: '/admin/flota',
      label: 'Flota',
      modulo: 'flota',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 14V9l3-4h7l3 5h4a1 1 0 0 1 1 1v3M3 14h18" />
          <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
        </svg>
      ),
    },
  ]
  const items = allItems.filter(it => tieneModulo(it.modulo))
  if (items.length === 0) return null

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
  // Gating dinámico por módulos contratados. Cada item del NAV
  // declara su `modulo` — si no existe en modulos_config (o la
  // tabla todavía está vacía para el municipio), tieneModulo cae
  // a true para no romper la navegación legacy.
  const municipioId = useEffectiveMunicipioId()
  const { data: modulos } = useModulosActivos(municipioId)
  const tieneModulo = useMemo(() => {
    const set = new Set((modulos ?? []).map(m => m.modulo))
    return (mod) => {
      if (!mod) return true
      if (!modulos || modulos.length === 0) return true
      return set.has(mod)
    }
  }, [modulos])

  // Filtramos el NAV nivel-1 y, para los grupos con subitems, los
  // subitems que también tienen `modulo`. Un grupo se oculta si su
  // módulo principal está apagado o si quedó sin subitems visibles.
  // Mismo filtro aplica al NAV_FOOTER (Administración + Config General).
  const navFiltrado = useMemo(() => NAV.map(item => {
    if (!tieneModulo(item.modulo)) return null
    if (!item.subitems) return item
    const subs = item.subitems.filter(s => !s.modulo || tieneModulo(s.modulo))
    if (subs.length === 0) return null
    return { ...item, subitems: subs }
  }).filter(Boolean), [tieneModulo])

  const navFiltradoFooter = useMemo(() => NAV_FOOTER.map(item => {
    if (!tieneModulo(item.modulo)) return null
    if (!item.subitems) return item
    const subs = item.subitems.filter(s => !s.modulo || tieneModulo(s.modulo))
    if (subs.length === 0) return null
    return { ...item, subitems: subs }
  }).filter(Boolean), [tieneModulo])

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        {/* En mobile: nav horizontal con scroll-x (los chips de cada
            sección desfilan a lo ancho). En desktop: nav vertical
            con scroll-y propio acotado al alto del viewport — sin
            esto, con muchas dependencias o pantallas chicas el nav
            crecía más allá de la altura visible y los últimos items
            quedaban inaccesibles sin scrollear la página entera. */}
        <nav className="sticky top-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-white p-2 shadow-card lg:flex-col lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:overflow-x-hidden">
          <SuperadminSection />
          {navFiltrado.map(item => (
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
          {/* En desktop:
              1) dependencias dinámicas como lista plana (sin header
                 "Otras dependencias") siguiendo el NAV.
              2) Sección RECURSOS (Inventario / Flota).
              3) Separador fino.
              4) NAV_FOOTER (Administración + Config. General).
              En mobile aceptamos la degradación (el overflow-x mezcla
              los chips) — el sidebar pasa a horizontal igual. */}
          <div className="hidden lg:block">
            <DependenciasFlat />
            <RecursosSection tieneModulo={tieneModulo} />
          </div>
          {navFiltradoFooter.length > 0 && (
            <div className="mt-1 hidden border-t border-border pt-2 lg:block">
              {navFiltradoFooter.map(item => (
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
            </div>
          )}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
