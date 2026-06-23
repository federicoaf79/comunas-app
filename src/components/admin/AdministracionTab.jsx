import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useGastos, useCreateGasto, useUpdateGastoEstado,
  usePresupuestoPartidas,
  currentMonthYYYYMM, currentYear, monthRange,
} from '../../hooks/useAdministracion'
import {
  useOrdenesCompra, useCreateOrdenCompra, useUpdateOrdenEstado,
  usePartidasTipo,
} from '../../hooks/useInventario'
import { useAuth } from '../../context/AuthContext'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import StatCard from '../ui/StatCard'
import Spinner from '../ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../ui/Table'
import { todayArgYMD, dateOf } from '../../lib/datetime'

// =============================================================
// AdministracionTab — sección reusable para cualquier dependencia
// (Sala Primeros Auxilios, Juez de Paz, SUM, Portal Web, o cualquier
// DependenciaGeneral) que necesite mostrar el flujo financiero:
// gastos del área, solicitudes de insumos y presupuesto del año.
//
// Props:
//   dependenciaId      uuid de la dependencia. Si null/undefined
//                      la tab renderiza un empty state amable.
//   dependenciaNombre  texto opcional para mostrar en subtítulos
//                      y modales ("Gastos de · NOMBRE").
//   municipioId        del municipio efectivo (usar
//                      useEffectiveMunicipioId arriba).
//   canApprove         bool — habilita Aprobar/Rechazar (admin/super).
//   canCreate          bool — habilita los botones de "+ Registrar".
// =============================================================

const CATEGORIAS_GASTO = [
  'Personal', 'Servicios', 'Insumos', 'Obras',
  'Mantenimiento', 'Combustible', 'Otros',
]

const FUENTES_PARTIDA_LABEL = {
  coparticipacion:  'Coparticipación',
  recursos_propios: 'Recursos propios',
  aportes_no_reint: 'Aportes no reintegrables',
  tasas:            'Tasas y servicios',
  otros:            'Otros',
}

const fmtMoneyAdm = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

// Estados que mostramos como "pendiente de aprobación" en los KPIs
// y badges. El alta desde este tab persiste 'pendiente'; el sistema
// legacy usaba 'borrador' — los dos cuentan como esperando aprobación.
const ESTADOS_PENDIENTES_GASTO = new Set(['pendiente', 'borrador'])

function GastoEstadoBadge({ estado }) {
  if (estado === 'aprobado') {
    return <span className="estado-confirmado">Aprobado</span>
  }
  if (estado === 'rechazado') {
    return <span className="estado-cancelado">Rechazado</span>
  }
  return (
    <span className="inline-flex items-center rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
      Pendiente
    </span>
  )
}

export default function AdministracionTab({
  dependenciaId,
  dependenciaNombre,
  municipioId,
  canApprove,
  canCreate,
}) {
  // Fallback de empty state cuando todavía no hay dep resuelta —
  // típico cuando una página llega antes de que termine el query
  // de useDependenciaByTipo.
  if (!dependenciaId) {
    return (
      <div className="card p-8 text-center text-sm text-primary-400">
        Esta sección requiere una dependencia asignada al módulo. Pedile al
        administrador que cree la dependencia correspondiente.
      </div>
    )
  }
  // dep mínimo construido a partir de los props — las sub-secciones
  // siguen usando el shape { id, nombre } como antes.
  const dep = { id: dependenciaId, nombre: dependenciaNombre ?? 'la dependencia' }
  return (
    <div className="space-y-5">
      <GastosSection         dep={dep} municipioId={municipioId} canApprove={canApprove} canCreate={canCreate} />
      <SolicitudInsumosSection dep={dep} municipioId={municipioId} canApprove={canApprove} canCreate={canCreate} />
      <PresupuestoSection    dep={dep} municipioId={municipioId} />
    </div>
  )
}

// ── Sección 1: Gastos del área ──────────────────────────────────

function GastosSection({ dep, municipioId, canApprove, canCreate }) {
  const [modalNew, setModalNew] = useState(false)
  const partidasQ = usePartidasTipo()
  const partidasTipo = partidasQ.data ?? []

  const gastosQ = useGastos(
    { dependenciaId: dep.id },
    { municipioIdOverride: municipioId },
  )
  const gastos = gastosQ.data ?? []
  const ultimos = gastos.slice(0, 20)

  const mes = currentMonthYYYYMM()
  const { first, next } = monthRange(mes)
  const enMes  = (g) => g.fecha && g.fecha >= first && g.fecha < next
  const totalMes = gastos
    .filter(g => enMes(g) && g.estado === 'aprobado')
    .reduce((acc, g) => acc + Number(g.monto ?? 0), 0)
  const pendientes = gastos
    .filter(g => ESTADOS_PENDIENTES_GASTO.has(g.estado))
    .reduce((acc, g) => acc + Number(g.monto ?? 0), 0)

  const createMut    = useCreateGasto()
  const updateEstMut = useUpdateGastoEstado()

  async function handleCreate(payload) {
    await createMut.mutateAsync({
      municipio_id:   municipioId,
      dependencia_id: dep.id,
      fecha:          todayArgYMD(),
      ...payload,
      estado:         'pendiente',
    })
    setModalNew(false)
  }
  function handleAprobar(id)  { updateEstMut.mutate({ id, estado: 'aprobado' }) }
  function handleRechazar(id) { updateEstMut.mutate({ id, estado: 'rechazado' }) }

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary">Gastos del área</h2>
          <p className="text-sm text-primary-400">
            Últimos movimientos financieros de <b>{dep.nombre}</b>.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setModalNew(true)}>+ Registrar gasto</Button>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Total gastado este mes" value={fmtMoneyAdm.format(totalMes)} accent="primary" />
        <StatCard
          label="Pendiente de aprobación"
          value={fmtMoneyAdm.format(pendientes)}
          accent={pendientes > 0 ? 'accent' : 'primary'}
        />
      </div>

      {gastosQ.isLoading ? (
        <div className="card flex items-center justify-center p-8"><Spinner /></div>
      ) : ultimos.length === 0 ? (
        <div className="card p-8 text-center text-sm text-primary-400">
          Todavía no hay gastos registrados para esta dependencia.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Descripción</Th>
              <Th>Categoría</Th>
              <Th className="text-right">Monto</Th>
              <Th>Estado</Th>
              {canApprove && <Th className="text-right">Acciones</Th>}
            </Tr>
          </THead>
          <tbody>
            {ultimos.map(g => (
              <Tr key={g.id}>
                <Td className="whitespace-nowrap">{dateOf(g.fecha)}</Td>
                <Td className="min-w-0">{g.descripcion}</Td>
                <Td className="text-xs">{g.categoria || '—'}</Td>
                <Td className="whitespace-nowrap text-right font-semibold tabular-nums">
                  {fmtMoneyAdm.format(g.monto ?? 0)}
                </Td>
                <Td><GastoEstadoBadge estado={g.estado} /></Td>
                {canApprove && (
                  <Td className="whitespace-nowrap text-right text-xs">
                    {ESTADOS_PENDIENTES_GASTO.has(g.estado) ? (
                      <div className="flex justify-end gap-2 font-semibold">
                        <button onClick={() => handleAprobar(g.id)}  className="text-ok-700 hover:underline">Aprobar</button>
                        <span className="text-primary-200">·</span>
                        <button onClick={() => handleRechazar(g.id)} className="text-danger hover:underline">Rechazar</button>
                      </div>
                    ) : (
                      <span className="text-primary-300">—</span>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {modalNew && (
        <RegistrarGastoModal
          dep={dep}
          partidasTipo={partidasTipo}
          onClose={() => setModalNew(false)}
          onSave={handleCreate}
          saving={createMut.isPending}
        />
      )}
    </section>
  )
}

function RegistrarGastoModal({ dep, partidasTipo, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    descripcion: '', categoria: '', monto: '',
    comprobante_url: '', partida_codigo: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const canSubmit =
    !!form.descripcion.trim() && !!form.categoria &&
    Number(form.monto) > 0

  async function handle() {
    setError('')
    try {
      await onSave({
        descripcion:     form.descripcion.trim(),
        categoria:       form.categoria,
        monto:           Number(form.monto),
        comprobante_url: form.comprobante_url.trim() || null,
        partida_codigo:  form.partida_codigo || null,
      })
    } catch (e) {
      setError(e?.message ?? 'No pudimos registrar el gasto.')
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg"
      title={`Registrar gasto · ${dep.nombre}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handle} loading={saving} disabled={!canSubmit}>Registrar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Detalle del gasto"
            required
          />
        </div>
        <Select
          label="Categoría"
          value={form.categoria}
          onChange={v => set('categoria', v)}
          placeholder="Seleccionar..."
          options={CATEGORIAS_GASTO.map(c => ({ value: c, label: c }))}
        />
        <Input
          label="Monto"
          type="number"
          min="0"
          step="0.01"
          value={form.monto}
          onChange={e => set('monto', e.target.value)}
          required
        />
        <Select
          label="Partida (opcional)"
          value={form.partida_codigo}
          onChange={v => set('partida_codigo', v)}
          placeholder="Sin asignar"
          options={partidasTipo.map(p => ({ value: p.codigo, label: `${p.codigo} — ${p.nombre}` }))}
        />
        <Input
          label="Comprobante (URL, opcional)"
          value={form.comprobante_url}
          onChange={e => set('comprobante_url', e.target.value)}
          placeholder="https://..."
        />
        <p className="text-xs text-primary-400 sm:col-span-2">
          El gasto se crea como <b>Pendiente</b>. Un admin de comuna puede aprobarlo
          o rechazarlo después.
        </p>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ── Sección 2: Solicitud de insumos ─────────────────────────────

const URGENCIA_BADGE = {
  normal:  'inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-700 ring-1 ring-inset ring-primary-200',
  urgente: 'inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger ring-1 ring-inset ring-red-100',
}

const OC_ESTADO_LABEL = {
  borrador:  'Pendiente',
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
}

function ocEstadoBadgeClass(estado) {
  if (estado === 'aprobada')  return 'estado-confirmado'
  if (estado === 'rechazada') return 'estado-cancelado'
  return 'inline-flex items-center rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100'
}

function urgenciaFromDesc(desc = '') {
  if (/^\[Solicitud urgente\]/i.test(desc)) return 'urgente'
  if (/^\[Solicitud\]/i.test(desc))         return 'normal'
  return null
}

function SolicitudInsumosSection({ dep, municipioId, canApprove, canCreate }) {
  const [modalNew, setModalNew] = useState(false)
  const { perfil } = useAuth()

  const ordenesQ = useOrdenesCompra(
    { dependenciaId: dep.id },
    { municipioIdOverride: municipioId },
  )
  const ordenes = ordenesQ.data ?? []

  const createMut = useCreateOrdenCompra()
  const updateMut = useUpdateOrdenEstado()

  async function handleCreate(payload) {
    await createMut.mutateAsync({
      municipio_id:    municipioId,
      dependencia_id:  dep.id,
      proveedor:       'A definir',
      descripcion:     payload.descripcion,
      monto_total:     0,
      tipo:            'directa',
      estado:          'borrador',
      created_by:      perfil?.id ?? null,
    })
    setModalNew(false)
  }
  function handleAprobar(id)  { updateMut.mutate({ id, estado: 'aprobada' }) }
  function handleRechazar(id) { updateMut.mutate({ id, estado: 'rechazada' }) }

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary">Solicitud de insumos</h2>
          <p className="text-sm text-primary-400">
            Pedidos de compra de la dependencia. Una vez aprobados pasan a Órdenes de Compra.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setModalNew(true)}>+ Solicitar insumos</Button>
        )}
      </header>

      {ordenesQ.isLoading ? (
        <div className="card flex items-center justify-center p-8"><Spinner /></div>
      ) : ordenes.length === 0 ? (
        <div className="card p-8 text-center text-sm text-primary-400">
          No hay solicitudes registradas.
        </div>
      ) : (
        <ul className="space-y-2">
          {ordenes.map(o => {
            const urgencia = urgenciaFromDesc(o.descripcion)
            const fechaTxt = o.created_at ? dateOf(o.created_at) : '—'
            return (
              <li key={o.id} className="rounded-lg border border-border bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {urgencia && (
                        <span className={URGENCIA_BADGE[urgencia]}>{urgencia}</span>
                      )}
                      <span className="text-xs text-primary-400">{fechaTxt}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-primary-700">
                      {o.descripcion}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={ocEstadoBadgeClass(o.estado)}>
                      {OC_ESTADO_LABEL[o.estado] ?? o.estado}
                    </span>
                    {canApprove && (o.estado === 'borrador' || o.estado === 'pendiente') && (
                      <div className="flex gap-2 text-xs font-semibold">
                        <button onClick={() => handleAprobar(o.id)}  className="text-ok-700 hover:underline">Aprobar</button>
                        <span className="text-primary-200">·</span>
                        <button onClick={() => handleRechazar(o.id)} className="text-danger hover:underline">Rechazar</button>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {modalNew && (
        <SolicitarInsumosModal
          dep={dep}
          onClose={() => setModalNew(false)}
          onSave={handleCreate}
          saving={createMut.isPending}
        />
      )}
    </section>
  )
}

function SolicitarInsumosModal({ dep, onClose, onSave, saving }) {
  const [form, setForm] = useState({
    descripcion: '', cantidad: '', urgencia: 'normal', observaciones: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const canSubmit = !!form.descripcion.trim()

  async function handle() {
    setError('')
    // ordenes_compra no tiene columnas cantidad/urgencia/observaciones,
    // así que empaquetamos todo en `descripcion`. El prefijo
    // `[Solicitud urgente]` permite mostrar urgencia en la lista sin
    // parsear más.
    const partes = [
      form.urgencia === 'urgente' ? '[Solicitud urgente]' : '[Solicitud]',
      form.descripcion.trim(),
    ]
    if (form.cantidad.trim()) partes.push(`Cantidad estimada: ${form.cantidad.trim()}`)
    if (form.observaciones.trim()) partes.push(`Observaciones: ${form.observaciones.trim()}`)
    const descripcion = partes.join('\n')
    try {
      await onSave({ descripcion })
    } catch (e) {
      setError(e?.message ?? 'No pudimos registrar la solicitud.')
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg"
      title={`Solicitar insumos · ${dep.nombre}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handle} loading={saving} disabled={!canSubmit}>Enviar solicitud</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="Ej: Gasas estériles 10×10cm"
            required
          />
        </div>
        <Input
          label="Cantidad estimada"
          value={form.cantidad}
          onChange={e => set('cantidad', e.target.value)}
          placeholder="Ej: 50 cajas"
        />
        <Select
          label="Urgencia"
          value={form.urgencia}
          onChange={v => set('urgencia', v)}
          options={[
            { value: 'normal',  label: 'Normal' },
            { value: 'urgente', label: 'Urgente' },
          ]}
        />
        <div className="sm:col-span-2">
          <Input
            label="Observaciones (opcional)"
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            placeholder="Algún detalle adicional"
          />
        </div>
        <p className="text-xs text-primary-400 sm:col-span-2">
          La solicitud queda <b>pendiente</b> hasta que un admin de comuna la
          apruebe.
        </p>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ── Sección 3: Presupuesto del área (solo lectura) ──────────────

function PresupuestoSection({ dep, municipioId }) {
  const anio = currentYear()
  const opts = { municipioIdOverride: municipioId }
  const partidasQ = usePresupuestoPartidas(anio, opts)
  const { first: yearStart } = monthRange(`${anio}-01`)
  const { next: yearEnd   } = monthRange(`${anio}-12`)
  const gastosAprobQ = useGastos(
    { dependenciaId: dep.id, fechaFrom: yearStart, fechaTo: yearEnd, estado: 'aprobado' },
    opts,
  )

  const partidasDep = useMemo(() => {
    const all = partidasQ.data ?? []
    return all.filter(p => p.dependencia_id === dep.id)
  }, [partidasQ.data, dep.id])

  const ejecutadoDep = useMemo(() => {
    const gs = gastosAprobQ.data ?? []
    return gs.reduce((acc, g) => acc + Number(g.monto ?? 0), 0)
  }, [gastosAprobQ.data])

  const totalAsignado   = partidasDep.reduce((acc, p) => acc + Number(p.monto_asignado ?? 0), 0)
  const totalDisponible = totalAsignado - ejecutadoDep
  const totalPct = totalAsignado > 0
    ? Math.round((ejecutadoDep / totalAsignado) * 100)
    : 0

  const isLoading = partidasQ.isLoading || gastosAprobQ.isLoading

  return (
    <section className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-sora text-lg font-bold text-primary">
            Presupuesto del área · {anio}
          </h2>
          <p className="text-sm text-primary-400">
            Partidas asignadas y ejecutado a nivel dependencia.
          </p>
        </div>
        <Link
          to="/admin/rendicion"
          className="text-sm font-semibold text-accent hover:underline"
        >
          Ver rendición completa →
        </Link>
      </header>

      {isLoading ? (
        <div className="card flex items-center justify-center p-8"><Spinner /></div>
      ) : partidasDep.length === 0 ? (
        <div className="card p-8 text-center text-sm text-primary-400">
          No hay partidas asignadas a esta dependencia para {anio}.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Partida</Th>
              <Th>Fuente</Th>
              <Th className="text-right">Asignado</Th>
              <Th className="text-right">Ejecutado (dep.)</Th>
              <Th className="text-right">Disponible</Th>
            </Tr>
          </THead>
          <tbody>
            {partidasDep.map(p => {
              const asignado   = Number(p.monto_asignado ?? 0)
              const disponible = asignado - ejecutadoDep
              return (
                <Tr key={p.id}>
                  <Td className="font-mono text-xs">{p.partida_codigo}</Td>
                  <Td className="text-xs">{FUENTES_PARTIDA_LABEL[p.fuente] ?? (p.fuente || '—')}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoneyAdm.format(asignado)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-primary-500">
                    {fmtMoneyAdm.format(ejecutadoDep)}
                  </Td>
                  <Td className={`whitespace-nowrap text-right font-semibold tabular-nums ${disponible < 0 ? 'text-danger' : 'text-primary-700'}`}>
                    {fmtMoneyAdm.format(disponible)}
                  </Td>
                </Tr>
              )
            })}
            <Tr className="bg-primary-50/60 font-bold">
              <Td className="font-bold text-primary" colSpan={2}>Total · {totalPct}% ejecutado</Td>
              <Td className="whitespace-nowrap text-right">{fmtMoneyAdm.format(totalAsignado)}</Td>
              <Td className="whitespace-nowrap text-right">{fmtMoneyAdm.format(ejecutadoDep)}</Td>
              <Td className={`whitespace-nowrap text-right ${totalDisponible < 0 ? 'text-danger' : 'text-primary-700'}`}>
                {fmtMoneyAdm.format(totalDisponible)}
              </Td>
            </Tr>
          </tbody>
        </Table>
      )}

      <p className="text-xs text-primary-400">
        Nota: el ejecutado se calcula al sumar todos los gastos aprobados de la
        dependencia ({fmtMoneyAdm.format(ejecutadoDep)}). El schema de gastos
        no lleva partida_codigo por fila, por eso el valor aparece igual en
        cada partida.
      </p>
    </section>
  )
}
