import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { useDependencias } from '../../hooks/useTurnos'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useModulosActivos } from '../../hooks/useModulos'
import { useDependenciasAdmin } from '../../hooks/useDependenciaPublica'

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
  obras:                'Obras Públicas',
  obras_publicas:       'Obras Públicas',
  deporte:              'Polideportivo',
  polideportivo:        'Polideportivo',
  cementerio:           'Cementerio',
  velatorio:            'Velatorio',
  policia:              'Delegación Policial',
  policial:             'Delegación Policial',
  delegacion_policial:  'Delegación Policial',
  educacion:            'Educación',
  educacion_sec:        'Educación Secundaria',
  escuela:              'Escuela',
  jardin:               'Jardín de Infantes',
  jardin_infantes:      'Jardín de Infantes',
  primaria:             'Escuela Primaria',
  secundaria:           'Escuela Secundaria',
  bienes:               'Bienes',
  ayuda_social:         'Ayuda Social',
  social:               'Ayuda Social',
}

// NAV_TOP — links planos del header del sidebar. Dashboard +
// herramientas cross-municipales que no son específicas de una
// dependencia. Sala / Juez / SUM ahora viven en CIC con NavGroups.
const NAV_TOP = [
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
]

// CIC_BLUEPRINT — dependencias del CIC con módulo dedicado. Cada
// una se renderiza como NavGroup con sus sub-items propios.
// `tipo` debe coincidir con la fila de `dependencias` para poder
// resolver el dep.id y leer permisos del perfil.
const CIC_BLUEPRINT = [
  { tipo: 'caps',    label: 'Sala PA',      basePath: '/admin/sala',                modulo: 'sala_pa',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  { tipo: 'juzgado', label: 'Juez de Paz',  basePath: '/admin/juez',                modulo: 'juez_paz',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    ),
  },
  { tipo: 'sum',     label: 'SUM',          basePath: '/admin/sum',                 modulo: 'sum',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    ),
  },
  { tipo: 'social',  label: 'Ayuda Social', basePath: '/admin/dependencia/social',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" />
      </svg>
    ),
  },
]

// Tipos que viven en CIC — se excluyen de DEPENDENCIAS dinámicas
// para no duplicar la entrada.
const TIPOS_CIC = new Set(['caps', 'salud', 'sala', 'juzgado', 'sum', 'salon', 'social', 'ayuda_social'])

// Tipos solo-informativos — un solo link al detalle, sin gestión
// ni administración. Se renderizan al final del bloque DEPENDENCIAS
// bajo un mini-rótulo "Solo información" para diferenciarlos de las
// dependencias operativas. No verificamos permisos por dep para
// estos (son informativos en el sidebar).
const TIPOS_INFO_ONLY = new Set([
  'policia', 'policial', 'delegacion_policial',
  'educacion', 'educacion_sec', 'escuela',
  'jardin', 'jardin_infantes',
  'primaria', 'secundaria',
])

// Tipos cuyo módulo ya ES "Administración Municipal" — no tienen
// sentido tener un sub-item "Administración" porque eso es la
// página completa. Solo se renderiza el sub-item "Gestión".
const TIPOS_SIN_ADMIN_TAB = new Set(['admin', 'administracion', 'intendencia', 'comuna'])

// Sub-items por NavGroup de cada tipo de dependencia. `kind`
// determina si el subitem se filtra por puede_gestionar o
// puede_administrar al renderizar.
function subitemsParaTipo(tipo, basePath) {
  const t = (tipo ?? '').toLowerCase()
  if (TIPOS_SIN_ADMIN_TAB.has(t)) {
    return [
      { to: basePath, label: 'Información', kind: 'gestion' },
    ]
  }
  if (t === 'caps' || t === 'salud' || t === 'sala') {
    return [
      { to: basePath,                  label: 'Agenda',          kind: 'gestion' },
      { to: `${basePath}?tab=admin`,   label: 'Administración', kind: 'admin' },
    ]
  }
  if (t === 'juzgado') {
    return [
      { to: basePath,                            label: 'Información',     kind: 'gestion' },
      { to: `${basePath}?tab=expedientes`,       label: 'Expedientes',     kind: 'gestion' },
      { to: `${basePath}?tab=landing`,           label: 'Landing pública', kind: 'gestion' },
      { to: `${basePath}?tab=admin`,             label: 'Administración',  kind: 'admin' },
    ]
  }
  if (t === 'sum') {
    return [
      { to: basePath,                        label: 'Reservas',        kind: 'gestion' },
      { to: `${basePath}?tab=landing`,       label: 'Landing pública', kind: 'gestion' },
      { to: `${basePath}?tab=admin`,         label: 'Administración',  kind: 'admin' },
    ]
  }
  if (t === 'social' || t === 'ayuda_social') {
    return [
      { to: basePath,                        label: 'Beneficiarios',   kind: 'gestion' },
      { to: `${basePath}?tab=landing`,       label: 'Landing pública', kind: 'gestion' },
      { to: `${basePath}?tab=admin`,         label: 'Administración',  kind: 'admin' },
    ]
  }
  // Dependencias dinámicas genéricas
  return [
    { to: basePath,                        label: 'Información',     kind: 'gestion' },
    { to: `${basePath}?tab=landing`,       label: 'Landing pública', kind: 'gestion' },
    { to: `${basePath}?tab=admin`,         label: 'Administración',  kind: 'admin' },
  ]
}

// NAV_GESTION — sección "Gestión Municipal" al pie del sidebar.
// Portal Web + Administración con su nueva estructura ampliada
// (Inventario y Flota viven adentro de Administración ahora) +
// Config General como link plano.
const NAV_GESTION = [
  {
    label: 'Portal Web',
    modulo: 'portal_web',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
      </svg>
    ),
    subitems: [
      { to: '/admin/noticias',                  label: 'Noticias' },
      { to: '/admin/config',                    label: 'Configuración RSS' },
      { to: '/admin/config?tab=autoridades',    label: 'Autoridades' },
      { to: '/admin/config?tab=historia',       label: 'Historia' },
      { to: '/admin/config?tab=dependencias',   label: 'Dependencias' },
      { to: '/admin/config?tab=hero',           label: 'Slides del Hero' },
      { to: '/admin/config?tab=tramites',       label: 'Trámites del portal' },
    ],
  },
  {
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
      { to: '/admin/administracion',                 label: 'Gastos e ingresos' },
      { to: '/admin/administracion?tab=solicitudes', label: 'Solicitudes' },
      { to: '/admin/rendicion',                      label: 'Rendición',  modulo: 'rendicion' },
      { to: '/admin/inventario',                     label: 'Inventario', modulo: 'inventario' },
      { to: '/admin/flota',                          label: 'Flota',      modulo: 'flota' },
      { to: '/admin/patrimonio',                     label: 'Patrimonio', modulo: 'patrimonio' },
      { to: '/admin/obras-publicas',                 label: 'Obras públicas' },
    ],
  },
  {
    // Sin `modulo`: Auditoría siempre disponible para admin_comuna /
    // superadmin. La página interna ya muestra AccessDenied a otros
    // roles, así que no hace falta gating extra desde modulos_config.
    to: '/admin/auditoria',
    label: 'Auditoría',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M9 8h6M5 21V5a2 2 0 0 1 2-2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      </svg>
    ),
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
  {
    to: '/admin/dependencias',
    label: 'Dependencias',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    to: '/admin/importador',
    label: 'Importador',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
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
//
// Gating por dependencias_acceso del perfil:
//   - admin_comuna / superadmin → ven todas las dependencias (es el
//     comportamiento default — no se filtra).
//   - Otros roles → solo ven las dependencias cuyo `id` aparece en
//     perfil.dependencias_acceso[].dependencia_id. Si el array está
//     vacío o no existe, no muestran ninguna.
// Parsea `to` en { path, tab }. `/admin/juez?tab=expedientes` →
// { path: '/admin/juez', tab: 'expedientes' }. Sin query → tab null.
function parseSubTo(to) {
  const [path, query] = (to ?? '').split('?')
  const tab = query ? new URLSearchParams(query).get('tab') : null
  return { path, tab }
}

// Carpeta del NAV con dos comportamientos:
//   - Desktop (lg+): header colapsable inline. El chevron abre/cierra
//     y los sub-items se renderizan debajo. El grupo arranca abierto
//     si alguno de sus sub-items está activo.
//   - Mobile (< lg): se degrada a un NavLink plano que navega al
//     primer sub-item. Sin chevron, sin expansión, sin dropdown
//     flotante (el sidebar mobile es un scroll horizontal de chips).
//
// Active state EXACTO por sub-item:
//   /admin/juez?tab=expedientes está activo solo si pathname coincide
//   exactamente Y el ?tab actual coincide. Para sub-items sin ?tab,
//   se exige que NO haya ?tab en la URL (sino "Agenda" y
//   "Administración" matchearían ambos en /admin/sala).
function NavGroup({ label, icon, subitems }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const currentTab = searchParams.get('tab')

  const isSubActive = (subTo) => {
    const { path, tab } = parseSubTo(subTo)
    if (location.pathname !== path) return false
    return tab ? currentTab === tab : !currentTab
  }

  const hasActive = subitems.some(s => isSubActive(s.to))
  const [open, setOpen] = useState(hasActive)
  const firstSubTo = subitems[0]?.to ?? '#'

  return (
    <>
      {/* Mobile: link plano al primer sub-item. */}
      <NavLink
        to={firstSubTo}
        className={
          `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors lg:hidden ${
            hasActive
              ? 'bg-primary text-white shadow-sm'
              : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
          }`
        }
      >
        <span aria-hidden="true">{icon}</span>
        <span className="truncate">{label}</span>
      </NavLink>

      {/* Desktop: header colapsable + sub-items inline. */}
      <div className="hidden lg:block">
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
            {subitems.map(s => {
              const active = isSubActive(s.to)
              return (
                <NavLink
                  key={s.to}
                  to={s.to}
                  end={s.end}
                  className={
                    `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-1.5 pl-7 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
                    }`
                  }
                >
                  <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-current opacity-50" />
                  <span className="truncate">{s.label}</span>
                </NavLink>
              )
            })}
          </div>
        )}
      </div>
    </>
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
      to: '/superadmin/dominios',
      label: 'Dominios',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
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

// Grupo de sidebar para el módulo genérico de gestión de
// dependencias (DependenciaGestion, ruta /admin/dependencia-gestion/:id).
// Aislado a propósito: hace su propia query y NO toca la lógica
// de dependencias por :tipo existente más abajo. Lista las
// dependencias activas del municipio que NO tienen módulo propio
// (excluye sala PA, juzgado, SUM, administración, obras).
const TIPOS_GESTION_EXCLUIDOS = new Set([
  ...TIPOS_CON_MODULO_PROPIO,
  'obras', 'obras_publicas',
])

function DependenciasGestionNav() {
  const municipioId = useEffectiveMunicipioId()
  const { data: deps = [] } = useDependenciasAdmin({ municipioIdOverride: municipioId })

  const items = (deps ?? [])
    .filter(d => d?.activa !== false)
    .filter(d => !TIPOS_GESTION_EXCLUIDOS.has((d.tipo ?? '').toLowerCase()))
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))

  if (items.length === 0) return null

  return (
    <>
      <Rotulo>Dependencias</Rotulo>
      {items.map(d => (
        <FlatNavLink
          key={d.id}
          to={`/admin/dependencia-gestion/${d.id}`}
          label={d.nombre}
        />
      ))}
    </>
  )
}

// Rótulo separador entre secciones del sidebar.
function Rotulo({ children }) {
  return (
    <div className="hidden px-3 pb-1 pt-4 lg:block">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C] opacity-70">
        {children}
      </span>
    </div>
  )
}

// NavLink plano del sidebar — extracto para reusar entre NAV_TOP,
// info-only deps y NAV_GESTION sin duplicar las clases largas.
function FlatNavLink({ to, label, icon, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? 'bg-primary text-white shadow-sm'
            : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
        }`
      }
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      <span>{label}</span>
    </NavLink>
  )
}

export default function AdminLayout() {
  // Gating dinámico por módulos contratados. Cada item del NAV
  // declara su `modulo` — si no existe en modulos_config (o la
  // tabla todavía está vacía para el municipio), tieneModulo cae
  // a true para no romper la navegación legacy.
  const municipioId = useEffectiveMunicipioId()
  const { data: modulos } = useModulosActivos(municipioId)
  const { perfil, hasRole } = useAuth()
  const esDirector = hasRole(['admin_comuna', 'superadmin'])
  const tieneModulo = useMemo(() => {
    const set = new Set((modulos ?? []).map(m => m.modulo))
    return (mod) => {
      if (!mod) return true
      if (!modulos || modulos.length === 0) return true
      return set.has(mod)
    }
  }, [modulos])

  const accesoByDepId = useMemo(() => {
    const map = new Map()
    for (const r of (perfil?.dependencias_acceso ?? [])) {
      if (r?.dependencia_id) map.set(r.dependencia_id, r)
    }
    return map
  }, [perfil])

  // Lista de dependencias del municipio para mapear tipo→dep.
  const { data: deps = [] } = useDependencias()
  // Construye la entrada del sidebar para una dependencia. Devuelve:
  //   - { kind: 'group', ...NavGroup } si tiene sub-items visibles
  //   - { kind: 'link',  ...FlatNavLink } para tipos info-only
  //   - null si el usuario no tiene acceso y/o el módulo está off
  function entryParaDep({ tipo, label, basePath, modulo, icon, dep }) {
    if (modulo && !tieneModulo(modulo)) return null
    const tLower = (tipo ?? '').toLowerCase()
    // Info-only: link plano sin verificar permisos (siempre visible)
    if (TIPOS_INFO_ONLY.has(tLower)) {
      return { kind: 'link', to: basePath, label, icon }
    }
    // Permisos: directores ven todo; el resto solo si tienen acceso
    // explícito a este dep.id (gestión y/o administración).
    const acceso = dep ? accesoByDepId.get(dep.id) : null
    const puedeGestionar   = esDirector || !!acceso?.puede_gestionar
    const puedeAdministrar = esDirector || !!acceso?.puede_administrar
    if (!puedeGestionar && !puedeAdministrar) return null
    const subs = subitemsParaTipo(tipo, basePath).filter(s =>
      s.kind === 'admin' ? puedeAdministrar : puedeGestionar,
    )
    if (subs.length === 0) return null
    return { kind: 'group', label, icon, subitems: subs }
  }

  // CIC: el blueprint dice qué dependencias hardcodear; cada una
  // se matchea contra el dep real (por tipo) del municipio para
  // resolver el dep.id que necesitan los checks de permisos.
  const cicEntries = useMemo(() => {
    return CIC_BLUEPRINT
      .map(blue => {
        const dep = deps.find(d => (d?.tipo ?? '').toLowerCase() === blue.tipo && d.activa !== false)
        return entryParaDep({ ...blue, dep })
      })
      .filter(Boolean)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, accesoByDepId, esDirector, tieneModulo])

  // DEPENDENCIAS dinámicas: el resto de filas de la tabla que NO
  // están en CIC. Dedupe por tipo (un tipo = una entrada aunque
  // existan varias filas).
  //
  // Devolvemos dos listas: las "principales" (con gestión y/o
  // administración) y las "info-only" (policial / educativas) que
  // se renderizan al final del bloque bajo un mini-separador.
  const { depsPrincipales, depsInfo } = useMemo(() => {
    const seenTipo = new Set()
    const principales = []
    const info = []
    // tipos que NO se muestran como dependencia en el sidebar
    // porque ya tienen su propio módulo en "Gestión Municipal"
    // (Administración Municipal vive bajo /admin/administracion, y
    // Bienes Municipales ahora se administra desde /admin/patrimonio).
    const TIPOS_EXCLUIDOS = new Set(['admin', 'administracion', 'intendencia', 'comuna', 'bienes'])
    for (const d of (deps ?? [])) {
      if (d.activa === false) continue
      const t = (d.tipo ?? '').toLowerCase().trim()
      if (!t || TIPOS_CIC.has(t)) continue
      if (TIPOS_EXCLUIDOS.has(t)) continue
      if (seenTipo.has(t)) continue
      seenTipo.add(t)
      const label = LABEL_BY_TIPO[t] ?? d.nombre
      const basePath = `/admin/dependencia/${t}`
      const entry = entryParaDep({ tipo: t, label, basePath, dep: d })
      if (!entry) continue
      if (TIPOS_INFO_ONLY.has(t)) info.push(entry)
      else                         principales.push(entry)
    }
    principales.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
    info.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
    return { depsPrincipales: principales, depsInfo: info }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, accesoByDepId, esDirector, tieneModulo])

  // Filtramos top + gestión por módulo (mismo patrón que antes).
  const navTopFiltrado = useMemo(() => NAV_TOP.filter(item => tieneModulo(item.modulo)), [tieneModulo])
  const navGestionFiltrado = useMemo(() => NAV_GESTION.map(item => {
    if (!tieneModulo(item.modulo)) return null
    if (!item.subitems) return item
    const subs = item.subitems.filter(s => !s.modulo || tieneModulo(s.modulo))
    if (subs.length === 0) return null
    return { ...item, subitems: subs }
  }).filter(Boolean), [tieneModulo])

  return (
    <>
      {/* Sidebar — scroll independiente, altura completa del contenedor padre */}
      <aside
        className="w-full shrink-0 overflow-x-auto border-b border-border bg-white lg:w-64 lg:border-b-0 lg:border-r"
        style={{
          width: '256px',
          flexShrink: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          height: '100%',
        }}
      >
        <nav className="flex gap-1 p-2 lg:flex-col lg:p-4">
          <SuperadminSection />
          {navTopFiltrado.map(item => (
            <FlatNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} end={item.end} />
          ))}

          {cicEntries.length > 0 && <Rotulo>CIC</Rotulo>}
          {cicEntries.map(item => (
            item.kind === 'link'
              ? <FlatNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
              : <NavGroup key={item.label} label={item.label} icon={item.icon} subitems={item.subitems} />
          ))}

          {(depsPrincipales.length > 0 || depsInfo.length > 0) && <Rotulo>Dependencias</Rotulo>}
          {depsPrincipales.map(item => (
            item.kind === 'link'
              ? <FlatNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
              : <NavGroup key={item.label} label={item.label} icon={item.icon} subitems={item.subitems} />
          ))}

          {/* Sub-rótulo "Solo información" — separa las dependencias
              informativas (policial, educativas) de las operativas.
              Usa gris suave para señalar que son enlaces secundarios.
              Hidden en mobile (mismo patrón que los demás rótulos). */}
          {depsInfo.length > 0 && (
            <div className="hidden px-3 pb-1 pt-3 lg:block">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 opacity-70">
                Solo información
              </span>
            </div>
          )}
          {depsInfo.map(item => (
            item.kind === 'link'
              ? <FlatNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
              : <NavGroup key={item.label} label={item.label} icon={item.icon} subitems={item.subitems} />
          ))}

          <DependenciasGestionNav />

          {navGestionFiltrado.length > 0 && <Rotulo>Gestión municipal</Rotulo>}
          {navGestionFiltrado.map(item => (
            item.subitems
              ? <NavGroup key={item.label} label={item.label} icon={item.icon} subitems={item.subitems} />
              : <FlatNavLink key={item.to} to={item.to} label={item.label} icon={item.icon} />
          ))}
        </nav>
      </aside>

      {/* Contenido principal — scroll independiente, altura completa */}
      <main
        className="min-w-0 flex-1"
        style={{
          flex: 1,
          overflowY: 'auto',
          minWidth: 0,
          height: '100%',
        }}
      >
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </>
  )
}
