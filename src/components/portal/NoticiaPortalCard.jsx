import { dateOf } from '../../lib/datetime'

export default function NoticiaPortalCard({ noticia }) {
  return (
    <article className="card flex h-full flex-col gap-2 p-5">
      {noticia.imagen_url && (
        <img
          src={noticia.imagen_url}
          alt=""
          className="aspect-video w-full rounded-lg object-cover"
          loading="lazy"
        />
      )}
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
      <h3 className="text-lg font-semibold leading-tight text-primary">
        {noticia.titulo}
      </h3>
      {noticia.resumen && (
        <p className="text-sm leading-relaxed text-primary-500">
          {noticia.resumen}
        </p>
      )}
    </article>
  )
}
