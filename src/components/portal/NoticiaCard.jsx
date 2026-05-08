import { dateOf } from '../../lib/datetime'

// Card administrativa de la lista en /admin/noticias.
// Muestra estado real (publicada/borrador), fecha de publicación,
// categoría y resumen, con acciones según permisos (canDelete).
export default function NoticiaCard({
  noticia,
  onEdit,
  onTogglePublicar,
  onDelete,
  canDelete = false,
  busy = false,
}) {
  const publicada = noticia.estado === 'publicada'
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className={publicada ? 'badge-ok' : 'badge-neutral'}>
              {publicada ? 'Publicada' : 'Borrador'}
            </span>
            {noticia.categoria && (
              <span className="badge-accent">{noticia.categoria}</span>
            )}
            {publicada && noticia.publicado_at && (
              <span className="text-xs text-primary-400">
                {dateOf(noticia.publicado_at)}
              </span>
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
            disabled={busy}
            className="btn-secondary px-3 py-1.5 text-xs"
          >
            {publicada ? 'Despublicar' : 'Publicar'}
          </button>
          <button
            onClick={() => onEdit(noticia)}
            disabled={busy}
            className="btn-ghost px-3 py-1.5 text-xs"
          >
            Editar
          </button>
          {canDelete && (
            <button
              onClick={() => onDelete(noticia)}
              disabled={busy}
              className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50 hover:text-danger"
            >
              Eliminar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
