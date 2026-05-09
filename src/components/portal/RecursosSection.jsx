import { useState } from 'react'

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
        titulo: '3 planos de vivienda modelo',
        desc:   'Planos oficiales para construcción de vivienda económica. Aptos para gestión de permisos municipales.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Guía: cómo aislar tu casa del calor',
        desc:   'Tips prácticos para reducir la temperatura interior con materiales accesibles.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Guía: calefacción eficiente y bajo costo',
        desc:   'Opciones de calefacción para el invierno con menor consumo y gasto.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Recomendaciones de iluminación LED',
        desc:   'Cómo reemplazar las luces de tu hogar y bajar la factura eléctrica.',
        tipo:   'pdf',
        url:    '#',
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
        desc:   'Controlá ingresos, gastos y stock de tu negocio. Fácil de usar.',
        tipo:   'xlsx',
        url:    '#',
      },
      {
        titulo: 'Formulario de habilitación comercial',
        desc:   'Documento oficial para iniciar el trámite de habilitación de un comercio.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Guía para emprendedores: primeros pasos',
        desc:   'Información práctica para arrancar un emprendimiento en la comuna.',
        tipo:   'pdf',
        url:    '#',
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
        desc:   'Formulario para iniciar el trámite de permiso ante la Comisión.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Formulario de ayuda social',
        desc:   'Documento para solicitar asistencia del área social del municipio.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Solicitud de turno Juez de Paz',
        desc:   'Formulario para gestionar turno presencial en el Juzgado de Paz.',
        tipo:   'pdf',
        url:    '#',
      },
      {
        titulo: 'Declaración jurada de domicilio',
        desc:   'Modelo oficial de DDJJ para acreditar residencia en la comuna.',
        tipo:   'pdf',
        url:    '#',
      },
    ],
  },
]

function CategoriaTab({ tab, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex shrink-0 items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ' +
        (active
          ? 'border-primary bg-primary text-white shadow-sm'
          : 'border-primary bg-white text-primary hover:bg-primary-50')
      }
    >
      <span aria-hidden="true">{tab.icon}</span>
      <span className="hidden sm:inline">{tab.label}</span>
      <span className="sm:hidden">{tab.short}</span>
    </button>
  )
}

function RecursoCard({ recurso }) {
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-border bg-white p-5 shadow-card transition-shadow hover:shadow-lg">
      <div className="flex items-start gap-3">
        <FileTypeIcon tipo={recurso.tipo} className="h-10 w-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="font-sora text-base font-semibold leading-snug text-primary">
            {recurso.titulo}
          </h3>
        </div>
      </div>
      {recurso.desc && (
        <p className="text-sm leading-relaxed text-primary-500">
          {recurso.desc}
        </p>
      )}
      <a
        href={recurso.url ?? '#'}
        onClick={e => { if (!recurso.url || recurso.url === '#') e.preventDefault() }}
        className="mt-auto inline-flex items-center justify-center gap-2 self-start rounded-md bg-accent px-4 py-2 text-sm font-semibold text-primary-900 shadow-sm transition-colors hover:bg-accent-600 hover:text-white"
        download={recurso.url && recurso.url !== '#' ? '' : undefined}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4 4-4M5 21h14" />
        </svg>
        Descargar
      </a>
    </article>
  )
}

export default function RecursosSection() {
  const [tab, setTab] = useState(CATEGORIAS[0].key)
  const cat = CATEGORIAS.find(c => c.key === tab) ?? CATEGORIAS[0]

  return (
    <section
      aria-labelledby="recursos-h2"
      className="border-y border-border"
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
          Los archivos están en preparación — pronto vas a poder descargar
          cada recurso. Si necesitás alguno con urgencia, acercate a Administración.
        </p>
      </div>
    </section>
  )
}
