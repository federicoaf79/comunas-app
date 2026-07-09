import { useMemo, useState } from 'react'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import {
  useSeguros, useSeguro, useSeguroItems,
  useCreateSeguro, useUpdateSeguro, useDeleteSeguro,
  useAddSeguroItem, useRemoveSeguroItem, useUploadPoliza,
  TIPOS_SEGURO, diasParaVencer,
} from '../../hooks/useSeguros'
import { useVehiculos } from '../../hooks/useFlota'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { dateOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// Seguros — gestión de pólizas de seguros municipales
// Paleta COMUNAS estricta (cero verde, OK/azul = #1D4ED8)
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

function tipoBadgeCls(tipo) {
  if (tipo === 'flota_vehiculos') return 'badge-primary'
  if (tipo === 'art') return 'badge-accent'
  if (tipo === 'responsabilidad_civil') return 'badge-ok'
  return 'badge-neutral'
}

export default function Seguros() {
  const { municipioId, loading } = useEffectiveMunicipioId()
  const [filtroTipo, setFiltroTipo] = useState('')
  const [modalNew, setModalNew] = useState(false)
  const [detalle, setDetalle] = useState(null)

  const { data: seguros = [], isLoading } = useSeguros(municipioId, { tipo: filtroTipo })

  const filtrados = useMemo(() => {
    return seguros.filter(s => {
      if (filtroTipo && s.tipo !== filtroTipo) return false
      return true
    })
  }, [seguros, filtroTipo])

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Seguros</h1>
        <p className="text-sm text-primary-400">
          Gestión de pólizas de seguros municipales y elementos cubiertos.
        </p>
      </header>

      {loading && (
        <div className="card flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && !municipioId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No encontramos un municipio asignado ni un fallback activo.
        </div>
      )}

      {!loading && municipioId && (
        <>
          {/* Header con filtros */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-primary">
                {filtrados.length} póliza{filtrados.length === 1 ? '' : 's'}
              </span>
              <div className="h-4 w-px bg-border" />
              <Select
                value={filtroTipo}
                onChange={setFiltroTipo}
                placeholder="Todos los tipos"
                options={TIPOS_SEGURO}
                className="min-w-[200px]"
              />
            </div>
            <Button onClick={() => setModalNew(true)}>+ Nueva póliza</Button>
          </div>

          {/* Lista de pólizas */}
          {isLoading ? (
            <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
          ) : filtrados.length === 0 ? (
            <div className="card p-10 text-center text-sm text-primary-400">
              {seguros.length === 0
                ? 'No hay pólizas cargadas. Apretá + Nueva póliza.'
                : 'No hay pólizas que coincidan con los filtros.'}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtrados.map(s => (
                <SeguroCard key={s.id} seguro={s} onView={() => setDetalle(s)} />
              ))}
            </div>
          )}

          {modalNew && (
            <SeguroFormModal
              municipioId={municipioId}
              onClose={() => setModalNew(false)}
            />
          )}
          {detalle && (
            <SeguroDetalleDrawer
              seguro={detalle}
              municipioId={municipioId}
              onClose={() => setDetalle(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

function SeguroCard({ seguro, onView }) {
  const dias = diasParaVencer(seguro.vigencia_hasta)
  const vencido = dias !== null && dias < 0
  const porVencer = dias !== null && dias >= 0 && dias <= 30

  // Contar items cubiertos
  const { data: items = [] } = useSeguroItems(seguro.id)

  return (
    <div className="card p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-sora text-base font-bold text-primary truncate">
            {seguro.compania}
          </h3>
          <p className="text-xs font-mono text-primary-500">
            N° {seguro.numero_poliza}
          </p>
        </div>
        {seguro.poliza_url && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5 shrink-0 text-accent ml-2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        )}
      </div>

      <div className="space-y-2 mb-3">
        <span className={`inline-block text-xs font-medium px-2 py-1 rounded-full ${tipoBadgeCls(seguro.tipo)}`}>
          {TIPOS_SEGURO.find(t => t.value === seguro.tipo)?.label ?? seguro.tipo}
        </span>

        <div className="text-xs text-primary-500">
          <div className="flex items-center gap-2">
            <span className="text-primary-400">Vigencia:</span>
            <span>
              {dateOf(seguro.vigencia_desde)} → {dateOf(seguro.vigencia_hasta)}
            </span>
          </div>
          {vencido && (
            <div className="mt-1 rounded bg-red-50 px-2 py-1 text-danger font-medium">
              ⚠️ Vencida hace {Math.abs(dias)} días
            </div>
          )}
          {porVencer && (
            <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-amber-700 font-medium">
              ⏰ Vence en {dias} días
            </div>
          )}
        </div>

        <div className="text-xs text-primary-400">
          {items.length} elemento{items.length === 1 ? '' : 's'} cubierto{items.length === 1 ? '' : 's'}
        </div>
      </div>

      <button
        onClick={onView}
        className="w-full text-center text-sm font-semibold text-accent hover:underline"
      >
        Ver detalle →
      </button>
    </div>
  )
}

function SeguroFormModal({ municipioId, seguro, onClose }) {
  const isEdit = !!seguro
  const [form, setForm] = useState(seguro ? {
    compania: seguro.compania ?? '',
    numero_poliza: seguro.numero_poliza ?? '',
    tipo: seguro.tipo ?? 'flota_vehiculos',
    tipo_cobertura: seguro.tipo_cobertura ?? '',
    vigencia_desde: seguro.vigencia_desde ?? '',
    vigencia_hasta: seguro.vigencia_hasta ?? '',
    costo: seguro.costo ?? '',
    observaciones: seguro.observaciones ?? '',
  } : {
    compania: '', numero_poliza: '', tipo: 'flota_vehiculos',
    tipo_cobertura: '', vigencia_desde: '', vigencia_hasta: '',
    costo: '', observaciones: '',
  })
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const create = useCreateSeguro()
  const update = useUpdateSeguro()
  const upload = useUploadPoliza()

  const canSubmit = !!form.compania && !!form.numero_poliza && !!form.tipo

  async function handle() {
    setError('')
    try {
      const payload = {
        compania:         form.compania.trim(),
        numero_poliza:    form.numero_poliza.trim(),
        tipo:             form.tipo,
        tipo_cobertura:   form.tipo_cobertura.trim() || null,
        vigencia_desde:   form.vigencia_desde || null,
        vigencia_hasta:   form.vigencia_hasta || null,
        costo:            form.costo ? Number(form.costo) : null,
        observaciones:    form.observaciones.trim() || null,
      }

      let seguroId = seguro?.id
      if (isEdit) {
        await update.mutateAsync({ id: seguro.id, ...payload })
      } else {
        const created = await create.mutateAsync({ municipio_id: municipioId, ...payload })
        seguroId = created.id
      }

      // Subir archivo si hay uno nuevo
      if (file && seguroId) {
        const url = await upload.mutateAsync({ file, municipioId, seguroId })
        await update.mutateAsync({ id: seguroId, poliza_url: url })
      }

      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  const saving = create.isPending || update.isPending || upload.isPending

  return (
    <Modal
      open onClose={onClose} size="lg"
      title={isEdit ? 'Editar póliza' : 'Nueva póliza'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handle} loading={saving} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Compañía"
          value={form.compania}
          onChange={e => set('compania', e.target.value)}
          placeholder="Ej: Río Uruguay Seguros"
        />
        <Input
          label="N° de póliza"
          value={form.numero_poliza}
          onChange={e => set('numero_poliza', e.target.value)}
          placeholder="Ej: 12345678"
        />
        <Select
          label="Tipo de seguro"
          value={form.tipo}
          onChange={v => set('tipo', v)}
          options={TIPOS_SEGURO}
        />
        <Input
          label="Tipo de cobertura"
          value={form.tipo_cobertura}
          onChange={e => set('tipo_cobertura', e.target.value)}
          placeholder="Ej: Todo riesgo"
        />
        <Input
          label="Vigencia desde"
          type="date"
          value={form.vigencia_desde}
          onChange={e => set('vigencia_desde', e.target.value)}
        />
        <Input
          label="Vigencia hasta"
          type="date"
          value={form.vigencia_hasta}
          onChange={e => set('vigencia_hasta', e.target.value)}
        />
        <Input
          label="Costo (ARS)"
          type="number"
          min="0"
          value={form.costo}
          onChange={e => set('costo', e.target.value)}
        />
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Archivo de póliza (PDF/Imagen)
          </label>
          <input
            type="file"
            accept=".pdf,image/*"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="input-field"
          />
          {seguro?.poliza_url && !file && (
            <p className="mt-1 text-xs text-primary-500">Ya hay un archivo adjunto</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Observaciones
          </label>
          <textarea
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            rows={3}
            className="input-field resize-y"
            placeholder="Notas adicionales"
          />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

function SeguroDetalleDrawer({ seguro, municipioId, onClose }) {
  const [modalEdit, setModalEdit] = useState(false)
  const [modalAdd, setModalAdd] = useState(false)
  const { data: items = [], isLoading: loadingItems } = useSeguroItems(seguro.id)
  const deleteSeguro = useDeleteSeguro()
  const removeItem = useRemoveSeguroItem()

  const dias = diasParaVencer(seguro.vigencia_hasta)
  const vencido = dias !== null && dias < 0
  const porVencer = dias !== null && dias >= 0 && dias <= 30

  async function handleDelete() {
    if (!confirm('¿Eliminar esta póliza y todos sus elementos vinculados?')) return
    try {
      await deleteSeguro.mutateAsync(seguro.id)
      onClose()
    } catch (e) {
      alert(e?.message ?? 'No pudimos eliminar')
    }
  }

  async function handleRemoveItem(itemId) {
    if (!confirm('¿Desvincular este elemento de la póliza?')) return
    try {
      await removeItem.mutateAsync(itemId)
    } catch (e) {
      alert(e?.message ?? 'No pudimos eliminar')
    }
  }

  return (
    <>
      <Modal
        open onClose={onClose} size="xl"
        title={`Póliza ${seguro.numero_poliza} · ${seguro.compania}`}
        footer={
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-2">
              <Button onClick={() => setModalEdit(true)}>Editar</Button>
              <Button variant="secondary" onClick={handleDelete} loading={deleteSeguro.isPending}>
                Eliminar
              </Button>
            </div>
            <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          </div>
        }
      >
        <div className="space-y-5">
          {/* Datos principales */}
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoCelda label="Compañía" value={seguro.compania} />
            <InfoCelda label="N° Póliza" value={seguro.numero_poliza} />
            <InfoCelda
              label="Tipo"
              value={TIPOS_SEGURO.find(t => t.value === seguro.tipo)?.label ?? seguro.tipo}
            />
            <InfoCelda label="Cobertura" value={seguro.tipo_cobertura || '—'} />
            <InfoCelda label="Vigencia desde" value={dateOf(seguro.vigencia_desde)} />
            <InfoCelda
              label="Vigencia hasta"
              value={
                <div>
                  <div>{dateOf(seguro.vigencia_hasta)}</div>
                  {vencido && (
                    <div className="mt-1 text-xs text-danger font-medium">
                      Vencida hace {Math.abs(dias)} días
                    </div>
                  )}
                  {porVencer && (
                    <div className="mt-1 text-xs text-amber-700 font-medium">
                      Vence en {dias} días
                    </div>
                  )}
                </div>
              }
            />
            <InfoCelda label="Costo" value={seguro.costo ? fmtMoney.format(seguro.costo) : '—'} />
          </div>

          {seguro.observaciones && (
            <div className="rounded-lg border border-border bg-white p-3">
              <div className="text-xs uppercase tracking-wider text-primary-400 mb-1">Observaciones</div>
              <div className="text-sm text-primary">{seguro.observaciones}</div>
            </div>
          )}

          {seguro.poliza_url && (
            <div>
              <a
                href={seguro.poliza_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                Ver archivo de póliza →
              </a>
            </div>
          )}

          {/* Elementos cubiertos */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-sora text-sm font-bold text-primary">Elementos cubiertos</h3>
              <button
                onClick={() => setModalAdd(true)}
                className="text-xs font-semibold text-accent hover:underline"
              >
                + Agregar elemento
              </button>
            </div>
            {loadingItems ? (
              <Spinner size="sm" />
            ) : items.length === 0 ? (
              <p className="text-xs text-primary-400">No hay elementos vinculados a esta póliza.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {items.map(item => (
                  <li key={item.id} className="flex items-center justify-between px-3 py-2">
                    <div className="text-xs text-primary">
                      <span className="font-medium capitalize">{item.tipo_entidad}</span>
                      <span className="text-primary-500 ml-2">ID: {item.entidad_id}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-xs text-danger hover:underline"
                      disabled={removeItem.isPending}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Modal>

      {modalEdit && (
        <SeguroFormModal
          municipioId={municipioId}
          seguro={seguro}
          onClose={() => setModalEdit(false)}
        />
      )}
      {modalAdd && (
        <AddItemModal
          seguroId={seguro.id}
          onClose={() => setModalAdd(false)}
        />
      )}
    </>
  )
}

function InfoCelda({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-primary-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-primary">{value}</div>
    </div>
  )
}

function AddItemModal({ seguroId, onClose }) {
  const [tipoEntidad, setTipoEntidad] = useState('vehiculo')
  const [entidadId, setEntidadId] = useState('')
  const [error, setError] = useState('')
  const addItem = useAddSeguroItem()

  // Cargar vehículos disponibles (ejemplo)
  const { data: vehiculos = [] } = useVehiculos()

  async function handle() {
    setError('')
    if (!entidadId) {
      setError('Seleccioná un elemento')
      return
    }
    try {
      await addItem.mutateAsync({
        seguro_id: seguroId,
        tipo_entidad: tipoEntidad,
        entidad_id: entidadId,
      })
      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos agregar') }
  }

  return (
    <Modal
      open onClose={onClose} size="md"
      title="Agregar elemento a la póliza"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={addItem.isPending}>Cancelar</Button>
          <Button onClick={handle} loading={addItem.isPending}>Agregar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Tipo de elemento"
          value={tipoEntidad}
          onChange={setTipoEntidad}
          options={[
            { value: 'vehiculo', label: 'Vehículo' },
            { value: 'inmueble', label: 'Inmueble' },
            { value: 'empleado', label: 'Empleado' },
          ]}
        />
        {tipoEntidad === 'vehiculo' && (
          <Select
            label="Vehículo"
            value={entidadId}
            onChange={setEntidadId}
            placeholder="Seleccionar vehículo..."
            options={vehiculos.map(v => ({
              value: v.id,
              label: `${v.patente || 'S/P'} · ${[v.marca, v.modelo].filter(Boolean).join(' ')}`,
            }))}
          />
        )}
        {tipoEntidad !== 'vehiculo' && (
          <Input
            label="ID del elemento"
            value={entidadId}
            onChange={e => setEntidadId(e.target.value)}
            placeholder="Ingresar ID..."
          />
        )}
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}
