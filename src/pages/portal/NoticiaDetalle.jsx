import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabaseAnon } from '../../lib/supabaseAnon'
import { dateOf } from '../../lib/datetime'
import { bgColorForCategoria } from '../../lib/noticiasCategoria'
import Spinner from '../../components/ui/Spinner'
import PortalBackLink from '../../components/portal/PortalBackLink'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'

const NOTICIA_SELECT =
  'id, titulo, cuerpo, categoria, publicado_at, imagen_url, estado, autor:autor_id ( id, nombre )'

async function fetchNoticiaById(id) {
  const { data, error } = await supabaseAnon
    .from('noticias')
    .select(NOTICIA_SELECT)
    .eq('id', id)
    .eq('estado', 'publicada')
    .maybeSingle()
  if (error) throw error
  return data
}

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-detail-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z"
        fill="url(#escudo-detail-bg)"
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

function PortalSimpleHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <Link to="/portal" className="flex items-center gap-3 text-white">
          <Escudo className="h-9 w-9 shrink-0" />
          <div className="leading-tight">
            <p className="font-sora text-sm font-bold sm:text-base">{MUNICIPIO_NOMBRE}</p>
            <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
              Portal Ciudadano
            </p>
          </div>
        </Link>
      </div>
    </header>
  )
}

export default function NoticiaDetalle() {
  const { id } = useParams()
  const {
    data: noticia,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['noticia', id],
    queryFn:  () => fetchNoticiaById(id),
    enabled:  !!id,
  })

  // Cuando el contenido cambia, llevamos el scroll al inicio para que
  // se vea el título — sino la posición del listado se mantiene.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [id])

  return (
    <div className="min-h-svh bg-background">
      <PortalSimpleHeader />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <PortalBackLink to="/portal/noticias" className="mb-6 text-primary hover:bg-primary-50 hover:text-primary-700" />
        {isLoading && (
          <div className="flex items-center justify-center rounded-xl border border-border bg-white p-16">
            <Spinner size="lg" />
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-sm text-danger">
            No pudimos cargar la noticia. Probá nuevamente más tarde.
          </div>
        )}

        {!isLoading && !error && !noticia && (
          <div className="rounded-xl border border-border bg-white p-10 text-center">
            <h1 className="font-sora text-2xl font-bold text-primary">
              Noticia no encontrada
            </h1>
            <p className="mt-2 text-sm text-primary-500">
              La noticia que buscás no existe o fue dada de baja.
            </p>
          </div>
        )}

        {!isLoading && !error && noticia && (
          <article>
            {/* Hero image full width — arriba del título */}
            {noticia.imagen_url ? (
              <img
                src={noticia.imagen_url}
                alt=""
                className="w-full rounded-xl border border-border object-cover"
                style={{ maxHeight: 400 }}
                loading="lazy"
              />
            ) : (
              <div
                className="flex aspect-[16/9] w-full items-center justify-center rounded-xl border border-border text-primary"
                style={{ backgroundColor: bgColorForCategoria(noticia.categoria), maxHeight: 400 }}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-20 w-20">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
                </svg>
              </div>
            )}

            {/* Encabezado: título + metadata (badge / fecha / autor) */}
            <header className="mt-6 sm:mt-8">
              <h1 className="font-sora text-3xl font-bold leading-tight text-primary sm:text-4xl">
                {noticia.titulo}
              </h1>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                {noticia.categoria && (
                  <span className="inline-flex items-center rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-900 shadow-sm">
                    {noticia.categoria}
                  </span>
                )}
                {noticia.publicado_at && (
                  <time
                    dateTime={noticia.publicado_at}
                    className="text-sm font-medium uppercase tracking-wide text-primary-400"
                  >
                    {dateOf(noticia.publicado_at)}
                  </time>
                )}
                {noticia.autor?.nombre && (
                  <span className="text-sm text-primary-500">
                    Por <strong className="font-semibold text-primary-700">{noticia.autor.nombre}</strong>
                  </span>
                )}
              </div>
            </header>

            {/* Cuerpo — prose con tipografía grande para lectura cómoda */}
            {noticia.cuerpo?.trim() ? (
              <div className="prose-portal mt-8 whitespace-pre-line text-lg leading-relaxed text-primary-700">
                {noticia.cuerpo}
              </div>
            ) : (
              <p className="mt-8 text-sm italic text-primary-400">
                Esta noticia aún no tiene contenido.
              </p>
            )}
          </article>
        )}
      </main>
    </div>
  )
}
