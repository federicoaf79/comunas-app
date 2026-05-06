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

export default function CrmVecinos() {
  const navigate = useNavigate()
  const [q, setQ]               = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [barrio, setBarrio]     = useState('')
  const [open, setOpen]         = useState(false)

  // Debounce de la búsqueda — evita una query por tecla.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300)
    return () => clearTimeout(t)
  }, [q])

  const {
    rows, total, isLoading, isFetching, error, create,
  } = useVecinos({ search: debouncedQ, barrio, page: 0 })

  const hasFilters  = !!debouncedQ.trim() || !!barrio
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
              <Th>Barrio</Th>
              <Th>Teléfono</Th>
              <Th>Email</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map(v => (
              <Tr key={v.id} onClick={() => navigate(`/admin/crm/${v.id}`)}>
                <Td>
                  <div className="flex items-center gap-3">
                    <Avatar name={`${v.nombre} ${v.apellido}`} size="sm" />
                    <span className="font-medium text-primary">
                      {v.apellido}, {v.nombre}
                    </span>
                  </div>
                </Td>
                <Td>{v.dni || '—'}</Td>
                <Td>{v.barrio || '—'}</Td>
                <Td>{v.telefono || '—'}</Td>
                <Td className="text-primary-400">{v.email || '—'}</Td>
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
