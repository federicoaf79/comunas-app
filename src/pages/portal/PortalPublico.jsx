import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNoticiasPublicas } from '../../hooks/useNoticiasPublicas'
import Spinner from '../../components/ui/Spinner'
import Modal   from '../../components/ui/Modal'
import NoticiaPortalCard           from '../../components/portal/NoticiaPortalCard'
import SacarTurnoFormPortal        from '../../components/portal/SacarTurnoFormPortal'
import ConsultarTurnoFormPortal    from '../../components/portal/ConsultarTurnoFormPortal'
import MiSaludForm                 from '../../components/portal/MiSaludForm'
import { dateOf } from '../../lib/datetime'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'
const PROVINCIA        = 'Santiago del Estero'

const NAV_LINKS = [
  { href: '#noticias',  label: 'Noticias' },
  { href: '#servicios', label: 'Servicios' },
  { href: '#turnos',    label: 'Turnos' },
  { href: '#contacto',  label: 'Contacto' },
]

// ─────────────────────────────────────────────────────────────────
// Accesos rápidos — abren un modal con el formulario correspondiente
// El protagonista visual es el contenido (noticias). Los formularios
// quedan escondidos hasta que el ciudadano hace clic.
// ─────────────────────────────────────────────────────────────────
const ACCESOS_RAPIDOS = [
  {
    key:   'sacar-turno',
    label: 'Sacar turno',
    desc:  'Sala PA, Juez de Paz, SUM, Administración',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-9 w-9">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
        <path strokeLinecap="round" d="M12 13v5M9.5 15.5h5" />
      </svg>
    ),
  },
  {
    key:   'mi-turno',
    label: 'Consultar turno',
    desc:  'Verificá el estado de tu solicitud',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-9 w-9">
        <circle cx="11" cy="11" r="7" />
        <path strokeLinecap="round" d="M21 21l-4.3-4.3" />
      </svg>
    ),
  },
  {
    key:   'mi-salud',
    label: 'Mi Salud',
    desc:  'Resumen de tus atenciones en la Sala PA',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-9 w-9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" />
      </svg>
    ),
  },
  {
    key:   'noticias',
    label: 'Ver noticias',
    desc:  'Anuncios y novedades de la comuna',
    isAnchor: true,
    href: '#noticias',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-9 w-9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h13a3 3 0 0 1 3 3v12a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V4zM4 4v14" />
        <path strokeLinecap="round" d="M8 8h6M8 12h6M8 16h4" />
      </svg>
    ),
  },
]

const SERVICIOS = [
  {
    nombre:  'Sala de Primeros Auxilios',
    horario: 'Lunes a Viernes · 8:00 – 20:00',
    detalle: 'Atención médica, vacunación y enfermería.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-7 w-7">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 8v8M8 12h8" />
      </svg>
    ),
  },
  {
    nombre:  'Juzgado de Paz',
    horario: 'Lunes a Viernes · 7:00 – 13:00',
    detalle: 'Trámites civiles, certificaciones y mediación.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-7 w-7">
        <path strokeLinecap="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    ),
  },
  {
    nombre:  'Salón de Usos Múltiples',
    horario: 'Reservas — consultar disponibilidad',
    detalle: 'Eventos comunitarios, capacitaciones y reuniones.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-7 w-7">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    ),
  },
  {
    nombre:  'Administración',
    horario: 'Lunes a Viernes · 7:00 – 13:00',
    detalle: 'Mesa de entradas, tesorería y trámites generales.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" className="h-7 w-7">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" />
      </svg>
    ),
  },
]

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

function Header({ onOpenForm }) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-primary-900 bg-primary text-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Marca */}
        <Link to="/portal" className="flex items-center gap-3 text-white">
          <Escudo className="h-11 w-11 shrink-0" />
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
            <a
              key={l.href}
              href={l.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              {l.label}
            </a>
          ))}
          <Link
            to="/login"
            className="ml-2 inline-flex items-center justify-center rounded-md border border-white/20 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Ingresar
          </Link>
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
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onOpenForm('sacar-turno') }}
                className="mt-1 rounded-md bg-accent px-3 py-2.5 text-left text-sm font-semibold text-primary-900 hover:bg-accent-600 hover:text-white"
              >
                Sacar turno
              </button>
              <Link
                to="/login"
                onClick={() => setMenuOpen(false)}
                className="mt-1 rounded-md border border-white/20 px-3 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
              >
                Ingresar al sistema
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  )
}

function Hero({ onOpenForm }) {
  return (
    <section
      className="relative overflow-hidden bg-primary text-white"
      style={{ minHeight: '70vh' }}
    >
      <HeroDiagonalPattern />
      {/* Halos decorativos sutiles */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-20 top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -bottom-24 h-80 w-80 rounded-full bg-ok/15 blur-3xl" />

      <div
        className="relative mx-auto flex max-w-6xl flex-col items-start justify-center gap-5 px-4 py-16 sm:px-6 sm:py-20 lg:py-28"
        style={{ minHeight: '70vh' }}
      >
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
          <button
            type="button"
            onClick={() => onOpenForm('sacar-turno')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-6 py-3 text-base font-semibold text-primary-900 shadow-sm transition-all hover:bg-accent-600 hover:text-white active:scale-95"
          >
            Sacar turno
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <a
            href="#noticias"
            className="inline-flex items-center justify-center gap-2 rounded-lg border-2 border-white/40 bg-transparent px-6 py-3 text-base font-semibold text-white transition-all hover:bg-white/10 active:scale-95"
          >
            Ver noticias
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  )
}

function AccesosRapidos({ onOpenForm }) {
  return (
    <section aria-labelledby="accesos-h2" className="border-b border-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <h2 id="accesos-h2" className="sr-only">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {ACCESOS_RAPIDOS.map(a => {
            const inner = (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-accent transition-colors group-hover:bg-primary-900">
                  {a.icon}
                </div>
                <div>
                  <p className="text-base font-semibold text-primary sm:text-lg">{a.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-primary-500 sm:text-[13px]">
                    {a.desc}
                  </p>
                </div>
                <div className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-accent-700 group-hover:text-accent-800">
                  Acceder
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </div>
              </>
            )
            const cardClasses =
              'group flex h-full flex-col gap-3 rounded-xl border border-border bg-white p-5 text-left transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg sm:p-6'
            return a.isAnchor ? (
              <a key={a.key} href={a.href} className={cardClasses}>
                {inner}
              </a>
            ) : (
              <button
                key={a.key}
                type="button"
                onClick={() => onOpenForm(a.key)}
                className={cardClasses}
              >
                {inner}
              </button>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Layout de noticias estilo diario — 1 grande + 2/3 chicas
// ─────────────────────────────────────────────────────────────────

// Misma lógica de color que NoticiaPortalCard pero la duplicamos
// localmente para tener variantes featured/secundaria con estilos
// propios sin tocar el card original.
function gradForCategoria(categoria) {
  if (!categoria) return 'from-primary to-primary-700'
  const c = categoria.toLowerCase()
  if (/salud|caps|m[eé]dic/.test(c))     return 'from-ok-500 to-ok-700'
  if (/obra|infra|catastro/.test(c))     return 'from-primary-500 to-primary-900'
  if (/educ|escuel/.test(c))             return 'from-accent to-accent-700'
  if (/evento|cultural|deport/.test(c))  return 'from-accent-500 to-accent-700'
  if (/seguridad|polic/.test(c))         return 'from-primary-700 to-primary-900'
  let h = 0
  for (let i = 0; i < categoria.length; i++) h = (h * 31 + categoria.charCodeAt(i)) >>> 0
  const palettes = [
    'from-primary to-primary-700',
    'from-accent to-accent-700',
    'from-ok-500 to-ok-700',
    'from-primary-500 to-primary-900',
  ]
  return palettes[h % palettes.length]
}

function iconForCategoria(categoria, sizeClass = 'h-12 w-12') {
  const c = (categoria ?? '').toLowerCase()
  if (/salud|caps|m[eé]dic/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sizeClass}>
        <path strokeLinecap="round" d="M12 8v8M8 12h8" /><circle cx="12" cy="12" r="9" />
      </svg>
    )
  }
  if (/obra|infra|catastro/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sizeClass}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    )
  }
  if (/evento|cultural|deport/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sizeClass}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={sizeClass}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4zM4 9h16M9 4v16" />
    </svg>
  )
}

function getResumen(noticia, max = 180) {
  if (noticia.resumen?.trim()) return noticia.resumen
  const cuerpo = noticia.cuerpo?.trim()
  if (!cuerpo) return null
  return cuerpo.length > max ? `${cuerpo.slice(0, max).trimEnd()}…` : cuerpo
}

// Noticia destacada — formato grande con imagen prominente y bajada larga.
function NoticiaFeatured({ noticia }) {
  const resumen = getResumen(noticia, 220)
  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-card transition-shadow hover:shadow-lg">
      <div className="relative aspect-[16/9] w-full overflow-hidden">
        {noticia.imagen_url ? (
          <img
            src={noticia.imagen_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradForCategoria(noticia.categoria)} text-white/85`}>
            {iconForCategoria(noticia.categoria, 'h-20 w-20')}
          </div>
        )}
        {noticia.categoria && (
          <span className="absolute left-4 top-4 inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-900 shadow-sm">
            {noticia.categoria}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        {noticia.publicado_at && (
          <time className="text-xs font-medium uppercase tracking-wide text-primary-400" dateTime={noticia.publicado_at}>
            {dateOf(noticia.publicado_at)}
          </time>
        )}
        <h3 className="font-sora text-2xl font-bold leading-tight text-primary sm:text-3xl">
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
  )
}

// Noticia secundaria — formato horizontal compacto, ícono lateral.
function NoticiaSecondary({ noticia }) {
  const resumen = getResumen(noticia, 100)
  return (
    <article className="group flex gap-3 rounded-xl border border-border bg-white p-3 shadow-card transition-shadow hover:shadow-lg sm:p-4">
      <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-lg sm:h-28 sm:w-32">
        {noticia.imagen_url ? (
          <img
            src={noticia.imagen_url}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradForCategoria(noticia.categoria)} text-white/85`}>
            {iconForCategoria(noticia.categoria, 'h-9 w-9')}
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {noticia.categoria && (
            <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 font-bold uppercase tracking-wide text-accent-700 ring-1 ring-inset ring-accent-100">
              {noticia.categoria}
            </span>
          )}
          {noticia.publicado_at && (
            <time className="font-medium uppercase tracking-wide text-primary-400" dateTime={noticia.publicado_at}>
              {dateOf(noticia.publicado_at)}
            </time>
          )}
        </div>
        <h3 className="line-clamp-2 font-sora text-sm font-semibold leading-snug text-primary group-hover:text-primary-700 sm:text-base">
          {noticia.titulo}
        </h3>
        {resumen && (
          <p className="line-clamp-2 hidden text-xs leading-relaxed text-primary-500 sm:block">
            {resumen}
          </p>
        )}
      </div>
    </article>
  )
}

function NoticiasSection({ noticias, loading, error }) {
  return (
    <section id="noticias" aria-labelledby="noticias-h2" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b-2 border-primary pb-4 sm:mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-accent-700">
              Sala de prensa
            </p>
            <h2 id="noticias-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
              Noticias y anuncios
            </h2>
          </div>
          <p className="text-sm text-primary-500">
            Novedades, comunicados y actividades de la comuna.
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
            const featured  = noticias[0]
            const secondary = noticias.slice(1, 4)
            const rest      = noticias.slice(4, 7)
            const useNewspaperLayout = secondary.length >= 2

            // Si hay menos de 3 noticias, fallback a grid simple.
            if (!useNewspaperLayout) {
              return (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {noticias.map(n => <NoticiaPortalCard key={n.id} noticia={n} />)}
                </div>
              )
            }

            return (
              <>
                <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
                  {/* Destacada — 2/3 en desktop */}
                  <div className="lg:col-span-2">
                    <NoticiaFeatured noticia={featured} />
                  </div>
                  {/* Columna lateral — 1/3 en desktop */}
                  <div className="flex flex-col gap-4">
                    {secondary.map(n => (
                      <NoticiaSecondary key={n.id} noticia={n} />
                    ))}
                  </div>
                </div>

                {/* Noticias adicionales en grid simple debajo */}
                {rest.length > 0 && (
                  <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {rest.map(n => <NoticiaPortalCard key={n.id} noticia={n} />)}
                  </div>
                )}
              </>
            )
          })()
        )}
      </div>
    </section>
  )
}

function ServiciosSection() {
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICIOS.map(s => (
            <div
              key={s.nombre}
              className="flex flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-lg sm:p-6"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-accent">
                {s.icon}
              </div>
              <p className="text-base font-semibold text-primary">{s.nombre}</p>
              <p className="text-xs text-primary-500 sm:text-sm">{s.detalle}</p>
              <p className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-primary-700">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 7v5l3 2" />
                </svg>
                {s.horario}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FooterSection() {
  return (
    <footer id="contacto" className="bg-primary-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
          {/* Contacto */}
          <div>
            <div className="flex items-center gap-3">
              <Escudo className="h-10 w-10" />
              <div>
                <p className="font-sora text-base font-bold">{MUNICIPIO_NOMBRE}</p>
                <p className="text-[11px] uppercase tracking-wide text-white/60">{PROVINCIA}</p>
              </div>
            </div>
            <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-accent">
              Contacto
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-white/80">
              <li>Av. San Martín s/n</li>
              <li>Real Sayana, Santiago del Estero</li>
              <li className="pt-2">Tel: (0385) 4-110-001</li>
              <li>WhatsApp: +54 9 3854 110001</li>
            </ul>
            <div className="mt-4 flex gap-2">
              <a
                href="#"
                aria-label="Facebook"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
              >
                <SocialIcon kind="facebook" />
              </a>
              <a
                href="#"
                aria-label="Instagram"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
              >
                <SocialIcon kind="instagram" />
              </a>
              <a
                href="https://wa.me/5493854110001"
                aria-label="WhatsApp"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-accent hover:text-primary"
              >
                <SocialIcon kind="whatsapp" />
              </a>
            </div>
          </div>

          {/* Dependencias */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent">
              Dependencias
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-white/80">
              {SERVICIOS.map(s => (
                <li key={s.nombre} className="flex flex-col">
                  <span className="font-medium text-white/90">{s.nombre}</span>
                  <span className="text-xs text-white/60">{s.horario}</span>
                </li>
              ))}
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
          <p>© {new Date().getFullYear()} {MUNICIPIO_NOMBRE}. Todos los derechos reservados.</p>
          <p>Portal oficial · Información pública</p>
        </div>
      </div>
    </footer>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

const MODAL_TITLES = {
  'sacar-turno': 'Sacar turno online',
  'mi-turno':    'Consultar mi turno',
  'mi-salud':    'Mi Salud',
}

export default function PortalPublico() {
  const [alertOpen, setAlertOpen] = useState(true)
  const [activeModal, setActiveModal] = useState(null)
  const {
    data: noticias = [],
    isLoading: loadingNoticias,
    error: errNoticias,
  } = useNoticiasPublicas({ limit: 7 })

  const closeModal = () => setActiveModal(null)

  return (
    <div className="min-h-svh bg-background">
      {alertOpen && <AlertBar onClose={() => setAlertOpen(false)} />}
      <Header onOpenForm={setActiveModal} />
      <Hero onOpenForm={setActiveModal} />

      <main>
        <AccesosRapidos onOpenForm={setActiveModal} />
        <NoticiasSection
          noticias={noticias}
          loading={loadingNoticias}
          error={errNoticias}
        />
        <ServiciosSection />
      </main>

      <FooterSection />

      {/* Formularios — ocultos por defecto, se abren desde accesos rápidos */}
      <Modal
        open={activeModal === 'sacar-turno'}
        onClose={closeModal}
        title={MODAL_TITLES['sacar-turno']}
        size="lg"
      >
        <SacarTurnoFormPortal />
      </Modal>
      <Modal
        open={activeModal === 'mi-turno'}
        onClose={closeModal}
        title={MODAL_TITLES['mi-turno']}
        size="md"
      >
        <ConsultarTurnoFormPortal />
      </Modal>
      <Modal
        open={activeModal === 'mi-salud'}
        onClose={closeModal}
        title={MODAL_TITLES['mi-salud']}
        size="lg"
      >
        <MiSaludForm />
      </Modal>
    </div>
  )
}
