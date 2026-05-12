import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDependenciaPublica } from '../../hooks/useDependenciaPublica'
import { usePortalMunicipioId, useDatosMunicipio } from '../../hooks/useConfigPortal'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// DependenciaPublica — landing pública de una dependencia.
// Ruta /portal/dependencia/:tipo (acepta también slug o nombre
// normalizado — el match lo resuelve useDependenciaPublica).
//
// Secciones:
//   1) Header con ícono + nombre + descripción + horario badge
//   2) Servicios (con CTA admin si está vacío)
//   3) Cómo contactarnos (horario, tel, email, WhatsApp, canal)
//   4) Dónde encontrarnos (dirección + Google Maps embed)
//   5) Fotos (si hay)
//   6) Botones "Sacar turno" + "Volver al portal" arriba y abajo
//   7) Banner gold para admin si la dep está vacía
// =============================================================

// Tipos de dependencia que aceptan turnos online — alineado con
// DEP_OPTIONS de SacarTurnoFormPortal.
const TIPOS_CON_TURNOS = new Set(['caps', 'salud', 'juzgado', 'sum', 'social', 'ayuda_social', 'intendencia', 'admin'])

// Fallback de horario por tipo cuando la dependencia no tiene
// `horario_atencion` cargado en la DB.
const HORARIO_FALLBACK = {
  salud:        'Lun a Vie · 8:00 – 20:00',
  caps:         'Lun a Vie · 8:00 – 20:00',
  juzgado:      'Lun a Vie · 7:00 – 13:00',
  sum:          'Reservas · consultar disponibilidad',
  intendencia:  'Lun a Vie · 7:00 – 13:00',
  admin:        'Lun a Vie · 7:00 – 13:00',
  obras:        'Lun a Vie · 7:00 – 13:00',
  obras_publicas:'Lun a Vie · 7:00 – 13:00',
  deporte:      'Consultar horarios',
  polideportivo:'Consultar horarios',
  cementerio:   'Todos los días · 8:00 – 18:00',
  velatorio:    'Disponibilidad 24/7',
  policia:      '24/7 · 911 / 101',
  policial:     '24/7 · 911 / 101',
  educacion:    'Lun a Vie · 7:00 – 13:00',
  bienes:       'Lun a Vie · 7:00 – 13:00',
  social:       'Lun a Vie · 7:00 – 13:00',
  ayuda_social: 'Lun a Vie · 7:00 – 13:00',
  alumbrado:    'Lun a Vie · 7:00 – 13:00',
  verde:        'Lun a Vie · 7:00 – 13:00',
  espacios_verdes:'Lun a Vie · 7:00 – 13:00',
}

// Ícono grande de cabecera. Conjunto reducido — los tipos que no
// matchean caen al edificio genérico.
function IconForTipo({ tipo, className = 'h-12 w-12' }) {
  const t = (tipo ?? '').toLowerCase()
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '1.4', 'aria-hidden': 'true', className }
  if (/caps|salud|sala/.test(t)) return (
    <svg {...common}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 8v8M8 12h8" /></svg>
  )
  if (/juzgado|paz|justicia/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" /></svg>
  )
  if (/sum|sal[oó]n|cultural/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" /></svg>
  )
  if (/intendencia|admin|gobierno|comuna|gesti/.test(t)) return (
    <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" /></svg>
  )
  if (/obra|construc|infra|catastro/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M9 7v4M15 7v4M9 11h6" /></svg>
  )
  if (/social|familia|comunidad|asisten|ayuda/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-4.5-9-9c-1.5-3 0-7 4-7 2.5 0 4 1.5 5 3 1-1.5 2.5-3 5-3 4 0 5.5 4 4 7-2 4.5-9 9-9 9z" /></svg>
  )
  if (/alumbrado|elect/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M13 2 4 14h7l-1 8 9-12h-7l1-8z" /></svg>
  )
  if (/verde|parque|plaza|forestaci/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 6-3 16-9 16zM4 20l6-6" /></svg>
  )
  if (/polic|seguridad|defensa/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" /></svg>
  )
  if (/cementerio|necr/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M8 21v-9a4 4 0 0 1 8 0v9M12 8V4M10 6h4M5 21h14" /></svg>
  )
  if (/educ|escuel|jardi|primaria|secundaria|biblioteca/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5h7a3 3 0 0 1 3 3v12a3 3 0 0 0-3-3H3V5zM21 5h-7a3 3 0 0 0-3 3v12a3 3 0 0 1 3-3h7V5z" /></svg>
  )
  return (
    <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" /></svg>
  )
}

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-dp-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z" fill="url(#escudo-dp-bg)" stroke="#0F1C35" strokeWidth="1.5" />
      <path d="M24 12 L26 19 L33 19 L27.5 23 L29.5 30 L24 26 L18.5 30 L20.5 23 L15 19 L22 19 Z" fill="#0F1C35" />
    </svg>
  )
}

function canalLabel(canal) {
  const c = (canal ?? '').toLowerCase()
  if (c === 'presencial') return 'Atención presencial'
  if (c === 'online')     return 'Atención online'
  if (c === 'mixto')      return 'Atención presencial + online'
  return canal ?? null
}

function whatsappLink(whatsapp) {
  const digits = (whatsapp ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const prefixed = digits.startsWith('549') ? digits : `549${digits.replace(/^54/, '')}`
  return `https://wa.me/${prefixed}`
}

// Sanea el teléfono para tel:. Conserva +; descarta paréntesis, guiones, espacios.
function telLink(tel) {
  const t = (tel ?? '').replace(/[^\d+]/g, '')
  return t || null
}

// Construye la URL del iframe de Google Maps embed. Cae al
// nombre del municipio + provincia si la dependencia no tiene
// dirección propia.
function mapaEmbedUrl(direccion, muniDatos) {
  const muniFallback = [muniDatos?.nombre, muniDatos?.provincia, 'Argentina']
    .filter(Boolean).join(' ')
  const q = (direccion && direccion.trim())
    ? direccion.trim()
    : (muniFallback || 'Argentina')
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&output=embed`
}

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

function BackLink({ extra = '' }) {
  return (
    <Link
      to="/portal"
      className={`inline-flex items-center gap-2 rounded-lg border-2 border-primary/30 bg-white px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white active:scale-95 ${extra}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
      </svg>
      Volver al portal
    </Link>
  )
}

export default function DependenciaPublica() {
  const { tipo } = useParams()
  const { data: municipioId } = usePortalMunicipioId()
  const { data: dep, isLoading } = useDependenciaPublica(tipo, municipioId)
  const { datos: muniDatos } = useDatosMunicipio()
  const { perfil, hasRole } = useAuth()
  const esAdmin = !!perfil && hasRole(['admin_comuna', 'superadmin', 'admin_portal'])

  const [lightbox, setLightbox] = useState(null)

  const muniNombre = muniDatos?.nombre || 'Comisión Municipal Real Sayana'
  const tipoMatch  = (dep?.tipo ?? tipo ?? '').toLowerCase()

  const servicios = Array.isArray(dep?.servicios) ? dep.servicios.filter(Boolean) : []
  const fotos     = Array.isArray(dep?.fotos)     ? dep.fotos.filter(Boolean)     : []
  const horario   = dep?.horario_atencion || HORARIO_FALLBACK[tipoMatch] || null
  const direccion = dep?.direccion || null
  const telefono  = telLink(dep?.telefono)
  const waUrl     = whatsappLink(dep?.whatsapp)
  const canal     = canalLabel(dep?.canal_atencion)
  const aceptaTurnos = TIPOS_CON_TURNOS.has(tipoMatch)

  // Banner para admin si la landing está prácticamente vacía. Sirve
  // para que el equipo se entere de que falta cargar contenido sin
  // exponer ese mensaje al vecino.
  const contenidoVacio = !dep?.descripcion_larga && servicios.length === 0 && fotos.length === 0

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white">
            <Escudo className="h-9 w-9 shrink-0" />
            <div className="leading-tight">
              <p className="font-sora text-sm font-bold sm:text-base">{muniNombre}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
                Portal Ciudadano
              </p>
            </div>
          </Link>
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            <span className="hidden sm:inline">Volver al portal</span>
            <span className="sm:hidden">Volver</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        {isLoading ? (
          <div className="card flex items-center justify-center p-12">
            <Spinner size="lg" />
          </div>
        ) : !dep ? (
          <div className="card p-10 text-center">
            <p className="font-sora text-lg font-semibold text-primary">
              No encontramos esta dependencia.
            </p>
            <p className="mt-2 text-sm text-primary-500">
              Es posible que el enlace haya cambiado o que la dependencia esté inactiva.
            </p>
            <BackLink extra="mt-6" />
          </div>
        ) : (
          <>
            {esAdmin && contenidoVacio && (
              <div className="mb-6 rounded-xl border border-[#C9A84C]/40 bg-[#C9A84C]/10 p-4 text-sm text-primary-800">
                <p className="font-sora font-semibold">Esta dependencia no tiene contenido configurado.</p>
                <p className="mt-1 text-primary-700">
                  Cargá descripción, servicios y fotos desde{' '}
                  <Link to="/admin/config?tab=dependencias" className="font-semibold text-primary underline decoration-[#C9A84C] underline-offset-2 hover:text-primary-900">
                    Portal Web → Dependencias →
                  </Link>
                </p>
              </div>
            )}

            {/* ===== 1. Header de la dependencia ===== */}
            <section className="rounded-2xl border border-border bg-white p-6 shadow-card sm:p-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary text-accent sm:h-24 sm:w-24">
                  <IconForTipo tipo={tipoMatch} className="h-12 w-12 sm:h-14 sm:w-14" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
                    Dependencia municipal
                  </p>
                  <h1 className="mt-1 font-sora text-3xl font-bold leading-tight text-primary sm:text-4xl">
                    {dep.nombre}
                  </h1>
                  {dep.descripcion_larga && (
                    <p className="mt-3 whitespace-pre-line text-base leading-relaxed text-primary-700">
                      {dep.descripcion_larga}
                    </p>
                  )}
                  {horario && (
                    <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-100">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                        <circle cx="12" cy="12" r="9" />
                        <path strokeLinecap="round" d="M12 7v5l3 2" />
                      </svg>
                      {horario}
                    </span>
                  )}
                  {/* Botones de acción */}
                  <div className="mt-5 flex flex-wrap gap-3">
                    {aceptaTurnos && (
                      <Link
                        to={`/portal/turno?dep=${encodeURIComponent(tipoMatch)}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-primary-900 shadow-sm transition-all hover:bg-accent-600 hover:text-white active:scale-95"
                      >
                        Sacar turno
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </Link>
                    )}
                    <BackLink />
                  </div>
                </div>
              </div>
            </section>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* ===== 2. Servicios ===== */}
              <section className="rounded-xl border border-border bg-white p-6 shadow-card">
                <h2 className="font-sora text-xl font-bold text-primary">
                  Servicios que ofrecemos
                </h2>
                {servicios.length > 0 ? (
                  <ul className="mt-4 space-y-2.5">
                    {servicios.map((s, i) => (
                      <li key={s + i} className="flex items-start gap-2.5 text-sm text-primary-700">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-white" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                ) : esAdmin ? (
                  <p className="mt-4 rounded-md border border-dashed border-[#C9A84C]/40 bg-[#C9A84C]/5 p-3 text-xs text-primary-700">
                    Configurá los servicios desde{' '}
                    <Link to="/admin/config?tab=dependencias" className="font-semibold underline decoration-[#C9A84C] underline-offset-2">
                      Portal Web → Dependencias
                    </Link>
                  </p>
                ) : (
                  <p className="mt-4 text-sm text-primary-400">
                    Próximamente vas a poder ver el detalle de los servicios.
                  </p>
                )}
              </section>

              {/* ===== 3. Contacto ===== */}
              <section className="rounded-xl border border-border bg-white p-6 shadow-card">
                <h2 className="font-sora text-xl font-bold text-primary">
                  Cómo contactarnos
                </h2>
                <dl className="mt-4 space-y-3 text-sm">
                  {horario && (
                    <div className="flex items-start gap-3">
                      <dt className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <circle cx="12" cy="12" r="9" />
                          <path strokeLinecap="round" d="M12 7v5l3 2" />
                        </svg>
                      </dt>
                      <dd className="text-primary-700">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-primary-400">Horario</span>
                        <span>{horario}</span>
                      </dd>
                    </div>
                  )}
                  {telefono && (
                    <div className="flex items-start gap-3">
                      <dt className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </dt>
                      <dd className="text-primary-700">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-primary-400">Teléfono</span>
                        <a href={`tel:${telefono}`} className="hover:underline">
                          {dep.telefono}
                        </a>
                      </dd>
                    </div>
                  )}
                  {dep.email_contacto && (
                    <div className="flex items-start gap-3">
                      <dt className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <rect x="3" y="5" width="18" height="14" rx="2" />
                          <path strokeLinecap="round" d="M3 7l9 6 9-6" />
                        </svg>
                      </dt>
                      <dd className="text-primary-700">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-primary-400">Email</span>
                        <a href={`mailto:${dep.email_contacto}`} className="hover:underline">
                          {dep.email_contacto}
                        </a>
                      </dd>
                    </div>
                  )}
                  {waUrl && (
                    <div className="flex items-start gap-3">
                      <dt className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4 8 8 0 0 0 4.05 12a7.94 7.94 0 0 0 1.07 4l-1.13 4.13 4.23-1.11A8 8 0 0 0 12.05 20a8 8 0 0 0 8-8 7.94 7.94 0 0 0-2.45-5.68zm-5.55 12.34a6.65 6.65 0 0 1-3.4-.93l-.24-.14-2.51.66.67-2.45-.16-.25a6.65 6.65 0 0 1-1.02-3.55 6.66 6.66 0 1 1 6.66 6.66z" />
                        </svg>
                      </dt>
                      <dd className="text-primary-700">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-primary-400">WhatsApp</span>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                        >
                          Enviar mensaje
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                          </svg>
                        </a>
                      </dd>
                    </div>
                  )}
                  {canal && (
                    <div className="flex items-start gap-3">
                      <dt className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                          <circle cx="12" cy="8" r="4" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
                        </svg>
                      </dt>
                      <dd className="text-primary-700">
                        <span className="block text-xs font-semibold uppercase tracking-wide text-primary-400">Canal de atención</span>
                        <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
                          {canal}
                        </span>
                      </dd>
                    </div>
                  )}
                  {!horario && !telefono && !dep.email_contacto && !waUrl && !canal && (
                    <p className="text-sm text-primary-400">
                      Próximamente vas a poder contactarnos por más canales.
                    </p>
                  )}
                </dl>
              </section>
            </div>

            {/* ===== 4. Dónde encontrarnos ===== */}
            <section className="mt-6 rounded-xl border border-border bg-white p-6 shadow-card">
              <h2 className="font-sora text-xl font-bold text-primary">
                Dónde encontrarnos
              </h2>
              {direccion ? (
                <p className="mt-2 text-sm text-primary-700">
                  <span className="font-semibold">Dirección:</span> {direccion}
                </p>
              ) : (
                <p className="mt-2 text-xs italic text-primary-400">
                  Mostrando la ubicación general del municipio — esta dependencia no
                  tiene una dirección específica cargada.
                </p>
              )}
              <div className="mt-4 overflow-hidden rounded-lg border border-border">
                <iframe
                  title={`Mapa de ${dep.nombre}`}
                  src={mapaEmbedUrl(direccion, muniDatos)}
                  width="100%"
                  height="240"
                  style={{ border: 0 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
            </section>

            {/* ===== 5. Fotos ===== */}
            {fotos.length > 0 && (
              <section className="mt-8">
                <h2 className="font-sora text-xl font-bold text-primary sm:text-2xl">Fotos</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:gap-4">
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
                        className="aspect-[4/3] w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* ===== 6. Botones inferiores ===== */}
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
              <BackLink />
              {aceptaTurnos && (
                <Link
                  to={`/portal/turno?dep=${encodeURIComponent(tipoMatch)}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-primary-900 shadow-sm transition-all hover:bg-accent-600 hover:text-white active:scale-95"
                >
                  Sacar turno
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              )}
            </div>
          </>
        )}
      </main>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
