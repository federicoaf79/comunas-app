import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Spinner from '../ui/Spinner'

// =============================================================
// Noticias de la provincia — feed RSS de medios externos vía
// rss2json.com (proxy gratuito que convierte RSS a JSON).
//
// Es contenido de TERCEROS — el visual lo deja claro con el
// badge "EXTERNO" en cada card y un disclaimer en el header.
// Los enlaces abren en pestaña nueva con rel=noopener noreferrer.
// =============================================================

const FUENTES = [
  {
    key:   'liberal',
    label: 'El Liberal',
    url:   'https://api.rss2json.com/v1/api.json?rss_url=https://www.elliberal.com.ar/rss/',
  },
  {
    key:   'panorama',
    label: 'Panorama',
    url:   'https://api.rss2json.com/v1/api.json?rss_url=https://www.diariopanorama.com/rss/',
  },
]

const MAX_ITEMS = 8
const STALE_MS  = 15 * 60 * 1000  // 15 minutos — el RSS no cambia tan seguido

async function fetchRss(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (data?.status !== 'ok') {
    throw new Error(data?.message ?? 'No se pudo leer el RSS.')
  }
  return (data.items ?? []).slice(0, MAX_ITEMS)
}

// Intenta resolver una URL de imagen para el item. Prioriza:
//   1. thumbnail (rss2json a veces lo extrae)
//   2. enclosure.link (estándar RSS para adjuntos)
//   3. primer <img src> dentro de description (HTML embebido)
// Filtra a solo `http(s)://` para evitar javascript:/data: URLs.
function getImageUrl(item) {
  const isHttp = (u) => typeof u === 'string' && /^https?:\/\//i.test(u)
  if (isHttp(item.thumbnail))      return item.thumbnail
  if (isHttp(item.enclosure?.link)) return item.enclosure.link
  const m = (item.description ?? '').match(/<img[^>]+src=['"]([^'"]+)['"]/i)
  if (m && isHttp(m[1])) return m[1]
  return null
}

const _fechaFmt = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit', month: 'short', year: 'numeric',
})
function fmtFecha(pubDate) {
  if (!pubDate) return ''
  const d = new Date(pubDate)
  return isNaN(d) ? '' : _fechaFmt.format(d)
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────

function FuenteChip({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ' +
        (active
          ? 'border-primary bg-primary text-accent shadow-sm'
          : 'border-border bg-white text-primary-700 hover:border-primary-200 hover:bg-primary-50')
      }
    >
      {label}
    </button>
  )
}

function PlaceholderImg() {
  return (
    <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-primary via-primary-700 to-primary-900 text-white/70">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-12 w-12" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4zM4 9h16M9 4v16" />
      </svg>
    </div>
  )
}

function NoticiaExternaCard({ item }) {
  const img = getImageUrl(item)
  return (
    <a
      href={item.link}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="flex h-full flex-col">
        <div className="relative">
          {img ? (
            <img
              src={img}
              alt=""
              className="aspect-[16/9] w-full object-cover"
              loading="lazy"
              onError={e => { e.currentTarget.style.opacity = '0.3' }}
            />
          ) : (
            <PlaceholderImg />
          )}
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary-900/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent shadow-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-2.5 w-2.5" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
            </svg>
            Externo
          </span>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-3 font-sora text-sm font-semibold leading-snug text-primary group-hover:text-primary-700 sm:text-[15px]">
            {item.title}
          </h3>
          {item.pubDate && (
            <time className="mt-auto text-[11px] font-medium uppercase tracking-wide text-primary-400" dateTime={item.pubDate}>
              {fmtFecha(item.pubDate)}
            </time>
          )}
        </div>
      </article>
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────
// Componente principal
// ─────────────────────────────────────────────────────────────────

export default function NoticiasProvinciales() {
  const [fuenteKey, setFuenteKey] = useState(FUENTES[0].key)
  const fuente = FUENTES.find(f => f.key === fuenteKey) ?? FUENTES[0]

  const { data, isLoading, error } = useQuery({
    queryKey: ['rss-provincial', fuente.key],
    queryFn:  () => fetchRss(fuente.url),
    staleTime: STALE_MS,
    retry: 1,
  })

  return (
    <section
      aria-labelledby="provinciales-h2"
      className="border-y border-border bg-white"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
              Medios externos
            </p>
            <h2 id="provinciales-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
              Noticias de Santiago del Estero
            </h2>
            <p className="mt-2 text-sm text-primary-500 sm:text-base">
              Actualidad provincial — contenido publicado por medios independientes,
              ajeno a la Comisión Municipal.
            </p>
          </div>
          <div className="hidden h-px flex-1 bg-gradient-to-l from-accent via-accent/60 to-transparent sm:block" aria-hidden="true" />
        </header>

        {/* Selector de fuente */}
        <div
          role="tablist"
          aria-label="Fuente de noticias"
          className="mb-6 flex gap-2 overflow-x-auto pb-1 sm:mb-8"
        >
          {FUENTES.map(f => (
            <FuenteChip
              key={f.key}
              label={f.label}
              active={fuenteKey === f.key}
              onClick={() => setFuenteKey(f.key)}
            />
          ))}
        </div>

        {/* Estados de carga / error / vacío */}
        {isLoading && (
          <div className="flex items-center justify-center rounded-xl border border-border bg-primary-50/40 p-12">
            <Spinner size="lg" />
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
            <p className="font-semibold">No pudimos cargar las noticias provinciales.</p>
            <p className="mt-1 text-xs text-accent-700/80">
              Es contenido de medios externos — probá nuevamente más tarde.
              {' '}
              <a
                href={`https://www.${fuente.key === 'liberal' ? 'elliberal.com.ar' : 'diariopanorama.com'}/`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline hover:no-underline"
              >
                Visitar {fuente.label} directamente
              </a>
            </p>
          </div>
        )}

        {!isLoading && !error && (data?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-border bg-primary-50/40 p-10 text-center text-sm text-primary-400">
            La fuente no devolvió noticias.
          </div>
        )}

        {!isLoading && !error && data && data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.map(item => (
              <NoticiaExternaCard key={item.guid ?? item.link} item={item} />
            ))}
          </div>
        )}

        <p className="mt-6 text-xs text-primary-400 sm:mt-8">
          Las noticias de esta sección provienen del RSS público de cada medio
          y se abren en su sitio original. La Comisión Municipal no es
          responsable por su contenido.
        </p>
      </div>
    </section>
  )
}
