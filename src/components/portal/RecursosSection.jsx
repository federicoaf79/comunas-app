import { useState } from 'react'
import { Link } from 'react-router-dom'

// =============================================================
// Recursos para la comunidad — biblioteca de descargas pública.
// Por ahora los archivos son placeholder (href="#") porque el
// flujo de carga real lo va a manejar el admin más adelante.
// El componente queda armado para que el día que existan los
// archivos, el cambio sea solo cambiar la URL en cada item.
// =============================================================

// Íconos por tipo de archivo — colores por convención:
//   pdf   → danger (rojo)
//   xlsx  → ok (azul)
//   link  → accent-700 (gold)
function FileTypeIcon({ tipo, className = 'h-9 w-9' }) {
  if (tipo === 'xlsx') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`${className} text-ok-700`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 13l2 3-2 3M14 13l2 3-2 3" />
      </svg>
    )
  }
  if (tipo === 'link') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`${className} text-accent-700`}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      </svg>
    )
  }
  // default: pdf
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={`${className} text-danger`}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" />
      <text x="12" y="17" textAnchor="middle" fontSize="5" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
    </svg>
  )
}

const CATEGORIAS = [
  {
    key:    'hogar',
    label:  'Construcción y hogar',
    short:  'Hogar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 12 12 3l10 9M5 10v11h14V10M9 21v-6h6v6" />
      </svg>
    ),
    items: [
      {
        titulo: 'Plano Casa Modelo 1 — 8×15m, 2 dormitorios',
        desc:   'Planta baja, fachada, isométrico, instalaciones hidro/eléctrica y estructural. Terreno 8×15m.',
        tipo:   'pdf',
        url:    'https://tuvfrnjnupfurzkepsod.supabase.co/storage/v1/object/public/recursos/construccion/plano-casa-1-8x15m-2rec.pdf',
      },
      {
        titulo: 'Plano Casa Modelo 2 — 7×16m, 2 dormitorios',
        desc:   'Estilo tradicional en planta baja. Planos completos de arquitectura e instalaciones.',
        tipo:   'pdf',
        url:    'https://tuvfrnjnupfurzkepsod.supabase.co/storage/v1/object/public/recursos/construccion/plano-casa-2-7x16m-2rec.pdf',
      },
      {
        titulo: 'Plano Casa Modelo 3 — 5×11m, 3 dormitorios, 2 pisos',
        desc:   'Vivienda progresiva en 3 etapas. Planta baja y alta, instalaciones y estructura.',
        tipo:   'pdf',
        url:    'https://tuvfrnjnupfurzkepsod.supabase.co/storage/v1/object/public/recursos/construccion/plano-casa-3-5x11m-3rec-2pisos.pdf',
      },
      {
        titulo: 'Plano Casa Modelo 4 — 9×17m, 2 dormitorios (70–100m²)',
        desc:   'Vivienda de mayor superficie con garage, jardín y patio de servicio.',
        tipo:   'pdf',
        url:    'https://tuvfrnjnupfurzkepsod.supabase.co/storage/v1/object/public/recursos/construccion/plano-casa-4-9x17m-2rec-70-100m2.pdf',
      },
      {
        titulo: 'Guía: cómo aislar tu casa del calor',
        desc:   'Manual de Vivienda Sustentable — Ministerio de Ambiente. Tips para reducir la temperatura interior.',
        tipo:   'pdf',
        url:    'https://www.argentina.gob.ar/ambiente/desarrollo-sostenible/vivienda/manual',
      },
      {
        titulo: 'Guía: calefacción eficiente y bajo costo',
        desc:   'Opciones de calefacción, aislación y consejos para bajar la factura energética en el hogar.',
        tipo:   'pdf',
        url:    'https://tuvfrnjnupfurzkepsod.supabase.co/storage/v1/object/public/recursos/construccion/guia_calefaccion_eficiente.pdf',
      },
      {
        titulo: 'Recomendaciones de iluminación LED',
        desc:   'Cómo reemplazar las luces del hogar y bajar la factura eléctrica con tecnología LED.',
        tipo:   'pdf',
        url:    'https://www.argentina.gob.ar/ambiente/desarrollo-sostenible/vivienda/manual',
      },
    ],
  },
  {
    key:    'gestion',
    label:  'Gestión y negocios',
    short:  'Gestión',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-6" />
      </svg>
    ),
    items: [
      {
        titulo: 'Planilla de administración de negocio',
        desc:   'Planilla Excel gratuita para controlar ingresos, egresos y stock de tu negocio. Lista para usar.',
        tipo:   'xlsx',
        url:    'https://siempreexcel.com/plantilla-ingresos-y-egresos-excel-gratis/',
      },
      {
        titulo: 'Formulario de habilitación comercial',
        desc:   'Portal oficial Argentina.gob.ar — pasos para habilitar tu comercio: CUIT, monotributo y municipio.',
        tipo:   'pdf',
        url:    'https://www.argentina.gob.ar/tema/emprender/soy-emprendedor',
      },
      {
        titulo: 'Guía para emprendedores: primeros pasos',
        desc:   'Guía completa para emprendimientos urbanos, digitales y rurales. Trámites, herramientas y recursos gratuitos.',
        tipo:   'pdf',
        url:    'https://tuvfrnjnupfurzkepsod.supabase.co/storage/v1/object/public/recursos/gestion/guia_emprendedores_comunas.pdf',
      },
    ],
  },
  {
    key:    'tramites',
    label:  'Trámites y formularios',
    short:  'Trámites',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
    items: [
      {
        titulo: 'Solicitud de permiso de construcción',
        desc:   'Formulario para iniciar el trámite de permiso ante la Comisión. Retirá en Administración.',
        tipo:   'pdf',
        url:    '#tramite-presencial',
      },
      {
        titulo: 'Formulario de ayuda social',
        desc:   'Documento para solicitar asistencia del área social del municipio. Retirá en Administración.',
        tipo:   'pdf',
        url:    '#tramite-presencial',
      },
      {
        titulo: 'Solicitud de turno Juez de Paz',
        desc:   'Formulario para gestionar turno presencial en el Juzgado de Paz. Retirá en Administración.',
        tipo:   'pdf',
        url:    '#tramite-presencial',
      },
      {
        titulo: 'Declaración jurada de domicilio',
        desc:   'Modelo oficial de DDJJ para acreditar residencia en la comuna. Retirá en Administración.',
        tipo:   'pdf',
        url:    '#tramite-presencial',
      },
    ],
  },
  {
    // Tab-shortcut: no monta cards de descarga; al click navega a
    // /portal/videos. `items` queda vacío para que la lógica de
    // render del grid no se rompa si alguien forzara su selección.
    key:    'videos',
    label:  'Videos educativos',
    short:  'Videos',
    to:     '/portal/videos',
    badge:  '15',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7z" />
      </svg>
    ),
    items: [],
  },
]

function CategoriaTab({ tab, active, onClick }) {
  const baseCls =
    'inline-flex shrink-0 items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ' +
    (active
      ? 'border-primary bg-primary text-white shadow-sm'
      : 'border-primary bg-white text-primary hover:bg-primary-50')

  // Badge contador opcional — color depende del estado activo del
  // tab para mantener contraste contra el fondo.
  const badgeCls =
    'inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ' +
    (active ? 'bg-accent text-primary-900' : 'bg-accent text-primary-900')

  const inner = (
    <>
      <span aria-hidden="true">{tab.icon}</span>
      <span className="hidden sm:inline">{tab.label}</span>
      <span className="sm:hidden">{tab.short}</span>
      {tab.badge && <span className={badgeCls}>{tab.badge}</span>}
    </>
  )

  // Si la tab tiene `to`, no es una pestaña de contenido sino un
  // shortcut a otra ruta del portal — renderea como Link en lugar
  // de button. No mantenemos estado activo: al click navegamos.
  if (tab.to) {
    return (
      <Link to={tab.to} className={baseCls}>
        {inner}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={baseCls}
    >
      {inner}
    </button>
  )
}

function RecursoCard({ recurso }) {
  const presencial = recurso.url === '#tramite-presencial'
  const [showHint, setShowHint] = useState(false)

  const handleClick = e => {
    if (presencial) {
      e.preventDefault()
      setShowHint(true)
      window.clearTimeout(handleClick._t)
      handleClick._t = window.setTimeout(() => setShowHint(false), 4000)
      return
    }
    if (!recurso.url || recurso.url === '#') e.preventDefault()
  }

  const isExternal =
    recurso.url && recurso.url !== '#' && !recurso.url.startsWith('#')

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-white p-3 shadow-card transition-shadow hover:shadow-lg sm:p-4">
      <div className="flex items-start gap-3">
        <FileTypeIcon tipo={recurso.tipo} className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-sora text-sm font-semibold leading-snug text-primary">
            {recurso.titulo}
          </h3>
        </div>
      </div>
      {recurso.desc && (
        <p className="text-xs leading-relaxed text-primary-500">
          {recurso.desc}
        </p>
      )}
      <div className="mt-auto flex flex-col gap-2">
        <a
          href={recurso.url ?? '#'}
          onClick={handleClick}
          target={isExternal ? '_blank' : undefined}
          rel={isExternal ? 'noopener noreferrer' : undefined}
          className="inline-flex items-center justify-center gap-2 self-start rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-primary-900 shadow-sm transition-colors hover:bg-accent-600 hover:text-white"
          title={presencial ? 'Este formulario se retira de forma presencial en la Comisión Municipal.' : undefined}
        >
          {presencial ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4 4-4M5 21h14" />
            </svg>
          )}
          {presencial ? 'Solicitar en Administración' : 'Descargar'}
        </a>
        {presencial && showHint && (
          <p
            role="status"
            className="rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-xs leading-snug text-primary-700"
          >
            Este formulario se retira de forma presencial en la Comisión Municipal.
          </p>
        )}
      </div>
    </article>
  )
}

export default function RecursosSection() {
  const [tab, setTab] = useState(CATEGORIAS[0].key)
  const cat = CATEGORIAS.find(c => c.key === tab) ?? CATEGORIAS[0]

  return (
    <section
      id="recursos"
      aria-labelledby="recursos-h2"
      className="scroll-mt-20 border-y border-border"
      style={{ backgroundColor: '#F5F4EF' }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-6 sm:mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
            Biblioteca de descargas
          </p>
          <h2 id="recursos-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
            Recursos para la comunidad
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-primary-500 sm:text-base">
            Herramientas, guías y formularios gratuitos.
          </p>
        </header>

        <div
          role="tablist"
          aria-label="Categoría de recursos"
          className="mb-6 flex gap-2 overflow-x-auto pb-1 sm:mb-8"
        >
          {CATEGORIAS.map(c => (
            <CategoriaTab
              key={c.key}
              tab={c}
              active={tab === c.key}
              onClick={() => setTab(c.key)}
            />
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cat.items.map(item => (
            <RecursoCard key={item.titulo} recurso={item} />
          ))}
        </div>

        <p className="mt-6 text-xs text-primary-400 sm:mt-8">
          Los planos son orientativos. Consultá con un profesional para adaptar
          el diseño a tu terreno y normativa local.
        </p>
      </div>
    </section>
  )
}
