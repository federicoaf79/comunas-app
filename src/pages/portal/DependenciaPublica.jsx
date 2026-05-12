import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useDependenciaPublica } from '../../hooks/useDependenciaPublica'
import { usePortalMunicipioId } from '../../hooks/useConfigPortal'
import Spinner from '../../components/ui/Spinner'

// =============================================================
// DependenciaPublica — página de detalle de una dependencia del
// portal ciudadano. Ruta /portal/dependencia/:tipo.
//
// Renderiza:
//   - Header con nombre + ícono grande + descripcion_larga
//   - Galería de fotos (fotos[])
//   - Servicios que ofrecemos (servicios[])
//   - Cómo contactarnos (horario, tel, email, whatsapp, canal)
//   - Botón "Sacar turno →" si la dep acepta turnos por su tipo
//   - Botón "← Volver"
// =============================================================

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

// Tipos de dependencia que aceptan turnos online — debe quedar
// alineado con DEP_OPTIONS de SacarTurnoFormPortal.
const TIPOS_CON_TURNOS = new Set(['caps', 'juzgado', 'sum', 'intendencia', 'admin'])

// Detalle/horario por tipo (mismo descriptor que PortalPublico).
// Usado solo como fallback de horario cuando la dependencia no
// tiene info propia cargada.
const DEP_DESCRIPTOR = {
  salud:       { horario: 'Lun a Vie · 8:00 – 20:00' },
  caps:        { horario: 'Lun a Vie · 8:00 – 20:00' },
  juzgado:     { horario: 'Lun a Vie · 7:00 – 13:00' },
  sum:         { horario: 'Reservas · consultar disponibilidad' },
  intendencia: { horario: 'Lun a Vie · 7:00 – 13:00' },
  admin:       { horario: 'Lun a Vie · 7:00 – 13:00' },
  obras:       { horario: 'Lun a Vie · 7:00 – 13:00' },
  deporte:     { horario: 'Consultar horarios' },
  cementerio:  { horario: 'Todos los días · 8:00 – 18:00' },
  velatorio:   { horario: 'Disponibilidad 24/7' },
  policia:     { horario: '24/7 · 911 / 101' },
  educacion:   { horario: 'Lun a Vie · 7:00 – 13:00' },
  bienes:      { horario: 'Lun a Vie · 7:00 – 13:00' },
  social:      { horario: 'Lun a Vie · 7:00 – 13:00' },
  ayuda_social:{ horario: 'Lun a Vie · 7:00 – 13:00' },
}

// Ícono grande de cabecera. Conjunto reducido — los tipos que no
// matchean caen al edificio genérico.
function IconForTipo({ tipo, className = 'h-12 w-12' }) {
  const t = (tipo ?? '').toLowerCase()
  const stroke = '1.4'
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: stroke, 'aria-hidden': 'true', className }
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
  if (/social|familia|comunidad|asisten/.test(t)) return (
    <svg {...common}><path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5V8a2 2 0 1 1 4 0v6l3-1 2 1v3a2 2 0 0 1-2 2h-6l-4-4-2 1V8a2 2 0 1 1 4 0v3.5" /></svg>
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

// Etiqueta humana del canal de atención. La columna en la DB es
// libre — soportamos las 3 opciones del select + cualquier otro
// valor a modo de fallback.
function canalLabel(canal) {
  const c = (canal ?? '').toLowerCase()
  if (c === 'presencial') return 'Atención presencial'
  if (c === 'online')     return 'Atención online'
  if (c === 'mixto')      return 'Atención presencial + online'
  return canal ?? null
}

// Construye el link de WhatsApp con el formato que pidió el sprint:
// https://wa.me/549{whatsapp}. Solo dígitos; si la entrada ya empieza
// con 549 no lo duplicamos.
function whatsappLink(whatsapp) {
  const digits = (whatsapp ?? '').replace(/[^0-9]/g, '')
  if (!digits) return null
  const prefixed = digits.startsWith('549') ? digits : `549${digits.replace(/^54/, '')}`
  return `https://wa.me/${prefixed}`
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

export default function DependenciaPublica() {
  const { tipo } = useParams()
  const { data: municipioId } = usePortalMunicipioId()
  const { data: dep, isLoading } = useDependenciaPublica(tipo, municipioId)
  const [lightbox, setLightbox] = useState(null)

  const servicios = Array.isArray(dep?.servicios) ? dep.servicios.filter(Boolean) : []
  const fotos     = Array.isArray(dep?.fotos)     ? dep.fotos.filter(Boolean)     : []
  const horario   = DEP_DESCRIPTOR[tipo]?.horario ?? null
  const waUrl     = whatsappLink(dep?.whatsapp)
  const canal     = canalLabel(dep?.canal_atencion)
  const aceptaTurnos = TIPOS_CON_TURNOS.has(tipo)

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white">
            <Escudo className="h-9 w-9 shrink-0" />
            <div className="leading-tight">
              <p className="font-sora text-sm font-bold sm:text-base">{MUNICIPIO_NOMBRE}</p>
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
            <Link to="/portal" className="btn-primary mt-6 inline-flex">
              ← Volver al portal
            </Link>
          </div>
        ) : (
          <>
            {/* Header de la dependencia */}
            <section className="rounded-2xl border border-border bg-white p-6 shadow-card sm:p-10">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-primary text-accent sm:h-24 sm:w-24">
                  <IconForTipo tipo={tipo} className="h-12 w-12 sm:h-14 sm:w-14" />
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
                  {/* Botones de acción */}
                  <div className="mt-5 flex flex-wrap gap-3">
                    {aceptaTurnos && (
                      <Link
                        to={`/portal/turno?dep=${encodeURIComponent(tipo)}`}
                        className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-primary-900 shadow-sm transition-all hover:bg-accent-600 hover:text-white active:scale-95"
                      >
                        Sacar turno
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
                        </svg>
                      </Link>
                    )}
                    <Link
                      to="/portal"
                      className="inline-flex items-center gap-2 rounded-lg border-2 border-primary/30 bg-white px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white active:scale-95"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
                      </svg>
                      Volver
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            {/* Galería de fotos */}
            {fotos.length > 0 && (
              <section className="mt-8">
                <h2 className="font-sora text-xl font-bold text-primary sm:text-2xl">Fotos</h2>
                <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
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

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              {/* Servicios */}
              {servicios.length > 0 && (
                <section className="rounded-xl border border-border bg-white p-6 shadow-card">
                  <h2 className="font-sora text-xl font-bold text-primary">
                    Servicios que ofrecemos
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {servicios.map((s, i) => (
                      <li key={s + i} className="flex items-start gap-2 text-sm text-primary-700">
                        <span className="mt-1 inline-flex h-2 w-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* Contacto */}
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
                          className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
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
                        <span>{canal}</span>
                      </dd>
                    </div>
                  )}
                  {!horario && !dep.email_contacto && !waUrl && !canal && (
                    <p className="text-sm text-primary-400">
                      Próximamente vas a poder contactarnos por más canales.
                    </p>
                  )}
                </dl>
              </section>
            </div>
          </>
        )}
      </main>

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </div>
  )
}
