import { useState } from 'react'
import { useFuentesRssAdmin, useUpsertFuentesRss } from '../../hooks/useConfigPortal'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import FuenteRssFormModal from '../../components/admin/FuenteRssFormModal'

// =============================================================
// Configuración del portal — por ahora solo gestiona las fuentes
// RSS que se muestran en la sección "Noticias de Argentina" del
// portal público. La data se persiste en `configuracion_portal`
// con clave 'fuentes_rss' y se lee en cliente con anon access.
// =============================================================

function FuenteRow({ fuente, onToggle, onEdit, onDelete, busy }) {
  const palabras = (fuente.palabras_clave ?? []).filter(Boolean)
  return (
    <li className="card flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={fuente.active ? 'badge-ok' : 'badge-neutral'}>
            {fuente.active ? 'Activa' : 'Inactiva'}
          </span>
          <p className="font-sora text-base font-semibold text-primary">
            {fuente.label}
          </p>
        </div>
        <p className="mt-1 truncate text-xs text-primary-400 sm:text-sm">
          {fuente.url}
        </p>
        {palabras.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {palabras.map(k => (
              <span
                key={k}
                className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button
          onClick={() => onToggle(fuente)}
          disabled={busy}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          {fuente.active ? 'Desactivar' : 'Activar'}
        </button>
        <button
          onClick={() => onEdit(fuente)}
          disabled={busy}
          className="btn-ghost px-3 py-1.5 text-xs"
        >
          Editar
        </button>
        <button
          onClick={() => onDelete(fuente)}
          disabled={busy}
          className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50 hover:text-danger"
        >
          Eliminar
        </button>
      </div>
    </li>
  )
}

export default function ConfigPortal() {
  const { perfil } = useAuth()
  const { data: fuentes = [], isLoading, error } = useFuentesRssAdmin()
  const upsertMut = useUpsertFuentesRss()

  const [editing, setEditing]     = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saveError, setSaveError] = useState('')

  function openNew()         { setEditing(null);    setSaveError(''); setModalOpen(true) }
  function openEdit(fuente)  { setEditing(fuente);  setSaveError(''); setModalOpen(true) }

  // La fuente de verdad es la query (TanStack). Después de cada
  // mutación se invalida y se refetchea — la UI se actualiza al
  // llegar la respuesta. El upsertMut.isPending bloquea los botones
  // durante el round-trip.
  async function persist(next) {
    setSaveError('')
    try {
      await upsertMut.mutateAsync(next)
    } catch (e) {
      setSaveError(e?.message ?? 'No pudimos guardar los cambios.')
      throw e
    }
  }

  async function handleToggle(fuente) {
    const next = fuentes.map(f =>
      f.key === fuente.key ? { ...f, active: !f.active } : f,
    )
    try { await persist(next) } catch { /* error visible en banner */ }
  }

  async function handleDelete(fuente) {
    if (!confirm(`¿Eliminar la fuente "${fuente.label}"? Los lectores del portal dejarán de verla.`)) return
    const next = fuentes.filter(f => f.key !== fuente.key)
    try { await persist(next) } catch { /* error visible en banner */ }
  }

  async function handleSave(formFuente) {
    let next
    if (editing) {
      next = fuentes.map(f => f.key === editing.key ? { ...formFuente } : f)
    } else {
      // Si el slug colisiona con uno existente, sufijamos con timestamp.
      const exists = fuentes.some(f => f.key === formFuente.key)
      const final  = exists
        ? { ...formFuente, key: `${formFuente.key}-${Date.now()}` }
        : formFuente
      next = [...fuentes, final]
    }
    try {
      await persist(next)
      setModalOpen(false)
      setEditing(null)
    } catch { /* error visible en banner */ }
  }

  const activas   = fuentes.filter(f => f.active)
  const inactivas = fuentes.filter(f => !f.active)
  const sinMunicipio = !perfil?.municipio_id

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Configuración del portal</h1>
        <p className="text-sm text-primary-400">
          Settings del Portal Ciudadano público.
        </p>
      </header>

      {/* Sección: Noticias provinciales / nacionales */}
      <section className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-primary">Noticias externas</h2>
            <p className="text-sm text-primary-500">
              Fuentes RSS que alimentan la sección "Noticias de Argentina" del
              portal público. {activas.length} activa{activas.length === 1 ? '' : 's'}
              {inactivas.length > 0 && ` · ${inactivas.length} inactiva${inactivas.length === 1 ? '' : 's'}`}.
            </p>
          </div>
          <Button onClick={openNew} disabled={sinMunicipio || upsertMut.isPending}>
            + Agregar fuente
          </Button>
        </header>

        {sinMunicipio && (
          <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
            Tu usuario no tiene un municipio asignado, así que no podés guardar
            cambios. Pedile al administrador que lo configure.
          </div>
        )}

        {saveError && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            {saveError}
          </div>
        )}

        {error && !isLoading && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            No pudimos cargar la configuración. {error.message}
          </div>
        )}

        {isLoading ? (
          <div className="card flex items-center justify-center p-12">
            <Spinner size="lg" />
          </div>
        ) : fuentes.length === 0 ? (
          <div className="card p-10 text-center text-sm text-primary-400">
            Todavía no hay fuentes configuradas. Agregá la primera con{' '}
            <strong>+ Agregar fuente</strong>.
          </div>
        ) : (
          <ul className="space-y-3">
            {fuentes.map(f => (
              <FuenteRow
                key={f.key}
                fuente={f}
                onToggle={handleToggle}
                onEdit={openEdit}
                onDelete={handleDelete}
                busy={upsertMut.isPending}
              />
            ))}
          </ul>
        )}

        <p className="text-xs text-primary-400">
          Las fuentes activas se ven en{' '}
          <a href="/portal" className="font-semibold text-primary hover:underline">
            /portal
          </a>{' '}
          dentro de la sección "Noticias de Argentina". Los cambios pueden
          tardar hasta 5 minutos en propagarse a los visitantes (caché del
          navegador).
        </p>
      </section>

      <FuenteRssFormModal
        key={editing?.key ?? 'new'}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        fuente={editing}
        saving={upsertMut.isPending}
      />
    </div>
  )
}
