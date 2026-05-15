import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabasePublic } from '../../lib/supabase'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-fp-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z"
        fill="url(#escudo-fp-bg)"
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

// Layout compartido por las páginas de formulario del portal.
// Header con logo + botón "Volver al portal", y el formulario
// centrado en una columna.
//
// Por default usa la clase `portal-form-page` que aplica los
// overrides senior-friendly de index.css (inputs ≥52px, labels
// grandes, etc.). Si `compact={true}`, se omite ese wrapper, se
// estrecha la columna a max-w-lg y se baja el peso del header —
// pensado para formularios que tienen muchos campos y necesitan
// caber en pantalla sin scroll horizontal a 100% de zoom.
export default function PortalFormPage({ titulo, descripcion, children, compact = false }) {
  // Logo institucional — query DIRECTA a configuracion_portal con
  // supabasePublic (anon, sin lock de auth), mismo patrón que el
  // Header de PortalPublico (commit 72dfe3e). No depende del bundle
  // ni de useDatosMunicipio, que venían sin devolver identidad_visual.
  // Portal de un solo municipio → traemos la única fila sin filtrar
  // por municipio_id (no lo tenemos en este layout compartido).
  const [logoUrl, setLogoUrl] = useState(null)
  useEffect(() => {
    let cancel = false
    supabasePublic
      .from('configuracion_portal')
      .select('valor')
      .eq('clave', 'identidad_visual')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancel && data?.valor?.logo_url) setLogoUrl(data.valor.logo_url)
      })
    return () => { cancel = true }
  }, [])

  const mainWidth   = compact ? 'max-w-2xl' : 'max-w-3xl'
  const mainPad     = compact ? 'py-6 sm:py-8' : 'py-8 sm:py-12'
  const headerSpace = compact ? 'mb-5 sm:mb-6' : 'mb-8 sm:mb-10'
  const tituloSize  = compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
  const descSize    = compact ? 'mt-2 text-sm sm:text-base' : 'mt-3 text-base sm:text-lg'

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
        <div className={`mx-auto flex ${mainWidth} items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
          <Link to="/portal" className="flex items-center gap-3 text-white">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt="Logo municipio"
                onError={() => setLogoUrl(null)}
                className="h-10 w-auto max-w-[160px] shrink-0 object-contain"
              />
            ) : (
              <Escudo className="h-10 w-10 shrink-0" />
            )}
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

      <main className={`mx-auto ${mainWidth} px-4 ${mainPad} sm:px-6`}>
        <header className={headerSpace}>
          <h1 className={`font-sora ${tituloSize} font-bold leading-tight text-primary`}>
            {titulo}
          </h1>
          {descripcion && (
            <p className={`${descSize} leading-relaxed text-primary-500`}>
              {descripcion}
            </p>
          )}
        </header>
        {/* En modo compact NO aplicamos la clase portal-form-page —
            los inputs caen al .input-field default (px-3 py-2.5 text-sm)
            en vez del bloque senior-friendly de ≥52px. */}
        {compact ? children : <div className="portal-form-page">{children}</div>}
      </main>
    </div>
  )
}
