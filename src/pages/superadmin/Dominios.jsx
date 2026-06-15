import { useState } from 'react'
import { useDominios, useCreateDominio, useUpdateDominio, useDeleteDominio } from '../../hooks/useDominios'
import { useMunicipios } from '../../hooks/useMunicipios'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'

const TIPO_META = {
  subdominio:     { label: 'Subdominio', cls: 'bg-primary-100 text-primary-700' },
  dominio_propio: { label: 'Dominio propio', cls: 'bg-accent-50 text-accent-700' },
  alias:          { label: 'Alias', cls: 'bg-gray-100 text-gray-700' },
}

const INSTRUCCIONES_DNS = `Instrucciones para conectar el dominio de su municipio:

1. Ingresá al panel de DNS de su proveedor de dominio (NIC Argentina, otros).

2. Agregá este registro DNS:

   Tipo:   CNAME
   Host:   app  (o el subdominio que prefieran)
   Valor:  comunas.lat
   TTL:    3600

3. Una vez propagado (24-48hs), su portal estará disponible en:
   https://app.sudominio.gob.ar

4. Avisanos cuando el DNS esté configurado y lo activamos desde este panel.

Nota: Si tienen dudas técnicas, contactanos a soporte@comunas.lat`

export default function Dominios() {
  const [modalOpen, setModalOpen] = useState(false)
  const [instruccionesOpen, setInstruccionesOpen] = useState(false)

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Dominios</h1>
          <p className="text-sm text-primary-400">
            Gestión de dominios y subdominios multi-tenant
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          Agregar dominio
        </Button>
      </header>

      <TablaDominios />

      {modalOpen && (
        <DominioFormModal
          onClose={() => setModalOpen(false)}
          onSuccessDominio={() => setInstruccionesOpen(true)}
        />
      )}

      {instruccionesOpen && (
        <InstruccionesDNSModal onClose={() => setInstruccionesOpen(false)} />
      )}
    </div>
  )
}

function TablaDominios() {
  const { data: dominios, isLoading } = useDominios()
  const updateMut = useUpdateDominio()
  const deleteMut = useDeleteDominio()

  if (isLoading) {
    return (
      <Card>
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      </Card>
    )
  }

  if (!dominios || dominios.length === 0) {
    return (
      <Card>
        <p className="py-6 text-center text-sm text-primary-400">
          No hay dominios registrados todavía.
        </p>
      </Card>
    )
  }

  const handleToggleActivo = (dominio) => {
    updateMut.mutate({
      id: dominio.id,
      updates: { activo: !dominio.activo },
    })
  }

  const handleToggleVerificado = (dominio) => {
    updateMut.mutate({
      id: dominio.id,
      updates: { verificado: !dominio.verificado },
    })
  }

  const handleDelete = (id) => {
    if (window.confirm('¿Eliminar este dominio? Esta acción no se puede deshacer.')) {
      deleteMut.mutate(id)
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <THead>
          <Tr>
            <Th>Municipio</Th>
            <Th>Dominio</Th>
            <Th>Tipo</Th>
            <Th className="text-center">Verificado</Th>
            <Th className="text-center">Activo</Th>
            <Th className="text-right">Acciones</Th>
          </Tr>
        </THead>
        <tbody className="divide-y divide-border">
          {dominios.map(d => (
            <Tr key={d.id}>
              <Td>
                <div>
                  <p className="text-sm font-medium text-primary">
                    {d.municipio?.nombre ?? 'Sin municipio'}
                  </p>
                  <p className="text-xs text-primary-400">
                    {d.municipio?.slug ?? '—'}
                  </p>
                </div>
              </Td>
              <Td>
                <code className="text-sm text-primary-600">{d.dominio}</code>
              </Td>
              <Td>
                <Badge className={TIPO_META[d.tipo]?.cls ?? ''}>
                  {TIPO_META[d.tipo]?.label ?? d.tipo}
                </Badge>
              </Td>
              <Td className="text-center">
                <button
                  onClick={() => handleToggleVerificado(d)}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-sm transition-colors hover:bg-primary-50"
                  disabled={updateMut.isPending}
                >
                  {d.verificado ? (
                    <span className="text-ok-600">✓</span>
                  ) : (
                    <span className="text-primary-300">✗</span>
                  )}
                </button>
              </Td>
              <Td className="text-center">
                <button
                  onClick={() => handleToggleActivo(d)}
                  className={`inline-flex h-6 w-12 items-center rounded-full px-1 transition-colors ${
                    d.activo ? 'bg-ok-600' : 'bg-gray-300'
                  }`}
                  disabled={updateMut.isPending}
                >
                  <span
                    className={`block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      d.activo ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </Td>
              <Td className="text-right">
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-xs text-danger hover:underline"
                  disabled={deleteMut.isPending}
                >
                  Eliminar
                </button>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
  )
}

function DominioFormModal({ onClose, onSuccessDominio }) {
  const { data: municipios } = useMunicipios()
  const createMut = useCreateDominio()
  const [form, setForm] = useState({
    municipio_id: '',
    dominio: '',
    tipo: 'subdominio',
  })

  const municipiosOpts = (municipios ?? [])
    .filter(m => m.activo)
    .map(m => ({ value: m.id, label: m.nombre }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.municipio_id || !form.dominio.trim()) return

    try {
      await createMut.mutateAsync({
        municipio_id: form.municipio_id,
        dominio: form.dominio.trim().toLowerCase(),
        tipo: form.tipo,
        activo: form.tipo === 'dominio_propio' ? false : true,
        verificado: form.tipo === 'dominio_propio' ? false : true,
      })
      if (form.tipo === 'dominio_propio') {
        onSuccessDominio()
      }
      onClose()
    } catch (err) {
      alert(`Error al guardar: ${err.message}`)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar dominio"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createMut.isPending}>
            {createMut.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-primary-700">
            Municipio
          </label>
          <Select
            value={form.municipio_id}
            onChange={(v) => setForm({ ...form, municipio_id: v })}
            options={municipiosOpts}
            placeholder="Seleccionar municipio"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-primary-700">
            Dominio
          </label>
          <Input
            value={form.dominio}
            onChange={(e) => setForm({ ...form, dominio: e.target.value })}
            placeholder="realsayana.comunas.lat"
            required
          />
          <p className="mt-1 text-xs text-primary-400">
            Sin https:// ni www. Solo el hostname.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-primary-700">
            Tipo
          </label>
          <Select
            value={form.tipo}
            onChange={(v) => setForm({ ...form, tipo: v })}
            options={[
              { value: 'subdominio', label: 'Subdominio (*.comunas.lat)' },
              { value: 'dominio_propio', label: 'Dominio propio (requiere CNAME)' },
              { value: 'alias', label: 'Alias' },
            ]}
          />
          {form.tipo === 'dominio_propio' && (
            <p className="mt-2 text-xs text-primary-500">
              Se guardará inactivo hasta que el DNS esté configurado y verificado.
            </p>
          )}
        </div>
      </form>
    </Modal>
  )
}

function InstruccionesDNSModal({ onClose }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(INSTRUCCIONES_DNS)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Instrucciones DNS"
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button onClick={handleCopy}>
            {copied ? '✓ Copiado' : 'Copiar instrucciones'}
          </Button>
        </>
      }
    >
      <Card className="border-2 border-primary-200 bg-primary-50">
        <pre className="whitespace-pre-wrap font-sora text-sm leading-relaxed text-accent-700">
          {INSTRUCCIONES_DNS}
        </pre>
      </Card>
    </Modal>
  )
}
