import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useDatosMunicipio } from '../../hooks/useConfigPortal'

// =============================================================
// VideosPage — biblioteca pública de videos educativos.
// Ruta: /portal/videos.
//
// 4 categorías navegables por tabs; cada video se reproduce en
// un modal con iframe de YouTube. La página NO requiere sesión —
// usa el mismo header del portal público y el escudo gold.
// =============================================================

const CATEGORIAS = [
  {
    key:    'salud',
    label:  'Salud & Prevención',
    short:  'Salud',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
    videos: [
      { id: 'RAp0gvSpYuk', titulo: 'Alimentación y enfermedades crónicas' },
      { id: 'NFDkuLNtcRk', titulo: 'Primeros Auxilios — Atención Primaria' },
      { id: '8yttS8dS0R4', titulo: 'Primeros Auxilios Básicos' },
      { id: '4ZjgZ5FfGbM', titulo: 'Primeros Auxilios — Emergencias' },
    ],
  },
  {
    key:    'huerta',
    label:  'Huerta Casera',
    short:  'Huerta',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 6-3 16-9 16zM4 20l6-6" />
      </svg>
    ),
    videos: [
      { id: 'aaqZZcTPxPg', titulo: 'Huerta pequeña en casa paso a paso' },
      { id: '_W2XRbzAzc',  titulo: 'Iniciar un Huerto Casero' },
      { id: 'vVhenNTMvHM', titulo: 'Recomendaciones para huerta casera' },
      { id: 'SsDA_9BV19Y', titulo: 'Huerta orgánica con poco espacio' },
    ],
  },
  {
    key:    'herramientas',
    label:  'Herramientas & Jardinería',
    short:  'Herramientas',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a5 5 0 0 0-7 7l-6.4 6.4 2.8 2.8 6.4-6.4a5 5 0 0 0 7-7l-3 3-2.8-2.8 3-3z" />
      </svg>
    ),
    videos: [
      { id: '8EOThM27Ll4', titulo: 'Mantenimiento de Herramientas de Jardín' },
      { id: 'jCmvFesTsxk', titulo: 'Limpieza de tijeras de poda' },
      { id: '6IznecaNkY0', titulo: 'Cómo cuidar las herramientas del jardín' },
    ],
  },
  {
    key:    'ganaderia',
    label:  'Ganadería',
    short:  'Ganadería',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 9c-1 0-2 .8-2 2 0 1.5 1 2 2 2M19 9c1 0 2 .8 2 2 0 1.5-1 2-2 2M5 10c0-2.5 3-4 7-4s7 1.5 7 4v6c0 1.5-3 2.5-7 2.5S5 17.5 5 16v-6zM9 13h.01M15 13h.01M9 16c1 .5 3 .5 6 0" />
      </svg>
    ),
    videos: [
      { id: 'EQgfe3BzbjK', titulo: 'Ganadería Vacuna en 2 minutos' },
      { id: 'VEyUrVPAYJ4', titulo: 'Ganadería — Cría y alimentación' },
      { id: 'HurJG_yglPs', titulo: 'Vacunas para Ganado' },
      { id: 'xTEdGw-fulE', titulo: 'Ganadería Bovina Programa 2' },
    ],
  },
]

const TOTAL_VIDEOS = CATEGORIAS.reduce((a, c) => a + c.videos.length, 0)

function Escudo({ className = 'h-9 w-9' }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="escudo-vp-bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#C9A84C" />
          <stop offset="1" stopColor="#7E682B" />
        </linearGradient>
      </defs>
      <path d="M24 2 L42 8 V24 C42 35 33 43 24 46 C15 43 6 35 6 24 V8 L24 2 Z" fill="url(#escudo-vp-bg)" stroke="#0F1C35" strokeWidth="1.5" />
      <path d="M24 12 L26 19 L33 19 L27.5 23 L29.5 30 L24 26 L18.5 30 L20.5 23 L15 19 L22 19 Z" fill="#0F1C35" />
    </svg>
  )
}

function CategoriaTab({ tab, active, count, onClick }) {
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
      <span
        className={
          'ml-1 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ' +
          (active
            ? 'bg-white text-primary'
            : 'bg-primary text-white')
        }
      >
        {count}
      </span>
    </button>
  )
}

function PlayOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-primary-900/30 opacity-0 transition-opacity group-hover:opacity-100">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#C9A84C] text-primary-900 shadow-lg">
        <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-7 w-7" aria-hidden="true">
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </div>
  )
}

function VideoCard({ video, onPlay }) {
  // mqdefault es 320×180; carga rápido y se ve nítido en grids 2/3
  // cols. hqdefault sería 480×360 (más pesado, sin ganancia).
  const thumb = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`
  return (
    <button
      type="button"
      onClick={() => onPlay(video)}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-white text-left shadow-card transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-primary-900/10">
        <img
          src={thumb}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <PlayOverlay />
      </div>
      <div className="flex flex-1 items-start gap-2 p-3">
        <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#C9A84C] text-primary-900">
          <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-3 w-3" aria-hidden="true">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <p className="line-clamp-2 font-sora text-sm font-semibold leading-snug text-primary">
          {video.titulo}
        </p>
      </div>
    </button>
  )
}

function VideoModal({ video, onClose }) {
  useEffect(() => {
    if (!video) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    // Bloquea scroll del body mientras el modal está abierto.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [video, onClose])

  if (!video) return null

  // autoplay=1 + rel=0 (no relacionados al final) + modestbranding
  // para que el reproductor se vea más limpio.
  const src = `https://www.youtube.com/embed/${video.id}?autoplay=1&rel=0&modestbranding=1`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={video.titulo}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/85 p-4 backdrop-blur-sm"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="relative w-full max-w-4xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar video"
          className="absolute -top-12 right-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
            <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black shadow-2xl">
          <iframe
            title={video.titulo}
            src={src}
            className="h-full w-full"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
        <p className="mt-3 text-center font-sora text-sm font-semibold text-white">
          {video.titulo}
        </p>
      </div>
    </div>
  )
}

export default function VideosPage() {
  const [tabKey, setTabKey] = useState(CATEGORIAS[0].key)
  const [playing, setPlaying] = useState(null)
  const { datos } = useDatosMunicipio()
  const muniNombre = datos?.nombre || 'Comisión Municipal Real Sayana'

  const cat = useMemo(
    () => CATEGORIAS.find(c => c.key === tabKey) ?? CATEGORIAS[0],
    [tabKey],
  )

  return (
    <div className="min-h-svh bg-background" style={{ backgroundColor: '#F5F4EF' }}>
      <header className="sticky top-0 z-30 border-b border-primary-900 bg-primary text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link to="/portal" className="flex items-center gap-3 text-white">
            <Escudo className="h-9 w-9 shrink-0" />
            <div className="leading-tight">
              <p className="font-sora text-sm font-bold sm:text-base">{muniNombre}</p>
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

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Breadcrumb + título */}
        <div className="mb-6 sm:mb-8">
          <p className="text-xs font-medium text-primary-500">
            <Link to="/portal#recursos" className="hover:text-primary hover:underline">
              Recursos
            </Link>
            <span className="mx-1.5 text-primary-300">›</span>
            <span className="font-semibold text-primary-700">Videos educativos</span>
          </p>
          <h1 className="mt-2 font-sora text-3xl font-bold leading-tight text-primary sm:text-4xl">
            Videos educativos
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-primary-500 sm:text-base">
            Salud, huerta, jardinería y ganadería — material gratuito
            para vecinos y productores de la comuna. {TOTAL_VIDEOS} videos
            disponibles.
          </p>
        </div>

        {/* Tabs de categorías */}
        <div
          role="tablist"
          aria-label="Categoría de videos"
          className="mb-6 flex gap-2 overflow-x-auto pb-1 sm:mb-8"
        >
          {CATEGORIAS.map(c => (
            <CategoriaTab
              key={c.key}
              tab={c}
              count={c.videos.length}
              active={tabKey === c.key}
              onClick={() => setTabKey(c.key)}
            />
          ))}
        </div>

        {/* Grid de videos — 2 cols mobile, 3 cols desktop */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cat.videos.map(v => (
            <VideoCard key={v.id} video={v} onPlay={setPlaying} />
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/portal"
            className="inline-flex items-center gap-2 rounded-lg border-2 border-primary/30 bg-white px-5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white active:scale-95"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M11 18l-6-6 6-6" />
            </svg>
            Volver al portal
          </Link>
          <p className="text-xs italic text-primary-400">
            Si conocés un video que debería estar en esta biblioteca, sugerilo
            en la oficina de Administración.
          </p>
        </div>
      </main>

      <VideoModal video={playing} onClose={() => setPlaying(null)} />
    </div>
  )
}
