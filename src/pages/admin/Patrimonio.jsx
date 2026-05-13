import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import {
  useBienesPatrimonio, useCreateBien, useUpdateBien,
  useMantenimientos, useCreateMantenimiento, useResumenPatrimonio,
  diasParaVencerSeguro,
  TIPOS_BIEN, ESTADOS_BIEN, TIPOS_MANTENIMIENTO,
} from '../../hooks/usePatrimonio'
import Tabs from '../../components/ui/Tabs'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { dateOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// /admin/patrimonio — módulo Patrimonio Municipal.
//
// 3 tabs navegados por ?tab=:
//   sin ?tab / inmuebles → Bienes Inmuebles
//   ?tab=muebles         → Muebles de capital
//   ?tab=seguros         → Seguros y valuación
//
// Restringido a admin_comuna / superadmin — el guard duro vive en
// App.jsx (RoleGuard admin_comuna|operador), y acá adentro filtramos
// operadores con un mensaje suave de "acceso restringido" igual que
// hace /admin/auditoria.
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

const TABS = [
  { value: 'inmuebles', label: 'Bienes Inmuebles' },
  { value: 'muebles',   label: 'Bienes muebles de capital' },
  { value: 'seguros',   label: 'Seguros y valuación' },
]

// Estado del bien → clase de badge (paleta COMUNAS, cero verde):
//   bueno    → azul   (badge-ok    — text-ok-700 / bg-ok-50)
//   regular  → gold   (badge-accent)
//   malo     → rojo   (badge-danger)
//   baja     → gris   (badge-neutral)
const ESTADO_BADGE = {
  bueno:   'badge-ok',
  regular: 'badge-accent',
  malo:    'badge-danger',
  baja:    'badge-neutral',
}
function estadoLabel(e) {
  return ESTADOS_BIEN.find(s => s.value === e)?.label ?? (e ?? '—')
}
function EstadoBadge({ estado }) {
  const cls = ESTADO_BADGE[estado] ?? 'badge-neutral'
  return <span className={cls}>{estadoLabel(estado)}</span>
}

// Días → badge de vencimiento del seguro (vencido / por vencer / vigente).
function SeguroBadge({ iso }) {
  if (!iso) return <span className="text-xs text-primary-300">—</span>
  const dias = diasParaVencerSeguro(iso)
  if (dias == null) return <span className="text-xs text-primary-300">—</span>
  if (dias < 0)  return <span className="badge-danger">Vencido · {dateOf(iso)}</span>
  if (dias <= 30) return <span className="badge-accent">Vence en {dias}d</span>
  return <span className="badge-ok">Vigente · {dateOf(iso)}</span>
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function Patrimonio() {
  const { hasRole } = useAuth()
  const autorizado  = hasRole(['admin_comuna', 'superadmin'])
  const municipioId = useEffectiveMunicipioId()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || ''
  const tab = ['inmuebles', 'muebles', 'seguros'].includes(tabParam) ? tabParam : 'inmuebles'

  const { data: dependencias = [] } = useDependencias()

  function setTab(v) {
    const next = new URLSearchParams(searchParams)
    if (v === 'inmuebles') next.delete('tab')
    else                   next.set('tab', v)
    setSearchParams(next)
  }

  if (!autorizado) {
    return (
      <div className="space-y-5">
        <header>
          <h1 className="font-sora text-2xl font-bold text-primary">Patrimonio</h1>
        </header>
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">Acceso restringido</p>
          <p className="mt-2 text-sm text-primary-500">
            Solo los administradores de la comuna y el superadmin pueden acceder al módulo Patrimonio.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Patrimonio</h1>
        <p className="text-sm text-primary-400">
          Inventario patrimonial — inmuebles, muebles de capital, seguros y valuación.
        </p>
      </header>

      {!municipioId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No encontramos un municipio asignado ni un fallback activo.
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div>
        {tab === 'inmuebles' && <InmueblesTab municipioId={municipioId} dependencias={dependencias} />}
        {tab === 'muebles'   && <MueblesTab   municipioId={municipioId} dependencias={dependencias} />}
        {tab === 'seguros'   && <SegurosTab   municipioId={municipioId} dependencias={dependencias} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// KPIs compartidos (inmuebles)
// ─────────────────────────────────────────────────────────────────

function KpisInmuebles({ municipioId }) {
  const { data: resumen, isLoading } = useResumenPatrimonio(municipioId)
  const inmuebles = resumen?.porTipo?.inmueble ?? 0
  const conSeguro = (resumen?.segurosVigentes ?? 0) + (resumen?.segurosPorVencer ?? 0)
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Total inmuebles"
        value={isLoading ? '…' : inmuebles}
        accent="primary"
      />
      <StatCard
        label="Valor fiscal total"
        value={isLoading ? '…' : fmtMoney.format(resumen?.valorFiscalTotal ?? 0)}
        hint="Suma de todos los bienes"
        accent="accent"
      />
      <StatCard
        label="Con seguro activo"
        value={isLoading ? '…' : conSeguro}
        hint={`${resumen?.segurosPorVencer ?? 0} por vencer`}
        accent="ok"
      />
      <StatCard
        label="Requieren atención"
        value={isLoading ? '…' : (resumen?.requierenAtencion ?? 0)}
        hint="Estado regular o malo"
        accent={resumen?.requierenAtencion > 0 ? 'danger' : 'primary'}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Inmuebles
// ─────────────────────────────────────────────────────────────────

function InmueblesTab({ municipioId, dependencias }) {
  const { data: bienes = [], isLoading } = useBienesPatrimonio(
    { tipo: 'inmueble' },
    { municipioIdOverride: municipioId },
  )
  const [modalNew, setModalNew] = useState(false)
  const [detalle, setDetalle]   = useState(null)

  return (
    <div className="space-y-5">
      <KpisInmuebles municipioId={municipioId} />

      <div className="flex justify-end">
        <Button onClick={() => setModalNew(true)}>+ Registrar inmueble</Button>
      </div>

      <BienesTabla
        bienes={bienes}
        isLoading={isLoading}
        emptyText="No hay inmuebles cargados todavía."
        mostrarDependencia={false}
        onRowClick={setDetalle}
      />

      {modalNew && (
        <BienFormModal
          defaultTipo="inmueble"
          municipioId={municipioId}
          dependencias={dependencias}
          onClose={() => setModalNew(false)}
        />
      )}
      {detalle && (
        <BienDetalleDrawer
          bien={detalle}
          dependencias={dependencias}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Muebles
// ─────────────────────────────────────────────────────────────────

function MueblesTab({ municipioId, dependencias }) {
  const [depFiltro, setDepFiltro] = useState('')
  const { data: bienes = [], isLoading } = useBienesPatrimonio(
    { tipo: 'mueble', dependenciaId: depFiltro || undefined },
    { municipioIdOverride: municipioId },
  )
  const [modalNew, setModalNew] = useState(false)
  const [detalle, setDetalle]   = useState(null)

  // KPIs del subset "muebles" usan el resumen global filtrado por
  // tipo — el resumen ya viene desglosado por tipo así que no hace
  // falta otra query.
  const { data: resumen, isLoading: lr } = useResumenPatrimonio(municipioId)
  const totalMuebles = resumen?.porTipo?.mueble ?? 0

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-primary-100 bg-primary-50/60 p-3 text-xs text-primary-700">
        <strong className="font-semibold">Nota:</strong>{' '}
        los <strong>vehículos</strong> se administran en el módulo{' '}
        <a href="/admin/flota" className="font-semibold text-primary underline-offset-2 hover:underline">
          Flota
        </a>
        . Este listado cubre el resto del equipamiento de capital (mobiliario,
        computación, maquinaria menor, etc).
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total muebles" value={lr ? '…' : totalMuebles} accent="primary" />
        <StatCard
          label="Valor fiscal total"
          value={lr ? '…' : fmtMoney.format(resumen?.valorFiscalTotal ?? 0)}
          hint="Suma global del patrimonio"
          accent="accent"
        />
        <StatCard
          label="Con seguro activo"
          value={lr ? '…' : ((resumen?.segurosVigentes ?? 0) + (resumen?.segurosPorVencer ?? 0))}
          hint={`${resumen?.segurosPorVencer ?? 0} por vencer`}
          accent="ok"
        />
        <StatCard
          label="Requieren atención"
          value={lr ? '…' : (resumen?.requierenAtencion ?? 0)}
          hint="Estado regular o malo"
          accent={resumen?.requierenAtencion > 0 ? 'danger' : 'primary'}
        />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full sm:max-w-xs">
          <Select
            label="Filtrar por dependencia"
            value={depFiltro}
            onChange={setDepFiltro}
            placeholder="Todas las dependencias"
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
          />
        </div>
        <Button onClick={() => setModalNew(true)}>+ Registrar mueble</Button>
      </div>

      <BienesTabla
        bienes={bienes}
        isLoading={isLoading}
        emptyText="No hay muebles de capital cargados para este filtro."
        mostrarDependencia
        onRowClick={setDetalle}
      />

      {modalNew && (
        <BienFormModal
          defaultTipo="mueble"
          defaultDependenciaId={depFiltro}
          municipioId={municipioId}
          dependencias={dependencias}
          onClose={() => setModalNew(false)}
        />
      )}
      {detalle && (
        <BienDetalleDrawer
          bien={detalle}
          dependencias={dependencias}
          onClose={() => setDetalle(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Seguros y valuación
// ─────────────────────────────────────────────────────────────────

function SegurosTab({ municipioId, dependencias }) {
  // Bajamos TODO el patrimonio del municipio una sola vez para poder
  // segmentar "con seguro" (UI principal) y exportar a CSV el total.
  const { data: bienes = [], isLoading } = useBienesPatrimonio(
    {}, { municipioIdOverride: municipioId },
  )

  const conSeguro = useMemo(() => {
    return (bienes ?? []).filter(b => b.seguro_vencimiento || b.seguro_compania || b.seguro_poliza)
  }, [bienes])

  const valorTotal = useMemo(() => {
    return (bienes ?? []).reduce((a, b) => a + Number(b.valor_fiscal ?? 0), 0)
  }, [bienes])

  // KPIs derivados (vencidos / por vencer / vigentes) calculados
  // localmente — no dependen del resumen global porque acá ya
  // tenemos todo el set en memoria.
  const buckets = useMemo(() => {
    let vencidos = 0, porVencer = 0, vigentes = 0
    for (const b of conSeguro) {
      const d = diasParaVencerSeguro(b.seguro_vencimiento)
      if (d == null) continue
      if (d < 0)        vencidos  += 1
      else if (d <= 30) porVencer += 1
      else              vigentes  += 1
    }
    return { vencidos, porVencer, vigentes }
  }, [conSeguro])

  function exportarCsv() {
    const cols = [
      { label: 'N°Inventario', get: b => b.numero_inventario ?? '' },
      { label: 'Tipo',         get: b => labelTipo(b.tipo) },
      { label: 'Nombre',       get: b => b.nombre ?? '' },
      { label: 'Estado',       get: b => estadoLabel(b.estado) },
      { label: 'Valor Fiscal', get: b => b.valor_fiscal ?? 0 },
      { label: 'Seguro',       get: b => fmtSeguroCsv(b) },
      { label: 'Dependencia',  get: b => b.dependencia?.nombre ?? '' },
      { label: 'Observaciones', get: b => b.observaciones ?? '' },
    ]
    descargarCsv(`patrimonio-${todayArgYMD()}.csv`, bienes, cols)
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Valor total del patrimonio"
          value={isLoading ? '…' : fmtMoney.format(valorTotal)}
          hint="Suma de valor_fiscal de todos los bienes"
          accent="accent"
        />
        <StatCard
          label="Seguros vigentes"
          value={isLoading ? '…' : buckets.vigentes}
          accent="ok"
        />
        <StatCard
          label="Por vencer (30d)"
          value={isLoading ? '…' : buckets.porVencer}
          accent={buckets.porVencer > 0 ? 'accent' : 'primary'}
        />
        <StatCard
          label="Vencidos"
          value={isLoading ? '…' : buckets.vencidos}
          accent={buckets.vencidos > 0 ? 'danger' : 'primary'}
        />
      </div>

      <div className="flex justify-end">
        <Button onClick={exportarCsv} disabled={bienes.length === 0}>
          Exportar inventario patrimonial
        </Button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : conSeguro.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay bienes con datos de seguro cargados todavía.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>N° Inv</Th>
              <Th>Tipo</Th>
              <Th>Nombre</Th>
              <Th>Estado</Th>
              <Th>Compañía</Th>
              <Th>Póliza</Th>
              <Th>Vencimiento</Th>
              <Th className="text-right">Valor fiscal</Th>
            </Tr>
          </THead>
          <tbody>
            {conSeguro.map(b => (
              <Tr key={b.id}>
                <Td className="font-mono text-xs text-primary-700">
                  {b.numero_inventario || '—'}
                </Td>
                <Td>
                  <span className="badge-neutral">{labelTipo(b.tipo)}</span>
                </Td>
                <Td>
                  <p className="font-medium text-primary">{b.nombre}</p>
                  {b.dependencia?.nombre && (
                    <p className="text-[11px] text-primary-400">{b.dependencia.nombre}</p>
                  )}
                </Td>
                <Td><EstadoBadge estado={b.estado} /></Td>
                <Td className="text-sm text-primary-700">{b.seguro_compania || '—'}</Td>
                <Td className="font-mono text-xs text-primary-500">{b.seguro_poliza || '—'}</Td>
                <Td><SeguroBadge iso={b.seguro_vencimiento} /></Td>
                <Td className="text-right font-semibold tabular-nums text-primary">
                  {fmtMoney.format(Number(b.valor_fiscal ?? 0))}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}

function fmtSeguroCsv(b) {
  if (!b.seguro_compania && !b.seguro_poliza && !b.seguro_vencimiento) return ''
  const partes = [b.seguro_compania, b.seguro_poliza]
    .filter(Boolean).join(' / ')
  const venc = b.seguro_vencimiento ? `vence ${b.seguro_vencimiento}` : ''
  return [partes, venc].filter(Boolean).join(' — ')
}

function labelTipo(t) {
  return TIPOS_BIEN.find(x => x.value === t)?.label ?? (t ?? '—')
}

// ─────────────────────────────────────────────────────────────────
// Tabla de bienes (compartida entre inmuebles y muebles)
// ─────────────────────────────────────────────────────────────────

function BienesTabla({ bienes, isLoading, emptyText, mostrarDependencia, onRowClick }) {
  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (!bienes || bienes.length === 0) {
    return <div className="card p-10 text-center text-sm text-primary-400">{emptyText}</div>
  }
  return (
    <Table>
      <THead>
        <Tr>
          <Th>N° Inv</Th>
          <Th>Nombre</Th>
          {mostrarDependencia && <Th>Dependencia</Th>}
          <Th>Estado</Th>
          <Th className="text-right">Valor fiscal</Th>
          <Th>Seguro vence</Th>
          <Th>Observaciones</Th>
          <Th className="text-right">Acciones</Th>
        </Tr>
      </THead>
      <tbody>
        {bienes.map(b => (
          <Tr key={b.id} onClick={() => onRowClick?.(b)}>
            <Td className="font-mono text-xs text-primary-700">
              {b.numero_inventario || '—'}
            </Td>
            <Td>
              <p className="font-medium text-primary">{b.nombre}</p>
              {b.ubicacion && (
                <p className="text-[11px] text-primary-400">{b.ubicacion}</p>
              )}
            </Td>
            {mostrarDependencia && (
              <Td>
                {b.dependencia?.nombre
                  ? <span className="badge-neutral">{b.dependencia.nombre}</span>
                  : <span className="text-xs text-primary-300">—</span>}
              </Td>
            )}
            <Td><EstadoBadge estado={b.estado} /></Td>
            <Td className="text-right font-semibold tabular-nums text-primary">
              {fmtMoney.format(Number(b.valor_fiscal ?? 0))}
            </Td>
            <Td><SeguroBadge iso={b.seguro_vencimiento} /></Td>
            <Td className="max-w-xs">
              <span className="line-clamp-2 text-xs text-primary-600">
                {b.observaciones || <span className="text-primary-300">—</span>}
              </span>
            </Td>
            <Td className="text-right">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRowClick?.(b) }}
                className="text-xs font-semibold text-accent hover:underline"
              >
                Ver detalle →
              </button>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}

// ─────────────────────────────────────────────────────────────────
// Formulario de bien (alta + edición)
// ─────────────────────────────────────────────────────────────────

function BienFormModal({
  defaultTipo = 'inmueble',
  defaultDependenciaId = '',
  bien = null,
  municipioId,
  dependencias,
  onClose,
}) {
  const editing = !!bien
  const [form, setForm] = useState(() => ({
    tipo:               bien?.tipo               ?? defaultTipo,
    numero_inventario:  bien?.numero_inventario  ?? '',
    nombre:             bien?.nombre             ?? '',
    descripcion:        bien?.descripcion        ?? '',
    dependencia_id:     bien?.dependencia_id     ?? defaultDependenciaId ?? '',
    estado:             bien?.estado             ?? 'bueno',
    valor_fiscal:       bien?.valor_fiscal       ?? '',
    fecha_adquisicion:  bien?.fecha_adquisicion  ?? '',
    seguro_compania:    bien?.seguro_compania    ?? '',
    seguro_poliza:      bien?.seguro_poliza      ?? '',
    seguro_vencimiento: bien?.seguro_vencimiento ?? '',
    ubicacion:          bien?.ubicacion          ?? '',
    observaciones:      bien?.observaciones      ?? '',
  }))
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const create = useCreateBien()
  const update = useUpdateBien()
  const pending = create.isPending || update.isPending

  const canSubmit = !!form.tipo && !!form.nombre.trim() && !!form.estado

  async function handle() {
    setError('')
    const payload = {
      municipio_id:       municipioId,
      tipo:               form.tipo,
      numero_inventario:  form.numero_inventario.trim() || null,
      nombre:             form.nombre.trim(),
      descripcion:        form.descripcion.trim() || null,
      dependencia_id:     form.dependencia_id || null,
      estado:             form.estado,
      valor_fiscal:       form.valor_fiscal === '' ? 0 : Number(form.valor_fiscal),
      fecha_adquisicion:  form.fecha_adquisicion || null,
      seguro_compania:    form.seguro_compania.trim() || null,
      seguro_poliza:      form.seguro_poliza.trim() || null,
      seguro_vencimiento: form.seguro_vencimiento || null,
      ubicacion:          form.ubicacion.trim() || null,
      observaciones:      form.observaciones.trim() || null,
    }
    try {
      if (editing) await update.mutateAsync({ id: bien.id, ...payload })
      else         await create.mutateAsync(payload)
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar el bien.')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={editing ? 'Editar bien patrimonial' : 'Registrar bien patrimonial'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={handle} loading={pending} disabled={!canSubmit}>
            {editing ? 'Guardar cambios' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Tipo de bien"
          value={form.tipo}
          onChange={v => set('tipo', v)}
          options={TIPOS_BIEN}
        />
        <Input
          label="N° de inventario"
          value={form.numero_inventario}
          onChange={e => set('numero_inventario', e.target.value)}
          placeholder="Ej. INM-001"
        />
        <div className="sm:col-span-2">
          <Input
            label="Nombre"
            value={form.nombre}
            onChange={e => set('nombre', e.target.value)}
            placeholder="Ej. Edificio Comunal"
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
          />
        </div>
        <Select
          label="Estado"
          value={form.estado}
          onChange={v => set('estado', v)}
          options={ESTADOS_BIEN}
        />
        <Select
          label="Dependencia asignada"
          value={form.dependencia_id}
          onChange={v => set('dependencia_id', v)}
          placeholder="Sin asignar"
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <Input
          label="Valor fiscal (ARS)"
          type="number"
          min="0"
          step="0.01"
          value={form.valor_fiscal}
          onChange={e => set('valor_fiscal', e.target.value)}
        />
        <Input
          label="Fecha de adquisición"
          type="date"
          value={form.fecha_adquisicion}
          onChange={e => set('fecha_adquisicion', e.target.value)}
        />
        <Input
          label="Ubicación"
          value={form.ubicacion}
          onChange={e => set('ubicacion', e.target.value)}
          placeholder="Dirección o referencia"
        />
        <div className="sm:col-span-2 mt-2 border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-400">
            Seguro (opcional)
          </p>
        </div>
        <Input
          label="Compañía aseguradora"
          value={form.seguro_compania}
          onChange={e => set('seguro_compania', e.target.value)}
        />
        <Input
          label="N° de póliza"
          value={form.seguro_poliza}
          onChange={e => set('seguro_poliza', e.target.value)}
        />
        <Input
          label="Vencimiento del seguro"
          type="date"
          value={form.seguro_vencimiento}
          onChange={e => set('seguro_vencimiento', e.target.value)}
        />
        <div />
        <div className="sm:col-span-2">
          <Input
            label="Observaciones"
            value={form.observaciones}
            onChange={e => set('observaciones', e.target.value)}
          />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Drawer de detalle del bien + historial de mantenimientos
// ─────────────────────────────────────────────────────────────────

function BienDetalleDrawer({ bien, dependencias, onClose }) {
  const [modalEditar, setModalEditar]     = useState(false)
  const [modalMant,   setModalMant]       = useState(false)
  const mantQ = useMantenimientos(bien.id)

  // ESC para cerrar — mismo pattern que AtencionDrawer.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <>
      {/* Backdrop — click fuera cierra. Mismo patrón que
          AtencionDrawer (siblings separados, no flex) para que el
          click cierre incluso cuando el drawer cubre toda la pantalla
          en mobile. */}
      <div
        className="fixed inset-0 z-40 bg-primary-900/50 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${bien.nombre}`}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col bg-white shadow-card animate-slide-up sm:w-[36rem]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-400">
              {labelTipo(bien.tipo)} · {bien.numero_inventario || 'sin N° inv.'}
            </p>
            <h2 className="mt-0.5 font-sora text-lg font-bold text-primary">
              {bien.nombre}
            </h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <EstadoBadge estado={bien.estado} />
              <SeguroBadge iso={bien.seguro_vencimiento} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-primary-400 hover:bg-primary-50 hover:text-primary"
            aria-label="Cerrar"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          {/* Datos del bien */}
          <section>
            <h3 className="font-sora text-sm font-bold text-primary">Datos del bien</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato label="Tipo"          value={labelTipo(bien.tipo)} />
              <Dato label="N° inventario" value={bien.numero_inventario} />
              <Dato label="Estado"        value={estadoLabel(bien.estado)} />
              <Dato label="Valor fiscal"  value={fmtMoney.format(Number(bien.valor_fiscal ?? 0))} />
              <Dato label="Adquisición"   value={bien.fecha_adquisicion ? dateOf(bien.fecha_adquisicion) : '—'} />
              <Dato label="Dependencia"   value={bien.dependencia?.nombre} />
              <Dato label="Ubicación"     value={bien.ubicacion} fullSpan />
              <Dato label="Descripción"   value={bien.descripcion} fullSpan />
            </dl>
          </section>

          {/* Seguro */}
          <section>
            <h3 className="font-sora text-sm font-bold text-primary">Seguro</h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Dato label="Compañía"      value={bien.seguro_compania} />
              <Dato label="Póliza"        value={bien.seguro_poliza} />
              <Dato label="Vencimiento"   value={bien.seguro_vencimiento ? dateOf(bien.seguro_vencimiento) : '—'} />
            </dl>
          </section>

          {/* Observaciones */}
          {bien.observaciones && (
            <section>
              <h3 className="font-sora text-sm font-bold text-primary">Observaciones</h3>
              <p className="mt-2 whitespace-pre-line text-sm text-primary-700">
                {bien.observaciones}
              </p>
            </section>
          )}

          {/* Mantenimientos */}
          <section>
            <div className="flex items-center justify-between">
              <h3 className="font-sora text-sm font-bold text-primary">
                Historial de mantenimientos
              </h3>
              <Button size="sm" onClick={() => setModalMant(true)}>
                + Registrar mantenimiento
              </Button>
            </div>
            {mantQ.isLoading ? (
              <div className="mt-3 flex items-center justify-center p-4"><Spinner /></div>
            ) : (mantQ.data ?? []).length === 0 ? (
              <p className="mt-3 text-xs text-primary-400">
                Sin mantenimientos registrados. El primer registro queda asociado a este bien.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
                {mantQ.data.map(m => (
                  <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2.5 text-xs">
                    <span className="font-mono text-primary-400">{dateOf(m.fecha)}</span>
                    <span className="badge-neutral">{labelMantTipo(m.tipo)}</span>
                    <p className="min-w-0 flex-1 text-primary-700">
                      <span className="font-medium">{m.descripcion || '—'}</span>
                      {m.responsable && (
                        <span className="block text-[11px] text-primary-400">
                          Responsable: {m.responsable}
                        </span>
                      )}
                    </p>
                    {Number(m.costo) > 0 && (
                      <span className="font-semibold tabular-nums text-primary">
                        {fmtMoney.format(Number(m.costo))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-white px-5 py-3">
          <Button variant="secondary" onClick={() => setModalEditar(true)}>
            Editar bien
          </Button>
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </footer>
      </aside>

      {modalEditar && (
        <BienFormModal
          bien={bien}
          municipioId={bien.municipio_id}
          dependencias={dependencias}
          onClose={() => setModalEditar(false)}
        />
      )}
      {modalMant && (
        <MantenimientoFormModal
          bienId={bien.id}
          onClose={() => setModalMant(false)}
        />
      )}
    </>
  )
}

function labelMantTipo(t) {
  return TIPOS_MANTENIMIENTO.find(x => x.value === t)?.label ?? (t ?? '—')
}

function Dato({ label, value, fullSpan }) {
  return (
    <div className={fullSpan ? 'col-span-2' : ''}>
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-primary-400">{label}</dt>
      <dd className="mt-0.5 text-primary-700">
        {value ? value : <span className="text-primary-300">—</span>}
      </dd>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modal de nuevo mantenimiento
// ─────────────────────────────────────────────────────────────────

function MantenimientoFormModal({ bienId, onClose }) {
  const [form, setForm] = useState({
    fecha:       todayArgYMD(),
    tipo:        'mantenimiento',
    descripcion: '',
    costo:       '',
    responsable: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const create = useCreateMantenimiento()
  const canSubmit = !!form.fecha && !!form.descripcion.trim()

  async function handle() {
    setError('')
    try {
      await create.mutateAsync({
        bien_id:     bienId,
        fecha:       form.fecha,
        tipo:        form.tipo,
        descripcion: form.descripcion.trim(),
        costo:       form.costo === '' ? 0 : Number(form.costo),
        responsable: form.responsable.trim() || null,
      })
      onClose()
    } catch (e) {
      setError(e?.message ?? 'No pudimos registrar el mantenimiento.')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Registrar mantenimiento"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handle} loading={create.isPending} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Fecha"
          type="date"
          value={form.fecha}
          onChange={e => set('fecha', e.target.value)}
          required
        />
        <Select
          label="Tipo"
          value={form.tipo}
          onChange={v => set('tipo', v)}
          options={TIPOS_MANTENIMIENTO}
        />
        <div className="sm:col-span-2">
          <Input
            label="Descripción"
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            placeholder="¿Qué se hizo? ¿Qué se reparó?"
            required
          />
        </div>
        <Input
          label="Costo (ARS)"
          type="number"
          min="0"
          step="0.01"
          value={form.costo}
          onChange={e => set('costo', e.target.value)}
        />
        <Input
          label="Responsable / proveedor"
          value={form.responsable}
          onChange={e => set('responsable', e.target.value)}
        />
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// CSV helpers — copia local del patrón de Auditoria.jsx
// ─────────────────────────────────────────────────────────────────

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function descargarCsv(filename, filas, columnas) {
  const header = columnas.map(c => csvEscape(c.label)).join(',')
  const body   = filas.map(r => columnas.map(c => csvEscape(c.get(r))).join(',')).join('\n')
  // BOM ﻿ para que Excel interprete UTF-8 sin manualmente
  // forzar la codificación (Tribunal de Cuentas suele abrir en Excel).
  const blob = new Blob(['﻿', header, '\n', body], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
