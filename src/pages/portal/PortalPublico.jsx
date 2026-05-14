import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useNoticiasPublicas } from '../../hooks/useNoticiasPublicas'
import { useDatosMunicipio, usePortalMunicipioId, useConfigClavePublica } from '../../hooks/useConfigPortal'
import { useAutoridades } from '../../hooks/useAutoridades'
import { useHistoriaMunicipio } from '../../hooks/useHistoriaMunicipio'
import { useVecino } from '../../context/VecinoContext'
import { useAuth, homeRouteFor } from '../../context/AuthContext'
import { supabaseAnon } from '../../lib/supabaseAnon'
import Spinner from '../../components/ui/Spinner'
import NoticiaCardSmall      from '../../components/portal/NoticiaCardSmall'
import CategoriaPlaceholder  from '../../components/portal/CategoriaPlaceholder'
import NoticiasProvinciales  from '../../components/portal/NoticiasProvinciales'
import RecursosSection       from '../../components/portal/RecursosSection'
import { getResumen } from '../../lib/noticiasCategoria'
import { dateOf } from '../../lib/datetime'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'
const PROVINCIA        = 'Santiago del Estero'

// Nav del header. Los items con `to` navegan a otra ruta (router);
// los que solo tienen `href` son anclas a secciones de esta misma página.
const NAV_LINKS = [
  { to:   '/portal/noticias', label: 'Noticias' },
  { href: '#servicios',       label: 'Servicios' },
  { href: '#recursos',        label: 'Recursos' },
  { to:   '/portal/turno',    label: 'Turnos' },
  { href: '#autoridades',     label: 'Autoridades' },
  { href: '#historia',        label: 'Historia' },
  { href: '#contacto',        label: 'Contacto' },
]

// Etiqueta corta para mostrar en el botón "Mi cuenta" del header
// cuando el vecino ya entró — usa el primer nombre solamente para
// no romper la grilla del nav en mobile.
function firstName(vecino) {
  if (!vecino) return ''
  if (vecino.nombre) return vecino.nombre.split(' ')[0]
  if (vecino.nombre_completo) return vecino.nombre_completo.split(' ')[0]
  return ''
}

// ─────────────────────────────────────────────────────────────────
// Accesos rápidos — cada uno navega a una página dedicada del portal.
// Los formularios viven en /portal/turno · /portal/mi-turno · /portal/mi-salud.
// ─────────────────────────────────────────────────────────────────
const ACCESOS_RAPIDOS = [
  {
    to:    '/portal/turno',
    label: 'Sacar turno',
    desc:  'Sala PA, Juez de Paz, SUM, Administración',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-8 w-8">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
        <path strokeLinecap="round" d="M12 13v5M9.5 15.5h5" />
      </svg>
    ),
  },
  {
    to:    '/portal/mi-turno',
    label: 'Consultar turno',
    desc:  'Verificá el estado de tu solicitud',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-8 w-8">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
  {
    to:    '/portal/mi-salud',
    label: 'Mi Salud',
    desc:  'Resumen de tus atenciones en la Sala PA',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-8 w-8">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" />
      </svg>
    ),
  },
  {
    to:    '/mi-cuenta/acceso',
    label: 'Mi cuenta',
    desc:  'Turnos, salud y datos personales',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-8 w-8">
        <circle cx="12" cy="8" r="4" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
      </svg>
    ),
  },
]

// Detalle/horario por `tipo` de dependencia. La tabla solo guarda
// nombre/tipo/activa, así que el copy descriptivo lo enriquecemos
// acá. Si una dep llega con un tipo no listado, se renderiza solo
// con su nombre (sin detalle ni horario).
const DEP_DESCRIPTOR = {
  salud:       { detalle: 'Atención médica, vacunación y enfermería.',          horario: 'Lun a Vie · 8:00 – 20:00' },
  caps:        { detalle: 'Atención médica, vacunación y enfermería.',          horario: 'Lun a Vie · 8:00 – 20:00' },
  juzgado:     { detalle: 'Trámites civiles, certificaciones y mediación.',     horario: 'Lun a Vie · 7:00 – 13:00' },
  sum:         { detalle: 'Eventos comunitarios, capacitaciones y reuniones.',  horario: 'Reservas · consultar disponibilidad' },
  intendencia: { detalle: 'Mesa de entradas, tesorería y trámites generales.',  horario: 'Lun a Vie · 7:00 – 13:00' },
  obras:       { detalle: 'Permisos de construcción e infraestructura.',         horario: 'Lun a Vie · 7:00 – 13:00' },
  deporte:     { detalle: 'Actividades deportivas, canchas y eventos.',          horario: 'Consultar horarios' },
  cementerio:  { detalle: 'Servicios fúnebres y memoriales.',                    horario: 'Todos los días · 8:00 – 18:00' },
  velatorio:   { detalle: 'Servicios de despedida y acompañamiento.',            horario: 'Disponibilidad 24/7' },
  policia:     { detalle: 'Seguridad ciudadana y emergencias.',                  horario: '24/7 · 911 / 101' },
  educacion:   { detalle: 'Becas, programas educativos y biblioteca.',           horario: 'Lun a Vie · 7:00 – 13:00' },
  bienes:      { detalle: 'Catastro, bienes inmuebles y patrimonio.',            horario: 'Lun a Vie · 7:00 – 13:00' },
  social:      { detalle: 'Ayuda social y programas de asistencia.',             horario: 'Lun a Vie · 7:00 – 13:00' },
}

// Ícono SVG inline por `tipo` de dependencia. Devuelve un default
// (edificio genérico) cuando el tipo no matchea ninguno conocido.
function iconForTipo(tipo) {
  const t = (tipo ?? '').toLowerCase()
  // CAPS / Salud — cruz
  if (/caps|salud|sala/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v8M8 12h8" />
      </svg>
    )
  }
  // Juzgado — balanza
  if (/juzgado|paz|justicia/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    )
  }
  // SUM / cultural — salón
  if (/sum|sal[oó]n|cultural/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    )
  }
  // Intendencia / admin — edificio
  if (/intendencia|admin|gobierno|comuna|gesti/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    )
  }
  // Obras — casco de construcción
  if (/obra|construc|infra|catastro/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M9 7v4M15 7v4M9 11h6" />
      </svg>
    )
  }
  // Deporte — pelota
  if (/deport|recreaci/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l3 5-3 4-3-4 3-5zM3 12l5 3 4-3-4-3-5 3zM21 12l-5 3-4-3 4-3 5 3zM12 21l-3-5 3-4 3 4-3 5z" />
      </svg>
    )
  }
  // Cementerio — flor / memorial
  if (/cementerio|necr/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <circle cx="12" cy="9" r="2.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.5V3M12 11.5V21M9.5 9c-2 0-3 1-3 2s1 2 3 2M14.5 9c2 0 3 1 3 2s-1 2-3 2M5 21h14" />
      </svg>
    )
  }
  // Velatorio — corazón / paz
  if (/velatorio|despedida|f[uú]nebre/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" />
      </svg>
    )
  }
  // Policía — escudo
  if (/polic|seguridad|defensa/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
      </svg>
    )
  }
  // Educación — birrete + libro
  if (/educ|escuel|biblioteca/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 9l10-4 10 4-10 4-10-4zM6 11v5c0 1 3 3 6 3s6-2 6-3v-5M21 10v6" />
      </svg>
    )
  }
  // Bienes / catastro — llaves
  if (/bienes|inmueble|patrim|llaves/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <circle cx="8" cy="14" r="3.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 14h10v3M18 14v3" />
      </svg>
    )
  }
  // Social / familia — manos
  if (/social|familia|comunidad|asisten/.test(t)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5V8a2 2 0 1 1 4 0v6l3-1 2 1v3a2 2 0 0 1-2 2h-6l-4-4-2 1V8a2 2 0 1 1 4 0v3.5" />
      </svg>
    )
  }
  // Default — edificio genérico
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-5 w-5">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" />
    </svg>
  )
}

// Lista mostrada cuando la query a `dependencias` no devuelve nada
// (DB vacía, RLS bloquea anon, o falla la red). Replica el mínimo
// histórico de la sección para que el portal nunca se vea pelado.
const FALLBACK_SERVICIOS = [
  { id: 'fb-caps',        nombre: 'Sala de Primeros Auxilios', tipo: 'caps' },
  { id: 'fb-juzgado',     nombre: 'Juzgado de Paz',            tipo: 'juzgado' },
  { id: 'fb-sum',         nombre: 'Salón de Usos Múltiples',   tipo: 'sum' },
  { id: 'fb-intendencia', nombre: 'Administración',            tipo: 'intendencia' },
]

// Hook anon — la migration 20250507000002_portal_publico habilita
// SELECT a anon en `dependencias`, así que el portal lee sin login.
async function fetchDependenciasPublicas() {
  const { data, error } = await supabaseAnon
    .from('dependencias')
    .select('id, nombre, tipo, activa')
    .order('nombre', { ascending: true })
  if (error) {
    console.warn('[PortalPublico] fetchDependenciasPublicas:', error.message)
    return null
  }
  return data ?? []
}

function useDependenciasPublicas() {
  return useQuery({
    queryKey: ['dependencias-publicas'],
    queryFn:  fetchDependenciasPublicas,
    staleTime: 5 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────
// SVGs decorativos / institucionales
// ─────────────────────────────────────────────────────────────────

// Escudo institucional — ícono SVG inline. Forma de escudo + estrella
// federal, en gold sobre navy. Sustituible por imagen real más adelante.
function Escudo({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z"
        fill="url(#escudo-bg)"
        stroke="#0F1C35"
        strokeWidth="1.5"
      />
      <path
        d="M24 12 L26 19 L33 19 L27.5 23 L29.5 30 L24 26 L18.5 30 L20.5 23 L15 19 L22 19 Z"
        fill="#0F1C35"
      />
    </svg>
  )
}

// Patrón diagonal sutil para el hero (institucional, sin imágenes externas).
function HeroDiagonalPattern() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full text-white"
    >
      <defs>
        <pattern id="hero-diag" width="40" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="40" stroke="currentColor" strokeWidth="1" opacity="0.06" />
          <line x1="20" y1="0" x2="20" y2="40" stroke="currentColor" strokeWidth="1" opacity="0.04" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hero-diag)" />
    </svg>
  )
}

function SocialIcon({ kind }) {
  if (kind === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/>
      </svg>
    )
  }
  if (kind === 'instagram') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="h-5 w-5">
        <rect x="3" y="3" width="18" height="18" rx="5"/>
        <circle cx="12" cy="12" r="4"/>
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/>
      </svg>
    )
  }
  if (kind === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4 8 8 0 0 0 4.05 12a7.94 7.94 0 0 0 1.07 4l-1.13 4.13 4.23-1.11A8 8 0 0 0 12.05 20a8 8 0 0 0 8-8 7.94 7.94 0 0 0-2.45-5.68zm-5.55 12.34a6.65 6.65 0 0 1-3.4-.93l-.24-.14-2.51.66.67-2.45-.16-.25a6.65 6.65 0 0 1-1.02-3.55 6.66 6.66 0 1 1 6.66 6.66zm3.65-4.99c-.2-.1-1.18-.58-1.36-.65-.18-.07-.32-.1-.45.1-.13.2-.51.65-.62.78-.12.13-.23.15-.42.05-.2-.1-.84-.31-1.6-.99a6 6 0 0 1-1.11-1.38c-.12-.2-.01-.31.09-.41.09-.09.2-.23.3-.35.1-.12.13-.2.2-.33.07-.13.03-.25-.02-.35-.05-.1-.45-1.08-.62-1.48-.16-.39-.32-.34-.45-.34h-.38a.74.74 0 0 0-.53.25c-.18.2-.7.69-.7 1.67 0 .98.71 1.93.81 2.06.1.13 1.4 2.13 3.39 2.99.47.2.84.32 1.13.42.48.15.91.13 1.25.08.38-.06 1.18-.48 1.34-.94.17-.47.17-.86.12-.94-.05-.08-.18-.13-.38-.23z"/>
      </svg>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────────

function AlertBar({ onClose }) {
  return (
    <div className="bg-accent text-primary">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-xs sm:text-sm sm:px-6">
        <span aria-hidden="true" className="text-base">📢</span>
        <p className="flex-1 font-medium">
          Sala de Primeros Auxilios: Lunes a Viernes 8:00 – 20:00
        </p>
        <button
          onClick={onClose}
          aria-label="Cerrar aviso"
          className="rounded p-1 transition-colors hover:bg-primary/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="h-4 w-4">
            <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function NavItem({ link, onClick, mobile = false }) {
  const cls = mobile
    ? 'rounded-md px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white'
    : 'rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white'
  if (link.to) {
    return <Link to={link.to} onClick={onClick} className={cls}>{link.label}</Link>
  }
  return <a href={link.href} onClick={onClick} className={cls}>{link.label}</a>
}

// Botón unificado de acceso al header. Tres estados:
// - sesión admin (Supabase auth) → "Panel →" al dashboard del rol.
// - sesión vecino (sessionStorage) → "Hola [nombre] →" a /mi-cuenta.
// - sin sesión → "Ingresar" a /acceso (chooser unificado).
function IngresarButton({ onClick, mobile = false }) {
  const { perfil } = useAuth()
  const { vecinoSession, isVecinoLogued } = useVecino()

  const adminRoute = perfil?.roles ? homeRouteFor(perfil.roles) : null
  let target, label
  if (adminRoute) {
    target = adminRoute
    label  = 'Panel →'
  } else if (isVecinoLogued) {
    target = '/mi-cuenta'
    label  = `Hola ${firstName(vecinoSession)} →`
  } else {
    target = '/acceso'
    label  = 'Ingresar'
  }

  const cls = mobile
    ? 'mt-1 rounded-md border border-accent/60 bg-accent/10 px-3 py-2.5 text-left text-sm font-semibold text-accent hover:bg-accent/20'
    : 'inline-flex items-center justify-center rounded-md border border-accent/60 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/20'
  return (
    <Link to={target} onClick={onClick} className={cls}>
      {label}
    </Link>
  )
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = () => setMenuOpen(false)
  // El logo institucional viene de configuracion_portal clave
  // 'identidad_visual'. Si no está cargado caemos al Escudo SVG.
  const { identidad } = useDatosMunicipio()
  const logoUrl = identidad?.logo_url || null
  return (
    <header className="sticky top-0 z-40 border-b border-primary-900 bg-primary text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Marca */}
        <Link to="/portal" className="flex items-center gap-3 text-white">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`Logo de ${MUNICIPIO_NOMBRE}`}
              className="h-11 w-11 shrink-0 rounded-full bg-white/10 object-cover ring-1 ring-inset ring-white/20"
            />
          ) : (
            <Escudo className="h-11 w-11 shrink-0" />
          )}
          <div className="leading-tight">
            <p className="font-sora text-base font-bold sm:text-lg">{MUNICIPIO_NOMBRE}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">
              {PROVINCIA}
            </p>
          </div>
        </Link>

        {/* Nav desktop */}
        <nav aria-label="Secciones del portal" className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map(l => (
            <NavItem key={l.to ?? l.href} link={l} />
          ))}
          <IngresarButton />
        </nav>

        {/* Hamburguesa mobile */}
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/20 text-white transition-colors hover:bg-white/10 lg:hidden"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            {menuOpen
              ? <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
              : <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {/* Menú mobile desplegable */}
      {menuOpen && (
        <div className="border-t border-white/10 bg-primary-900 lg:hidden">
          <div className="mx-auto max-w-6xl px-2 py-2 sm:px-4">
            <nav aria-label="Secciones del portal" className="flex flex-col">
              {NAV_LINKS.map(l => (
                <NavItem key={l.to ?? l.href} link={l} onClick={closeMenu} mobile />
              ))}
              <IngresarButton onClick={closeMenu} mobile />
              <Link
                to="/portal/turno"
                onClick={closeMenu}
                className="mt-1 rounded-md bg-accent px-3 py-2.5 text-left text-sm font-semibold text-primary-900 hover:bg-accent-600 hover:text-white"
              >
                Sacar turno
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}

// ─────────────────────────────────────────────────────────────────
// HeroCarousel — strip horizontal con las últimas 10 noticias con
// imagen, scroll continuo configurable desde Portal Web (clave
// `hero_carousel` de configuracion_portal). Pausa en hover.
// ─────────────────────────────────────────────────────────────────

const HERO_CAROUSEL_DEFAULT = {
  activo:             true,
  velocidad_segundos: 30,
  mostrar_titulo:     true,
  mostrar_categoria:  true,
}

async function fetchHeroCarouselNoticias(municipioId) {
  if (!municipioId) return []
  // El user spec menciona `.order('fecha', ...)` pero la columna real
  // de noticias es `publicado_at` (ver useNoticiasPublicas) — usamos
  // esa para mantener compatibilidad con el resto del portal.
  const { data, error } = await supabaseAnon
    .from('noticias')
    .select('id, titulo, imagen_url, categoria, publicado_at')
    .eq('municipio_id', municipioId)
    .eq('estado', 'publicada')
    .not('imagen_url', 'is', null)
    .order('publicado_at', { ascending: false })
    .limit(10)
  if (error) {
    console.warn('[HeroCarousel] fetchHeroCarouselNoticias error:', error.message)
    return []
  }
  return data ?? []
}

function HeroCarousel() {
  const { data: municipioId } = usePortalMunicipioId()
  // Config con defaults locales — si el admin no la cargó todavía
  // o la clave no está en el whitelist anon, caemos a HERO_CAROUSEL_DEFAULT.
  const { data: cfg } = useConfigClavePublica('hero_carousel', HERO_CAROUSEL_DEFAULT)
  const config = { ...HERO_CAROUSEL_DEFAULT, ...(cfg ?? {}) }

  const { data: noticias = [] } = useQuery({
    queryKey: ['hero-carousel-noticias', municipioId ?? '__NONE__'],
    queryFn:  () => fetchHeroCarouselNoticias(municipioId),
    enabled:  !!municipioId,
    staleTime: 5 * 60 * 1000,
  })

  if (!config.activo || noticias.length === 0) return null

  // Duplicamos el array — el track corre de translateX(0) a
  // translateX(-50%), que visualmente cae al inicio del segundo
  // bloque (idéntico al primero), generando el loop sin saltos.
  const doble = [...noticias, ...noticias]

  return (
    <div className="relative w-full overflow-hidden pb-8 sm:pb-10">
      <div
        className="hero-carousel-track flex w-max gap-3"
        style={{ animationDuration: `${config.velocidad_segundos}s` }}
        aria-label="Carrusel de noticias recientes"
      >
        {doble.map((n, i) => (
          <Link
            key={`${n.id}-${i}`}
            to={`/portal/noticias/${n.id}`}
            className="group relative block h-28 w-48 shrink-0 overflow-hidden rounded-xl ring-1 ring-white/10 shadow-md transition-transform hover:scale-[1.02]"
            aria-hidden={i >= noticias.length ? 'true' : undefined}
            tabIndex={i >= noticias.length ? -1 : undefined}
          >
            <img
              src={n.imagen_url}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            {/* Gradiente bottom-up para legibilidad del título. */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-primary-900/85 via-primary-900/40 to-transparent" aria-hidden="true" />
            {config.mostrar_categoria && n.categoria && (
              <span
                className="absolute left-2 top-2 inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-accent ring-1 ring-inset ring-accent/30"
                style={{ backgroundColor: 'rgba(15, 28, 53, 0.80)' }}
              >
                {n.categoria}
              </span>
            )}
            {config.mostrar_titulo && (
              <p
                className="absolute inset-x-0 bottom-0 line-clamp-2 px-2 pb-2 text-xs font-semibold leading-snug text-white"
                style={{ textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
              >
                {n.titulo}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section
      className="relative overflow-hidden bg-primary text-white"
      style={{ minHeight: '70vh' }}
    >
      <HeroDiagonalPattern />
      {/* Halos decorativos sutiles */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -bottom-24 h-80 w-80 rounded-full bg-ok/15 blur-3xl" />

      <div className="relative mx-auto flex max-w-6xl flex-col items-start justify-center gap-5 px-4 pt-16 pb-8 sm:px-6 sm:pt-20 sm:pb-10 lg:pt-24 lg:pb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Portal Ciudadano oficial
        </div>
        <h1 className="font-sora text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
          {MUNICIPIO_NOMBRE}
        </h1>
        <p className="text-base text-white/80 sm:text-lg">
          {PROVINCIA} · Portal del Vecino
        </p>
        <p className="max-w-2xl text-sm leading-relaxed text-white/70 sm:text-base">
          Información de gestión, turnos en línea y novedades de tu comuna.
          Acceso ágil a los servicios municipales desde un solo lugar.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            to="/portal/turno"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-primary-900 shadow-sm transition-all hover:bg-accent-600 hover:text-white active:scale-95"
          >
            Sacar turno
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <Link
            to="/portal/noticias"
            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white/40 bg-transparent px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white/10 active:scale-95"
          >
            Ver noticias
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Carrusel — strip horizontal infinite-scroll debajo del texto. */}
      <HeroCarousel />
    </section>
  )
}

function AccesosRapidos() {
  return (
    <section aria-labelledby="accesos-h2" className="border-b border-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <h2 id="accesos-h2" className="sr-only">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {ACCESOS_RAPIDOS.map(a => {
            const inner = (
              <>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-accent transition-colors group-hover:bg-primary-900">
                  {a.icon}
                </div>
                <div>
                  <p className="text-sm font-bold text-primary">{a.label}</p>
                  <p className="mt-0.5 text-xs leading-snug text-primary-500">
                    {a.desc}
                  </p>
                </div>
                <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent-700 group-hover:text-accent-800">
                  Acceder
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>
              </>
            )
            const cardClasses =
              'group flex h-full flex-col gap-2 rounded-xl border border-border bg-white p-3 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg'
            return a.to ? (
              <Link key={a.to} to={a.to} className={cardClasses}>
                {inner}
              </Link>
            ) : (
              <a key={a.href} href={a.href} className={cardClasses}>
                {inner}
              </a>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Layout de noticias estilo diario digital
//
//   ZONA A · noticia destacada (ancho completo)
//   ZONA B · grid 4 columnas × 2 filas (siguientes 8)
//   ZONA C · noticias restantes (2/3) + banners institucionales (1/3)
//
// Adaptativo: <4 = grid simple, 4-8 = A+B, 9+ = A+B+C completo.
// ─────────────────────────────────────────────────────────────────

// ZONA A · Noticia destacada de ancho completo
function NoticiaFeatured({ noticia }) {
  const resumen = getResumen(noticia, 240)
  return (
    <Link
      to={`/portal/noticias/${noticia.id}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
    <article className="group relative grid overflow-hidden rounded-xl border border-border bg-white shadow-card transition-shadow hover:shadow-lg lg:grid-cols-2">
      <div className="relative">
        {noticia.imagen_url ? (
          <img
            src={noticia.imagen_url}
            alt=""
            className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02] lg:h-full lg:aspect-auto"
            loading="lazy"
          />
        ) : (
          <CategoriaPlaceholder
            categoria={noticia.categoria}
            aspectClass="aspect-[16/9] lg:aspect-auto lg:h-full"
            iconSize="h-24 w-24"
          />
        )}
        {noticia.categoria && (
          <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-900 shadow-sm">
            {noticia.categoria}
          </span>
        )}
      </div>
      <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-accent-700">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Destacada
          </span>
          {noticia.publicado_at && (
            <time className="text-xs font-medium uppercase tracking-wide text-primary-400" dateTime={noticia.publicado_at}>
              · {dateOf(noticia.publicado_at)}
            </time>
          )}
        </div>
        <h3 className="font-sora text-2xl font-bold leading-tight text-primary sm:text-3xl lg:text-[28px]">
          {noticia.titulo}
        </h3>
        {resumen && (
          <p className="line-clamp-3 text-sm leading-relaxed text-primary-500 sm:text-base">
            {resumen}
          </p>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-accent-700">
          Leer nota
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </article>
    </Link>
  )
}

// ZONA C · Banner institucional navy/gold con ícono, título, copy y CTA.
// Navega a una ruta del portal — los CTAs apuntan a /portal/turno · /portal/mi-turno.
function BannerInstitucional({ icon, titulo, copy, cta, to }) {
  return (
    <Link
      to={to}
      className="group relative flex h-full overflow-hidden rounded-xl border border-primary-700 bg-gradient-to-br from-primary via-primary-700 to-primary-900 text-white shadow-card transition-shadow hover:shadow-lg"
    >
      <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
      <div className="absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-accent/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex h-full flex-col gap-3 p-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 text-3xl">
          <span aria-hidden="true">{icon}</span>
        </div>
        <h3 className="font-sora text-lg font-bold leading-tight text-white sm:text-xl">
          {titulo}
        </h3>
        <p className="text-sm leading-relaxed text-white/75">
          {copy}
        </p>
        <span className="mt-auto inline-flex items-center gap-1.5 self-start rounded-md bg-accent px-3 py-2 text-sm font-semibold text-primary-900 transition-colors group-hover:bg-accent-600 group-hover:text-white">
          {cta}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

function NoticiasSection({ noticias, loading, error }) {
  return (
    <section id="noticias" aria-labelledby="noticias-h2" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Encabezado de sección con línea decorativa gold */}
        <header className="mb-8 sm:mb-10">
          <div className="flex items-center gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
                Sala de prensa
              </p>
              <h2 id="noticias-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
                Noticias y anuncios
              </h2>
            </div>
            <div className="hidden h-px flex-1 bg-gradient-to-r from-accent via-accent/60 to-transparent sm:block" aria-hidden="true" />
          </div>
          <p className="mt-2 text-sm text-primary-500 sm:text-base">
            Últimas novedades de la Comisión Municipal
          </p>
        </header>

        {loading && (
          <div className="flex items-center justify-center rounded-xl border border-border bg-white p-12">
            <Spinner size="lg" />
          </div>
        )}

        {error && !loading && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-danger">
            No pudimos cargar las noticias en este momento. Probá nuevamente más tarde.
          </div>
        )}

        {!loading && !error && noticias.length === 0 && (
          <div className="rounded-xl border border-border bg-white p-12 text-center text-sm text-primary-400">
            No hay noticias publicadas todavía.
          </div>
        )}

        {!loading && !error && noticias.length > 0 && (
          (() => {
            const total = noticias.length

            // < 4 noticias → grid simple 2 columnas
            if (total < 4) {
              return (
                <div className="grid gap-4 sm:grid-cols-2">
                  {noticias.map(n => <NoticiaCardSmall key={n.id} noticia={n} />)}
                </div>
              )
            }

            const featured = noticias[0]
            const gridB    = noticias.slice(1, 9)   // hasta 8 noticias en zona B
            const restC    = noticias.slice(9, 15)  // resto en zona C
            const showZonaC = total >= 9

            return (
              <div className="space-y-10 sm:space-y-12">
                {/* ZONA A · Destacada */}
                <NoticiaFeatured noticia={featured} />

                {/* ZONA B · Grid 4 columnas */}
                {gridB.length > 0 && (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {gridB.map(n => <NoticiaCardSmall key={n.id} noticia={n} />)}
                  </div>
                )}

                {/* ZONA C · Restantes (2/3) + Banners institucionales (1/3) */}
                {showZonaC && (
                  <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
                    {restC.length > 0 ? (
                      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:col-span-2">
                        {restC.map(n => <NoticiaCardSmall key={n.id} noticia={n} />)}
                      </div>
                    ) : null}
                    <div className={`flex flex-col gap-4 ${restC.length === 0 ? 'lg:col-span-3 lg:grid lg:grid-cols-2' : ''}`}>
                      <BannerInstitucional
                        icon="📋"
                        titulo="Trámites online"
                        copy="Gestioná desde tu celular sin moverte de tu casa."
                        cta="Ir a trámites"
                        to="/portal/turno"
                      />
                      <BannerInstitucional
                        icon="📱"
                        titulo="Alertas por SMS"
                        copy="Recibí novedades de la comuna directo en tu celular."
                        cta="Suscribirme"
                        to="/portal/mi-turno"
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })()
        )}

        {/* Pie de la sección — link al listado completo */}
        {!loading && !error && noticias.length > 0 && (
          <div className="mt-10 flex justify-center sm:mt-12">
            <Link
              to="/portal/noticias"
              className="inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-white px-6 py-3 text-base font-semibold text-primary transition-colors hover:bg-primary hover:text-white active:scale-95"
            >
              Ver todas las noticias
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Link>
          </div>
        )}
      </div>
    </section>
  )
}

function ServiciosSection() {
  const { data, isLoading } = useDependenciasPublicas()
  // Tomamos solo dependencias activas. Si la query falló (data === null)
  // o el resultado está vacío, mostramos la lista mínima de fallback
  // para que la sección nunca quede pelada.
  const dbActivas = (data ?? []).filter(d => d.activa !== false)
  const useFallback = !isLoading && (data === null || dbActivas.length === 0)
  // "Bienes Municipales" se gestiona desde el panel admin (Patrimonio).
  // Lo escondemos del grid de la home, pero la fila sigue en la DB.
  const items = (useFallback ? FALLBACK_SERVICIOS : dbActivas).filter(d => {
    const t = (d.tipo ?? '').toLowerCase()
    const n = (d.nombre ?? '').toLowerCase()
    return t !== 'bienes' && !n.includes('bienes municipales')
  })

  return (
    <section id="servicios" aria-labelledby="servicios-h2" className="scroll-mt-20 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-6 sm:mb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-accent-700">
            Atención al ciudadano
          </p>
          <h2 id="servicios-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
            Dependencias municipales
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-primary-500 sm:text-base">
            Horarios y servicios de las distintas dependencias de la Comisión Municipal Real Sayana.
          </p>
        </header>

        {isLoading ? (
          <div className="card flex items-center justify-center p-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {items.map(d => {
              const desc    = DEP_DESCRIPTOR[d.tipo]
              const detalle = desc?.detalle ?? null
              const horario = desc?.horario ?? null
              // Si la dependencia tiene `tipo` la card se transforma
              // en un Link a la página de detalle pública. Sin tipo
              // (fallback raro), queda como bloque inerte.
              const cardClasses = 'group flex flex-col gap-2 rounded-xl border border-border bg-white py-3 px-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg'
              const inner = (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-accent transition-colors group-hover:bg-primary-900">
                    {iconForTipo(d.tipo)}
                  </div>
                  <p className="text-sm font-semibold text-primary">{d.nombre}</p>
                  {detalle && (
                    <p className="text-xs text-primary-500">{detalle}</p>
                  )}
                  {horario && (
                    <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" />
                        <path strokeLinecap="round" d="M12 7v5l3 2" />
                      </svg>
                      {horario}
                    </p>
                  )}
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent-700 group-hover:text-accent-800">
                    Ver detalle
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </>
              )
              return d.tipo ? (
                <Link key={d.id ?? d.nombre} to={`/portal/dependencia/${d.tipo}`} className={cardClasses}>
                  {inner}
                </Link>
              ) : (
                <div key={d.id ?? d.nombre} className={cardClasses}>{inner}</div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección: Autoridades de la Comisión Municipal
// ─────────────────────────────────────────────────────────────────

// Genera las iniciales para el fallback de avatar cuando no hay
// foto cargada — primer carácter del nombre + primer carácter del
// segundo término. Devuelve "?" si no se pudo derivar nada.
function initialsFor(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function AutoridadesSection({ municipioId }) {
  const { data: autoridades = [], isLoading } = useAutoridades(municipioId)
  if (!municipioId) return null
  if (!isLoading && autoridades.length === 0) return null
  return (
    <section id="autoridades" aria-labelledby="autoridades-h2" className="scroll-mt-20 border-t border-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
            Quiénes nos representan
          </p>
          <h2 id="autoridades-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
            Autoridades de la Comisión Municipal
          </h2>
        </header>

        {isLoading ? (
          <div className="card flex items-center justify-center p-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
            {autoridades.map(a => (
              <article
                key={a.id}
                className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-5 text-center shadow-card transition-shadow hover:shadow-lg"
              >
                {a.foto_url ? (
                  <img
                    src={a.foto_url}
                    alt={`Foto de ${a.nombre}`}
                    className="h-24 w-24 rounded-full object-cover ring-2 ring-accent/60"
                    loading="lazy"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="flex h-24 w-24 items-center justify-center rounded-full bg-primary text-2xl font-bold text-white ring-2 ring-accent/60"
                  >
                    {initialsFor(a.nombre)}
                  </div>
                )}
                <p className="text-base font-semibold text-primary leading-tight">
                  {a.nombre}
                </p>
                <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-900">
                  {a.cargo}
                </span>
                {a.descripcion && (
                  <p className="text-xs leading-relaxed text-primary-500">
                    {a.descripcion}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección: Historia del municipio
// ─────────────────────────────────────────────────────────────────

function Lightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])
  if (!src) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/85 p-4 backdrop-blur-sm"
    >
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
          <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  )
}

function HistoriaSection({ municipioId, municipioNombre }) {
  const { data: historia, isLoading } = useHistoriaMunicipio(municipioId)
  const [lightbox, setLightbox] = useState(null)
  if (!municipioId) return null
  const tieneContenido = historia && (
    historia.fundacion || historia.resena ||
    historia.importancia_regional || historia.recursos_naturales ||
    (Array.isArray(historia.fotos) && historia.fotos.length > 0)
  )
  if (!isLoading && !tieneContenido) return null

  const fotos = Array.isArray(historia?.fotos) ? historia.fotos.slice(0, 4) : []
  const nombreMostrar = municipioNombre || 'Nuestra comunidad'
  const titulo = historia?.fundacion
    ? `${nombreMostrar} — Fundada en ${historia.fundacion}`
    : nombreMostrar

  return (
    <section id="historia" aria-labelledby="historia-h2" className="scroll-mt-20 bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-8 sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
            Nuestra historia
          </p>
          <h2 id="historia-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
            {titulo}
          </h2>
        </header>

        {isLoading ? (
          <div className="card flex items-center justify-center p-12">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-5 lg:gap-10">
            {/* Texto — 60% del ancho en desktop (3 de 5 columnas) */}
            <div className="space-y-6 lg:col-span-3">
              {historia?.resena && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-primary-700 sm:text-base">
                  {historia.resena}
                </p>
              )}
              {historia?.importancia_regional && (
                <div>
                  <h3 className="font-sora text-lg font-bold text-primary">Importancia regional</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-primary-700 sm:text-base">
                    {historia.importancia_regional}
                  </p>
                </div>
              )}
              {historia?.recursos_naturales && (
                <div>
                  <h3 className="font-sora text-lg font-bold text-primary">Recursos naturales</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-primary-700 sm:text-base">
                    {historia.recursos_naturales}
                  </p>
                </div>
              )}
            </div>

            {/* Galería — 40% del ancho (2 de 5 columnas), grid 2x2 */}
            {fotos.length > 0 && (
              <div className="lg:col-span-2">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  {fotos.map((url, i) => (
                    <button
                      key={url + i}
                      type="button"
                      onClick={() => setLightbox(url)}
                      className="group relative overflow-hidden rounded-lg border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <img
                        src={url}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </section>
  )
}

// Defaults hardcodeados — se usan si configuracion_portal no tiene
// las claves persistidas todavía. Cuando el admin guarda algo en
// /admin/config-general, esos valores tienen prioridad.
const DEFAULT_FOOTER_DATOS = {
  nombre_oficial: MUNICIPIO_NOMBRE,
  direccion:      'Av. San Martín s/n',
  telefono:       '(0385) 4-110-001',
  email:          '',
  horario:        'L-V 7:00 – 13:00 · Sala PA 8:00 – 20:00',
}
const DEFAULT_FOOTER_REDES = {
  facebook:  '',
  instagram: '',
  whatsapp:  '+54 9 3854 110001',
  twitter:   '',
  youtube:   '',
}

// Convierte un número de teléfono libre ("+54 9 3854 110001") en
// un link válido de wa.me — solo dígitos, sin "+" ni espacios.
function whatsappLink(numero) {
  const digits = (numero ?? '').replace(/[^0-9]/g, '')
  return digits ? `https://wa.me/${digits}` : null
}

function FooterSection() {
  const { data: depData } = useDependenciasPublicas()
  const { datos: cfgDatos, redes: cfgRedes } = useDatosMunicipio()
  const datos = { ...DEFAULT_FOOTER_DATOS, ...(cfgDatos ?? {}) }
  const redes = { ...DEFAULT_FOOTER_REDES, ...(cfgRedes ?? {}) }
  const waUrl = whatsappLink(redes.whatsapp)

  const depList = (depData ?? []).filter(d => d.activa !== false)
  // Dedupe por nombre (case-insensitive) — protege contra filas
  // duplicadas en la DB hasta que se aplique la limpieza manual
  // (ej: dos "Ayuda Social" sembradas en distintas migrations).
  const seen = new Set()
  const footerDeps = (depList.length > 0 ? depList : FALLBACK_SERVICIOS).filter(d => {
    const k = (d.nombre ?? '').trim().toLowerCase()
    if (!k || seen.has(k)) return false
    seen.add(k)
    return true
  })
  return (
    <footer id="contacto" className="bg-primary-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {/* Contacto */}
          <div>
            <div className="flex items-center gap-3">
              <Escudo className="h-10 w-10" />
              <div>
                <p className="font-sora text-base font-bold">{datos.nombre_oficial}</p>
                <p className="text-[11px] uppercase tracking-wide text-white/60">{PROVINCIA}</p>
              </div>
            </div>
            <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-accent">
              Contacto
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-white/80">
              {datos.direccion && <li>{datos.direccion}</li>}
              <li>Real Sayana, Santiago del Estero</li>
              {datos.telefono && <li className="pt-2">Tel: {datos.telefono}</li>}
              {redes.whatsapp && <li>WhatsApp: {redes.whatsapp}</li>}
              {datos.email && <li>{datos.email}</li>}
              {datos.horario && <li className="pt-2 text-white/60">{datos.horario}</li>}
            </ul>
            <div className="mt-4 flex gap-2">
              {redes.facebook && (
                <a
                  href={redes.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
                >
                  <SocialIcon kind="facebook" />
                </a>
              )}
              {redes.instagram && (
                <a
                  href={redes.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
                >
                  <SocialIcon kind="instagram" />
                </a>
              )}
              {waUrl && (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
                >
                  <SocialIcon kind="whatsapp" />
                </a>
              )}
            </div>
          </div>

          {/* Dependencias */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">
              Dependencias
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-white/80">
              {footerDeps.map(s => {
                const horario = DEP_DESCRIPTOR[s.tipo]?.horario
                return (
                  <li key={s.id ?? s.nombre}>
                    <span className="text-xs text-white/90">
                      {s.nombre}
                      {horario && <span className="text-white/50"> · {horario}</span>}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>

          {/* Frey Consulting */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">
              Plataforma
            </h3>
            <p className="mt-3 text-sm text-white/80">
              Portal Ciudadano desarrollado sobre la plataforma <strong className="font-semibold text-white">COMUNAS</strong>{' '}
              — gestión municipal moderna para comisiones de Santiago del Estero.
            </p>
            <p className="mt-4 text-sm text-white/70">
              Desarrollado por{' '}
              <span className="font-semibold text-accent">Frey Consulting</span>
            </p>
            <Link
              to="/login"
              className="mt-4 inline-flex items-center justify-center rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ingresar al sistema
            </Link>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t border-white/10 pt-5 text-xs text-white/50 sm:flex-row">
          <p>© {new Date().getFullYear()} {datos.nombre_oficial}. Todos los derechos reservados.</p>
          <p>Portal oficial · Información pública</p>
        </div>
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function PortalPublico() {
  const [alertOpen, setAlertOpen] = useState(true)
  const {
    data: noticias = [],
    isLoading: loadingNoticias,
    error: errNoticias,
  } = useNoticiasPublicas({ limit: 15 })
  const { data: municipioId } = usePortalMunicipioId()
  const { datos } = useDatosMunicipio()
  const municipioNombre = datos?.nombre ?? datos?.nombre_oficial ?? MUNICIPIO_NOMBRE

  return (
    <div className="min-h-svh bg-background">
      {alertOpen && <AlertBar onClose={() => setAlertOpen(false)} />}
      <Header />
      <Hero />

      <main>
        <AccesosRapidos />
        <ServiciosSection />
        <RecursosSection />
        <NoticiasSection
          noticias={noticias}
          loading={loadingNoticias}
          error={errNoticias}
        />
        <NoticiasProvinciales />
        {/* Autoridades e Historia quedan al final — accesibles vía
            anclas #autoridades / #historia del nav del header. */}
        <AutoridadesSection municipioId={municipioId} />
        <HistoriaSection municipioId={municipioId} municipioNombre={municipioNombre} />
      </main>

      <FooterSection />
    </div>
  )
}
