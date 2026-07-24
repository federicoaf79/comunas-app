import { useState } from 'react'
import {
  useProveedores, useCreateProveedor, useUpdateProveedor, useToggleProveedorActivo,
} from '../../hooks/useProveedores'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import ProveedorFormModal from '../../components/admin/ProveedorFormModal'

// =============================================================
// Proveedores — comercios adheridos a Vales Electrónicos.
// Fase 0 del sprint Vales. CRUD simple: alta, edición, activar/
// desactivar. Sin baja física (mismo criterio que Usuarios/Vecinos).
// =============================================================

function EstadoBadge({ activo }) {
  if (activo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2.5 py-0.5 text-xs font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Activo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Inactivo
    </span>
  )
}

export default function Proveedores() {
  const proveedoresQ = useProveedores()
  const createMut = useCreateProveedor()
  const updateMut = useUpdateProveedor()
  const toggleMut = useToggleProveedorActivo()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [error, setError]         = useState('')

  const proveedores = proveedoresQ.data ?? []

  function handleNuevo() {
    setEditing(null)
    setError('')
    setModalOpen(true)
  }
  function handleEditar(p) {
    setEditing(p)
    setError('')
    setModalOpen(true)
  }
  async function handleSubmit(data) {
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, ...data })
    } else {
      await createMut.mutateAsync(data)
    }
  }
  function handleToggleActivo(p) {
    setError('')
    if (!confirm(p.activo
      ? `¿Desactivar "${p.nombre}"? Deja de poder recibir vales hasta que lo reactivés.`
      : `¿Reactivar "${p.nombre}"?`)) return
    toggleMut.mutate({ id: p.id, activo: !p.activo })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Proveedores</h1>
          <p className="mt-1 text-sm text-primary-500">
            Comercios adheridos al programa de Vales Electrónicos.
          </p>
        </div>
        <Button onClick={handleNuevo}>+ Nuevo proveedor</Button>
      </header>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}

      {proveedoresQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : proveedoresQ.error ? (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los proveedores: {proveedoresQ.error.message}
        </div>
      ) : proveedores.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay proveedores cargados todavía.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Nombre</Th>
              <Th>Categoría</Th>
              <Th>Teléfono</Th>
              <Th>Dirección</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {proveedores.map(p => (
              <Tr key={p.id}>
                <Td className="font-medium text-primary">{p.nombre}</Td>
                <Td className="text-primary-500">{p.categoria || '—'}</Td>
                <Td className="text-primary-500">{p.telefono || '—'}</Td>
                <Td className="text-primary-500">{p.direccion || '—'}</Td>
                <Td><EstadoBadge activo={!!p.activo} /></Td>
                <Td className="whitespace-nowrap text-right text-xs font-medium">
                  <div className="flex justify-end gap-3">
                    <button type="button" onClick={() => handleEditar(p)} className="text-primary hover:underline">
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActivo(p)}
                      className={p.activo ? 'text-danger hover:underline' : 'text-ok-700 hover:underline'}
                    >
                      {p.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <ProveedorFormModal
        open={modalOpen}
        proveedor={editing}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
