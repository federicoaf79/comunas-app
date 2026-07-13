import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { barrios } from '../../lib/mockData'
import { useVecinos } from '../../hooks/useVecinos'
import SearchBar from '../../components/ui/SearchBar'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import VecinoFormModal from '../../components/crm/VecinoFormModal'

// "Apellido, Nombre" si están separados; nombre_completo si no.
function displayName(v) {
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Sin nombre'
}

// "Nombre Apellido" para iniciales del Avatar; nombre_completo si no.
function avatarName(v) {
  if (v.nombre && v.apellido) return `${v.nombre} ${v.apellido}`
  return v.nombre_completo || v.apellido || v.nombre || '?'
}

// Paleta COMUNAS — Urbano azul (ok), Rural gold. Sin verde.
const ZONA_OPTS = [
  { value: 'urbano', label: 'Urbano' },
  { value: 'rural',  label: 'Rural' },
]

function ZonaBadge({ zona }) {
  if (zona === 'rural') {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
        Rural
      </span>
    )
  }
  if (zona === 'urbano') {
    return (
      <span className="inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
        Urbano
      </span>
    )
  }
  return <span className="text-primary-300">—</span>
}

export default function CrmVecinos() {
  const navigate = useNavigate()
  const [q, setQ]               = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [barrio, setBarrio]     = useState('')
  const [zona, setZona]         = useState('')
  const [portalEstado, setPortalEstado] = useState('')
  const [open, setOpen]         = useState(false)

  // Debounce de la búsqueda — evita una query por tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const {
    rows, total, isLoading, isFetching, error, create, updateVecino,
  } = useVecinos({ search: debouncedQ, barrio, zona, portal_estado: portalEstado, page: 0 })

  const pendientesCount = rows.filter(v => v.portal_estado === 'pendiente').length
  const hasFilters  = !!debouncedQ.trim() || !!barrio || !!zona || !!portalEstado
  const showRows    = !isLoading && !error
  const empty       = showRows && rows.length === 0

  async function handleCreate(data) {
    // Lanza para que el modal muestre el error en línea.
    await create.mutateAsync(data)
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">CRM Vecinal</h1>
          <p className="text-sm text-primary-400">
            Padrón de vecinos · {total} en total
            {isFetching && !isLoading && <span className="ml-2 text-primary-300">(actualizando...)</span>}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>+ Nuevo vecino</Button>
      </header>

      <div className="flex flex-wrap gap-3">
        <SearchBar
          value={q}
          onChange={setQ}
          placeholder="Buscar por nombre o DNI..."
          className="min-w-[280px] flex-1"
        />
        <Select
          value={barrio}
          onChange={setBarrio}
          placeholder="Todos los barrios"
          options={barrios.map(b => ({ value: b, label: b }))}
          className="min-w-[200px]"
        />
        <Select
          value={zona}
          onChange={setZona}
          placeholder="Todas las zonas"
          options={ZONA_OPTS}
          className="min-w-[160px]"
        />
        <Select
          value={portalEstado}
          onChange={setPortalEstado}
          placeholder="Estado portal"
          options={[
            { value: 'pendiente', label: `Pendientes (${pendientesCount})` },
            { value: 'activo', label: 'Activos' },
            { value: 'rechazado', label: 'Rechazados' },
          ]}
          className="min-w-[180px]"
        />
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los vecinos: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-10">
          <Spinner size="lg" />
        </div>
      )}

      {empty && (
        <div className="card p-10 text-center">
          {hasFilters ? (
            <p className="text-sm text-primary-400">
              No hay vecinos que coincidan con los filtros.
            </p>
          ) : (
            <>
              <p className="text-sm text-primary-500">
                Sin vecinos cargados aún.
              </p>
              <Button onClick={() => setOpen(true)} className="mt-4">
                Cargar el primero
              </Button>
            </>
          )}
        </div>
      )}

      {showRows && rows.length > 0 && (
        <Table>
          <THead>
            <tr>
              <Th>Vecino</Th>
              <Th>DNI</Th>
              <Th>Zona</Th>
              <Th>Barrio</Th>
              <Th>Teléfono</Th>
              <Th>Email</Th>
              <Th>Portal</Th>
              <Th className="w-px">Acciones</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map(v => (
              <Tr key={v.id} onClick={() => navigate(`/admin/crm/${v.id}`)}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={avatarName(v)} size="sm" />
                    <span className="font-medium text-primary">
                      {displayName(v)}
                    </span>
                  </div>
                </Td>
                <Td>{v.dni || '—'}</Td>
                <Td><ZonaBadge zona={v.zona} /></Td>
                <Td>{v.barrio || '—'}</Td>
                <Td>{v.telefono || '—'}</Td>
                <Td className="text-primary-400">{v.email || '—'}</Td>
                <Td>
                  {v.portal_estado === 'pendiente' && (
                    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-100">
                      Pendiente
                    </span>
                  )}
                  {v.portal_estado === 'activo' && (
                    <span className="inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[11px] font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
                      Activo
                    </span>
                  )}
                  {v.portal_estado === 'rechazado' && (
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-danger ring-1 ring-inset ring-red-100">
                      Rechazado
                    </span>
                  )}
                  {!v.portal_estado && <span className="text-primary-300">—</span>}
                </Td>
                <Td>
                  {v.portal_estado === 'pendiente' && (
                    <div className="flex gap-1">
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (confirm('¿Aprobar acceso al portal para este vecino?')) {
                            await updateVecino.mutateAsync({ id: v.id, portal_estado: 'activo' })
                          }
                        }}
                        className="rounded bg-ok px-2 py-1 text-[10px] font-semibold text-white hover:bg-ok/90"
                        disabled={updateVecino.isPending}
                      >
                        Aprobar
                      </button>
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          if (confirm('¿Rechazar acceso al portal para este vecino?')) {
                            await updateVecino.mutateAsync({ id: v.id, portal_estado: 'rechazado' })
                          }
                        }}
                        className="rounded bg-danger px-2 py-1 text-[10px] font-semibold text-white hover:bg-danger/90"
                        disabled={updateVecino.isPending}
                      >
                        Rechazar
                      </button>
                    </div>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <VecinoFormModal
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  )
}
