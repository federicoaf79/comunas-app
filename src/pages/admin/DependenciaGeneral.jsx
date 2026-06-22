import { useMemo, useState, useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
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
import { supabase } from '../../lib/supabase'
import {
  Paginacion, ItemFormModal, MovimientoFormModal,
} from './Inventario'
import Select from '../../components/ui/Select'
import Button from '../../components/ui/Button'
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

// Secciones disponibles. La página no renderiza barra de tabs:
// el sidebar (AdminLayout NavGroup) navega entre secciones vía
// ?tab=. Los campos `kind` se usan para gating por permisos:
//   gestion → puede_gestionar
//   admin   → puede_administrar
//   public  → siempre visible (info / contacto)
const SECCIONES_BASE = [
  { value: 'info',           label: 'Información',     kind: 'public'  },
  { value: 'landing',        label: 'Landing pública', kind: 'public'  },
  { value: 'turnos',         label: 'Turnos',          kind: 'gestion' },
  { value: 'administracion', label: 'Administración',  kind: 'admin'   },
  { value: 'inventario',     label: 'Inventario',      kind: 'gestion' },
  { value: 'contacto',       label: 'Contacto',        kind: 'public'  },
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

// Las extras siempre son de gestión (puede_gestionar para verlas).
const EXTRA_KIND = 'gestion'

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

function InformacionTab({ dep, municipioId }) {
  const [form, setForm] = useState({
    nombre:           dep.nombre           ?? '',
    horario_atencion: dep.horario_atencion  ?? '',
    telefono:         dep.telefono          ?? '',
    direccion:        dep.direccion         ?? '',
    email_contacto:   dep.email_contacto    ?? '',
    whatsapp:         dep.whatsapp          ?? '',
    responsable:      dep.responsable       ?? '',
    descripcion_larga: dep.descripcion_larga ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [ok, setOk]         = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setOk(false)
  }

  async function handleGuardar() {
    setSaving(true)
    setError('')
    setOk(false)
    try {
      const { error: err } = await supabase
        .from('dependencias')
        .update({
          horario_atencion:  form.horario_atencion  || null,
          telefono:          form.telefono           || null,
          direccion:         form.direccion          || null,
          email_contacto:    form.email_contacto     || null,
          whatsapp:          form.whatsapp           || null,
          responsable:       form.responsable        || null,
          descripcion_larga: form.descripcion_larga  || null,
        })
        .eq('id', dep.id)
      if (err) throw err
      setOk(true)
    } catch (e) {
      setError(e.message || 'No pudimos guardar')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-4">
      <div className="card p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-sora text-base font-bold text-primary">{dep.nombre}</h3>
            <p className="mt-0.5 text-xs text-primary-400">
              Tipo: {dep.tipo} · {dep.activa === false ? 'Inactiva' : 'Activa'}
            </p>
          </div>
          <a
            href={`/portal/dependencia/${dep.tipo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary text-xs flex items-center gap-1.5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Ver en portal
          </a>
        </div>

        <div className="space-y-4">
          {/* Descripción */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción</label>
            <textarea
              rows={3}
              value={form.descripcion_larga}
              onChange={e => set('descripcion_larga', e.target.value)}
              placeholder="Descripción de la dependencia para el portal ciudadano..."
              className={inputCls}
            />
          </div>

          {/* Grid de campos */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Horario de atención</label>
              <input type="text" value={form.horario_atencion} onChange={e => set('horario_atencion', e.target.value)}
                placeholder="Lun a Vie · 7:00 – 13:00" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Responsable</label>
              <input type="text" value={form.responsable} onChange={e => set('responsable', e.target.value)}
                placeholder="Nombre del responsable" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Teléfono</label>
              <input type="text" value={form.telefono} onChange={e => set('telefono', e.target.value)}
                placeholder="+54 9 385 XXX-XXXX" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Email de contacto</label>
              <input type="email" value={form.email_contacto} onChange={e => set('email_contacto', e.target.value)}
                placeholder="dependencia@municipio.gob.ar" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Dirección</label>
              <input type="text" value={form.direccion} onChange={e => set('direccion', e.target.value)}
                placeholder="Av. San Martín s/n" className={inputCls} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">WhatsApp</label>
              <input type="text" value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)}
                placeholder="Solo dígitos: 5493854110001" className={inputCls} />
            </div>
          </div>
        </div>

        {error && <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}
        {ok && <div className="mt-4 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">Información guardada correctamente.</div>}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleGuardar}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Spinner size="sm" /> : null}
            {saving ? 'Guardando...' : 'Guardar información'}
          </button>
        </div>
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
// Tab: Landing pública — CMS simple con 3 templates
// ─────────────────────────────────────────────────────────────────

const LANDING_TEMPLATES = [
  {
    value: 'estandar',
    label: 'Estándar',
    desc: 'Hero + Servicios + Contacto + Mapa. Para la mayoría de dependencias.',
    icon: '📋',
  },
  {
    value: 'espacio_fisico',
    label: 'Espacio físico',
    desc: 'Hero + Galería + Info + Contacto + Mapa. Para cementerio, polideportivo, SUM.',
    icon: '🏛️',
  },
  {
    value: 'administrativa',
    label: 'Administrativa',
    desc: 'Hero + Trámites + Requisitos + Archivos + Mapa. Para Juez de Paz, Registro Civil.',
    icon: '📁',
  },
]

function LandingTab({ dep, municipioId }) {
  const [form, setForm] = useState({
    landing_template:        dep.landing_template        ?? 'estandar',
    landing_hero_descripcion: dep.landing_hero_descripcion ?? '',
    descripcion_larga:       dep.descripcion_larga       ?? '',
    horario_atencion:        dep.horario_atencion        ?? '',
    telefono:                dep.telefono                ?? '',
    email_contacto:          dep.email_contacto          ?? '',
    direccion:               dep.direccion               ?? '',
    responsable:             dep.responsable             ?? '',
    servicios:               Array.isArray(dep.servicios) ? dep.servicios.join('\n') : '',
    landing_tramites:        Array.isArray(dep.landing_tramites) ? dep.landing_tramites.join('\n') : '',
  })
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState(false)
  const [error, setError] = useState('')

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setOk(false)
  }

  async function handleGuardar() {
    setSaving(true)
    setError('')
    setOk(false)
    try {
      const serviciosArr = form.servicios
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
      const tramitesArr = form.landing_tramites
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)

      const { error: err } = await supabase
        .from('dependencias')
        .update({
          landing_template:         form.landing_template,
          landing_hero_descripcion: form.landing_hero_descripcion || null,
          descripcion_larga:        form.descripcion_larga || null,
          horario_atencion:         form.horario_atencion || null,
          telefono:                 form.telefono || null,
          email_contacto:           form.email_contacto || null,
          direccion:                form.direccion || null,
          responsable:              form.responsable || null,
          servicios:                serviciosArr,
          landing_tramites:         tramitesArr,
        })
        .eq('id', dep.id)

      if (err) throw err
      setOk(true)
    } catch (e) {
      setError(e.message || 'No pudimos guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">

      {/* Selector de template */}
      <div className="card p-5">
        <h3 className="mb-3 font-sora text-sm font-bold text-primary">Template de landing</h3>
        {/* Selector de template — wireframe visual */}
        <div className="grid gap-4 sm:grid-cols-3">
          {LANDING_TEMPLATES.map(t => {
            const isActive = form.landing_template === t.value
            const isSaved  = dep.landing_template === t.value || (!dep.landing_template && t.value === 'estandar')
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => set('landing_template', t.value)}
                className={`relative rounded-xl border-2 text-left transition-all overflow-hidden ${
                  isActive
                    ? 'border-[#1D4ED8] shadow-md'
                    : 'border-border hover:border-primary-300'
                }`}
              >
                {/* Badge "Activo" — template guardado en DB */}
                {isSaved && (
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-[#C9A84C] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-900">
                    Activo
                  </span>
                )}
                {/* Badge "Seleccionado" — template elegido pero no guardado */}
                {isActive && !isSaved && (
                  <span className="absolute top-2 right-2 z-10 rounded-full bg-[#1D4ED8] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                    Seleccionado
                  </span>
                )}

                {/* Mini wireframe visual */}
                <div className="bg-primary-50 p-2">
                  {/* Header mini */}
                  <div className="mb-1 flex items-center gap-1 rounded bg-primary px-1.5 py-1">
                    <div className="h-2 w-2 rounded bg-accent" />
                    <div className="h-1.5 flex-1 rounded bg-white/30" />
                    <div className="h-1 w-6 rounded bg-white/20" />
                  </div>
                  {/* Hero mini */}
                  <div className="mb-1 rounded bg-primary-700 px-2 py-1.5">
                    <div className="mb-1 h-2 w-3/4 rounded bg-white/50" />
                    <div className="h-1 w-1/2 rounded bg-white/30" />
                  </div>
                  {/* Secciones según template */}
                  {t.value === 'estandar' && (
                    <>
                      <div className="mb-1 rounded border border-border bg-white px-2 py-1">
                        <div className="mb-0.5 h-1.5 w-1/3 rounded bg-primary-300" />
                        <div className="flex flex-col gap-0.5">
                          <div className="h-1 w-2/3 rounded bg-border" />
                          <div className="h-1 w-1/2 rounded bg-border" />
                        </div>
                      </div>
                      <div className="mb-1 grid grid-cols-2 gap-1">
                        <div className="rounded border border-border bg-white p-1"><div className="h-1 rounded bg-border" /><div className="mt-0.5 h-1.5 rounded bg-primary-200" /></div>
                        <div className="rounded border border-border bg-white p-1"><div className="h-1 rounded bg-border" /><div className="mt-0.5 h-1.5 rounded bg-primary-200" /></div>
                      </div>
                      <div className="rounded border border-border bg-primary-100 px-2 py-1.5">
                        <div className="mx-auto h-1 w-1/3 rounded bg-primary-300" />
                      </div>
                    </>
                  )}
                  {t.value === 'espacio_fisico' && (
                    <>
                      <div className="mb-1 grid grid-cols-3 gap-0.5">
                        {[1,2,3].map(i => <div key={i} className="aspect-video rounded bg-primary-200 border border-border" />)}
                      </div>
                      <div className="mb-1 rounded border border-border bg-white px-2 py-1">
                        <div className="mb-0.5 h-1.5 w-1/3 rounded bg-primary-300" />
                        <div className="flex flex-col gap-0.5">
                          <div className="h-1 w-2/3 rounded bg-border" />
                          <div className="h-1 w-1/2 rounded bg-border" />
                        </div>
                      </div>
                      <div className="mb-1 grid grid-cols-2 gap-1">
                        <div className="rounded border border-border bg-white p-1"><div className="h-1 rounded bg-border" /><div className="mt-0.5 h-1.5 rounded bg-primary-200" /></div>
                        <div className="rounded border border-border bg-white p-1"><div className="h-1 rounded bg-border" /><div className="mt-0.5 h-1.5 rounded bg-primary-200" /></div>
                      </div>
                      <div className="rounded border border-border bg-primary-100 px-2 py-1.5">
                        <div className="mx-auto h-1 w-1/3 rounded bg-primary-300" />
                      </div>
                    </>
                  )}
                  {t.value === 'administrativa' && (
                    <>
                      <div className="mb-1 rounded border border-border bg-white px-2 py-1">
                        <div className="mb-0.5 h-1.5 w-1/3 rounded bg-primary-300" />
                        <div className="mb-0.5 flex items-center gap-1"><div className="h-2 w-2 rounded bg-[#1D4ED8]/30" /><div className="h-1 flex-1 rounded bg-border" /></div>
                        <div className="flex items-center gap-1"><div className="h-2 w-2 rounded bg-[#1D4ED8]/30" /><div className="h-1 flex-1 rounded bg-border" /></div>
                      </div>
                      <div className="mb-1 rounded border border-border bg-white px-2 py-1">
                        <div className="mb-0.5 h-1.5 w-1/3 rounded bg-primary-300" />
                        <div className="flex items-center gap-1 rounded bg-primary-50 p-0.5"><div className="h-2 w-2 rounded bg-primary-200" /><div className="h-1 flex-1 rounded bg-border" /></div>
                      </div>
                      <div className="mb-1 grid grid-cols-2 gap-1">
                        <div className="rounded border border-border bg-white p-1"><div className="h-1 rounded bg-border" /><div className="mt-0.5 h-1.5 rounded bg-primary-200" /></div>
                        <div className="rounded border border-border bg-white p-1"><div className="h-1 rounded bg-border" /><div className="mt-0.5 h-1.5 rounded bg-primary-200" /></div>
                      </div>
                      <div className="rounded border border-border bg-primary-100 px-2 py-1.5">
                        <div className="mx-auto h-1 w-1/3 rounded bg-primary-300" />
                      </div>
                    </>
                  )}
                  {/* Footer mini */}
                  <div className="mt-1 rounded bg-primary-800 px-1.5 py-1">
                    <div className="flex gap-1">
                      <div className="h-1 w-1/3 rounded bg-white/20" />
                      <div className="h-1 w-1/4 rounded bg-white/20" />
                    </div>
                  </div>
                </div>

                {/* Label */}
                <div className={`px-3 py-2 ${isActive ? 'bg-[#1D4ED8]/5' : 'bg-white'}`}>
                  <p className="font-sora text-xs font-bold text-primary">{t.icon} {t.label}</p>
                  <p className="mt-0.5 text-[10px] text-primary-400 leading-tight">{t.desc}</p>
                </div>
              </button>
            )
          })}
        </div>

      {/* Preview del template seleccionado */}
      <div className="mt-4 rounded-lg border-2 border-dashed border-border bg-primary-50/50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-primary-400">
          Vista previa del layout — {LANDING_TEMPLATES.find(t => t.value === form.landing_template)?.label}
        </p>
        <div className="space-y-1.5">
          {/* Hero — siempre */}
          <div className="flex items-center gap-3 rounded-md bg-primary px-3 py-2.5 text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><rect x="3" y="3" width="18" height="18" rx="2"/><path strokeLinecap="round" d="M3 9h18"/></svg>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold leading-tight">Hero</p>
              <p className="text-[10px] opacity-60 leading-tight">Nombre · descripción · foto de portada</p>
            </div>
            <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">Siempre</span>
          </div>

          {/* Galería — solo espacio_fisico */}
          {form.landing_template === 'espacio_fisico' && (
            <div className="flex items-center gap-3 rounded-md bg-[#64748B] px-3 py-2.5 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-tight">Galería de fotos</p>
                <p className="text-[10px] opacity-60 leading-tight">Imágenes del espacio físico en grilla</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">Este template</span>
            </div>
          )}

          {/* Servicios — estándar y espacio_fisico */}
          {(form.landing_template === 'estandar' || form.landing_template === 'espacio_fisico') && (
            <div className="flex items-center gap-3 rounded-md bg-[#1D4ED8] px-3 py-2.5 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-tight">Servicios que ofrecemos</p>
                <p className="text-[10px] opacity-60 leading-tight">Lista de servicios disponibles para el vecino</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">Este template</span>
            </div>
          )}

          {/* Trámites — solo administrativa */}
          {form.landing_template === 'administrativa' && (
            <div className="flex items-center gap-3 rounded-md bg-[#1D4ED8] px-3 py-2.5 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6M9 16h6M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z"/></svg>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-tight">Trámites y requisitos</p>
                <p className="text-[10px] opacity-60 leading-tight">Pasos y documentación necesaria por trámite</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">Este template</span>
            </div>
          )}

          {/* Archivos — solo administrativa */}
          {form.landing_template === 'administrativa' && (
            <div className="flex items-center gap-3 rounded-md bg-[#64748B] px-3 py-2.5 text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold leading-tight">Archivos descargables</p>
                <p className="text-[10px] opacity-60 leading-tight">Formularios y documentos para descargar</p>
              </div>
              <span className="shrink-0 rounded-full bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">Este template</span>
            </div>
          )}

          {/* Contacto — siempre */}
          <div className="flex items-center gap-3 rounded-md bg-[#C9A84C] px-3 py-2.5 text-primary-900">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M22 16.92v3a2 2 0 01-2.18 2A19.79 19.79 0 014 4.18 2 2 0 016.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L10.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z"/></svg>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold leading-tight">Cómo contactarnos</p>
              <p className="text-[10px] opacity-60 leading-tight">Horario · teléfono · email · WhatsApp</p>
            </div>
            <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-semibold">Siempre</span>
          </div>

          {/* Mapa — siempre */}
          <div className="flex items-center gap-3 rounded-md bg-[#C9A84C]/70 px-3 py-2.5 text-primary-900">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0 opacity-70"><path strokeLinecap="round" strokeLinejoin="round" d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold leading-tight">Dónde encontrarnos</p>
              <p className="text-[10px] opacity-60 leading-tight">Dirección · mapa interactivo de Google Maps</p>
            </div>
            <span className="shrink-0 rounded-full bg-black/10 px-1.5 py-0.5 text-[9px] font-semibold">Siempre</span>
          </div>

          {/* Botón turno */}
          <div className="flex items-center gap-3 rounded-md border-2 border-dashed border-primary-300 px-3 py-2 text-primary-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5 shrink-0"><rect x="3" y="5" width="18" height="16" rx="2"/><path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4"/></svg>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold leading-tight">Botón "Sacar turno"</p>
              <p className="text-[10px] leading-tight">Se muestra solo si el módulo Turnos está activo para esta dependencia</p>
            </div>
            <span className="shrink-0 rounded-full border border-primary-300 px-1.5 py-0.5 text-[9px] font-semibold">Condicional</span>
          </div>
        </div>
      </div>
      </div>

      {/* Info pública — siempre visible */}
      <div className="card p-5 space-y-4">
        <h3 className="font-sora text-sm font-bold text-primary">Información pública</h3>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción corta (hero)</label>
          <input
            type="text"
            value={form.landing_hero_descripcion}
            onChange={e => set('landing_hero_descripcion', e.target.value)}
            placeholder="Ej: Atención médica y primeros auxilios para vecinos de Real Sayana"
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción larga</label>
          <textarea
            rows={4}
            value={form.descripcion_larga}
            onChange={e => set('descripcion_larga', e.target.value)}
            placeholder="Descripción completa de la dependencia para el portal ciudadano..."
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Horario de atención</label>
            <input type="text" value={form.horario_atencion} onChange={e => set('horario_atencion', e.target.value)}
              placeholder="Lun a Vie · 8:00 – 13:00"
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Teléfono</label>
            <input type="text" value={form.telefono} onChange={e => set('telefono', e.target.value)}
              placeholder="+54 9 385 XXX-XXXX"
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Email de contacto</label>
            <input type="email" value={form.email_contacto} onChange={e => set('email_contacto', e.target.value)}
              placeholder="dependencia@realsayana.gob.ar"
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Dirección</label>
            <input type="text" value={form.direccion} onChange={e => set('direccion', e.target.value)}
              placeholder="Av. San Martín s/n"
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Responsable</label>
            <input type="text" value={form.responsable} onChange={e => set('responsable', e.target.value)}
              placeholder="Nombre del responsable"
              className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent" />
          </div>
        </div>

        {/* Servicios */}
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
            Servicios (uno por línea)
          </label>
          <textarea
            rows={5}
            value={form.servicios}
            onChange={e => set('servicios', e.target.value)}
            placeholder={"Consultas médicas sin turno\nVacunación\nControl de presión arterial"}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-[11px] text-primary-400">Cada línea es un servicio separado</p>
        </div>
      </div>

      {/* Trámites — solo template administrativa */}
      {form.landing_template === 'administrativa' && (
        <div className="card p-5">
          <h3 className="mb-3 font-sora text-sm font-bold text-primary">Trámites y requisitos</h3>
          <textarea
            rows={6}
            value={form.landing_tramites}
            onChange={e => set('landing_tramites', e.target.value)}
            placeholder={"Certificación de firmas: DNI original\nSucesión simple: DNI + documentación del bien"}
            className="w-full rounded-md border border-border px-3 py-2 text-sm text-primary font-mono focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <p className="mt-1 text-[11px] text-primary-400">Formato: Nombre del trámite: requisitos</p>
        </div>
      )}

      {/* Preview link */}
      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Vista pública</p>
          <p className="text-xs text-primary-500">Así ve el vecino esta dependencia en el portal</p>
        </div>
        <a
          href={`/portal/dependencia/${dep.tipo}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-xs flex items-center gap-1.5"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          Ver en portal
        </a>
      </div>

      {/* Feedback + guardar */}
      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}
      {ok && (
        <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">Landing guardada correctamente.</div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={handleGuardar}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Spinner size="sm" /> : null}
          {saving ? 'Guardando...' : 'Guardar landing'}
        </button>
      </div>
    </div>
  )
}

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

  // Lectura del ?tab= desde URL. Sin escritura: la navegación
  // entre sub-secciones viene del sidebar.
  //   'informacion' → 'info'           (alias del sidebar info-only)
  //   'admin'       → 'administracion'
  // Resto: pass-through (turnos, inventario, contacto, ...).
  const [searchParams] = useSearchParams()
  const tabParamRaw = searchParams.get('tab') || ''
  const tabRequested = tabParamRaw === 'informacion' ? 'info'
                     : tabParamRaw === 'admin'       ? 'administracion'
                     : tabParamRaw || 'info'
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
  // Lista efectiva de secciones según permisos. "info" y "contacto"
  // son siempre visibles. El resto se filtra según gestion/admin.
  const secciones = useMemo(() => {
    const completo = extraKey
      ? [...SECCIONES_BASE, { value: extraKey, label: EXTRA_TAB_LABELS[extraKey], kind: EXTRA_KIND }]
      : SECCIONES_BASE
    return completo.filter(s => {
      if (s.kind === 'public')  return true
      if (s.kind === 'admin')   return puedeAdministrar
      return puedeGestionar
    })
  }, [extraKey, puedeGestionar, puedeAdministrar])

  // Si la sección pedida no está permitida, cae a la primera visible.
  // Para usuarios sin permisos, "info" siempre está visible (es public).
  const seccion = secciones.some(s => s.value === tabRequested)
    ? tabRequested
    : (secciones[0]?.value ?? 'info')
  const seccionLabel = secciones.find(s => s.value === seccion)?.label ?? '—'

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">{dep?.nombre ?? 'Dependencia'}</h1>
        <p className="mt-1 text-sm text-primary-500">
          <span className="text-primary-400">{dep?.nombre ?? 'Dependencia'}</span>
          <span className="mx-1.5 text-primary-300">›</span>
          <span className="font-medium text-primary-700">{seccionLabel}</span>
        </p>
        <p className="mt-1 text-xs text-primary-400">
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
          <div>
            {seccion === 'info'           && <InformacionTab dep={dep} municipioId={municipioId} />}
            {seccion === 'landing'        && <LandingTab dep={dep} municipioId={municipioId} />}
            {seccion === 'turnos'         && <TurnosTab dep={dep} onOpenNuevo={() => setModalOpen(true)} />}
            {seccion === 'administracion' && (
              <AdministracionTab
                dependenciaId={dep.id}
                dependenciaNombre={dep.nombre}
                municipioId={municipioId}
                canApprove={canApprove}
                canCreate={canCreate}
              />
            )}
            {seccion === 'inventario'     && <InventarioTab dep={dep} municipioId={municipioId} canEdit={canEditInv} />}
            {seccion === 'contacto'       && <ContactoTab dep={dep} />}
            {seccion === 'beneficiarios'  && <BeneficiariosTab municipioId={municipioId} />}
            {seccion === 'reclamos'       && <ReclamosTab      municipioId={municipioId} />}
            {seccion === 'reservas'       && <ReservasCanchasTab />}
            {seccion === 'calendario'     && <CalendarioEscolarTab />}
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
