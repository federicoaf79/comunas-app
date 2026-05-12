import { useEffect, useMemo, useState } from 'react'
import {
  useAtencionPorTurno, useAtencionInsumos, useAtencionesVecino,
  useInsumosDisponibles,
  useCreateAtencion, useUpdateAtencion,
  useCreateAtencionInsumo, useDeleteAtencionInsumo, useCloseAtencion,
  edadDesdeFechaNac,
} from '../../hooks/useAtenciones'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../ui/Spinner'
import Button from '../ui/Button'
import Input from '../ui/Input'
import Select from '../ui/Select'
import { dateOf, dateTimeOf } from '../../lib/datetime'

// =============================================================
// AtencionDrawer — panel lateral que abre cuando el operador
// hace click en un turno de la Sala PA. Concentra el flujo
// clínico completo: form de la atención, gestión de insumos
// usados y vista de historia clínica del vecino.
//
// El layout es un drawer fixed-right que entra con slide-in,
// w-full mobile, max-w-2xl desktop. Cierra con click fuera, ESC
// o botón. El form mantiene su estado mientras el drawer está
// abierto y vuelve a hidratar desde la atención existente cada
// vez que cambia el turno o se persiste un cambio.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

const ESTADO_ATENCION_BADGE = {
  borrador: 'inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-700 ring-1 ring-inset ring-primary-200',
  cerrada:  'inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok-700 ring-1 ring-inset ring-ok-100',
  derivada: 'inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-100',
}

function vecinoNombre(v) {
  if (!v) return '—'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || '—'
}

const TABS = [
  { value: 'atencion', label: 'Atención' },
  { value: 'insumos',  label: 'Insumos utilizados' },
  { value: 'hc',       label: 'Historia clínica' },
]

export default function AtencionDrawer({ turno, dependenciaSaludId, municipioId, onClose }) {
  const { perfil } = useAuth()
  const [tab, setTab] = useState('atencion')

  // ESC para cerrar — solo activo cuando el drawer está montado.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const atencionQ = useAtencionPorTurno(turno?.id)
  const atencion  = atencionQ.data ?? null

  if (!turno) return null

  const vecino = turno.vecino ?? null
  const edad   = edadDesdeFechaNac(vecino?.fecha_nac)

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-primary-900/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Atención clínica"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-card animate-slide-up"
      >
        {/* Header sticky */}
        <header className="shrink-0 border-b border-border bg-primary text-white">
          <div className="flex items-start justify-between gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-sora text-base font-bold leading-tight sm:text-lg">
                  {vecinoNombre(vecino)}
                </h2>
                {atencion?.estado && (
                  <span className={ESTADO_ATENCION_BADGE[atencion.estado] ?? ESTADO_ATENCION_BADGE.borrador}>
                    {atencion.estado}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-white/70">
                {vecino?.dni && <span>DNI {vecino.dni}</span>}
                {edad != null && <span>· {edad} años</span>}
                {turno.fecha_hora && <span>· Turno: {dateTimeOf(turno.fecha_hora)}</span>}
              </div>
              {/* TODO alergias: cuando exista hook real para alergias
                  del vecino, mostrar AlergiaBadge en rojo acá. */}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
          <nav className="flex border-t border-white/10">
            {TABS.map(t => {
              const active = tab === t.value
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={
                    'flex-1 border-b-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors sm:text-sm ' +
                    (active
                      ? 'border-accent text-white'
                      : 'border-transparent text-white/60 hover:text-white')
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </header>

        {/* Body scrolleable */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-background">
          {atencionQ.isLoading ? (
            <div className="flex items-center justify-center p-12"><Spinner /></div>
          ) : tab === 'atencion' ? (
            <AtencionForm
              turno={turno}
              atencion={atencion}
              municipioId={municipioId}
              profesionalId={perfil?.id ?? null}
            />
          ) : tab === 'insumos' ? (
            <InsumosTab
              atencion={atencion}
              municipioId={municipioId}
              dependenciaSaludId={dependenciaSaludId}
            />
          ) : (
            <HCTab vecinoId={vecino?.id} atencionActualId={atencion?.id} />
          )}
        </div>
      </aside>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Form de atención
// ─────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  motivo:             '',
  anamnesis:          '',
  examen_fisico:      '',
  diagnostico:        '',
  tratamiento:        '',
  indicaciones:       '',
  proxima_consulta:   '',
  derivacion_destino: '',
}

function AtencionForm({ turno, atencion, municipioId, profesionalId }) {
  // Key remount: si cambia la atención persistida, el form se
  // re-monta con los valores correctos sin useEffect→setState.
  return (
    <AtencionFormInner
      key={atencion?.id ?? `nuevo-${turno.id}`}
      turno={turno}
      atencion={atencion}
      municipioId={municipioId}
      profesionalId={profesionalId}
    />
  )
}

function AtencionFormInner({ turno, atencion, municipioId, profesionalId }) {
  const [form, setForm] = useState(() => atencion ? {
    motivo:             atencion.motivo             ?? '',
    anamnesis:          atencion.anamnesis          ?? '',
    examen_fisico:      atencion.examen_fisico      ?? '',
    diagnostico:        atencion.diagnostico        ?? '',
    tratamiento:        atencion.tratamiento        ?? '',
    indicaciones:       atencion.indicaciones       ?? '',
    proxima_consulta:   atencion.proxima_consulta   ?? '',
    derivacion_destino: atencion.derivacion_destino ?? '',
  } : { ...EMPTY_FORM, motivo: turno.motivo ?? '' })
  const [estadoTarget, setEstadoTarget] = useState(atencion?.estado ?? 'borrador')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const createMut = useCreateAtencion()
  const updateMut = useUpdateAtencion()
  const closeMut  = useCloseAtencion()

  const yaCerrada = atencion?.estado === 'cerrada' || atencion?.estado === 'derivada'

  async function persist({ estado } = {}) {
    setError(''); setOk('')
    const targetEstado = estado ?? estadoTarget
    const payload = {
      ...form,
      // Vacíos como null para no contaminar la fila con strings vacíos.
      proxima_consulta:   form.proxima_consulta || null,
      derivacion_destino: targetEstado === 'derivada' ? (form.derivacion_destino || null) : null,
      estado: targetEstado,
    }
    try {
      if (atencion) {
        await updateMut.mutateAsync({ id: atencion.id, ...payload })
      } else {
        await createMut.mutateAsync({
          municipio_id:   municipioId,
          turno_id:       turno.id,
          vecino_id:      turno.vecino_id ?? turno.vecino?.id,
          profesional_id: profesionalId,
          ...payload,
        })
      }
      setOk(targetEstado === 'borrador' ? 'Borrador guardado.' : 'Estado actualizado.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la atención.')
    }
  }

  async function handleCerrar() {
    setError(''); setOk('')
    if (!atencion) {
      // Hay que persistir primero como borrador para tener un id
      // sobre el cual descontar insumos. Solo cierra si el guardado
      // sale bien.
      try {
        const row = await createMut.mutateAsync({
          municipio_id:   municipioId,
          turno_id:       turno.id,
          vecino_id:      turno.vecino_id ?? turno.vecino?.id,
          profesional_id: profesionalId,
          ...form,
          proxima_consulta:   form.proxima_consulta || null,
          derivacion_destino: null,
          estado: 'borrador',
        })
        const { errores } = await closeMut.mutateAsync({ atencionId: row.id })
        setOk(errores.length === 0
          ? 'Atención cerrada y stock descontado.'
          : `Cerrada con ${errores.length} insumo${errores.length === 1 ? '' : 's'} que no pudieron descontarse — revisá manualmente.`)
      } catch (e) {
        setError(e?.message ?? 'No pudimos cerrar la atención.')
      }
      return
    }
    try {
      // Persistir cambios pendientes del form antes de cerrar.
      await updateMut.mutateAsync({
        id: atencion.id,
        ...form,
        proxima_consulta:   form.proxima_consulta || null,
        derivacion_destino: null,
        estado: 'borrador',
      })
      const { errores } = await closeMut.mutateAsync({ atencionId: atencion.id })
      setOk(errores.length === 0
        ? 'Atención cerrada y stock descontado.'
        : `Cerrada con ${errores.length} insumo${errores.length === 1 ? '' : 's'} sin descontar — revisá stock.`)
    } catch (e) {
      setError(e?.message ?? 'No pudimos cerrar la atención.')
    }
  }

  const saving = createMut.isPending || updateMut.isPending || closeMut.isPending

  return (
    <div className="space-y-4 p-5">
      {yaCerrada && (
        <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-xs text-ok-700">
          Esta atención está <b>{atencion.estado}</b>. El form queda en solo lectura.
        </div>
      )}

      <Textarea
        label="Motivo de consulta"
        value={form.motivo}
        onChange={v => set('motivo', v)}
        disabled={yaCerrada}
      />
      <Textarea
        label="Anamnesis / síntomas referidos"
        value={form.anamnesis}
        onChange={v => set('anamnesis', v)}
        disabled={yaCerrada}
      />
      <Textarea
        label="Examen físico"
        value={form.examen_fisico}
        onChange={v => set('examen_fisico', v)}
        disabled={yaCerrada}
      />
      <Textarea
        label="Diagnóstico"
        value={form.diagnostico}
        onChange={v => set('diagnostico', v)}
        disabled={yaCerrada}
      />
      <Textarea
        label="Tratamiento indicado"
        value={form.tratamiento}
        onChange={v => set('tratamiento', v)}
        disabled={yaCerrada}
      />
      <Textarea
        label="Indicaciones al paciente"
        value={form.indicaciones}
        onChange={v => set('indicaciones', v)}
        disabled={yaCerrada}
      />
      <Input
        label="Próxima consulta (opcional)"
        type="date"
        value={form.proxima_consulta}
        onChange={e => set('proxima_consulta', e.target.value)}
        disabled={yaCerrada}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-primary-700">Estado al guardar</label>
        <div className="grid gap-2 sm:grid-cols-3">
          {['borrador', 'cerrada', 'derivada'].map(v => {
            const sel = estadoTarget === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setEstadoTarget(v)}
                disabled={yaCerrada}
                className={
                  'rounded-lg border-2 px-3 py-2 text-sm font-semibold capitalize transition-all disabled:opacity-50 ' +
                  (sel
                    ? 'border-accent bg-primary-50 text-primary'
                    : 'border-border bg-white text-primary-500 hover:border-primary-200')
                }
              >
                {v === 'cerrada' ? 'Cerrar atención' : v === 'derivada' ? 'Derivar' : 'Borrador'}
              </button>
            )
          })}
        </div>
      </div>

      {estadoTarget === 'derivada' && (
        <Input
          label="Destino de derivación"
          value={form.derivacion_destino}
          onChange={e => set('derivacion_destino', e.target.value)}
          placeholder="Hospital, especialista, etc."
          disabled={yaCerrada}
        />
      )}

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
      )}
      {ok && (
        <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-xs text-ok-700">{ok}</div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <Button
          variant="secondary"
          onClick={() => persist({ estado: 'borrador' })}
          loading={saving}
          disabled={yaCerrada}
        >
          Guardar borrador
        </Button>
        <Button
          onClick={handleCerrar}
          loading={saving}
          disabled={yaCerrada}
        >
          Cerrar atención
        </Button>
        {!yaCerrada && (
          <p className="text-xs text-primary-400">
            Cerrar descuenta los insumos del stock y marca el turno como atendido.
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Insumos utilizados
// ─────────────────────────────────────────────────────────────────

function InsumosTab({ atencion, municipioId, dependenciaSaludId }) {
  const insumosQ   = useAtencionInsumos(atencion?.id)
  const catalogoQ  = useInsumosDisponibles({ municipioId, dependenciaId: dependenciaSaludId })
  const createMut  = useCreateAtencionInsumo()
  const deleteMut  = useDeleteAtencionInsumo()
  const [inventarioId, setInventarioId] = useState('')
  const [cantidad, setCantidad]         = useState('')
  const [error, setError]               = useState('')

  const yaCerrada = atencion?.estado === 'cerrada' || atencion?.estado === 'derivada'

  // Mantenemos las deps del useMemo apuntando a las refs raw de
  // .data — sino el array nuevo de `?? []` cambia identity en cada
  // render y el memo no sirve para nada.
  const totalEstimado = useMemo(() => {
    const items   = insumosQ.data   ?? []
    const catalog = catalogoQ.data  ?? []
    const byId = new Map(catalog.map(c => [c.id, c]))
    return items.reduce((acc, it) => {
      const pref = Number(byId.get(it.inventario_id)?.precio_referencia ?? 0)
      return acc + pref * Number(it.cantidad ?? 0)
    }, 0)
  }, [insumosQ.data, catalogoQ.data])

  const items   = insumosQ.data   ?? []
  const catalog = catalogoQ.data  ?? []

  async function handleAgregar() {
    setError('')
    if (!atencion) {
      setError('Primero guardá la atención como borrador desde la tab "Atención".')
      return
    }
    if (!inventarioId || !(Number(cantidad) > 0)) {
      setError('Elegí un insumo y una cantidad > 0.')
      return
    }
    const selected = catalog.find(c => c.id === inventarioId)
    try {
      await createMut.mutateAsync({
        atencion_id:   atencion.id,
        inventario_id: inventarioId,
        cantidad:      Number(cantidad),
        unidad:        selected?.unidad ?? null,
      })
      setInventarioId('')
      setCantidad('')
    } catch (e) {
      setError(e?.message ?? 'No pudimos agregar el insumo.')
    }
  }

  return (
    <div className="space-y-4 p-5">
      {!atencion && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-xs text-accent-700">
          Guardá un borrador de la atención primero (tab <b>Atención</b>) para poder
          agregar insumos.
        </div>
      )}

      <section>
        <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
          Insumos cargados
        </h3>
        {insumosQ.isLoading ? (
          <div className="mt-2 flex justify-center p-6"><Spinner /></div>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-primary-400">Todavía no se cargaron insumos.</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-white">
            {items.map(it => (
              <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-primary">{it.inventario?.nombre ?? '—'}</p>
                  <p className="text-xs text-primary-500">
                    <b>{it.cantidad}</b> {it.unidad || it.inventario?.unidad || ''}
                  </p>
                </div>
                {!yaCerrada && (
                  <button
                    onClick={() => deleteMut.mutate({ id: it.id, atencionId: atencion.id })}
                    className="text-xs font-semibold text-danger hover:underline"
                  >
                    Eliminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && totalEstimado > 0 && (
          <p className="mt-2 text-right text-xs text-primary-500">
            Total estimado: <b className="text-primary">{fmtMoney.format(totalEstimado)}</b>
          </p>
        )}
      </section>

      {!yaCerrada && (
        <section className="rounded-lg border border-border bg-white p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
            Agregar insumo
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Select
              label="Insumo"
              value={inventarioId}
              onChange={setInventarioId}
              placeholder={catalogoQ.isLoading ? 'Cargando...' : 'Seleccionar...'}
              options={catalog.map(c => ({
                value: c.id,
                label: `${c.nombre} (stock ${c.stock_actual}${c.unidad ? ' ' + c.unidad : ''})`,
              }))}
            />
            <Input
              label="Cantidad"
              type="number"
              min="0.01"
              step="0.01"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              className="min-w-[100px]"
            />
            <div className="flex items-end">
              <Button
                onClick={handleAgregar}
                loading={createMut.isPending}
                disabled={!atencion || !inventarioId || !(Number(cantidad) > 0)}
              >
                + Agregar
              </Button>
            </div>
          </div>
          {error && (
            <div className="mt-3 rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
          )}
        </section>
      )}

      <p className="text-xs text-primary-400">
        Al cerrar la atención, estos insumos se descontarán automáticamente del stock
        de la dependencia.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Historia Clínica
// ─────────────────────────────────────────────────────────────────

function HCTab({ vecinoId, atencionActualId }) {
  const hcQ = useAtencionesVecino(vecinoId, { limit: 50 })
  const [expandedId, setExpandedId] = useState(null)

  // Excluimos la atención que se está editando ahora para no
  // duplicarla en la HC. Dep en hcQ.data (ref estable) en vez del
  // array nuevo con `?? []`.
  const filas = useMemo(() => {
    const items = hcQ.data ?? []
    return items.filter(a => a.id !== atencionActualId)
  }, [hcQ.data, atencionActualId])

  return (
    <div className="space-y-4 p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-primary-500">
        Atenciones previas
      </h3>
      {hcQ.isLoading ? (
        <div className="flex justify-center p-6"><Spinner /></div>
      ) : filas.length === 0 ? (
        <p className="text-sm text-primary-400">Primera consulta de este paciente.</p>
      ) : (
        <ul className="space-y-2">
          {filas.map(a => {
            const expanded = expandedId === a.id
            return (
              <li
                key={a.id}
                className="overflow-hidden rounded-lg border border-border bg-white shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : a.id)}
                  aria-expanded={expanded}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-primary-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-primary-400">{dateOf(a.fecha_hora)}</p>
                    <p className="truncate text-sm font-semibold text-primary">
                      {a.diagnostico || a.motivo || '(sin diagnóstico)'}
                    </p>
                    <p className="text-xs text-primary-500">
                      {a.profesional?.nombre ?? 'Profesional —'}
                    </p>
                  </div>
                  <span className={ESTADO_ATENCION_BADGE[a.estado] ?? ESTADO_ATENCION_BADGE.borrador}>
                    {a.estado}
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-2 border-t border-border bg-primary-50/30 px-3 py-3 text-sm">
                    <HCDetalle label="Motivo"        value={a.motivo} />
                    <HCDetalle label="Anamnesis"     value={a.anamnesis} />
                    <HCDetalle label="Examen físico" value={a.examen_fisico} />
                    <HCDetalle label="Diagnóstico"   value={a.diagnostico} />
                    <HCDetalle label="Tratamiento"   value={a.tratamiento} />
                    <HCDetalle label="Indicaciones"  value={a.indicaciones} />
                    {a.proxima_consulta && (
                      <HCDetalle label="Próxima consulta" value={dateOf(a.proxima_consulta)} />
                    )}
                    {a.derivacion_destino && (
                      <HCDetalle label="Derivado a" value={a.derivacion_destino} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function HCDetalle({ label, value }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary-400">{label}</p>
      <p className="whitespace-pre-wrap text-sm text-primary-700">{value}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers de UI
// ─────────────────────────────────────────────────────────────────

function Textarea({ label, value, onChange, disabled, rows = 3 }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-primary-700">{label}</label>
      <textarea
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className="input-field min-h-[64px] resize-y disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  )
}
