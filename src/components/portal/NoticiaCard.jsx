export default function NoticiaCard({ noticia, onEdit, onTogglePublicar, onDelete }) {
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={noticia.publicado ? 'badge-ok' : 'badge-neutral'}>
              {noticia.publicado ? 'Publicada' : 'Borrador'}
            </span>
            {noticia.publicado && noticia.fecha_publicacion && (
              <span className="text-xs text-primary-400">{noticia.fecha_publicacion}</span>
            )}
            {noticia.autor && (
              <span className="text-xs text-primary-400">· {noticia.autor}</span>
            )}
          </div>
          <h3 className="text-base font-semibold text-primary">{noticia.titulo}</h3>
          {noticia.resumen && (
            <p className="mt-1 line-clamp-2 text-sm text-primary-500">{noticia.resumen}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            onClick={() => onTogglePublicar(noticia)}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {noticia.publicado ? 'Despublicar' : 'Publicar'}
          </button>
          <button
            onClick={() => onEdit(noticia)}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(noticia)}
            className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50 hover:text-danger"
          >
            Eliminar
          </button>
        </div>
      </div>
    </div>
  )
}
