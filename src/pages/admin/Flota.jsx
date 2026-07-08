import { useMemo, useState } from 'react'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import {
  useVehiculos, useCombustibleLog, useServiceVehiculos,
  useCreateVehiculo, useCreateCombustible, useCreateService,
  TIPOS_VEHICULO, ESTADOS_VEHICULO, TIPOS_COMBUSTIBLE, TIPOS_SERVICE,
  diasParaVencer,
} from '../../hooks/useFlota'
import Tabs from '../../components/ui/Tabs'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { dateOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// Flota — vehículos, combustible, service y alertas.
// 4 tabs. Paleta COMUNAS estricta. Cero verde.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})
const fmtNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 })
const fmtDec = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })

const TABS = [
  { value: 'vehiculos',    label: 'Vehículos' },
  { value: 'combustible',  label: 'Combustible' },
  { value: 'service',      label: 'Service' },
  { value: 'alertas',      label: 'Alertas' },
]

// Ícono por tipo de vehículo. SVG inline simple.
function VehicleIcon({ tipo, className = 'h-10 w-10' }) {
  const t = (tipo ?? '').toLowerCase()
  if (t === 'tractor' || t === 'maquinaria') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
        <circle cx="6" cy="17" r="3" /><circle cx="18" cy="18" r="2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13V8h6l3 4h6l1 4M9 8V5h4v3" />
      </svg>
    )
  }
  if (t === 'moto') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
        <circle cx="5" cy="17" r="3" /><circle cx="19" cy="17" r="3" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 17l4-7h5l3 5M14 6h3l1 4" />
      </svg>
    )
  }
  // camioneta / utilitario / auto / otro — silueta genérica
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 14V9l3-4h7l3 5h4a1 1 0 0 1 1 1v3M3 14h18M3 14v3M21 14v3" />
      <circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function Flota() {
  const { municipioId, loading } = useEffectiveMunicipioId()
  const [tab, setTab] = useState('vehiculos')
  const { data: dependencias = [] } = useDependencias()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Flota</h1>
        <p className="text-sm text-primary-400">
          Vehículos del municipio — combustible, service y vencimientos.
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

      {!loading && (
        <>
          <Tabs tabs={TABS} value={tab} onChange={setTab} />

          <div>
            {tab === 'vehiculos'   && <VehiculosTab   municipioId={municipioId} dependencias={dependencias} />}
            {tab === 'combustible' && <CombustibleTab municipioId={municipioId} />}
            {tab === 'service'     && <ServiceTab     municipioId={municipioId} />}
            {tab === 'alertas'     && <AlertasTab     municipioId={municipioId} />}
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Vehículos (cards)
// ─────────────────────────────────────────────────────────────────

function estadoCls(estado) {
  if (estado === 'operativo')         return 'badge-ok'
  if (estado === 'en_service')        return 'badge-accent'
  if (estado === 'fuera_de_servicio') return 'badge-danger'
  return 'badge-neutral'
}
function estadoLabel(estado) {
  return ESTADOS_VEHICULO.find(e => e.value === estado)?.label ?? estado
}

// Helper para obtener dominio del logo de marca
function marcaDomain(marca) {
  const dominios = {
    'Toyota': 'toyota.com',
    'Ford': 'ford.com',
    'Mercedes Benz': 'mercedes-benz.com',
    'Volkswagen': 'volkswagen.com',
    'Renault': 'renault.com',
    'Fiat': 'fiat.com',
    'Honda': 'honda.com',
    'New Holland': 'newholland.com',
    'Chevrolet': 'chevrolet.com',
    'Peugeot': 'peugeot.com',
    'Nissan': 'nissan.com',
  }
  return dominios[marca] ?? `${(marca || '').toLowerCase().replace(/ /g, '-')}.com`
}

function VehiculosTab({ municipioId, dependencias }) {
  const { data: vehiculos = [], isLoading } = useVehiculos({}, { municipioIdOverride: municipioId })
  const [modalNew, setModalNew] = useState(false)
  const [detalle, setDetalle] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')

  const filtrados = useMemo(() => {
    return vehiculos.filter(v => {
      if (filtroEstado && v.estado !== filtroEstado) return false
      if (filtroTipo && v.tipo !== filtroTipo) return false
      return true
    })
  }, [vehiculos, filtroEstado, filtroTipo])

  return (
    <div className="space-y-4">
      {/* Header con filtros y contador */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-primary">
            {filtrados.length} vehículo{filtrados.length === 1 ? '' : 's'}
          </span>
          <div className="h-4 w-px bg-border" />
          <Select
            value={filtroEstado}
            onChange={setFiltroEstado}
            placeholder="Todos los estados"
            options={ESTADOS_VEHICULO}
            className="min-w-[160px]"
          />
          <Select
            value={filtroTipo}
            onChange={setFiltroTipo}
            placeholder="Todos los tipos"
            options={TIPOS_VEHICULO}
            className="min-w-[160px]"
          />
        </div>
        <Button onClick={() => setModalNew(true)}>+ Registrar vehículo</Button>
      </div>

      {/* Lista compacta */}
      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : filtrados.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          {vehiculos.length === 0
            ? 'No hay vehículos cargados. Apretá + Registrar vehículo.'
            : 'No hay vehículos que coincidan con los filtros.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtrados.map(v => (
            <div
              key={v.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-white px-4 py-3 hover:shadow-sm transition-shadow"
            >
              {/* Logo marca con fallback */}
              <div className="h-10 w-10 shrink-0 rounded-lg border border-border bg-gray-50 flex items-center justify-center overflow-hidden">
                <img
                  src={`https://logo.clearbit.com/${marcaDomain(v.marca)}`}
                  alt={v.marca || 'Logo'}
                  className="h-8 w-8 object-contain"
                  onError={(e) => {
                    e.target.style.display = 'none'
                    const fallback = e.target.nextSibling
                    if (fallback) fallback.style.display = 'flex'
                  }}
                />
                <span className="hidden text-xs font-bold text-primary-400">
                  {v.marca?.[0] ?? '?'}
                </span>
              </div>

              {/* Info principal */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-primary truncate">
                    {v.marca} {v.modelo}
                  </span>
                  {v.anio && <span className="text-xs text-primary-400">{v.anio}</span>}
                  {v.patente && (
                    <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded text-primary-500">
                      {v.patente}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs text-primary-400">
                    {v.tipo} · {v.dependencia?.nombre ?? 'Sin asignar'}
                  </span>
                  {v.km_actuales != null && (
                    <span className="text-xs text-primary-400">
                      {Number(v.km_actuales).toLocaleString('es-AR')} km
                    </span>
                  )}
                </div>
              </div>

              {/* Estado badge */}
              <span
                className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                  v.estado === 'activo'
                    ? 'bg-ok-50 text-ok-700'
                    : v.estado === 'mantenimiento'
                    ? 'bg-amber-50 text-amber-700'
                    : v.estado === 'baja'
                    ? 'bg-danger/10 text-danger'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {v.estado}
              </span>

              {/* Ver detalle */}
              <button
                onClick={() => setDetalle(v)}
                className="shrink-0 text-xs text-accent hover:underline font-medium"
              >
                Ver →
              </button>
            </div>
          ))}
        </div>
      )}

      {modalNew && (
        <VehiculoFormModal
          municipioId={municipioId}
          dependencias={dependencias}
          onClose={() => setModalNew(false)}
        />
      )}
      {detalle && (
        <VehiculoDetalleDrawer
          vehiculo={detalle}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  )
}

function VehiculoFormModal({ municipioId, dependencias, onClose }) {
  const [form, setForm] = useState({
    dependencia_id: '', patente: '', marca: '', modelo: '', anio: '',
    tipo: 'camioneta', km_actuales: '', estado: 'operativo',
    seguro_vencimiento: '', vtv_vencimiento: '', observaciones: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const create = useCreateVehiculo()

  const canSubmit = !!form.tipo && !!form.estado

  async function handle() {
    setError('')
    try {
      await create.mutateAsync({
        municipio_id:        municipioId,
        dependencia_id:      form.dependencia_id || null,
        patente:             form.patente.trim() || null,
        marca:               form.marca.trim() || null,
        modelo:              form.modelo.trim() || null,
        anio:                form.anio ? Number(form.anio) : null,
        tipo:                form.tipo,
        km_actuales:         form.km_actuales ? Number(form.km_actuales) : 0,
        estado:              form.estado,
        seguro_vencimiento:  form.seguro_vencimiento || null,
        vtv_vencimiento:     form.vtv_vencimiento || null,
        observaciones:       form.observaciones.trim() || null,
      })
      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Registrar vehículo"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handle} loading={create.isPending} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Patente" value={form.patente} onChange={e => set('patente', e.target.value)} placeholder="AB123CD o S/P" />
        <Select
          label="Tipo" value={form.tipo} onChange={v => set('tipo', v)}
          options={TIPOS_VEHICULO}
        />
        <Input label="Marca" value={form.marca} onChange={e => set('marca', e.target.value)} />
        <Input label="Modelo" value={form.modelo} onChange={e => set('modelo', e.target.value)} />
        <Input label="Año" type="number" min="1950" max="2099" value={form.anio} onChange={e => set('anio', e.target.value)} />
        <Input label="KM actuales" type="number" min="0" value={form.km_actuales} onChange={e => set('km_actuales', e.target.value)} />
        <Select
          label="Dependencia" value={form.dependencia_id} onChange={v => set('dependencia_id', v)}
          placeholder="Sin asignar"
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <Select
          label="Estado" value={form.estado} onChange={v => set('estado', v)}
          options={ESTADOS_VEHICULO}
        />
        <Input label="Vencimiento de seguro" type="date" value={form.seguro_vencimiento} onChange={e => set('seguro_vencimiento', e.target.value)} />
        <Input label="Vencimiento de VTV" type="date" value={form.vtv_vencimiento} onChange={e => set('vtv_vencimiento', e.target.value)} />
        <div className="sm:col-span-2">
          <Input label="Observaciones" value={form.observaciones} onChange={e => set('observaciones', e.target.value)} />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

function VehiculoDetalleDrawer({ vehiculo, onClose }) {
  const combQ = useCombustibleLog({ vehiculoId: vehiculo.id, limit: 20 })
  const servQ = useServiceVehiculos({ vehiculoId: vehiculo.id, limit: 20 })

  return (
    <Modal
      open onClose={onClose} size="xl"
      title={`${vehiculo.patente || 'S/P'} · ${[vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ')}`}
      footer={<Button variant="secondary" onClick={onClose}>Cerrar</Button>}
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <ResumenCelda label="KM actuales"          value={fmtNum.format(vehiculo.km_actuales ?? 0)} />
          <ResumenCelda label="Estado"               value={estadoLabel(vehiculo.estado)} />
          <ResumenCelda label="Dependencia"          value={vehiculo.dependencia?.nombre ?? '—'} />
          <ResumenCelda label="Seguro vence"         value={vehiculo.seguro_vencimiento ? dateOf(vehiculo.seguro_vencimiento) : '—'} />
          <ResumenCelda label="VTV vence"            value={vehiculo.vtv_vencimiento ? dateOf(vehiculo.vtv_vencimiento) : '—'} />
          <ResumenCelda label="Tipo"                 value={TIPOS_VEHICULO.find(t => t.value === vehiculo.tipo)?.label ?? '—'} />
        </div>

        <section>
          <h3 className="font-sora text-sm font-bold text-primary">Combustible</h3>
          {combQ.isLoading ? <Spinner size="sm" /> : (combQ.data ?? []).length === 0 ? (
            <p className="text-xs text-primary-400">Sin cargas registradas.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {combQ.data.map(c => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                  <span className="font-mono text-primary-400">{dateOf(c.fecha)}</span>
                  <span className="text-primary">{fmtDec.format(c.litros)} L</span>
                  <span className="text-primary-500">· {c.tipo_combustible}</span>
                  <span className="text-primary-500">· {fmtNum.format(c.km_al_cargar ?? 0)} km</span>
                  <span className="ml-auto font-semibold tabular-nums text-primary">{fmtMoney.format(c.costo_total ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="font-sora text-sm font-bold text-primary">Service</h3>
          {servQ.isLoading ? <Spinner size="sm" /> : (servQ.data ?? []).length === 0 ? (
            <p className="text-xs text-primary-400">Sin services registrados.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
              {servQ.data.map(s => (
                <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
                  <span className="font-mono text-primary-400">{dateOf(s.fecha)}</span>
                  <ServiceBadge tipo={s.tipo_service} />
                  <span className="text-primary">{s.descripcion}</span>
                  <span className="text-primary-500">· {fmtNum.format(s.km_al_service ?? 0)} km</span>
                  <span className="ml-auto font-semibold tabular-nums text-primary">{fmtMoney.format(s.costo ?? 0)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  )
}

function ResumenCelda({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-primary-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-primary">{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Combustible
// ─────────────────────────────────────────────────────────────────

function CombustibleTab({ municipioId }) {
  const { data: vehiculos = [] } = useVehiculos({}, { municipioIdOverride: municipioId })
  const ids = vehiculos.map(v => v.id)
  const { data: cargas = [], isLoading } = useCombustibleLog({ vehiculoIds: ids, limit: 30 })
  const [modalNew, setModalNew] = useState(false)

  // KPIs del mes en curso (usa fecha_local del log, comparada
  // contra el mes/año actuales).
  const today = new Date()
  const mesActual = today.getMonth()
  const yyActual  = today.getFullYear()
  const cargasMes = cargas.filter(c => {
    if (!c.fecha) return false
    const d = new Date(c.fecha)
    return d.getMonth() === mesActual && d.getFullYear() === yyActual
  })
  const litrosMes      = cargasMes.reduce((s, c) => s + Number(c.litros ?? 0), 0)
  const costoMes       = cargasMes.reduce((s, c) => s + Number(c.costo_total ?? 0), 0)
  const costoPromedio  = litrosMes > 0 ? costoMes / litrosMes : 0

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Litros del mes"     value={fmtDec.format(litrosMes)} accent="primary" />
        <StatCard label="Costo del mes"      value={fmtMoney.format(costoMes)} accent="accent" />
        <StatCard label="Costo prom. / litro" value={fmtMoney.format(costoPromedio)} accent="ok" />
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setModalNew(true)} disabled={vehiculos.length === 0}>
          + Cargar combustible
        </Button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : cargas.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">No hay cargas registradas.</div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Vehículo</Th>
              <Th className="text-right">Litros</Th>
              <Th>Tipo</Th>
              <Th className="text-right">KM</Th>
              <Th className="text-right">Costo</Th>
              <Th>Proveedor</Th>
            </Tr>
          </THead>
          <tbody>
            {cargas.map(c => (
              <Tr key={c.id}>
                <Td className="whitespace-nowrap">{dateOf(c.fecha)}</Td>
                <Td className="font-mono text-xs">
                  {c.vehiculo?.patente || 'S/P'} <span className="text-primary-400">{c.vehiculo?.modelo}</span>
                </Td>
                <Td className="text-right tabular-nums">{fmtDec.format(c.litros ?? 0)}</Td>
                <Td className="text-xs">{c.tipo_combustible}</Td>
                <Td className="text-right tabular-nums">{fmtNum.format(c.km_al_cargar ?? 0)}</Td>
                <Td className="text-right font-semibold tabular-nums">{fmtMoney.format(c.costo_total ?? 0)}</Td>
                <Td className="text-xs">{c.proveedor || '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {modalNew && (
        <CombustibleFormModal
          vehiculos={vehiculos}
          onClose={() => setModalNew(false)}
        />
      )}
    </div>
  )
}

function CombustibleFormModal({ vehiculos, onClose }) {
  const [form, setForm] = useState({
    vehiculo_id: '', fecha: todayArgYMD(), litros: '', km_al_cargar: '',
    tipo_combustible: 'nafta', costo_total: '', proveedor: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const create = useCreateCombustible()

  const canSubmit =
    !!form.vehiculo_id && !!form.fecha &&
    Number(form.litros) > 0 && Number(form.costo_total) >= 0

  async function handle() {
    setError('')
    try {
      await create.mutateAsync({
        vehiculo_id:       form.vehiculo_id,
        fecha:             form.fecha,
        litros:            Number(form.litros),
        km_al_cargar:      form.km_al_cargar ? Number(form.km_al_cargar) : null,
        tipo_combustible:  form.tipo_combustible,
        costo_total:       Number(form.costo_total ?? 0),
        proveedor:         form.proveedor.trim() || null,
      })
      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Cargar combustible"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handle} loading={create.isPending} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Vehículo" value={form.vehiculo_id} onChange={v => set('vehiculo_id', v)}
          placeholder="Seleccionar..."
          options={vehiculos.map(v => ({
            value: v.id,
            label: `${v.patente || 'S/P'} · ${[v.marca, v.modelo].filter(Boolean).join(' ')}`,
          }))}
        />
        <Input label="Fecha" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required />
        <Input label="Litros" type="number" min="0" step="0.01" value={form.litros} onChange={e => set('litros', e.target.value)} required />
        <Input label="KM al cargar" type="number" min="0" value={form.km_al_cargar} onChange={e => set('km_al_cargar', e.target.value)} />
        <Select label="Tipo" value={form.tipo_combustible} onChange={v => set('tipo_combustible', v)} options={TIPOS_COMBUSTIBLE} />
        <Input label="Costo total" type="number" min="0" step="0.01" value={form.costo_total} onChange={e => set('costo_total', e.target.value)} required />
        <div className="sm:col-span-2">
          <Input label="Proveedor (opcional)" value={form.proveedor} onChange={e => set('proveedor', e.target.value)} />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Service
// ─────────────────────────────────────────────────────────────────

const TIPO_SERV_BADGE = {
  aceite:           'badge-accent',
  frenos:           'badge-danger',
  neumaticos:       'badge-neutral',
  revision_general: 'badge-ok',
  otro:             'badge-neutral',
}

function ServiceBadge({ tipo }) {
  const cls   = TIPO_SERV_BADGE[tipo] ?? 'badge-neutral'
  const label = TIPOS_SERVICE.find(t => t.value === tipo)?.label ?? tipo
  return <span className={cls}>{label}</span>
}

function ServiceTab({ municipioId }) {
  const { data: vehiculos = [] } = useVehiculos({}, { municipioIdOverride: municipioId })
  const ids = vehiculos.map(v => v.id)
  const { data: services = [], isLoading } = useServiceVehiculos({ vehiculoIds: ids, limit: 50 })
  const [modalNew, setModalNew] = useState(false)

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setModalNew(true)} disabled={vehiculos.length === 0}>
          + Registrar service
        </Button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : services.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">No hay services registrados.</div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Vehículo</Th>
              <Th>Tipo</Th>
              <Th>Descripción</Th>
              <Th className="text-right">KM</Th>
              <Th className="text-right">Próximo</Th>
              <Th className="text-right">Costo</Th>
              <Th>Taller</Th>
            </Tr>
          </THead>
          <tbody>
            {services.map(s => (
              <Tr key={s.id}>
                <Td className="whitespace-nowrap">{dateOf(s.fecha)}</Td>
                <Td className="font-mono text-xs">
                  {s.vehiculo?.patente || 'S/P'} <span className="text-primary-400">{s.vehiculo?.modelo}</span>
                </Td>
                <Td><ServiceBadge tipo={s.tipo_service} /></Td>
                <Td>{s.descripcion}</Td>
                <Td className="text-right tabular-nums">{fmtNum.format(s.km_al_service ?? 0)}</Td>
                <Td className="text-right tabular-nums text-primary-500">
                  {s.proximo_service_km ? fmtNum.format(s.proximo_service_km) : '—'}
                </Td>
                <Td className="text-right font-semibold tabular-nums">{fmtMoney.format(s.costo ?? 0)}</Td>
                <Td className="text-xs">{s.taller || '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {modalNew && (
        <ServiceFormModal vehiculos={vehiculos} onClose={() => setModalNew(false)} />
      )}
    </div>
  )
}

function ServiceFormModal({ vehiculos, onClose }) {
  const [form, setForm] = useState({
    vehiculo_id: '', fecha: todayArgYMD(), tipo_service: 'aceite',
    descripcion: '', km_al_service: '', proximo_service_km: '',
    costo: '', taller: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const create = useCreateService()

  const canSubmit = !!form.vehiculo_id && !!form.fecha && !!form.descripcion.trim()

  async function handle() {
    setError('')
    try {
      await create.mutateAsync({
        vehiculo_id:        form.vehiculo_id,
        fecha:              form.fecha,
        tipo_service:       form.tipo_service,
        descripcion:        form.descripcion.trim(),
        km_al_service:      form.km_al_service ? Number(form.km_al_service) : null,
        proximo_service_km: form.proximo_service_km ? Number(form.proximo_service_km) : null,
        costo:              form.costo ? Number(form.costo) : 0,
        taller:             form.taller.trim() || null,
      })
      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Registrar service"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handle} loading={create.isPending} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Vehículo" value={form.vehiculo_id} onChange={v => set('vehiculo_id', v)}
          placeholder="Seleccionar..."
          options={vehiculos.map(v => ({
            value: v.id,
            label: `${v.patente || 'S/P'} · ${[v.marca, v.modelo].filter(Boolean).join(' ')}`,
          }))}
        />
        <Input label="Fecha" type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} required />
        <Select label="Tipo de service" value={form.tipo_service} onChange={v => set('tipo_service', v)} options={TIPOS_SERVICE} />
        <Input label="Taller (opcional)" value={form.taller} onChange={e => set('taller', e.target.value)} />
        <div className="sm:col-span-2">
          <Input label="Descripción" value={form.descripcion} onChange={e => set('descripcion', e.target.value)} required />
        </div>
        <Input label="KM al service" type="number" min="0" value={form.km_al_service} onChange={e => set('km_al_service', e.target.value)} />
        <Input label="Próximo service (KM)" type="number" min="0" value={form.proximo_service_km} onChange={e => set('proximo_service_km', e.target.value)} />
        <Input label="Costo" type="number" min="0" step="0.01" value={form.costo} onChange={e => set('costo', e.target.value)} />
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 4 — Alertas
// ─────────────────────────────────────────────────────────────────

function AlertasTab({ municipioId }) {
  const { data: vehiculos = [], isLoading } = useVehiculos({}, { municipioIdOverride: municipioId })

  const alertas = useMemo(() => {
    const hoy = new Date()
    const en30dias = new Date(hoy.getTime() + 30 * 24 * 60 * 60 * 1000)

    return vehiculos.flatMap(v => {
      const alertasVehiculo = []

      // Seguro vencido o próximo a vencer
      if (v.seguro_vencimiento) {
        const venc = new Date(v.seguro_vencimiento)
        if (venc <= en30dias) {
          alertasVehiculo.push({
            tipo: venc < hoy ? 'Seguro VENCIDO' : 'Seguro por vencer',
            vehiculo: `${v.marca} ${v.modelo} (${v.patente})`,
            detalle: `Vence: ${venc.toLocaleDateString('es-AR')}`,
            urgente: venc < hoy,
            icon: '🛡',
          })
        }
      }

      // VTV vencida o próxima a vencer
      if (v.vtv_vencimiento) {
        const venc = new Date(v.vtv_vencimiento)
        if (venc <= en30dias) {
          alertasVehiculo.push({
            tipo: venc < hoy ? 'VTV VENCIDA' : 'VTV por vencer',
            vehiculo: `${v.marca} ${v.modelo} (${v.patente})`,
            detalle: `Vence: ${venc.toLocaleDateString('es-AR')}`,
            urgente: venc < hoy,
            icon: '🪪',
          })
        }
      }

      // Vehículo en mantenimiento
      if (v.estado === 'mantenimiento') {
        alertasVehiculo.push({
          tipo: 'En mantenimiento',
          vehiculo: `${v.marca} ${v.modelo} (${v.patente})`,
          detalle: v.observaciones ?? 'Sin detalles',
          urgente: false,
          icon: '🔧',
        })
      }

      // Kilometraje alto (> 200.000 km)
      if (v.km_actuales && Number(v.km_actuales) > 200000) {
        alertasVehiculo.push({
          tipo: 'Kilometraje alto',
          vehiculo: `${v.marca} ${v.modelo} (${v.patente})`,
          detalle: `${fmtNum.format(v.km_actuales)} km`,
          urgente: false,
          icon: '📊',
        })
      }

      return alertasVehiculo
    })
  }, [vehiculos])

  return (
    <div className="space-y-5">
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Alertas de flota</h2>
          <p className="text-sm text-primary-400">
            Vencimientos de seguro/VTV, vehículos en mantenimiento y kilometraje alto.
          </p>
        </div>
        <span className="badge-neutral">{alertas.length} {alertas.length === 1 ? 'alerta' : 'alertas'}</span>
      </header>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : alertas.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          ✅ Sin alertas activas — todos los vehículos al día
        </div>
      ) : (
        <ul className="space-y-2">
          {alertas.map((a, idx) => (
            <li
              key={idx}
              className={
                'flex items-start gap-3 rounded-lg border-l-4 bg-white p-4 shadow-card ' +
                (a.urgente ? 'border-l-danger' : 'border-l-accent')
              }
            >
              <span className="text-2xl leading-none" aria-hidden="true">{a.icon}</span>
              <div className="min-w-0 flex-1">
                <div className={'font-sora text-sm font-bold ' + (a.urgente ? 'text-danger' : 'text-accent-700')}>
                  {a.tipo}
                </div>
                <div className="text-sm font-medium text-primary">{a.vehiculo}</div>
                <div className="text-xs text-primary-500">{a.detalle}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
