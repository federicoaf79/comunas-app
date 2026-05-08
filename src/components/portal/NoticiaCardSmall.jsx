import { Link } from 'react-router-dom'
import CategoriaPlaceholder from './CategoriaPlaceholder'
import { dateOf } from '../../lib/datetime'

// Card chica de noticia — 4:3 imagen, badge categoría, título y
// fecha (sin resumen). Compartida entre el portal home (zona B/C)
// y el listado completo /portal/noticias.
export default function NoticiaCardSmall({ noticia }) {
  return (
    <Link
      to={`/portal/noticias/${noticia.id}`}
      className="block h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-lg">
        <div className="relative">
          {noticia.imagen_url ? (
            <img
              src={noticia.imagen_url}
              alt=""
              className="aspect-[4/3] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <CategoriaPlaceholder
              categoria={noticia.categoria}
              aspectClass="aspect-[4/3]"
              iconSize="h-12 w-12"
            />
          )}
          {noticia.categoria && (
            <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-900 shadow-sm ring-1 ring-inset ring-border">
              {noticia.categoria}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-3 font-sora text-sm font-semibold leading-snug text-primary group-hover:text-primary-700 sm:text-[15px]">
            {noticia.titulo}
          </h3>
          {noticia.publicado_at && (
            <time className="mt-auto text-[11px] font-medium uppercase tracking-wide text-primary-400" dateTime={noticia.publicado_at}>
              {dateOf(noticia.publicado_at)}
            </time>
          )}
        </div>
      </article>
    </Link>
  )
}
