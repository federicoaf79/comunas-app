import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useNoticiasPublicas } from '../../hooks/useNoticiasPublicas'
import Spinner       from '../../components/ui/Spinner'
import SearchBar     from '../../components/ui/SearchBar'
import NoticiaCardSmall from '../../components/portal/NoticiaCardSmall'

const MUNICIPIO_NOMBRE = 'Comisión Municipal Real Sayana'
const PAGE_SIZE = 12
// Cap de seguridad. La query corre con anon RLS y en un proyecto
// real el volumen es bajo (decenas o cientos), así que 500 alcanza
// largamente para el "fetch sin límite" del listado público.
const MAX_FETCH = 500

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-listado-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path
        d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z"
        fill="url(#escudo-listado-bg)"
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
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
  )
}

// Chip de categoría — botón con dos estados visuales (activo/inactivo).
// Activo: fondo navy + texto gold. Inactivo: blanco con borde y texto navy.
function CategoriaChip({ label, count, active, onClick }) {
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
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={
            'inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ' +
            (active ? 'bg-accent text-primary-900' : 'bg-primary-50 text-primary-500')
          }
        >
          {count}
        </span>
      )}
    </button>
  )
}

export default function NoticiasListado() {
  const [query, setQuery]         = useState('')
  const [categoria, setCategoria] = useState(null)  // null = "Todas"
  const [visible, setVisible]     = useState(PAGE_SIZE)

  const {
    data: noticias = [],
    isLoading,
    error,
  } = useNoticiasPublicas({ limit: MAX_FETCH })

  // Categorías derivadas de los datos cargados — ordenadas alfabéticamente,
  // sin duplicados, con conteo total por categoría.
  const categorias = useMemo(() => {
    const map = new Map()
    for (const n of noticias) {
      const cat = n.categoria?.trim()
      if (!cat) continue
      map.set(cat, (map.get(cat) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'es'))
      .map(([label, count]) => ({ label, count }))
  }, [noticias])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return noticias.filter(n => {
      if (categoria && n.categoria !== categoria) return false
      if (!term) return true
      return (
        (n.titulo  ?? '').toLowerCase().includes(term) ||
        (n.cuerpo  ?? '').toLowerCase().includes(term) ||
        (n.resumen ?? '').toLowerCase().includes(term)
      )
    })
  }, [noticias, query, categoria])

  // Cuando cambian los filtros, reseteamos la cantidad visible al primer page.
  // Lo hacemos derivado: usamos Math.min para no exceder el total filtrado.
  const visibleClamped = Math.min(visible, filtered.length)
  const items = filtered.slice(0, visibleClamped)
  const hasMore = filtered.length > visibleClamped

  function handleQueryChange(value) {
    setQuery(value)
    setVisible(PAGE_SIZE)
  }

  function handleCategoria(cat) {
    setCategoria(cat)
    setVisible(PAGE_SIZE)
  }

  return (
    <div className="min-h-svh bg-background">
      <PortalSimpleHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Encabezado */}
        <header className="mb-8 sm:mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-accent-700">
            Sala de prensa
          </p>
          <h1 className="mt-1 font-sora text-3xl font-bold leading-tight text-primary sm:text-4xl">
            Noticias y anuncios
          </h1>
          <p className="mt-2 text-base text-primary-500 sm:text-lg">
            {MUNICIPIO_NOMBRE}
          </p>
        </header>

        {/* Filtros */}
        <section aria-label="Filtros" className="mb-8 space-y-4 sm:mb-10">
          <SearchBar
            value={query}
            onChange={handleQueryChange}
            placeholder="Buscar en noticias..."
            className="max-w-xl"
          />

          {categorias.length > 0 && (
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0">
              <div
                role="group"
                aria-label="Filtrar por categoría"
                className="flex gap-2 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0"
                style={{ scrollbarWidth: 'thin' }}
              >
                <CategoriaChip
                  label="Todas"
                  count={noticias.length}
                  active={categoria === null}
                  onClick={() => handleCategoria(null)}
                />
                {categorias.map(c => (
                  <CategoriaChip
                    key={c.label}
                    label={c.label}
                    count={c.count}
                    active={categoria === c.label}
                    onClick={() => handleCategoria(c.label)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Estados de carga / error / vacío */}
        {isLoading && (
          <div className="flex items-center justify-center rounded-xl border border-border bg-white p-16">
            <Spinner size="lg" />
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-danger">
            No pudimos cargar las noticias. Probá nuevamente más tarde.
          </div>
        )}

        {!isLoading && !error && noticias.length === 0 && (
          <div className="rounded-xl border border-border bg-white p-12 text-center text-sm text-primary-400">
            No hay noticias publicadas todavía.
          </div>
        )}

        {!isLoading && !error && noticias.length > 0 && filtered.length === 0 && (
          <div className="rounded-xl border border-border bg-white p-10 text-center">
            <p className="font-sora text-lg font-semibold text-primary">
              No encontramos noticias con esos filtros
            </p>
            <p className="mt-2 text-sm text-primary-500">
              Probá con otra búsqueda o seleccioná "Todas" para ver el listado completo.
            </p>
            <button
              type="button"
              onClick={() => { setQuery(''); setCategoria(null); setVisible(PAGE_SIZE) }}
              className="btn-secondary mt-5"
            >
              Limpiar filtros
            </button>
          </div>
        )}

        {/* Grid de noticias */}
        {!isLoading && !error && items.length > 0 && (
          <>
            <p className="mb-4 text-xs font-medium uppercase tracking-wide text-primary-400">
              Mostrando {items.length} de {filtered.length}
              {filtered.length !== noticias.length && ` · ${noticias.length} en total`}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {items.map(n => (
                <NoticiaCardSmall key={n.id} noticia={n} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-10 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible(v => v + PAGE_SIZE)}
                  className="btn-primary px-6 py-3 text-base"
                >
                  Ver más noticias
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
