import { useMemo, useState } from 'react'
import { noticias as initialNoticias } from '../../lib/mockData'
import Button from '../../components/ui/Button'
import SearchBar from '../../components/ui/SearchBar'
import Select from '../../components/ui/Select'
import NoticiaCard from '../../components/portal/NoticiaCard'
import NoticiaFormModal from '../../components/portal/NoticiaFormModal'

let nextId = 100

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function Noticias() {
  const [items, setItems]         = useState(initialNoticias)
  const [q, setQ]                 = useState('')
  const [estado, setEstado]       = useState('')
  const [editing, setEditing]     = useState(null)
  const [modalOpen, setModalOpen] = useState(false)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return items
      .filter(n => {
        if (estado === 'publicada' && !n.publicado) return false
        if (estado === 'borrador'  &&  n.publicado) return false
        if (!term) return true
        return (
          n.titulo.toLowerCase().includes(term) ||
          (n.resumen ?? '').toLowerCase().includes(term)
        )
      })
      .sort((a, b) => (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? ''))
  }, [items, q, estado])

  function openNew()         { setEditing(null);   setModalOpen(true) }
  function openEdit(noticia) { setEditing(noticia); setModalOpen(true) }

  function handleSave(form) {
    if (editing) {
      setItems(s => s.map(n => n.id === editing.id ? { ...n, ...form } : n))
    } else {
      const newItem = {
        ...form,
        id: `n${nextId++}`,
        fecha_publicacion: form.publicado ? todayStr() : null,
      }
      setItems(s => [newItem, ...s])
    }
  }

  function handleTogglePublicar(noticia) {
    setItems(s => s.map(n =>
      n.id === noticia.id
        ? {
            ...n,
            publicado: !n.publicado,
            fecha_publicacion: !n.publicado ? todayStr() : n.fecha_publicacion,
          }
        : n
    ))
  }

  function handleDelete(noticia) {
    if (!confirm(`¿Eliminar la noticia "${noticia.titulo}"?`)) return
    setItems(s => s.filter(n => n.id !== noticia.id))
  }

  const publicadas = items.filter(n => n.publicado).length
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
        <Button onClick={openNew}>+ Nueva noticia</Button>
      </header>

      <div className="flex flex-wrap gap-3">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Buscar título o resumen..."
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

      {filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay noticias con esos filtros.
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
            />
          ))}
        </div>
      )}

      <NoticiaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        noticia={editing}
      />
    </div>
  )
}
