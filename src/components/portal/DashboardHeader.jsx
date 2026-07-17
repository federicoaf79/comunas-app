// src/components/portal/DashboardHeader.jsx
// Header compartido del portal del vecino — banner con nombre del municipio + logout

import { Link } from 'react-router-dom'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

// Solo el primer token de `nombre` con casing parejo. La DB suele
// guardar nombres en mayúsculas ("MARIANA VICTORIA"); pasamos a
// formato Title (M + restos en minúscula) para que el saludo se
// vea natural ("Hola, Mariana"). Si nombre viene vacío, devuelve
// string vacío y el caller decide el fallback.
function primerNombreLindo(nombre) {
  const first = (nombre ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first) return ''
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase()
}

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-portal-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z"
        fill="url(#escudo-portal-bg)"
        fillOpacity="0.9"
      />
      <path
        d="M24 8 L36 12 V24 C36 31 30 37 24 40 C18 37 12 31 12 24 V12 L24 8 Z"
        fill="#0F1C35"
        fillOpacity="0.3"
      />
    </svg>
  )
}

/**
 * Header del dashboard del vecino — saludo, datos breves y logout.
 *
 * @param {Object} vecino - Datos del vecino (nombre, dni, barrio, etc.)
 * @param {Function} onSignOut - Callback para cerrar sesión
 * @param {string} [subtitle='Mi cuenta'] - Subtítulo debajo del nombre del municipio
 */
export default function DashboardHeader({ vecino, onSignOut, subtitle = 'Mi cuenta' }) {
  return (
    <header className="border-b border-primary-900 bg-primary text-white">
      <div className="mx-auto max-w-5xl px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/portal" className="flex items-center gap-2.5 text-white">
            <Escudo className="h-8 w-8 shrink-0" />
            <div className="leading-tight">
              <p className="font-sora text-sm font-bold">{MUNICIPIO_NOMBRE}</p>
              <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
                {subtitle}
              </p>
            </div>
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 rounded-md border border-white/20 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Cerrar sesión
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M20 12H9M14 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h7" />
            </svg>
          </button>
        </div>

        {/* Saludo + datos breves en una sola línea (flex-wrap permite
            que en mobile, si no entra, el DNI/barrio caigan abajo). */}
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="font-sora text-xl font-bold leading-tight sm:text-2xl">
            Hola, {primerNombreLindo(vecino?.nombre) || 'vecino'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-white/70">
            {vecino?.dni && <span>DNI {vecino.dni}</span>}
            {(vecino?.barrio || vecino?.localidad) && (
              <span>· {vecino.barrio || vecino.localidad}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
