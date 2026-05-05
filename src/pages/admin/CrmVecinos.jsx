import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { vecinos, barrios } from '../../lib/mockData'
import SearchBar from '../../components/ui/SearchBar'
import Select from '../../components/ui/Select'
import Avatar from '../../components/ui/Avatar'
import Button from '../../components/ui/Button'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import VecinoFormModal from '../../components/crm/VecinoFormModal'

export default function CrmVecinos() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [barrio, setBarrio] = useState('')
  const [open, setOpen] = useState(false)

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return vecinos.filter(v => {
      if (barrio && v.barrio !== barrio) return false
      if (!term) return true
      return (
        v.nombre.toLowerCase().includes(term) ||
        v.apellido.toLowerCase().includes(term) ||
        (v.dni ?? '').includes(term)
      )
    })
  }, [q, barrio])

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">CRM Vecinal</h1>
          <p className="text-sm text-primary-400">
            Padrón de vecinos · {filtered.length} de {vecinos.length}
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
          {filtered.map(v => (
            <Tr key={v.id} onClick={() => navigate(`/admin/crm/${v.id}`)}>
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={`${v.nombre} ${v.apellido}`} size="sm" />
                  <span className="font-medium text-primary">
                    {v.apellido}, {v.nombre}
                  </span>
                </div>
              </Td>
              <Td>{v.dni}</Td>
              <Td>{v.barrio}</Td>
              <Td>{v.telefono}</Td>
              <Td className="text-primary-400">{v.email || '—'}</Td>
            </Tr>
          ))}
          {filtered.length === 0 && (
            <Tr>
              <Td colSpan={5} className="py-10 text-center text-primary-400">
                No hay vecinos que coincidan con los filtros.
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <VecinoFormModal open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
