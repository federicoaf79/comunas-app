import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import {
  useBeneficiarios, useCreateBeneficiario, useUpdateBeneficiarioEstado,
  usePagos, useCreatePago,
} from '../../hooks/useBeneficiarios'
import Tabs from '../../components/ui/Tabs'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { dateOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// /admin/ayuda-social — módulo Ayuda Social.
// 3 tabs: Beneficiarios | Pagos y entregas | Resumen
// =============================================================

// currentMonthYYYYMM no existe en datetime.js — implementación inline
const currentMonthYYYYMM = () => new Date().toISOString().slice(0, 7)

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

const TABS = [
  { value: 'beneficiarios', label: 'Beneficiarios' },
  { value: 'pagos',         label: 'Pagos y entregas' },
  { value: 'resumen',       label: 'Resumen' },
]

const NIVELES = [
  { value: 'nacional',    label: 'Nacional' },
  { value: 'provincial',  label: 'Provincial' },
  { value: 'municipal',   label: 'Municipal' },
]

const ESTADOS = [
  { value: 'activo',      label: 'Activo' },
  { value: 'inactivo',    label: 'Inactivo' },
  { value: 'suspendido',  label: 'Suspendido' },
]

const TIPOS_AYUDA = [
  { value: 'alimentaria',   label: 'Alimentaria' },
  { value: 'economica',     label: 'Económica' },
  { value: 'habitacional',  label: 'Habitacional' },
  { value: 'salud',         label: 'Salud' },
  { value: 'educacion',     label: 'Educación' },
  { value: 'otro',          label: 'Otro' },
]

// Badges por nivel
const NIVEL_BADGE = {
  nacional:   'inline-flex items-center rounded-full bg-ok-50 px-2.5 py-0.5 text-xs font-semibold text-ok-700',
  provincial: 'inline-flex items-center rounded-full bg-accent-50 px-2.5 py-0.5 text-xs font-semibold text-accent-700',
  municipal:  'inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary-700',
}

// Badges por estado
const ESTADO_BADGE = {
  activo:     'estado-confirmado',
  inactivo:   'estado-pendiente',
  suspendido: 'estado-cancelado',
}

function NivelBadge({ nivel }) {
  if (!nivel) return <span className="text-xs text-primary-300">—</span>
  const cls = NIVEL_BADGE[nivel] ?? NIVEL_BADGE.municipal
  const label = NIVELES.find(n => n.value === nivel)?.label ?? nivel
  return <span className={cls}>{label}</span>
}

function EstadoBadge({ estado }) {
  if (!estado) return <span className="text-xs text-primary-300">—</span>
  const cls = ESTADO_BADGE[estado] ?? 'estado-pendiente'
  const label = ESTADOS.find(e => e.value === estado)?.label ?? estado
  return <span className={cls}>{label}</span>
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function AyudaSocial() {
  const { hasRole } = useAuth()
  const canEdit = hasRole(['admin_comuna', 'superadmin'])
  const municipioId = useEffectiveMunicipioId()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'beneficiarios'

  function setTab(v) {
    const next = new URLSearchParams(searchParams)
    if (v === 'beneficiarios') next.delete('tab')
    else                       next.set('tab', v)
    setSearchParams(next)
  }

  return (
    <div className="space-y-5">
      <header className="mb-6">
        <p className="mb-1 text-xs text-primary-400">
          Administración municipal
        </p>
        <h1 className="font-sora text-2xl font-bold text-primary">
          Ayuda Social
        </h1>
        <p className="mt-1 text-sm text-primary-500">
          Gestión de beneficiarios y programas asistenciales
        </p>
      </header>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'beneficiarios' && <BeneficiariosTab municipioId={municipioId} canEdit={canEdit} />}
      {tab === 'pagos'         && <PagosTab municipioId={municipioId} canEdit={canEdit} />}
      {tab === 'resumen'       && <ResumenTab municipioId={municipioId} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 1: Beneficiarios
// ─────────────────────────────────────────────────────────────────

function BeneficiariosTab({ municipioId, canEdit }) {
  const [nivel, setNivel]       = useState('')
  const [estado, setEstado]     = useState('')
  const [programa, setPrograma] = useState('')
  const [modalNew, setModalNew] = useState(false)

  const { data: beneficiarios = [], isLoading } = useBeneficiarios({ estado: estado || undefined })
  const updateEstado = useUpdateBeneficiarioEstado()

  const filtered = useMemo(() => {
    let rows = beneficiarios
    if (nivel)    rows = rows.filter(b => b.nivel === nivel)
    if (programa) rows = rows.filter(b => (b.programa ?? '').toLowerCase().includes(programa.toLowerCase()))
    return rows
  }, [beneficiarios, nivel, programa])

  async function handleEstado(id, nuevoEstado) {
    if (!window.confirm(`¿Cambiar estado del beneficiario a "${nuevoEstado}"?`)) return
    await updateEstado.mutateAsync({ id, estado: nuevoEstado })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            label="Nivel"
            value={nivel}
            onChange={setNivel}
            placeholder="Todos"
            options={NIVELES}
          />
          <Select
            label="Estado"
            value={estado}
            onChange={setEstado}
            placeholder="Todos"
            options={ESTADOS}
          />
          <Input
            label="Programa"
            value={programa}
            onChange={e => setPrograma(e.target.value)}
            placeholder="Buscar programa..."
          />
        </div>
        {canEdit && (
          <Button onClick={() => setModalNew(true)}>
            + Nuevo beneficiario
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay beneficiarios con esos filtros.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Vecino</Th>
              <Th>Programa</Th>
              <Th>Nivel</Th>
              <Th className="text-right">Monto mensual</Th>
              <Th>Estado</Th>
              <Th>Desde</Th>
              {canEdit && <Th className="text-right">Acciones</Th>}
            </Tr>
          </THead>
          <tbody>
            {filtered.map(b => (
              <Tr key={b.id}>
                <Td>
                  <div>
                    <p className="font-medium text-primary">{b.vecino?.nombre_completo ?? '—'}</p>
                    <p className="text-xs text-primary-400">DNI {b.vecino?.dni ?? '—'}</p>
                  </div>
                </Td>
                <Td>{b.programa ?? '—'}</Td>
                <Td><NivelBadge nivel={b.nivel} /></Td>
                <Td className="text-right font-semibold tabular-nums">
                  {b.monto_mensual ? fmtMoney.format(b.monto_mensual) : '—'}
                </Td>
                <Td><EstadoBadge estado={b.estado} /></Td>
                <Td className="whitespace-nowrap">{dateOf(b.fecha_inicio)}</Td>
                {canEdit && (
                  <Td className="whitespace-nowrap text-right text-xs">
                    {b.estado === 'activo' && (
                      <div className="flex justify-end gap-3">
                        <button
                          onClick={() => handleEstado(b.id, 'suspendido')}
                          className="text-danger hover:underline"
                        >
                          Suspender
                        </button>
                        <button
                          onClick={() => handleEstado(b.id, 'inactivo')}
                          className="text-primary-500 hover:underline"
                        >
                          Inactivar
                        </button>
                      </div>
                    )}
                    {b.estado === 'suspendido' && (
                      <button
                        onClick={() => handleEstado(b.id, 'activo')}
                        className="text-ok-700 hover:underline"
                      >
                        Reactivar
                      </button>
                    )}
                    {b.estado === 'inactivo' && (
                      <button
                        onClick={() => handleEstado(b.id, 'activo')}
                        className="text-ok-700 hover:underline"
                      >
                        Reactivar
                      </button>
                    )}
                  </Td>
                )}
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {modalNew && (
        <BeneficiarioFormModal
          municipioId={municipioId}
          onClose={() => setModalNew(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2: Pagos y entregas
// ─────────────────────────────────────────────────────────────────

function PagosTab({ municipioId, canEdit }) {
  const [mes, setMes]           = useState(currentMonthYYYYMM())
  const [nivel, setNivel]       = useState('')
  const [programa, setPrograma] = useState('')
  const [modalNew, setModalNew] = useState(false)

  const { data: pagos = [], isLoading } = usePagos({
    mes: mes || undefined,
    nivel: nivel || undefined,
    programa: programa || undefined,
  })

  const total = useMemo(() => pagos.reduce((sum, p) => sum + Number(p.monto ?? 0), 0), [pagos])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            label="Mes"
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
          />
          <Select
            label="Nivel"
            value={nivel}
            onChange={setNivel}
            placeholder="Todos"
            options={NIVELES}
          />
          <Input
            label="Programa"
            value={programa}
            onChange={e => setPrograma(e.target.value)}
            placeholder="Buscar programa..."
          />
        </div>
        {canEdit && (
          <Button onClick={() => setModalNew(true)}>
            + Registrar pago/entrega
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ok-100 bg-ok-50 px-4 py-3 text-sm">
        <span className="font-medium text-ok-700">
          {pagos.length} registro{pagos.length === 1 ? '' : 's'} en el período
        </span>
        <span className="font-bold text-ok-700">
          Total del período: {fmtMoney.format(total)}
        </span>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : pagos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay pagos registrados en este período.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Beneficiario</Th>
              <Th>Concepto</Th>
              <Th>Programa</Th>
              <Th>Nivel</Th>
              <Th className="text-right">Monto</Th>
            </Tr>
          </THead>
          <tbody>
            {pagos.map(p => (
              <Tr key={p.id}>
                <Td className="whitespace-nowrap">{dateOf(p.fecha)}</Td>
                <Td>
                  <div>
                    <p className="font-medium text-primary">
                      {p.beneficiario?.vecino?.nombre_completo ?? '—'}
                    </p>
                    <p className="text-xs text-primary-400">
                      DNI {p.beneficiario?.vecino?.dni ?? '—'}
                    </p>
                  </div>
                </Td>
                <Td>{p.concepto ?? '—'}</Td>
                <Td>{p.programa ?? '—'}</Td>
                <Td><NivelBadge nivel={p.nivel} /></Td>
                <Td className="whitespace-nowrap text-right font-semibold tabular-nums">
                  {fmtMoney.format(p.monto)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {modalNew && (
        <PagoFormModal
          municipioId={municipioId}
          onClose={() => setModalNew(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3: Resumen
// ─────────────────────────────────────────────────────────────────

function ResumenTab({ municipioId }) {
  const { data: beneficiarios = [] } = useBeneficiarios()
  const { data: pagos = [] } = usePagos({ mes: currentMonthYYYYMM() })

  const activos = useMemo(() => beneficiarios.filter(b => b.estado === 'activo'), [beneficiarios])
  const totalPagadoMes = useMemo(() => pagos.reduce((sum, p) => sum + Number(p.monto ?? 0), 0), [pagos])

  const porNivel = useMemo(() => {
    const grupos = { nacional: 0, provincial: 0, municipal: 0 }
    activos.forEach(b => {
      if (b.nivel) grupos[b.nivel] = (grupos[b.nivel] || 0) + 1
    })
    return grupos
  }, [activos])

  const totalNivel = activos.length || 1

  const porPrograma = useMemo(() => {
    const map = new Map()
    activos.forEach(b => {
      const prog = b.programa || 'Sin programa'
      if (!map.has(prog)) {
        map.set(prog, { programa: prog, count: 0, monto: 0 })
      }
      const item = map.get(prog)
      item.count++
      item.monto += Number(b.monto_mensual ?? 0)
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [activos])

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Beneficiarios activos"
          value={activos.length}
          accent="primary"
        />
        <StatCard
          label="Total pagado este mes"
          value={fmtMoney.format(totalPagadoMes)}
          accent="accent"
        />
        <StatCard
          label="Programas activos"
          value={porPrograma.length}
          accent="ok"
        />
      </div>

      <div className="card overflow-hidden p-0">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-primary">Desglose por nivel</h3>
        </header>
        <div className="p-5 space-y-4">
          {NIVELES.map(({ value, label }) => {
            const count = porNivel[value] || 0
            const pct = Math.round((count / totalNivel) * 100)
            return (
              <div key={value}>
                <div className="flex items-baseline justify-between text-sm mb-2">
                  <NivelBadge nivel={value} />
                  <span className="font-semibold text-primary">{count} beneficiario{count === 1 ? '' : 's'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-primary-50">
                  <div
                    className={value === 'nacional' ? 'h-full bg-ok' : value === 'provincial' ? 'h-full bg-accent' : 'h-full bg-primary'}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card overflow-hidden p-0">
        <header className="border-b border-border px-5 py-3">
          <h3 className="text-sm font-semibold text-primary">Programas activos</h3>
          <p className="text-xs text-primary-400">Beneficiarios y monto mensual comprometido por programa</p>
        </header>
        {porPrograma.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-primary-400">
            No hay beneficiarios activos.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {porPrograma.map(p => (
              <div key={p.programa} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="font-medium text-primary">{p.programa}</p>
                  <p className="text-xs text-primary-400">{p.count} beneficiario{p.count === 1 ? '' : 's'}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">{fmtMoney.format(p.monto)}</p>
                  <p className="text-xs text-primary-400">por mes</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modales
// ─────────────────────────────────────────────────────────────────

function BeneficiarioFormModal({ municipioId, onClose }) {
  const { user } = useAuth()
  const createMut = useCreateBeneficiario()
  const [dni, setDni] = useState('')
  const [form, setForm] = useState({
    tipo_ayuda: '',
    programa: '',
    nivel: '',
    monto_mensual: '',
    fecha_inicio: todayArgYMD(),
    fecha_fin: '',
    estado: 'activo',
    descripcion: '',
    observaciones: '',
  })
  const [error, setError] = useState('')

  // useVecinoPorDNI no existe en useVecinos.js — implementación inline
  const vecinoQ = useQuery({
    queryKey: ['vecino-por-dni', municipioId ?? '__ALL__', dni],
    queryFn: async () => {
      if (!dni || dni.length < 7) return null
      const { data, error } = await supabase
        .from('vecinos')
        .select('id, nombre_completo, dni, telefono')
        .eq('dni', dni)
        .eq('municipio_id', municipioId)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!dni && dni.length >= 7 && !!municipioId,
  })
  const vecino = vecinoQ.data

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const canSubmit = vecino && form.tipo_ayuda && form.programa && form.nivel

  async function handle() {
    if (!canSubmit) return
    setError('')
    try {
      await createMut.mutateAsync({
        municipio_id: municipioId,
        vecino_id: vecino.id,
        tipo_ayuda: form.tipo_ayuda,
        programa: form.programa.trim(),
        nivel: form.nivel,
        monto_mensual: form.monto_mensual ? Number(form.monto_mensual) : null,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin || null,
        estado: form.estado,
        descripcion: form.descripcion.trim() || null,
        observaciones: form.observaciones.trim() || null,
        registrado_por: user?.id,
      })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Nuevo beneficiario"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createMut.isPending}>
            Cancelar
          </Button>
          <Button onClick={handle} loading={createMut.isPending} disabled={!canSubmit}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <Input
            label="DNI del vecino"
            value={dni}
            onChange={e => setDni(e.target.value)}
            placeholder="32145678"
            required
          />
          {vecinoQ.isLoading && <p className="mt-1 text-xs text-primary-500">Buscando...</p>}
          {vecino && (
            <p className="mt-1 text-sm text-ok-700">
              ✓ {vecino.nombre_completo} — Tel: {vecino.telefono ?? 'sin teléfono'}
            </p>
          )}
          {dni && !vecinoQ.isLoading && !vecino && (
            <p className="mt-1 text-xs text-danger">
              No se encontró vecino con ese DNI
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Programa"
            value={form.programa}
            onChange={e => set('programa', e.target.value)}
            placeholder="Ej: Plan Alimentar"
            required
          />
          <Select
            label="Tipo de ayuda"
            value={form.tipo_ayuda}
            onChange={v => set('tipo_ayuda', v)}
            placeholder="Seleccionar..."
            options={TIPOS_AYUDA}
            required
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-primary-700">
            Nivel *
          </label>
          <div className="flex gap-3">
            {NIVELES.map(n => (
              <label key={n.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="nivel"
                  value={n.value}
                  checked={form.nivel === n.value}
                  onChange={e => set('nivel', e.target.value)}
                  className="h-4 w-4"
                />
                <span className="text-sm text-primary">{n.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Monto mensual"
            type="number"
            min="0"
            step="0.01"
            value={form.monto_mensual}
            onChange={e => set('monto_mensual', e.target.value)}
            placeholder="0.00"
          />
          <Input
            label="Fecha inicio"
            type="date"
            value={form.fecha_inicio}
            onChange={e => set('fecha_inicio', e.target.value)}
            required
          />
          <Input
            label="Fecha fin (opcional)"
            type="date"
            value={form.fecha_fin}
            onChange={e => set('fecha_fin', e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-primary-700">
            Observaciones
          </label>
          <textarea
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
            rows={3}
            className="input"
            placeholder="Información adicional..."
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

function PagoFormModal({ municipioId, onClose }) {
  const { user } = useAuth()
  const createMut = useCreatePago()
  const { data: beneficiarios = [] } = useBeneficiarios({ estado: 'activo' })
  const [form, setForm] = useState({
    beneficiario_id: '',
    fecha: todayArgYMD(),
    concepto: '',
    monto: '',
    nivel: '',
    programa: '',
  })
  const [error, setError] = useState('')

  function set(k, v) {
    setForm(f => ({ ...f, [k]: v }))
  }

  const canSubmit = form.beneficiario_id && form.concepto && Number(form.monto) > 0

  async function handle() {
    if (!canSubmit) return
    setError('')
    try {
      await createMut.mutateAsync({
        municipio_id: municipioId,
        beneficiario_id: form.beneficiario_id,
        fecha: form.fecha,
        concepto: form.concepto.trim(),
        monto: Number(form.monto),
        nivel: form.nivel || null,
        programa: form.programa.trim() || null,
        registrado_por: user?.id,
      })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar')
    }
  }

  const benefOpts = beneficiarios.map(b => ({
    value: b.id,
    label: `${b.vecino?.nombre_completo ?? '—'} — ${b.programa ?? 'Sin programa'}`,
  }))

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Registrar pago/entrega"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createMut.isPending}>
            Cancelar
          </Button>
          <Button onClick={handle} loading={createMut.isPending} disabled={!canSubmit}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label="Beneficiario"
          value={form.beneficiario_id}
          onChange={v => set('beneficiario_id', v)}
          placeholder="Seleccionar..."
          options={benefOpts}
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Fecha"
            type="date"
            value={form.fecha}
            onChange={e => set('fecha', e.target.value)}
            required
          />
          <Input
            label="Monto"
            type="number"
            min="0"
            step="0.01"
            value={form.monto}
            onChange={e => set('monto', e.target.value)}
            placeholder="0.00"
            required
          />
        </div>

        <Input
          label="Concepto"
          value={form.concepto}
          onChange={e => set('concepto', e.target.value)}
          placeholder="Ej: Entrega bolsón alimentario mayo"
          required
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Programa (opcional)"
            value={form.programa}
            onChange={e => set('programa', e.target.value)}
            placeholder="Ej: Plan Alimentar"
          />
          <Select
            label="Nivel (opcional)"
            value={form.nivel}
            onChange={v => set('nivel', v)}
            placeholder="Seleccionar..."
            options={NIVELES}
          />
        </div>

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
