import { useState } from 'react'
import { Link } from 'react-router-dom'
import PortalFormPage from '../../components/portal/PortalFormPage'
import { useConfigClavePublica } from '../../hooks/useConfigPortal'
import {
  TRAMITES_PORTAL_DEFAULT,
  TRAMITE_TIPO_META,
  TRAMITE_PRESENCIAL_HINT,
} from '../../lib/portalDefaults'

// =============================================================
// /portal/tramites — landing pública con todos los trámites
// disponibles. Datos en configuracion_portal.tramites_portal (la
// migration 20260514_tramites_portal_anon.sql destraba la lectura
// anon). Si no hay valor persistido, caemos al array default del
// frontend (src/lib/portalDefaults.js) para que la página nunca
// quede pelada.
//
// Comportamiento del CTA por tipo:
//   turno   / reserva / reclamo → <Link to={url}>
//   presencial                  → mostrar hint inline "se realiza
//                                  en Administración Municipal".
// =============================================================

// SVG por nombre de ícono. Mismo estilo (h-6, stroke 1.6) que los
// íconos de las cards de dependencias del portal — paleta navy/gold.
function TramiteIcon({ icono }) {
  const cls = 'h-6 w-6'
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.6',
    'aria-hidden': true,
    className: cls,
  }
  switch (icono) {
    case 'salud':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 8v8M8 12h8" />
        </svg>
      )
    case 'justicia':
      return (
        <svg {...props}>
          <path strokeLinecap="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
        </svg>
      )
    case 'edificio':
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path strokeLinecap="round" d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      )
    case 'construccion':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 18h18M5 18v-3a7 7 0 0 1 14 0v3M9 7v4M15 7v4M9 11h6" />
        </svg>
      )
    case 'social':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 11.5V8a2 2 0 1 1 4 0v6l3-1 2 1v3a2 2 0 0 1-2 2h-6l-4-4-2 1V8a2 2 0 1 1 4 0v3.5" />
        </svg>
      )
    case 'documento':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5M9 13h6M9 17h6" />
        </svg>
      )
    case 'comercio':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h18l-1.5 11a2 2 0 0 1-2 1.7H6.5a2 2 0 0 1-2-1.7L3 8zM8 8V6a4 4 0 0 1 8 0v2" />
        </svg>
      )
    case 'alumbrado':
      return (
        <svg {...props}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 2a6 6 0 0 0-3 11.2V16h6v-2.8A6 6 0 0 0 12 2zM9 18h6M10 21h4" />
        </svg>
      )
    default:
      return (
        <svg {...props}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      )
  }
}

function TramiteBadge({ tipo }) {
  const meta = TRAMITE_TIPO_META[tipo] ?? TRAMITE_TIPO_META.presencial
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ${meta.cls}`}>
      {meta.label}
    </span>
  )
}

function TramiteCard({ tramite }) {
  const [hintOpen, setHintOpen] = useState(false)
  const isPresencial = tramite.tipo === 'presencial' || tramite.url === '#tramite-presencial'

  // Hint auto-cierra a los 5s — mismo patrón que el RecursoCard
  // de RecursosSection para mantener UX consistente.
  function handleClick(e) {
    if (!isPresencial) return
    e.preventDefault()
    setHintOpen(true)
    window.clearTimeout(handleClick._t)
    handleClick._t = window.setTimeout(() => setHintOpen(false), 5000)
  }

  const cardInner = (
    <>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-accent">
          <TramiteIcon icono={tramite.icono} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-sora text-sm font-bold leading-snug text-primary">
            {tramite.titulo}
          </h3>
          <div className="mt-1">
            <TramiteBadge tipo={tramite.tipo} />
          </div>
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-primary-500">
        {tramite.descripcion}
      </p>
      <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-accent-700 group-hover:text-accent-800">
        {isPresencial ? 'Cómo hacerlo' : 'Iniciar trámite'}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </div>
    </>
  )

  const cardCls =
    'group flex h-full flex-col rounded-xl border border-border bg-white p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg'

  return (
    <article className="flex flex-col gap-2">
      {isPresencial ? (
        <a href="#tramite-presencial" onClick={handleClick} className={cardCls}>
          {cardInner}
        </a>
      ) : (
        <Link to={tramite.url} className={cardCls}>
          {cardInner}
        </Link>
      )}
      {hintOpen && (
        <p
          role="status"
          className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-xs leading-snug text-primary-700"
        >
          {TRAMITE_PRESENCIAL_HINT}
        </p>
      )}
    </article>
  )
}

export default function TramitesPortal() {
  // El default `TRAMITES_PORTAL_DEFAULT` se devuelve cuando la clave
  // no está cargada en DB o el SELECT anon falla (RLS, network).
  const { data: tramites = TRAMITES_PORTAL_DEFAULT } =
    useConfigClavePublica('tramites_portal', TRAMITES_PORTAL_DEFAULT)
  const activos = (Array.isArray(tramites) ? tramites : TRAMITES_PORTAL_DEFAULT)
    .filter(t => t?.activo !== false)

  return (
    <PortalFormPage
      titulo="Trámites disponibles"
      descripcion="Desde acá podés iniciar los trámites online o consultar cómo se hacen los presenciales en Administración Municipal."
    >
      {activos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay trámites publicados en este momento.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activos.map(t => (
            <TramiteCard key={t.id} tramite={t} />
          ))}
        </div>
      )}
    </PortalFormPage>
  )
}
