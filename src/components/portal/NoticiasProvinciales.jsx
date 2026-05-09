import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useFuentesRssPublicas } from '../../hooks/useConfigPortal'
import Spinner from '../ui/Spinner'

// =============================================================
// Noticias nacionales — feed RSS de medios argentinos vía
// rss2json.com (proxy gratuito que convierte RSS a JSON).
//
// Las fuentes vienen de la tabla `configuracion_portal` con clave
// 'fuentes_rss'. Si no hay config persistida, el hook cae a un
// set de defaults (Infobae / La Nación / BA Times).
//
// Cada item se filtra contra una lista de palabras clave
// regionales/temáticas para mostrar solo lo relevante para el
// vecino. Si después del filtro quedan menos de 3 noticias, se
// muestran las primeras 8 sin filtrar y el badge cambia de
// "EXTERNO" a "NACIONAL" para dejar claro que no son del recorte.
//
// El visual deja claro que es contenido de TERCEROS — badge en
// cada card, disclaimer en el header y al pie. Los enlaces abren
// en pestaña nueva con rel="noopener noreferrer".
// =============================================================

const MAX_ITEMS = 8
const STALE_MS  = 15 * 60 * 1000  // 15 minutos — el RSS no cambia tan seguido

// Palabras clave base — comunes a todas las fuentes. Se combinan
// con las palabras clave específicas que cada fuente agregue
// desde el panel de admin.
const BASE_KEYWORDS = [
  'santiago del estero', 'santiagueño', 'santiagueña',
  'santiago', 'norte argentino', 'noa', 'tucumán',
  'salta', 'jujuy', 'catamarca', 'chaco', 'formosa',
  'litoral', 'interior del país',
]

// Normaliza para comparación: lowercase + sin acentos. Hace que
// "Tucumán" matchee "tucuman" y viceversa, y que el comentario
// del usuario sobre "santiagueño" matchee aunque la nota diga
// "santiagueno".
function normalize(s) {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

function matchesKeywords(item, keywords) {
  if (!keywords?.length) return true
  const text = normalize(`${item.title ?? ''} ${item.description ?? ''}`)
  return keywords.some(k => {
    const kn = normalize(k)
    return kn && text.includes(kn)
  })
}

// Cadena de fallback para leer RSS desde el browser:
//
//   1. rss2json.com — convierte RSS a JSON. Cuando funciona da
//      thumbnails ya extraídos y un shape estable, pero su plan
//      gratuito devuelve 422 para varios medios argentinos.
//   2. corsproxy.io — proxy CORS-permisivo que sirve el XML crudo.
//      Lo parseamos manual con DOMParser y normalizamos al mismo
//      shape que rss2json para que el resto del componente no se
//      entere de qué fuente vino.
//
// Devuelve hasta 30 items crudos para que el filtro de keywords
// tenga material — luego acotamos a MAX_ITEMS (8) para mostrar.
async function fetchRss(rawRssUrl) {
  // Intento 1 — rss2json
  try {
    const proxyUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rawRssUrl)}`
    const res = await fetch(proxyUrl)
    if (res.ok) {
      const data = await res.json()
      if (data?.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
        return data.items.slice(0, 30)
      }
    }
  } catch (e) {
    console.warn('[NoticiasProvinciales] rss2json falló, intento corsproxy:', e?.message)
  }

  // Intento 2 — corsproxy.io + DOMParser
  const corsUrl = `https://corsproxy.io/?${encodeURIComponent(rawRssUrl)}`
  const res = await fetch(corsUrl)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const text = await res.text()
  return parseRssXml(text).slice(0, 30)
}

// Parsea un string XML de RSS 2.0 a la misma shape que produce
// rss2json (campos: title, link, pubDate, description, thumbnail,
// guid). Acepta tanto <link>url</link> (RSS clásico) como
// <link href="url"/> (Atom-flavored).
function parseRssXml(xmlText) {
  const parser = new DOMParser()
  const xml = parser.parseFromString(xmlText, 'text/xml')
  if (xml.querySelector('parsererror')) {
    throw new Error('La respuesta no es un RSS válido.')
  }
  return [...xml.querySelectorAll('item')].map(item => {
    const linkEl  = item.querySelector('link')
    const linkTxt = linkEl?.textContent?.trim() || linkEl?.getAttribute('href') || ''
    return {
      title:       item.querySelector('title')?.textContent?.trim() ?? '',
      link:        linkTxt,
      pubDate:     item.querySelector('pubDate')?.textContent?.trim() ?? '',
      description: item.querySelector('description')?.textContent ?? '',
      thumbnail:   item.querySelector('enclosure')?.getAttribute('url') ?? null,
      guid:        item.querySelector('guid')?.textContent?.trim() || linkTxt,
    }
  })
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

function NoticiaExternaCard({ item, badgeLabel = 'Externo' }) {
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
            {badgeLabel}
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
  const { data: fuentes = [], isLoading: loadingConfig } = useFuentesRssPublicas()
  const fuentesActivas = useMemo(
    () => (fuentes ?? []).filter(f => f.active !== false),
    [fuentes],
  )

  const [fuenteKey, setFuenteKey] = useState(null)
  const fuente = fuentesActivas.find(f => f.key === fuenteKey) ?? fuentesActivas[0]

  const { data: items, isLoading: loadingFeed, error } = useQuery({
    queryKey: ['rss-nacional', fuente?.url ?? '__none__'],
    queryFn:  () => fetchRss(fuente.url),
    staleTime: STALE_MS,
    retry: 1,
    enabled: !!fuente?.url,
  })

  // Aplicamos filtro de keywords (base + extras de la fuente). Si
  // después de filtrar quedan menos de 3 ítems, mostramos las
  // primeras 8 sin filtrar y cambiamos el badge a "Nacional" para
  // que el usuario sepa que el feed está sin recorte regional.
  const { display, badgeLabel, didFilter } = useMemo(() => {
    const list = items ?? []
    const keywords = [...BASE_KEYWORDS, ...((fuente?.palabras_clave ?? []))]
    const filtered = list.filter(it => matchesKeywords(it, keywords))
    if (filtered.length >= 3) {
      return {
        display:    filtered.slice(0, MAX_ITEMS),
        badgeLabel: 'Externo',
        didFilter:  true,
      }
    }
    return {
      display:    list.slice(0, MAX_ITEMS),
      badgeLabel: 'Nacional',
      didFilter:  false,
    }
  }, [items, fuente])

  const isLoading = loadingConfig || loadingFeed

  return (
    <section
      aria-labelledby="nacionales-h2"
      className="border-y border-border bg-white"
    >
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3 sm:mb-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
              Medios externos
            </p>
            <h2 id="nacionales-h2" className="mt-1 font-sora text-2xl font-bold text-primary sm:text-3xl">
              Noticias de Argentina
            </h2>
            <p className="mt-2 text-sm text-primary-500 sm:text-base">
              Actualidad nacional y regional — contenido publicado por medios
              independientes, ajeno a la Comisión Municipal.
            </p>
          </div>
          <div className="hidden h-px flex-1 bg-gradient-to-l from-accent via-accent/60 to-transparent sm:block" aria-hidden="true" />
        </header>

        {/* Selector de fuente */}
        {fuentesActivas.length > 0 && (
          <div
            role="tablist"
            aria-label="Fuente de noticias"
            className="mb-6 flex gap-2 overflow-x-auto pb-1 sm:mb-8"
          >
            {fuentesActivas.map(f => (
              <FuenteChip
                key={f.key}
                label={f.label}
                active={(fuenteKey ?? fuentesActivas[0]?.key) === f.key}
                onClick={() => setFuenteKey(f.key)}
              />
            ))}
          </div>
        )}

        {/* Sin fuentes configuradas */}
        {!loadingConfig && fuentesActivas.length === 0 && (
          <div className="rounded-xl border border-border bg-primary-50/40 p-10 text-center text-sm text-primary-400">
            No hay fuentes externas configuradas para mostrar.
          </div>
        )}

        {/* Estados de carga / error / vacío del feed */}
        {fuente && isLoading && (
          <div className="flex items-center justify-center rounded-xl border border-border bg-primary-50/40 p-12">
            <Spinner size="lg" />
          </div>
        )}

        {fuente && error && !isLoading && (
          <div className="rounded-xl border border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
            <p className="font-semibold">No pudimos cargar las noticias nacionales.</p>
            <p className="mt-1 text-xs text-accent-700/80">
              Es contenido de medios externos — probá nuevamente más tarde.
              {fuente.home && (
                <>
                  {' '}
                  <a
                    href={fuente.home}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold underline hover:no-underline"
                  >
                    Visitar {fuente.label} directamente
                  </a>
                </>
              )}
            </p>
          </div>
        )}

        {fuente && !isLoading && !error && display.length === 0 && (
          <div className="rounded-xl border border-border bg-primary-50/40 p-10 text-center text-sm text-primary-400">
            La fuente no devolvió noticias.
          </div>
        )}

        {fuente && !isLoading && !error && display.length > 0 && (
          <>
            {!didFilter && (
              <p className="mb-3 text-xs text-primary-400">
                Mostrando las últimas noticias del medio (no encontramos suficientes
                con foco regional para esta fuente).
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {display.map(item => (
                <NoticiaExternaCard
                  key={item.guid ?? item.link}
                  item={item}
                  badgeLabel={badgeLabel}
                />
              ))}
            </div>
          </>
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
