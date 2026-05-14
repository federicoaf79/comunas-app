import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import {
  useObras, useCreateObra, useUpdateObra,
  useObraHistorial, useUsuariosDelMunicipio,
  ESTADOS_OBRA, FORMAS_PAGO, TIPOS_FINANCIAMIENTO,
} from '../../hooks/useObras'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { dateTimeOf } from '../../lib/datetime'

// =============================================================
// /admin/obras-publicas — listado y gestión de obras municipales.
//
// Permisos (alineados con la feedback "Solo pueden crear/editar:
// admin_comuna, subadmin de Obras, superadmin. Reporting solo ve"):
//   - admin_comuna / superadmin → siempre pueden crear/editar.
//   - subadmin / usuario_sub    → pueden crear/editar si una de sus
//                                  dependencias_ids es de tipo "obras".
//   - resto (reporting, etc.)   → solo lectura.
//
// Permisos a nivel DB los aplica la policy obras_municipio (USING
// + WITH CHECK) creada en 20260514_obras.sql.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

const ESTADO_BADGE = {
  planificacion: { label: 'En planificación', cls: 'bg-ok-50 text-ok-700 ring-ok-100',                 bar: 'bg-ok' },
  en_ejecucion:  { label: 'En ejecución',     cls: 'bg-accent-50 text-accent-700 ring-accent-100',    bar: 'bg-accent' },
  demorada:      { label: 'Demorada',         cls: 'bg-red-50 text-red-700 ring-red-200',            bar: 'bg-red-600' },
  finalizada:    { label: 'Finalizada',       cls: 'bg-primary-50 text-primary-700 ring-primary-200', bar: 'bg-primary' },
  cancelada:     { label: 'Cancelada',        cls: 'bg-gray-100 text-gray-600 ring-gray-200',         bar: 'bg-gray-400' },
}

function EstadoBadge({ estado }) {
  const b = ESTADO_BADGE[estado] ?? ESTADO_BADGE.planificacion
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${b.cls}`}>
      {b.label}
    </span>
  )
}

function formaPagoLabel(v) {
  return FORMAS_PAGO.find(f => f.value === v)?.label ?? '—'
}
function tipoFinLabel(v) {
  return TIPOS_FINANCIAMIENTO.find(t => t.value === v)?.label ?? '—'
}
function estadoLabel(v) {
  return ESTADOS_OBRA.find(e => e.value === v)?.label ?? (v ?? '—')
}

// DD/MM/YY directo desde un 'YYYY-MM-DD' (sin construir Date, para no
// caer en timezone shifts).
function fechaCorta(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y.slice(2)}`
}

// Detección de "subadmin de Obras": tiene rol subadmin/usuario_sub Y
// alguna de sus dependencias_ids es tipo 'obras' (o nombre contiene
// "obra" como fallback defensivo).
function canEditObras({ hasRole, perfil, dependencias }) {
  if (hasRole(['admin_comuna', 'superadmin'])) return true
  if (!hasRole(['subadmin', 'usuario_sub'])) return false
  const ids = perfil?.dependencias_ids ?? []
  if (ids.length === 0) return false
  return (dependencias ?? []).some(d => (
    ids.includes(d.id) &&
    (/obra/i.test(d.tipo ?? '') || /obra/i.test(d.nombre ?? ''))
  ))
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function ObrasPublicas() {
  const { hasRole, perfil } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  const { data: dependencias = [] } = useDependencias(municipioId)
  const puedeEditar = canEditObras({ hasRole, perfil, dependencias })

  const [filtros, setFiltros] = useState({ estado: '', dependenciaId: '' })
  const [modalNueva, setModalNueva]     = useState(false)
  const [modalEditar, setModalEditar]   = useState(null)
  const [modalDetalle, setModalDetalle] = useState(null)

  const { data: obras = [], isLoading } = useObras(
    {
      estado:        filtros.estado || undefined,
      dependenciaId: filtros.dependenciaId || undefined,
    },
    { municipioIdOverride: municipioId },
  )

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Obras públicas</h1>
          <p className="text-sm text-primary-400">
            Registro y seguimiento de obras municipales — avance, gasto y plazos.
          </p>
        </div>
        {puedeEditar && (
          <Button onClick={() => setModalNueva(true)}>+ Nueva obra</Button>
        )}
      </header>

      {!municipioId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No encontramos un municipio asignado ni un fallback activo.
        </div>
      )}

      {/* Filtros */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          label="Estado"
          value={filtros.estado}
          onChange={v => setFiltros(f => ({ ...f, estado: v }))}
          placeholder="Todos los estados"
          options={ESTADOS_OBRA}
        />
        <Select
          label="Dependencia"
          value={filtros.dependenciaId}
          onChange={v => setFiltros(f => ({ ...f, dependenciaId: v }))}
          placeholder="Todas"
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
      </div>

      {/* Listado */}
      {isLoading ? (
        <div className="card flex items-center justify-center p-12">
          <Spinner size="lg" />
        </div>
      ) : obras.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay obras registradas con estos filtros.
          {puedeEditar && (
            <p className="mt-2">
              Empezá creando una con el botón <strong className="text-primary-700">+ Nueva obra</strong>.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {obras.map(o => (
            <ObraCard
              key={o.id}
              obra={o}
              puedeEditar={puedeEditar}
              onVerDetalle={() => setModalDetalle(o)}
              onEditar={() => setModalEditar(o)}
            />
          ))}
        </div>
      )}

      {modalNueva && (
        <ObraFormModal
          mode="create"
          municipioId={municipioId}
          dependencias={dependencias}
          onClose={() => setModalNueva(false)}
        />
      )}
      {modalEditar && (
        <ObraFormModal
          mode="edit"
          obra={modalEditar}
          municipioId={municipioId}
          dependencias={dependencias}
          onClose={() => setModalEditar(null)}
        />
      )}
      {modalDetalle && (
        <ObraDetalleModal
          obra={modalDetalle}
          puedeEditar={puedeEditar}
          onEditar={() => {
            setModalEditar(modalDetalle)
            setModalDetalle(null)
          }}
          onClose={() => setModalDetalle(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Card de obra
// ─────────────────────────────────────────────────────────────────

function ObraCard({ obra, puedeEditar, onVerDetalle, onEditar }) {
  const avance = Math.max(0, Math.min(100, obra.porcentaje_avance ?? 0))
  const bar    = (ESTADO_BADGE[obra.estado] ?? ESTADO_BADGE.planificacion).bar
  const presupuesto = Number(obra.presupuesto_total ?? 0)
  const gasto       = Number(obra.gasto_acumulado ?? 0)
  // Porcentaje gastado contra presupuesto — saturado a 100 para que
  // las obras sobre-ejecutadas no rompan la barra. Se muestra el
  // valor crudo igual.
  const pctGastado = presupuesto > 0
    ? Math.min(100, Math.round((gasto / presupuesto) * 100))
    : 0
  const sobreEjecutado = presupuesto > 0 && gasto > presupuesto

  return (
    <article className="card flex h-full flex-col gap-3 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-sora text-base font-semibold text-primary">
            {obra.nombre}
          </h3>
          <p className="mt-0.5 text-xs text-primary-500">
            {obra.dependencia?.nombre ?? 'Sin dependencia'}
          </p>
        </div>
        <EstadoBadge estado={obra.estado} />
      </header>

      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-primary-500">
          <span>Avance</span>
          <span className="font-mono tabular-nums text-primary-700">{avance}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-50">
          <div className={`h-full ${bar}`} style={{ width: `${avance}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-primary-400">Presupuesto</p>
          <p className="font-mono font-semibold tabular-nums text-primary">
            {fmtMoney.format(presupuesto)}
          </p>
        </div>
        <div>
          <p className="text-primary-400">Gastado</p>
          <p className={`font-mono font-semibold tabular-nums ${sobreEjecutado ? 'text-danger' : 'text-primary'}`}>
            {fmtMoney.format(gasto)}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between text-[11px] font-semibold text-primary-500">
          <span>Ejecución presupuestaria</span>
          <span className={`font-mono tabular-nums ${sobreEjecutado ? 'text-danger' : 'text-primary-700'}`}>
            {pctGastado}%
          </span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-primary-50">
          <div
            className={sobreEjecutado ? 'h-full bg-danger' : 'h-full bg-primary'}
            style={{ width: `${pctGastado}%` }}
          />
        </div>
      </div>

      <p className="text-[11px] text-primary-400">
        Fin estimado: <span className="font-medium text-primary-700">{fechaCorta(obra.fecha_fin_estimada)}</span>
      </p>

      <div className="mt-auto flex justify-end gap-2 pt-2">
        {puedeEditar && (
          <Button variant="ghost" size="sm" onClick={onEditar}>
            Editar
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onVerDetalle}>
          Ver detalle →
        </Button>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modal — Detalle de obra (lectura + historial)
// ─────────────────────────────────────────────────────────────────

function ObraDetalleModal({ obra, puedeEditar, onEditar, onClose }) {
  const { data: historial = [], isLoading: lh } = useObraHistorial(obra.id)
  const presupuesto = Number(obra.presupuesto_total ?? 0)
  const gasto       = Number(obra.gasto_acumulado ?? 0)
  const restante    = presupuesto - gasto

  return (
    <Modal
      open
      onClose={onClose}
      title={obra.nombre}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          {puedeEditar && (
            <Button onClick={onEditar}>Editar obra</Button>
          )}
        </>
      }
    >
      <div className="space-y-6">
        {/* Bloque resumen */}
        <section className="grid gap-4 sm:grid-cols-2">
          <DetalleField label="Dependencia"   value={obra.dependencia?.nombre ?? '—'} />
          <DetalleField label="Estado"        value={<EstadoBadge estado={obra.estado} />} />
          <DetalleField label="Avance"        value={`${obra.porcentaje_avance ?? 0}%`} />
          <DetalleField label="Forma de pago" value={formaPagoLabel(obra.forma_pago)} />
        </section>

        {obra.descripcion && (
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">
              Descripción
            </p>
            <p className="mt-1 whitespace-pre-line text-sm text-primary-700">{obra.descripcion}</p>
          </section>
        )}

        {/* Fechas */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Fechas</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <DetalleField label="Inicio"          value={fechaCorta(obra.fecha_inicio)} />
            <DetalleField label="Fin estimado"    value={fechaCorta(obra.fecha_fin_estimada)} />
            <DetalleField label="Fin real"        value={fechaCorta(obra.fecha_fin_real)} />
          </div>
        </section>

        {/* Económico */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Económico</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <DetalleField label="Presupuesto total" value={fmtMoney.format(presupuesto)} />
            <DetalleField label="Gasto acumulado"   value={fmtMoney.format(gasto)} />
            <DetalleField
              label="Restante"
              value={
                <span className={restante < 0 ? 'text-danger' : 'text-primary'}>
                  {fmtMoney.format(restante)}
                </span>
              }
            />
            <DetalleField label="Tipo de financiamiento" value={tipoFinLabel(obra.tipo_financiamiento)} />
            <DetalleField label="Partida presupuestaria" value={obra.partida_presupuestaria ?? '—'} />
          </div>
        </section>

        {/* Operativos */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Operativos</h4>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <DetalleField label="Cantidad de obreros" value={obra.cantidad_obreros ?? 0} />
            <DetalleField label="Tiene seguros"       value={obra.tiene_seguro ? 'Sí' : 'No'} />
            <DetalleField label="Tiene permisos"      value={obra.tiene_permisos ? 'Sí' : 'No'} />
          </div>
          {obra.observaciones && (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">
                Observaciones
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-primary-700">{obra.observaciones}</p>
            </div>
          )}
        </section>

        {/* Historial */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Historial de actualizaciones</h4>
          {lh ? (
            <div className="mt-2 flex items-center justify-center rounded-lg border border-border bg-white p-6">
              <Spinner size="md" />
            </div>
          ) : historial.length === 0 ? (
            <p className="mt-2 rounded-lg border border-border bg-white p-4 text-center text-sm text-primary-400">
              Sin movimientos registrados todavía.
            </p>
          ) : (
            <div className="mt-2">
              <Table>
                <THead>
                  <Tr>
                    <Th>Fecha</Th>
                    <Th>Usuario</Th>
                    <Th>Cambio</Th>
                    <Th>Nota</Th>
                  </Tr>
                </THead>
                <tbody>
                  {historial.map(h => (
                    <Tr key={h.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">{dateTimeOf(h.created_at)}</Td>
                      <Td className="text-sm">{h.usuario?.nombre ?? '—'}</Td>
                      <Td className="text-xs">
                        {h.estado_anterior && h.estado_anterior !== h.estado_nuevo && (
                          <span>
                            {estadoLabel(h.estado_anterior)}
                            <span className="mx-1 text-primary-300">→</span>
                            {estadoLabel(h.estado_nuevo)}
                          </span>
                        )}
                        {!h.estado_anterior && h.estado_nuevo && (
                          <span>Creado en {estadoLabel(h.estado_nuevo)}</span>
                        )}
                        {h.avance_anterior != null && h.avance_anterior !== h.avance_nuevo && (
                          <div className="text-primary-500">
                            Avance {h.avance_anterior ?? 0}% → {h.avance_nuevo ?? 0}%
                          </div>
                        )}
                      </Td>
                      <Td className="text-sm text-primary-500">{h.nota ?? '—'}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

function DetalleField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-400">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-primary">{value}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modal — Form de obra (crear / editar)
// ─────────────────────────────────────────────────────────────────

function blankForm({ municipioId }) {
  return {
    municipio_id:           municipioId,
    nombre:                 '',
    descripcion:            '',
    dependencia_id:         '',
    estado:                 'planificacion',
    porcentaje_avance:      0,
    responsable_id:         '',
    fecha_inicio:           '',
    fecha_fin_estimada:     '',
    fecha_fin_real:         '',
    presupuesto_total:      '',
    gasto_acumulado:        '',
    forma_pago:             '',
    tipo_financiamiento:    '',
    partida_presupuestaria: '',
    cantidad_obreros:       0,
    tiene_seguro:           false,
    tiene_permisos:         false,
    observaciones:          '',
    nota_cambio:            '',
  }
}

function ObraFormModal({ mode, obra, municipioId, dependencias, onClose }) {
  const { perfil } = useAuth()
  const { data: usuarios = [] } = useUsuariosDelMunicipio(municipioId)
  const createMut = useCreateObra()
  const updateMut = useUpdateObra()

  const [form, setForm] = useState(() => {
    if (mode === 'edit' && obra) {
      return {
        ...blankForm({ municipioId }),
        ...obra,
        // Forzamos strings para que los inputs no se rompan con null.
        descripcion:            obra.descripcion ?? '',
        dependencia_id:         obra.dependencia_id ?? '',
        responsable_id:         obra.responsable_id ?? '',
        fecha_inicio:           obra.fecha_inicio ?? '',
        fecha_fin_estimada:     obra.fecha_fin_estimada ?? '',
        fecha_fin_real:         obra.fecha_fin_real ?? '',
        presupuesto_total:      obra.presupuesto_total ?? '',
        gasto_acumulado:        obra.gasto_acumulado ?? '',
        forma_pago:             obra.forma_pago ?? '',
        tipo_financiamiento:    obra.tipo_financiamiento ?? '',
        partida_presupuestaria: obra.partida_presupuestaria ?? '',
        cantidad_obreros:       obra.cantidad_obreros ?? 0,
        tiene_seguro:           !!obra.tiene_seguro,
        tiene_permisos:         !!obra.tiene_permisos,
        observaciones:          obra.observaciones ?? '',
        nota_cambio:            '',
      }
    }
    return blankForm({ municipioId })
  })

  // Si nuestro municipio cambia (superadmin haciendo override), el
  // payload se re-anclura. Conserva el resto del form.
  useEffect(() => {
    setForm(f => ({ ...f, municipio_id: municipioId ?? f.municipio_id }))
  }, [municipioId])

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const errores = useMemo(() => {
    const e = {}
    if (!form.nombre?.trim())                          e.nombre = 'Obligatorio'
    if (!form.dependencia_id)                          e.dependencia_id = 'Obligatorio'
    if (!form.municipio_id)                            e.municipio_id = 'Sin municipio asignado'
    if (form.porcentaje_avance < 0 || form.porcentaje_avance > 100)
      e.porcentaje_avance = 'Entre 0 y 100'
    if (form.presupuesto_total !== '' && Number(form.presupuesto_total) < 0)
      e.presupuesto_total = 'No puede ser negativo'
    if (form.gasto_acumulado !== '' && Number(form.gasto_acumulado) < 0)
      e.gasto_acumulado = 'No puede ser negativo'
    return e
  }, [form])

  const formInvalido = Object.keys(errores).length > 0

  async function submit(e) {
    e.preventDefault()
    if (formInvalido) return

    // Serializar al payload de la DB: vaciar strings → null para
    // que Postgres no rechace una fecha vacía con código 22007.
    const payload = {
      municipio_id:           form.municipio_id,
      nombre:                 form.nombre.trim(),
      descripcion:            form.descripcion?.trim() || null,
      dependencia_id:         form.dependencia_id || null,
      estado:                 form.estado,
      porcentaje_avance:      Number(form.porcentaje_avance ?? 0),
      responsable_id:         form.responsable_id || null,
      fecha_inicio:           form.fecha_inicio || null,
      fecha_fin_estimada:     form.fecha_fin_estimada || null,
      fecha_fin_real:         form.fecha_fin_real || null,
      presupuesto_total:      form.presupuesto_total === '' ? null : Number(form.presupuesto_total),
      gasto_acumulado:        form.gasto_acumulado === ''   ? 0    : Number(form.gasto_acumulado),
      forma_pago:             form.forma_pago || null,
      tipo_financiamiento:    form.tipo_financiamiento || null,
      partida_presupuestaria: form.partida_presupuestaria?.trim() || null,
      cantidad_obreros:       Number(form.cantidad_obreros ?? 0),
      tiene_seguro:           !!form.tiene_seguro,
      tiene_permisos:         !!form.tiene_permisos,
      observaciones:          form.observaciones?.trim() || null,
    }

    try {
      if (mode === 'create') {
        await createMut.mutateAsync(payload)
      } else {
        await updateMut.mutateAsync({
          id:    obra.id,
          patch: payload,
          prev:  obra,
          nota:  form.nota_cambio?.trim() || null,
        })
      }
      onClose()
    } catch (err) {
      console.error('[ObrasPublicas] submit error:', err)
      alert(`No se pudo guardar la obra: ${err.message ?? err}`)
    }
  }

  const isPending = createMut.isPending || updateMut.isPending

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === 'create' ? 'Nueva obra' : `Editar obra · ${obra.nombre}`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>Cancelar</Button>
          <Button onClick={submit} loading={isPending} disabled={formInvalido || isPending}>
            {mode === 'create' ? 'Crear obra' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6">
        {/* ── Datos generales ───────────────────────────── */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Datos generales</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Nombre de la obra *"
              value={form.nombre}
              onChange={e => set('nombre', e.target.value)}
              error={errores.nombre}
              placeholder="Pavimentación Av. Belgrano"
            />
            <Select
              label="Dependencia involucrada *"
              value={form.dependencia_id}
              onChange={v => set('dependencia_id', v)}
              placeholder="Seleccionar"
              options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
            />
            <Select
              label="Estado"
              value={form.estado}
              onChange={v => set('estado', v)}
              options={ESTADOS_OBRA}
            />
            <Select
              label="Responsable"
              value={form.responsable_id}
              onChange={v => set('responsable_id', v)}
              placeholder="Sin asignar"
              options={usuarios.map(u => ({ value: u.id, label: u.nombre || u.email || u.id.slice(0, 8) }))}
            />
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-primary-700">
                Porcentaje de avance: <span className="font-mono">{form.porcentaje_avance}%</span>
              </label>
              <input
                type="range" min="0" max="100" step="1"
                value={form.porcentaje_avance}
                onChange={e => set('porcentaje_avance', Number(e.target.value))}
                // accent-color usa el navy de la paleta; sin verde nativo del browser.
                className="mt-2 w-full accent-primary"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-primary-700">Descripción detallada</label>
              <textarea
                rows="3"
                value={form.descripcion}
                onChange={e => set('descripcion', e.target.value)}
                className="input-field mt-1.5"
                placeholder="Alcance, etapas y objetivos de la obra…"
              />
            </div>
          </div>
        </section>

        {/* ── Fechas ────────────────────────────────────── */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Fechas</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Input
              label="Inicio" type="date"
              value={form.fecha_inicio}
              onChange={e => set('fecha_inicio', e.target.value)}
            />
            <Input
              label="Fin estimado" type="date"
              value={form.fecha_fin_estimada}
              onChange={e => set('fecha_fin_estimada', e.target.value)}
            />
            <Input
              label="Fin real" type="date"
              value={form.fecha_fin_real}
              onChange={e => set('fecha_fin_real', e.target.value)}
            />
          </div>
        </section>

        {/* ── Económico ─────────────────────────────────── */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Económico</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Presupuesto total aprobado"
              type="number" inputMode="decimal" min="0" step="0.01"
              value={form.presupuesto_total}
              onChange={e => set('presupuesto_total', e.target.value)}
              error={errores.presupuesto_total}
              placeholder="0"
            />
            <Input
              label="Gasto acumulado a la fecha"
              type="number" inputMode="decimal" min="0" step="0.01"
              value={form.gasto_acumulado}
              onChange={e => set('gasto_acumulado', e.target.value)}
              error={errores.gasto_acumulado}
              placeholder="0"
            />
            <Select
              label="Forma de pago"
              value={form.forma_pago}
              onChange={v => set('forma_pago', v)}
              placeholder="Sin definir"
              options={FORMAS_PAGO}
            />
            <Select
              label="Tipo de financiamiento"
              value={form.tipo_financiamiento}
              onChange={v => set('tipo_financiamiento', v)}
              placeholder="Sin definir"
              options={TIPOS_FINANCIAMIENTO}
            />
            <Input
              label="Partida presupuestaria"
              value={form.partida_presupuestaria}
              onChange={e => set('partida_presupuestaria', e.target.value)}
              placeholder="2.3.4 — Obras"
              className="sm:col-span-2"
            />
          </div>
        </section>

        {/* ── Operativos ────────────────────────────────── */}
        <section>
          <h4 className="font-sora text-sm font-semibold text-primary">Detalles operativos</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input
              label="Cantidad de obreros contratados"
              type="number" inputMode="numeric" min="0" step="1"
              value={form.cantidad_obreros}
              onChange={e => set('cantidad_obreros', Number(e.target.value))}
            />
            <div className="flex flex-col gap-2 pt-2 sm:pt-7">
              <CheckboxRow
                checked={form.tiene_seguro}
                onChange={v => set('tiene_seguro', v)}
                label="¿Tiene seguros vigentes?"
              />
              <CheckboxRow
                checked={form.tiene_permisos}
                onChange={v => set('tiene_permisos', v)}
                label="¿Tiene permisos municipales?"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-sm font-medium text-primary-700">Observaciones / notas de seguimiento</label>
              <textarea
                rows="3"
                value={form.observaciones}
                onChange={e => set('observaciones', e.target.value)}
                className="input-field mt-1.5"
                placeholder="Notas internas, riesgos, dependencias externas…"
              />
            </div>
          </div>
        </section>

        {/* Nota de cambio — solo en edit. Va al historial. */}
        {mode === 'edit' && (
          <section className="rounded-lg border border-accent-100 bg-accent-50/40 p-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-accent-700">
              Nota de este cambio (opcional — se registra en el historial)
            </label>
            <textarea
              rows="2"
              value={form.nota_cambio}
              onChange={e => set('nota_cambio', e.target.value)}
              className="input-field mt-1.5"
              placeholder="Ej.: Avance verificado en inspección del 12/05"
            />
          </section>
        )}

        {/* Botón submit nativo escondido — el footer del Modal
            dispara submit() programáticamente, pero dejamos este
            para que ENTER en cualquier input también lo dispare. */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  )
}

function CheckboxRow({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-primary-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border accent-primary"
      />
      {label}
    </label>
  )
}
