import { dateOf } from '../../lib/datetime'

// Si la noticia no tiene imagen_url, mostramos un placeholder con
// gradiente de la paleta + ícono. Color determinístico según
// categoría — categorías comunes mapean a colores temáticos, el
// resto cae a un hash estable.
function gradientForCategoria(categoria) {
  if (!categoria) return 'from-primary to-primary-700'
  const c = categoria.toLowerCase()
  if (/salud|caps|m[eé]dic/.test(c))         return 'from-ok-500 to-ok-700'
  if (/obra|infra|catastro/.test(c))         return 'from-primary-500 to-primary-900'
  if (/educ|escuel/.test(c))                 return 'from-accent to-accent-700'
  if (/evento|cultural|deport/.test(c))      return 'from-accent-500 to-accent-700'
  if (/seguridad|polic/.test(c))             return 'from-primary-700 to-primary-900'
  // Hash determinístico para categorías no mapeadas — mismo string
  // siempre el mismo color.
  let h = 0
  for (let i = 0; i < categoria.length; i++) h = (h * 31 + categoria.charCodeAt(i)) >>> 0
  const palettes = [
    'from-primary to-primary-700',
    'from-accent to-accent-700',
    'from-ok-500 to-ok-700',
    'from-primary-500 to-primary-900',
  ]
  return palettes[h % palettes.length]
}

function iconForCategoria(categoria) {
  const c = (categoria ?? '').toLowerCase()
  // Salud
  if (/salud|caps|m[eé]dic/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-12 w-12">
        <path strokeLinecap="round" d="M12 8v8M8 12h8" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    )
  }
  // Obras
  if (/obra|infra|catastro/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-12 w-12">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
    )
  }
  // Eventos / cultura
  if (/evento|cultural|deport/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-12 w-12">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    )
  }
  // Default — periódico
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-12 w-12">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h16v16H4zM4 9h16M9 4v16" />
    </svg>
  )
}

function NoticiaPlaceholder({ categoria }) {
  const grad = gradientForCategoria(categoria)
  return (
    <div className={`flex aspect-video w-full items-center justify-center bg-gradient-to-br ${grad} text-white/80`}>
      {iconForCategoria(categoria)}
    </div>
  )
}

export default function NoticiaPortalCard({ noticia }) {
  return (
    <article className="card flex h-full flex-col overflow-hidden p-0 transition-shadow hover:shadow-lg">
      {noticia.imagen_url ? (
        <img
          src={noticia.imagen_url}
          alt=""
          className="aspect-video w-full object-cover"
          loading="lazy"
        />
      ) : (
        <NoticiaPlaceholder categoria={noticia.categoria} />
      )}
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {noticia.categoria && (
            <span className="badge-accent">{noticia.categoria}</span>
          )}
          {noticia.publicado_at && (
            <time className="text-primary-400" dateTime={noticia.publicado_at}>
              {dateOf(noticia.publicado_at)}
            </time>
          )}
          {noticia.autor && (
            <span className="text-primary-400">· {noticia.autor}</span>
          )}
        </div>
        <h3 className="text-lg font-semibold leading-tight text-primary sm:text-xl">
          {noticia.titulo}
        </h3>
        {noticia.resumen && (
          <p className="line-clamp-2 text-sm leading-relaxed text-primary-500">
            {noticia.resumen}
          </p>
        )}
      </div>
    </article>
  )
}
