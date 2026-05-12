import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  useTurnos, useDependenciaByTipo,
} from '../../hooks/useTurnos'
import {
  useBeneficiarios, useCreateBeneficiario, useUpdateBeneficiarioEstado,
} from '../../hooks/useBeneficiarios'
import {
  useReclamos, useCreateReclamo, useUpdateReclamoEstado,
} from '../../hooks/useReclamos'
import {
  useInventario, useCreateInventarioItem, useUpdateInventarioItem,
} from '../../hooks/useInventario'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import {
  Paginacion, ItemFormModal, MovimientoFormModal,
} from './Inventario'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
import Tabs from '../../components/ui/Tabs'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import NuevoTurnoModal from '../../components/admin/NuevoTurnoModal'
import BeneficiarioFormModal from '../../components/admin/BeneficiarioFormModal'
import ReclamoFormModal from '../../components/admin/ReclamoFormModal'
import AdministracionTab from '../../components/admin/AdministracionTab'
import { todayArgYMD, dateOf, timeOf, dateTimeOf } from '../../lib/datetime'

// =============================================================
// Página genérica para dependencias que no tienen módulo propio
// (Ayuda Social, Obras Públicas, Polideportivo, Cementerio,
// Velatorio, Delegación Policial, Educación, Bienes, etc).
//
// Tabs base: Información | Turnos | Contacto
// Tabs extra según tipo:
//   ayuda_social/social      → Beneficiarios
//   obras/obras_publicas     → Reclamos
//   deporte/polideportivo    → Reservas canchas (placeholder)
//   educacion                → Calendario escolar (placeholder)
// =============================================================

const TABS_BASE = [
  { value: 'info',           label: 'Información' },
  { value: 'turnos',         label: 'Turnos' },
  { value: 'administracion', label: 'Administración' },
  { value: 'inventario',     label: 'Inventario' },
  { value: 'contacto',       label: 'Contacto' },
]

const CATEGORIAS_INV = ['Limpieza', 'Oficina', 'Salud', 'Construcción', 'Combustible', 'Repuestos', 'Otros']
const PAGE_SIZE_INV = 20

const fmtMoneyInv = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

function stockEstado(item) {
  const a = Number(item.stock_actual ?? 0)
  const m = Number(item.stock_minimo ?? 0)
  if (a <= m)         return 'critico'
  if (a <= m * 1.5)   return 'bajo'
  return 'ok'
}
function StockBadge({ estado }) {
  if (estado === 'critico') return <span className="badge-danger">Crítico</span>
  if (estado === 'bajo')    return <span className="badge-accent">Bajo</span>
  return <span className="badge-ok">OK</span>
}

// Detalle/horario adicional por tipo — la tabla `dependencias` solo
// guarda nombre/tipo/activa, así que el copy descriptivo se
// enriquece acá.
const DEP_INFO = {
  caps:           { detalle: 'Atención médica, vacunación y enfermería.',          horario: 'Lun a Vie · 8:00 – 20:00' },
  salud:          { detalle: 'Atención médica, vacunación y enfermería.',          horario: 'Lun a Vie · 8:00 – 20:00' },
  juzgado:        { detalle: 'Trámites civiles, certificaciones y mediación.',     horario: 'Lun a Vie · 7:00 – 13:00' },
  sum:            { detalle: 'Eventos comunitarios, capacitaciones y reuniones.',  horario: 'Reservas — consultar disponibilidad' },
  intendencia:    { detalle: 'Mesa de entradas, tesorería y trámites generales.',  horario: 'Lun a Vie · 7:00 – 13:00' },
  obras:          { detalle: 'Permisos de construcción e infraestructura.',         horario: 'Lun a Vie · 7:00 – 13:00' },
  obras_publicas: { detalle: 'Permisos de construcción e infraestructura.',         horario: 'Lun a Vie · 7:00 – 13:00' },
  deporte:        { detalle: 'Actividades deportivas, canchas y eventos.',          horario: 'Consultar horarios' },
  polideportivo:  { detalle: 'Canchas, gimnasio y actividades deportivas.',         horario: 'Consultar horarios' },
  cementerio:     { detalle: 'Servicios fúnebres y memoriales.',                    horario: 'Todos los días · 8:00 – 18:00' },
  velatorio:      { detalle: 'Servicios de despedida y acompañamiento.',            horario: 'Disponibilidad 24/7' },
  policia:        { detalle: 'Seguridad ciudadana y emergencias.',                  horario: '24/7 · 911 / 101' },
  educacion:      { detalle: 'Becas, programas educativos y biblioteca.',           horario: 'Lun a Vie · 7:00 – 13:00' },
  jardin:         { detalle: 'Becas, programas educativos y biblioteca.',           horario: 'Lun a Vie · 7:00 – 13:00' },
  primaria:       { detalle: 'Becas, programas educativos y biblioteca.',           horario: 'Lun a Vie · 7:00 – 13:00' },
  secundaria:     { detalle: 'Becas, programas educativos y biblioteca.',           horario: 'Lun a Vie · 7:00 – 13:00' },
  bienes:         { detalle: 'Catastro, bienes inmuebles y patrimonio.',            horario: 'Lun a Vie · 7:00 – 13:00' },
  ayuda_social:   { detalle: 'Programas de asistencia y acompañamiento social.',    horario: 'Lun a Vie · 8:00 – 13:00' },
  social:         { detalle: 'Programas de asistencia y acompañamiento social.',    horario: 'Lun a Vie · 8:00 – 13:00' },
}

// Devuelve el slug de tab extra que aplica al tipo (o null).
function extraTabKey(tipo) {
  const t = (tipo ?? '').toLowerCase()
  if (/ayuda_social|social|asisten/.test(t))    return 'beneficiarios'
  if (/obras|infra|catastro/.test(t))           return 'reclamos'
  if (/deport|recreaci|polideport/.test(t))     return 'reservas'
  if (/educ|escuel|biblioteca|jardin|primaria|secundaria/.test(t)) return 'calendario'
  return null
}

const EXTRA_TAB_LABELS = {
  beneficiarios: 'Beneficiarios',
  reclamos:      'Reclamos',
  reservas:      'Reservas canchas',
  calendario:    'Calendario escolar',
}

const ESTADO_TURNO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
}
const ESTADO_TURNO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
}

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// ─────────────────────────────────────────────────────────────────
// Tab: Información
// ─────────────────────────────────────────────────────────────────

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border py-3 sm:flex-row sm:justify-between sm:gap-4 last:border-b-0">
      <p className="text-xs font-medium uppercase tracking-wide text-primary-400 sm:text-sm">{label}</p>
      <p className="text-sm font-semibold text-primary sm:text-base">{value || '—'}</p>
    </div>
  )
}

function InformacionTab({ dep }) {
  const info = DEP_INFO[dep.tipo] ?? {}
  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Datos generales</h3>
        <div className="mt-2">
          <InfoRow label="Nombre"      value={dep.nombre} />
          <InfoRow label="Tipo"        value={dep.tipo} />
          <InfoRow label="Estado"      value={dep.activa === false ? 'Inactiva' : 'Activa'} />
          <InfoRow label="Horario"     value={info.horario} />
          <InfoRow label="Descripción" value={info.detalle} />
        </div>
      </div>
      <div className="card p-5 sm:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Contacto directo</h3>
        <div className="mt-2">
          <InfoRow label="Teléfono"    value={null} />
          <InfoRow label="Responsable" value={null} />
        </div>
        <p className="mt-3 text-xs italic text-primary-400">
          El teléfono y el responsable directo todavía no están en la tabla
          dependencias. Si los necesitás visibles, configurálos en /admin/config-general
          o pedí extender el schema.
        </p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Turnos
// ─────────────────────────────────────────────────────────────────

function TurnosTab({ dep, onOpenNuevo }) {
  const [fecha, setFecha] = useState(() => todayArgYMD())
  const { turnos, isLoading, error, updateEstado, cancel } = useTurnos({
    fecha,
    dependenciaId: dep.id,
  })

  async function handleConfirmar(id) {
    try { await updateEstado.mutateAsync({ id, estado: 'confirmado' }) }
    catch (e) { alert(`No se pudo confirmar: ${e.message}`) }
  }
  async function handleCancelar(id) {
    if (!confirm('¿Cancelar este turno?')) return
    try { await cancel.mutateAsync(id) }
    catch (e) { alert(`No se pudo cancelar: ${e.message}`) }
  }

  const ordenados = (turnos ?? []).slice().sort((a, b) =>
    (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? '')
  )

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-primary-700">Fecha</span>
          <input
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="input-field min-w-[160px]"
          />
        </label>
        <button onClick={onOpenNuevo} className="btn-primary self-end">+ Nuevo turno</button>
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los turnos: {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : ordenados.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay turnos para esta dependencia en la fecha seleccionada.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Hora</Th>
              <Th>Vecino</Th>
              <Th>Motivo</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {ordenados.map(t => (
              <Tr key={t.id}>
                <Td className="whitespace-nowrap font-semibold text-primary">{timeOf(t.fecha_hora) || '—'}</Td>
                <Td>{vecinoNombre(t.vecino)}</Td>
                <Td className="max-w-xs"><span className="line-clamp-2">{t.motivo || '—'}</span></Td>
                <Td>
                  <span className={ESTADO_TURNO_CLASS[t.estado] ?? 'estado-pendiente'}>
                    {ESTADO_TURNO_LABEL[t.estado] ?? t.estado}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-right text-xs font-medium">
                  <div className="flex justify-end gap-3">
                    {t.estado === 'pendiente' && (
                      <button onClick={() => handleConfirmar(t.id)} className="text-ok-700 hover:underline">Confirmar</button>
                    )}
                    {t.estado !== 'cancelado' && t.estado !== 'completado' && (
                      <button onClick={() => handleCancelar(t.id)} className="text-danger hover:underline">Cancelar</button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Inventario (filtrado por dependencia actual)
// ─────────────────────────────────────────────────────────────────

function InventarioTab({ dep, municipioId, canEdit }) {
  const [categoria, setCategoria]       = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [page, setPage]                 = useState(1)
  const [modalNew, setModalNew]         = useState(false)
  const [editing, setEditing]           = useState(null)
  const [movItem, setMovItem]           = useState(null)
  const [movTipo, setMovTipo]           = useState('entrada')

  // Reset page al cambiar filtros vía wrappers — useEffect dispara
  // `react-hooks/set-state-in-effect`.
  const onChangeCateg  = (v) => { setCategoria(v);    setPage(1) }
  const onChangeEstado = (v) => { setEstadoFiltro(v); setPage(1) }

  const { data: items = [], isLoading } = useInventario(
    { dependenciaId: dep.id, categoria: categoria || undefined },
    { municipioIdOverride: municipioId },
  )

  const filtered = useMemo(() => {
    if (!estadoFiltro) return items
    return items.filter(i => stockEstado(i) === estadoFiltro)
  }, [items, estadoFiltro])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE_INV))
  const safePage   = Math.min(page, totalPages)
  const pageStart  = (safePage - 1) * PAGE_SIZE_INV
  const pageItems  = filtered.slice(pageStart, pageStart + PAGE_SIZE_INV)

  const itemsCriticos = items.filter(i => stockEstado(i) === 'critico').length
  const valorTotal    = items.reduce((acc, i) =>
    acc + Number(i.stock_actual ?? 0) * Number(i.precio_referencia ?? 0), 0)

  const createMut = useCreateInventarioItem()
  const updateMut = useUpdateInventarioItem()

  // Lista de "dependencias" como ÚNICA opción (la actual) — el
  // ItemFormModal pide un select, así pre-seleccionamos al crear.
  const depList = [{ id: dep.id, nombre: dep.nombre }]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-primary-50/40 px-4 py-3 text-sm">
        <span className="text-primary-700">
          <b>{items.length}</b> ítem{items.length === 1 ? '' : 's'}
          {itemsCriticos > 0 && (
            <> · <span className="font-bold text-danger">{itemsCriticos} crítico{itemsCriticos === 1 ? '' : 's'}</span></>
          )}
        </span>
        <span className="font-semibold text-primary">
          Valor estimado: {fmtMoneyInv.format(valorTotal)}
        </span>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Categoría" value={categoria} onChange={onChangeCateg}
            placeholder="Todas"
            options={CATEGORIAS_INV.map(c => ({ value: c, label: c }))}
          />
          <Select
            label="Estado de stock" value={estadoFiltro} onChange={onChangeEstado}
            placeholder="Todos"
            options={[
              { value: 'critico', label: 'Crítico' },
              { value: 'bajo',    label: 'Bajo' },
              { value: 'ok',      label: 'Normal' },
            ]}
          />
        </div>
        {canEdit && (
          <Button onClick={() => setModalNew(true)}>+ Agregar ítem</Button>
        )}
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          {items.length === 0
            ? 'Esta dependencia todavía no tiene ítems en inventario.'
            : 'No hay ítems con estos filtros.'}
        </div>
      ) : (
        <>
          <Table>
            <THead>
              <Tr>
                <Th>Ítem</Th>
                <Th>Categoría</Th>
                <Th>Unidad</Th>
                <Th className="text-right">Stock</Th>
                <Th className="text-right">Mínimo</Th>
                <Th>Estado</Th>
                <Th className="text-right">Precio ref.</Th>
                <Th className="text-right">Acciones</Th>
              </Tr>
            </THead>
            <tbody>
              {pageItems.map(i => {
                const est = stockEstado(i)
                return (
                  <Tr key={i.id}>
                    <Td className="font-medium text-primary">{i.nombre}</Td>
                    <Td>{i.categoria || '—'}</Td>
                    <Td>{i.unidad || '—'}</Td>
                    <Td className="text-right tabular-nums">{i.stock_actual}</Td>
                    <Td className="text-right tabular-nums text-primary-500">{i.stock_minimo}</Td>
                    <Td><StockBadge estado={est} /></Td>
                    <Td className="text-right tabular-nums">
                      {i.precio_referencia ? fmtMoneyInv.format(i.precio_referencia) : '—'}
                    </Td>
                    <Td className="whitespace-nowrap text-right text-xs">
                      <button
                        onClick={() => { setMovItem(i); setMovTipo('entrada') }}
                        className="font-medium text-ok-700 hover:underline"
                      >Entrada</button>
                      <span className="mx-1 text-primary-200">·</span>
                      <button
                        onClick={() => { setMovItem(i); setMovTipo('salida') }}
                        className="font-medium text-accent-700 hover:underline"
                      >Salida</button>
                      {canEdit && (
                        <>
                          <span className="mx-1 text-primary-200">·</span>
                          <button
                            onClick={() => setEditing(i)}
                            className="font-medium text-primary-500 hover:underline"
                          >Editar</button>
                        </>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
          <Paginacion
            page={safePage}
            totalPages={totalPages}
            totalItems={filtered.length}
            pageStart={pageStart}
            pageSize={PAGE_SIZE_INV}
            onPrev={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        </>
      )}

      {modalNew && (
        <ItemFormModal
          onClose={() => setModalNew(false)}
          onSave={async (data) => {
            // Forzamos dependencia_id a la actual — el modal igual la
            // tiene preseleccionada porque depList tiene una sola opción.
            await createMut.mutateAsync({
              ...data,
              dependencia_id: dep.id,
              municipio_id:   municipioId,
            })
            setModalNew(false)
          }}
          dependencias={depList}
          saving={createMut.isPending}
        />
      )}
      {editing && (
        <ItemFormModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateMut.mutateAsync({ id: editing.id, ...data })
            setEditing(null)
          }}
          dependencias={depList}
          saving={updateMut.isPending}
        />
      )}
      {movItem && (
        <MovimientoFormModal
          item={movItem}
          tipo={movTipo}
          onClose={() => setMovItem(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Administración — extraído a src/components/admin/
// AdministracionTab.jsx para reuso desde SalaPA / JuezDePaz / SUM
// / ConfigPortal. Solo lo importamos arriba y lo invocamos abajo
// con dep.id + dep.nombre.
// ─────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────
// Tab: Contacto
// ─────────────────────────────────────────────────────────────────

function ContactoTab({ dep }) {
  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        <h3 className="text-sm font-bold uppercase tracking-wide text-primary">Datos de contacto</h3>
        <p className="mt-2 text-sm text-primary-500">
          {dep.nombre} — {DEP_INFO[dep.tipo]?.detalle ?? 'Dependencia municipal.'}
        </p>
        <ul className="mt-4 space-y-1.5 text-sm text-primary-700">
          <li><strong>Horario:</strong> {DEP_INFO[dep.tipo]?.horario ?? 'Consultar'}</li>
          <li><strong>Dirección:</strong> Av. San Martín s/n, Real Sayana</li>
          <li><strong>Conmutador:</strong> (0385) 4-110-001</li>
        </ul>
      </div>
      <div className="card overflow-hidden p-0">
        <div className="border-b border-border bg-primary-50 px-5 py-3">
          <h3 className="text-sm font-semibold text-primary">Ubicación</h3>
        </div>
        <div className="flex aspect-[16/8] w-full items-center justify-center bg-gradient-to-br from-primary-50 via-white to-accent-50 text-primary-300">
          <div className="text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="mx-auto h-16 w-16">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 1 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <p className="mt-2 text-xs">Mapa próximamente</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Beneficiarios (ayuda_social)
// ─────────────────────────────────────────────────────────────────

const ESTADO_BENEF_LABEL = { activo: 'Activo', suspendido: 'Suspendido', baja: 'Baja' }
const ESTADO_BENEF_CLASS = {
  activo:     'estado-confirmado',
  suspendido: 'estado-pendiente',
  baja:       'estado-cancelado',
}

function BeneficiariosTab({ municipioId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const benefQ        = useBeneficiarios()
  const createMut     = useCreateBeneficiario()
  const updateEstMut  = useUpdateBeneficiarioEstado()
  const items         = benefQ.data ?? []

  async function handleCreate(payload) {
    await createMut.mutateAsync(payload)
    setModalOpen(false)
  }
  async function handleEstado(id, estado) {
    await updateEstMut.mutateAsync({ id, estado })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-primary-500">
          {items.length} beneficiario{items.length === 1 ? '' : 's'} registrado{items.length === 1 ? '' : 's'}.
        </p>
        <button onClick={() => setModalOpen(true)} className="btn-primary">+ Nuevo beneficiario</button>
      </div>

      {benefQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          Todavía no hay beneficiarios cargados.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Vecino</Th>
              <Th>Tipo de ayuda</Th>
              <Th>Inicio</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {items.map(b => (
              <Tr key={b.id}>
                <Td>
                  <p className="font-medium text-primary">{vecinoNombre(b.vecino)}</p>
                  {b.vecino?.dni && <p className="text-xs text-primary-400">DNI {b.vecino.dni}</p>}
                </Td>
                <Td>{b.tipo_ayuda || '—'}</Td>
                <Td className="whitespace-nowrap">{dateOf(b.fecha_inicio)}</Td>
                <Td>
                  <span className={ESTADO_BENEF_CLASS[b.estado] ?? 'estado-pendiente'}>
                    {ESTADO_BENEF_LABEL[b.estado] ?? b.estado}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-right text-xs font-medium">
                  <div className="flex justify-end gap-3">
                    {b.estado === 'activo' && (
                      <>
                        <button onClick={() => handleEstado(b.id, 'suspendido')} className="text-primary-500 hover:underline">Suspender</button>
                        <button onClick={() => handleEstado(b.id, 'baja')}        className="text-danger hover:underline">Dar de baja</button>
                      </>
                    )}
                    {b.estado === 'suspendido' && (
                      <button onClick={() => handleEstado(b.id, 'activo')} className="text-ok-700 hover:underline">Reactivar</button>
                    )}
                    {b.estado === 'baja' && (
                      <button onClick={() => handleEstado(b.id, 'activo')} className="text-ok-700 hover:underline">Reactivar</button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <BeneficiarioFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleCreate}
        municipioId={municipioId}
        saving={createMut.isPending}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Reclamos (obras)
// ─────────────────────────────────────────────────────────────────

const ESTADO_REC_LABEL = {
  abierto: 'Abierto', en_proceso: 'En proceso', resuelto: 'Resuelto',
  cerrado: 'Cerrado', rechazado: 'Rechazado',
}
const ESTADO_REC_CLASS = {
  abierto:    'estado-pendiente',
  en_proceso: 'estado-en-curso',
  resuelto:   'estado-confirmado',
  cerrado:    'estado-completado',
  rechazado:  'estado-cancelado',
}
const PRIORIDAD_CLASS = {
  urgente: 'inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-danger',
  alta:    'inline-flex items-center rounded-full bg-accent-100 px-2.5 py-0.5 text-xs font-semibold text-accent-700',
  normal:  'inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-semibold text-primary-700',
  baja:    'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700',
}

function ReclamosTab({ municipioId }) {
  const [modalOpen, setModalOpen] = useState(false)
  const reclamosQ      = useReclamos()
  const createMut      = useCreateReclamo()
  const updateEstMut   = useUpdateReclamoEstado()
  const items          = reclamosQ.data ?? []

  async function handleCreate(payload) {
    await createMut.mutateAsync(payload)
    setModalOpen(false)
  }
  async function handleEstado(id, estado) {
    await updateEstMut.mutateAsync({ id, estado })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-primary-500">
          {items.length} reclamo{items.length === 1 ? '' : 's'} registrado{items.length === 1 ? '' : 's'}.
        </p>
        <button onClick={() => setModalOpen(true)} className="btn-primary">+ Nuevo reclamo</button>
      </div>

      {reclamosQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          Todavía no hay reclamos registrados.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Vecino</Th>
              <Th>Reclamo</Th>
              <Th>Prioridad</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {items.map(r => (
              <Tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-primary-500">{dateTimeOf(r.created_at)}</Td>
                <Td>
                  <p className="font-medium text-primary">{r.vecino ? vecinoNombre(r.vecino) : 'Anónimo'}</p>
                  {r.vecino?.dni && <p className="text-xs text-primary-400">DNI {r.vecino.dni}</p>}
                </Td>
                <Td className="max-w-md">
                  {r.tipo && <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">{r.tipo}</p>}
                  <p className="line-clamp-2 text-sm text-primary-700">{r.descripcion}</p>
                  {r.ubicacion && <p className="mt-0.5 text-xs text-primary-400">📍 {r.ubicacion}</p>}
                </Td>
                <Td>
                  <span className={PRIORIDAD_CLASS[r.prioridad] ?? PRIORIDAD_CLASS.normal}>
                    {r.prioridad}
                  </span>
                </Td>
                <Td>
                  <span className={ESTADO_REC_CLASS[r.estado] ?? 'estado-pendiente'}>
                    {ESTADO_REC_LABEL[r.estado] ?? r.estado}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-right text-xs font-medium">
                  <div className="flex justify-end gap-3">
                    {r.estado === 'abierto' && (
                      <button onClick={() => handleEstado(r.id, 'en_proceso')} className="text-accent-700 hover:underline">Tomar</button>
                    )}
                    {(r.estado === 'abierto' || r.estado === 'en_proceso') && (
                      <button onClick={() => handleEstado(r.id, 'resuelto')} className="text-ok-700 hover:underline">Resolver</button>
                    )}
                    {r.estado !== 'rechazado' && r.estado !== 'cerrado' && (
                      <button onClick={() => handleEstado(r.id, 'rechazado')} className="text-danger hover:underline">Rechazar</button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <ReclamoFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleCreate}
        municipioId={municipioId}
        saving={createMut.isPending}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Reservas canchas (deporte) — placeholder simple
// ─────────────────────────────────────────────────────────────────

function ReservasCanchasTab() {
  return (
    <div className="card p-10 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="mx-auto h-12 w-12 text-primary-300">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12c4 0 6 4 6 9M21 12c-4 0-6 4-6 9M3 12c4 0 6-4 6-9M21 12c-4 0-6-4-6-9" />
      </svg>
      <p className="mt-3 font-sora text-base font-semibold text-primary">
        Reservas de canchas
      </p>
      <p className="mt-1 text-sm text-primary-500">
        Próximamente — calendario de reservas para canchas y espacios deportivos.
      </p>
      <p className="mt-3 text-xs text-primary-400">
        Por ahora gestioná las reservas de eventos en{' '}
        <Link to="/admin/sum" className="font-semibold text-primary hover:underline">/admin/sum</Link>.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab: Calendario escolar (educacion) — placeholder simple
// ─────────────────────────────────────────────────────────────────

const FECHAS_ESCOLARES_DEFAULT = [
  { fecha: '2026-03-03', titulo: 'Inicio del ciclo lectivo', tipo: 'inicio' },
  { fecha: '2026-04-02', titulo: 'Día del Veterano y de los Caídos en Malvinas', tipo: 'feriado' },
  { fecha: '2026-05-25', titulo: 'Revolución de Mayo', tipo: 'feriado' },
  { fecha: '2026-07-09', titulo: 'Día de la Independencia', tipo: 'feriado' },
  { fecha: '2026-12-15', titulo: 'Cierre del ciclo lectivo', tipo: 'cierre' },
]

function CalendarioEscolarTab() {
  return (
    <div className="space-y-3">
      <div className="card p-5">
        <p className="text-sm text-primary-500">
          Listado de fechas importantes del ciclo lectivo. Esta vista todavía
          es estática — la edición se va a poder hacer en una próxima iteración.
        </p>
      </div>
      <ul className="card divide-y divide-border p-0">
        {FECHAS_ESCOLARES_DEFAULT.map(f => (
          <li key={f.fecha} className="flex items-start gap-4 p-4">
            <div className="shrink-0 text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">
                {dateOf(f.fecha)}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-primary">{f.titulo}</p>
              <p className="text-xs text-primary-400">{f.tipo}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function DependenciaGeneral() {
  const { tipo } = useParams()
  const { perfil, hasRole } = useAuth()
  const qc = useQueryClient()
  // useEffectiveMunicipioId resuelve el municipio destino — para
  // superadmin (perfil.municipio_id null) cae al primer municipio
  // activo. Lo necesitan Inventario y Administración por igual.
  const municipioId = useEffectiveMunicipioId()
  const canEditInv  = hasRole(['admin_comuna', 'superadmin'])
  const canApprove  = hasRole(['admin_comuna', 'superadmin'])
  const canCreate   = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])
  const esDirector  = hasRole(['admin_comuna', 'superadmin'])

  const { data: dep, isLoading } = useDependenciaByTipo(tipo)
  const [tab, setTab] = useState('info')
  const [modalOpen, setModalOpen] = useState(false)

  // Permisos por dependencia desde dependencias_acceso del perfil.
  // Directores pasan todo true por rol. Para usuarios sub se busca
  // la fila del array por dependencia_id; falta de fila = sin acceso.
  const miAcceso = useMemo(() => {
    if (!dep) return null
    return (perfil?.dependencias_acceso ?? []).find(d => d?.dependencia_id === dep.id) ?? null
  }, [perfil, dep])
  const puedeGestionar   = esDirector || !!miAcceso?.puede_gestionar
  const puedeAdministrar = esDirector || !!miAcceso?.puede_administrar

  const extraKey = useMemo(() => extraTabKey(tipo), [tipo])
  // Filtramos tabs según permisos. "info" siempre visible (es
  // contexto básico). Las demás se gating según puede_gestionar /
  // puede_administrar.
  const tabs = useMemo(() => {
    const completo = extraKey
      ? [...TABS_BASE, { value: extraKey, label: EXTRA_TAB_LABELS[extraKey] }]
      : TABS_BASE
    return completo.filter(t => {
      if (t.value === 'info')          return true
      if (t.value === 'administracion') return puedeAdministrar
      // turnos / inventario / contacto / beneficiarios / reclamos
      // (extras) → gestión.
      return puedeGestionar
    })
  }, [extraKey, puedeGestionar, puedeAdministrar])

  // Si el tab seleccionado no está en la lista filtrada (cambio de
  // permisos), caemos al primero visible para el render sin tocar
  // el state — preserva la selección original si los permisos se
  // restauran sin recargar.
  const tabActivo = tabs.some(t => t.value === tab) ? tab : (tabs[0]?.value ?? 'info')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">{dep?.nombre ?? 'Dependencia'}</h1>
        <p className="text-sm text-primary-400">
          {DEP_INFO[tipo]?.detalle ?? 'Módulo genérico de dependencia.'}
        </p>
      </header>

      {isLoading && (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      )}

      {!isLoading && !dep && (
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">
            Dependencia no configurada
          </p>
          <p className="mt-2 text-sm text-primary-500">
            Esta dependencia no está configurada en tu municipio.
          </p>
          <p className="mt-1 text-xs text-primary-400">
            Pedile al administrador que cree una dependencia con tipo{' '}
            <code>{tipo}</code> en la tabla <code>dependencias</code>.
          </p>
        </div>
      )}

      {!isLoading && dep && (
        <>
          <Tabs tabs={tabs} value={tabActivo} onChange={setTab} />
          <div>
            {tabActivo === 'info'           && <InformacionTab dep={dep} />}
            {tabActivo === 'turnos'         && <TurnosTab dep={dep} onOpenNuevo={() => setModalOpen(true)} />}
            {tabActivo === 'administracion' && (
              <AdministracionTab
                dependenciaId={dep.id}
                dependenciaNombre={dep.nombre}
                municipioId={municipioId}
                canApprove={canApprove}
                canCreate={canCreate}
              />
            )}
            {tabActivo === 'inventario'     && <InventarioTab dep={dep} municipioId={municipioId} canEdit={canEditInv} />}
            {tabActivo === 'contacto'       && <ContactoTab dep={dep} />}
            {tabActivo === 'beneficiarios'  && <BeneficiariosTab municipioId={municipioId} />}
            {tabActivo === 'reclamos'       && <ReclamosTab      municipioId={municipioId} />}
            {tabActivo === 'reservas'       && <ReservasCanchasTab />}
            {tabActivo === 'calendario'     && <CalendarioEscolarTab />}
          </div>

          <NuevoTurnoModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            dependencia={dep}
            onCreated={() => qc.invalidateQueries({ queryKey: ['turnos'] })}
          />
        </>
      )}
    </div>
  )
}
