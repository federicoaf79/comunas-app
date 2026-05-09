import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import SearchBar from '../../components/ui/SearchBar'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import NoticiaCard from '../../components/portal/NoticiaCard'
import NoticiaFormModal from '../../components/portal/NoticiaFormModal'

const NOTICIA_COLS =
  'id, municipio_id, titulo, resumen, cuerpo, categoria, imagen_url, estado, publicado_at, created_at, autor:autor_id ( id, nombre )'

// Lista todas las noticias visibles para el usuario actual. Las
// policies RLS hacen el resto: superadmin ve todas, staff ve las
// de su municipio. No filtramos por municipio en el cliente — la
// DB lo decide.
async function fetchNoticiasAdmin() {
  const { data, error } = await supabase
    .from('noticias')
    .select(NOTICIA_COLS)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

// Construye el payload para INSERT/UPDATE. Si publicar=true y la
// noticia no estaba publicada (o es nueva), seteamos publicado_at=now().
// Si se despublica, dejamos publicado_at intacto — preservamos la
// historia de cuándo fue publicada por primera vez.
function buildPayload(form, { existing, municipio_id }) {
  const ahora    = new Date().toISOString()
  const wasPub   = existing?.estado === 'publicada'
  const willPub  = !!form.publicar
  const estado   = willPub ? 'publicada' : 'borrador'

  // publicado_at: se setea en la primera publicación. Si ya tenía
  // fecha y se vuelve a publicar, conservamos la original.
  let publicado_at = existing?.publicado_at ?? null
  if (willPub && !wasPub) publicado_at = ahora

  const payload = {
    titulo:     form.titulo.trim(),
    resumen:    form.resumen.trim() || null,
    cuerpo:     form.cuerpo.trim(),
    categoria:  form.categoria || null,
    imagen_url: form.imagen_url.trim() || null,
    estado,
    publicado_at,
  }
  // municipio_id solo va al INSERT; al UPDATE no lo tocamos.
  if (!existing) payload.municipio_id = municipio_id
  return payload
}

export default function Noticias() {
  const { perfil, hasRole } = useAuth()
  const qc = useQueryClient()

  const [q, setQ]                 = useState('')
  const [estado, setEstado]       = useState('')
  const [editing, setEditing]     = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [busyId, setBusyId]       = useState(null)
  const [error, setError]         = useState('')

  const canEdit   = hasRole(['admin_comuna', 'operador', 'admin_portal_web', 'superadmin'])
  const canDelete = hasRole(['admin_comuna', 'superadmin'])

  const { data: items = [], isLoading, error: loadError } = useQuery({
    queryKey: ['noticias-admin'],
    queryFn:  fetchNoticiasAdmin,
  })

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items.filter(n => {
      if (estado && n.estado !== estado) return false
      if (!term) return true
      return (
        n.titulo.toLowerCase().includes(term) ||
        (n.resumen ?? '').toLowerCase().includes(term) ||
        (n.cuerpo  ?? '').toLowerCase().includes(term)
      )
    })
  }, [items, q, estado])

  // ── Mutations ────────────────────────────────────────────────
  const upsertMut = useMutation({
    mutationFn: async (form) => {
      const payload = buildPayload(form, {
        existing: editing,
        municipio_id: perfil?.municipio_id,
      })
      if (editing) {
        const { error } = await supabase
          .from('noticias')
          .update(payload)
          .eq('id', editing.id)
        if (error) throw error
      } else {
        if (!payload.municipio_id) {
          throw new Error('No hay municipio asignado al usuario.')
        }
        const { error } = await supabase
          .from('noticias')
          .insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['noticias-admin'] })
      qc.invalidateQueries({ queryKey: ['noticias-publicas'] })
      setModalOpen(false)
      setEditing(null)
      setError('')
    },
    onError: (e) => setError(e?.message ?? 'No pudimos guardar la noticia.'),
  })

  const togglePubMut = useMutation({
    mutationFn: async (noticia) => {
      const willPub = noticia.estado !== 'publicada'
      const update = {
        estado: willPub ? 'publicada' : 'borrador',
      }
      // Solo seteamos publicado_at en la primera publicación.
      if (willPub && !noticia.publicado_at) {
        update.publicado_at = new Date().toISOString()
      }
      const { error } = await supabase
        .from('noticias')
        .update(update)
        .eq('id', noticia.id)
      if (error) throw error
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['noticias-admin'] })
      qc.invalidateQueries({ queryKey: ['noticias-publicas'] })
      setError('')
    },
    onError: (e) => setError(e?.message ?? 'No pudimos cambiar el estado.'),
  })

  const deleteMut = useMutation({
    mutationFn: async (noticia) => {
      const { error } = await supabase
        .from('noticias')
        .delete()
        .eq('id', noticia.id)
      if (error) throw error
    },
    onMutate: ({ id }) => setBusyId(id),
    onSettled: () => setBusyId(null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['noticias-admin'] })
      qc.invalidateQueries({ queryKey: ['noticias-publicas'] })
      setError('')
    },
    onError: (e) => setError(e?.message ?? 'No pudimos eliminar la noticia.'),
  })

  function openNew()         { setEditing(null);    setError(''); setModalOpen(true) }
  function openEdit(noticia) { setEditing(noticia); setError(''); setModalOpen(true) }

  function handleSave(form) {
    upsertMut.mutate(form)
  }

  function handleTogglePublicar(noticia) {
    togglePubMut.mutate(noticia)
  }

  function handleDelete(noticia) {
    if (!confirm(`¿Eliminar la noticia "${noticia.titulo}"? Esta acción no se puede deshacer.`)) return
    deleteMut.mutate(noticia)
  }

  const publicadas = items.filter(n => n.estado === 'publicada').length
  const borradores = items.length - publicadas

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Portal Web</h1>
          <p className="text-sm text-primary-400">
            Noticias y anuncios · {publicadas} publicada{publicadas === 1 ? '' : 's'} · {borradores} borrador{borradores === 1 ? '' : 'es'}
          </p>
        </div>
        {canEdit && <Button onClick={openNew}>+ Nueva noticia</Button>}
      </header>

      <div className="flex flex-wrap gap-3">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Buscar título, resumen o cuerpo..."
          className="min-w-[280px] flex-1"
        />
        <Select
          value={estado}
          onChange={setEstado}
          placeholder="Todos los estados"
          options={[
            { value: 'publicada', label: 'Publicadas' },
            { value: 'borrador',  label: 'Borradores' },
          ]}
          className="min-w-[180px]"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {loadError && !isLoading && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar las noticias. {loadError.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          {items.length === 0
            ? 'Todavía no hay noticias. Creá la primera con + Nueva noticia.'
            : 'No hay noticias con esos filtros.'}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <NoticiaCard
              key={n.id}
              noticia={n}
              onEdit={openEdit}
              onTogglePublicar={handleTogglePublicar}
              onDelete={handleDelete}
              canDelete={canDelete}
              busy={busyId === n.id}
            />
          ))}
        </div>
      )}

      <NoticiaFormModal
        key={editing?.id ?? 'new'}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        noticia={editing}
        saving={upsertMut.isPending}
        municipioId={perfil?.municipio_id ?? null}
      />
    </div>
  )
}
