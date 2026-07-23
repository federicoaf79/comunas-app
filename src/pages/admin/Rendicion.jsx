import { useMemo, useState } from 'react'
import {
  useGastos, usePresupuestoPartidas,
  currentMonthYYYYMM, currentYear, monthRange,
} from '../../hooks/useAdministracion'
import { usePartidasTipo } from '../../hooks/useInventario'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { createAuditLog } from '../../hooks/useAuditLog'
import Tabs from '../../components/ui/Tabs'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { dateOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// Rendición de Cuentas — vista cross-año de presupuesto vs
// ejecutado, agrupable por partida, con exports CSV pensados para
// la rendición al Tribunal de Cuentas SGO (SARC). Paleta COMUNAS
// estricta (cero verde).
//
// Datos:
//   - presupuesto_partidas → asignado por dep × partida × fuente
//   - gastos aprobados      → ejecutado (sumado por dependencia)
//   - partidas_tipo         → catálogo de códigos/nombres
//
// Nota: el schema de `gastos` no incluye partida_codigo directo,
// así que el agrupamiento de Tab 2 usa `categoria` como proxy.
// =============================================================

const SARC_URL = 'http://www.tcse.gob.ar/index.php/rendiciones/municipalidades-y-comisiones/'

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

const TABS = [
  { value: 'resumen',  label: 'Resumen' },
  { value: 'partida',  label: 'Gastos por partida' },
  { value: 'export',   label: 'Exportar' },
]

// Genera array de años desde 2024 hasta el actual +1 (para
// presupuestar el próximo ciclo). El selector lo usa en orden desc.
function aniosDisponibles() {
  const actual = currentYear()
  const out = []
  for (let y = actual + 1; y >= 2024; y--) out.push(y)
  return out
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function Rendicion() {
  const { municipioId } = useEffectiveMunicipioId()
  const { data: dependencias = [] } = useDependencias()
  const { data: partidasTipo = [] } = usePartidasTipo()
  const [tab, setTab] = useState('resumen')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Rendición de cuentas</h1>
        <p className="text-sm text-primary-400">
          Estado de ejecución presupuestaria — alineado con la rendición provincial (SARC).
        </p>
      </header>

      {!municipioId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No encontramos un municipio asignado ni un fallback activo.
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div>
        {tab === 'resumen' && <ResumenTab municipioId={municipioId} dependencias={dependencias} />}
        {tab === 'partida' && <PartidaTab municipioId={municipioId} dependencias={dependencias} partidasTipo={partidasTipo} />}
        {tab === 'export'  && <ExportTab  municipioId={municipioId} partidasTipo={partidasTipo} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Resumen
// ─────────────────────────────────────────────────────────────────

function estadoEjecucion(pct) {
  if (pct > 100) return { label: 'Excedido',  cls: 'badge-danger' }
  if (pct >= 90) return { label: 'Por vencer', cls: 'badge-accent' }
  return { label: 'En término', cls: 'badge-ok' }
}

function ProgressBar({ pct }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const bg = pct > 100 ? 'bg-danger' : pct >= 90 ? 'bg-accent' : 'bg-ok'
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-primary-50">
      <div className={`h-full ${bg}`} style={{ width: `${clamped}%` }} />
    </div>
  )
}

function ResumenTab({ municipioId, dependencias }) {
  const [anio, setAnio] = useState(currentYear())
  const opts = { municipioIdOverride: municipioId }
  const presQ = usePresupuestoPartidas(anio, opts)
  const { first: yearStart } = monthRange(`${anio}-01`)
  const { next: yearEnd }    = monthRange(`${anio}-12`)
  const gastosQ = useGastos(
    { fechaFrom: yearStart, fechaTo: yearEnd, estado: 'aprobado' },
    opts,
  )

  const rows = useMemo(() => {
    const presupuesto = presQ.data ?? []
    const gastos      = gastosQ.data ?? []
    const presPorDep  = new Map()
    const gastoPorDep = new Map()
    const nombrePorDep = new Map()

    for (const p of presupuesto) {
      const id = p.dependencia_id
      if (!id) continue
      presPorDep.set(id, (presPorDep.get(id) ?? 0) + Number(p.monto_asignado ?? 0))
      if (p.dependencia?.nombre) nombrePorDep.set(id, p.dependencia.nombre)
    }
    for (const g of gastos) {
      const id = g.dependencia_id
      if (!id) continue
      gastoPorDep.set(id, (gastoPorDep.get(id) ?? 0) + Number(g.monto ?? 0))
      if (g.dependencia?.nombre) nombrePorDep.set(id, g.dependencia.nombre)
    }

    const ids = new Set([...presPorDep.keys(), ...gastoPorDep.keys()])
    return Array.from(ids).map(id => {
      const presupuesto = presPorDep.get(id) ?? 0
      const ejecutado   = gastoPorDep.get(id) ?? 0
      const pct = presupuesto > 0
        ? Math.round((ejecutado / presupuesto) * 100)
        : (ejecutado > 0 ? 100 : 0)
      const nombre = nombrePorDep.get(id) ?? dependencias.find(d => d.id === id)?.nombre ?? '—'
      return { id, dependencia: nombre, presupuesto, ejecutado, pct }
    }).sort((a, b) => a.dependencia.localeCompare(b.dependencia))
  }, [presQ.data, gastosQ.data, dependencias])

  const totalPres = rows.reduce((s, r) => s + r.presupuesto, 0)
  const totalEjec = rows.reduce((s, r) => s + r.ejecutado, 0)
  const totalPct  = totalPres > 0 ? Math.round((totalEjec / totalPres) * 100) : 0
  const totalEstado = estadoEjecucion(totalPct)

  const isLoading = presQ.isLoading || gastosQ.isLoading

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Año"
          value={String(anio)}
          onChange={v => setAnio(Number(v))}
          options={aniosDisponibles().map(y => ({ value: String(y), label: String(y) }))}
          className="min-w-[140px]"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Presupuesto anual" value={fmtMoney.format(totalPres)} accent="primary" />
        <StatCard label="Ejecutado"          value={fmtMoney.format(totalEjec)} accent="accent" />
        <StatCard
          label={`Ejecución · ${totalPct}%`}
          value={totalEstado.label}
          accent={totalPct > 100 ? 'danger' : totalPct >= 90 ? 'accent' : 'ok'}
        />
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay datos de presupuesto ni gastos aprobados para {anio}.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Dependencia</Th>
              <Th className="text-right">Presupuesto</Th>
              <Th className="text-right">Ejecutado</Th>
              <Th className="min-w-[140px]">%</Th>
              <Th>Estado</Th>
            </Tr>
          </THead>
          <tbody>
            {rows.map(r => {
              const est = estadoEjecucion(r.pct)
              return (
                <Tr key={r.id}>
                  <Td className="font-medium text-primary">{r.dependencia}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoney.format(r.presupuesto)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoney.format(r.ejecutado)}</Td>
                  <Td>
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-primary-500">{r.pct}%</div>
                      <ProgressBar pct={r.pct} />
                    </div>
                  </Td>
                  <Td><span className={est.cls}>{est.label}</span></Td>
                </Tr>
              )
            })}
            <Tr className="bg-primary-50/60 font-bold">
              <Td className="font-bold text-primary">Total</Td>
              <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoney.format(totalPres)}</Td>
              <Td className="whitespace-nowrap text-right tabular-nums">{fmtMoney.format(totalEjec)}</Td>
              <Td>
                <div className="space-y-1">
                  <div className="text-xs font-medium text-primary-500">{totalPct}%</div>
                  <ProgressBar pct={totalPct} />
                </div>
              </Td>
              <Td><span className={totalEstado.cls}>{totalEstado.label}</span></Td>
            </Tr>
          </tbody>
        </Table>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Gastos por partida
// ─────────────────────────────────────────────────────────────────

function PartidaTab({ municipioId, dependencias }) {
  const [mes, setMes]                     = useState(currentMonthYYYYMM())
  const [dependenciaId, setDependenciaId] = useState('')

  const gastosQ = useGastos(
    {
      mes:           mes || undefined,
      dependenciaId: dependenciaId || undefined,
      estado:        'aprobado',
    },
    { municipioIdOverride: municipioId },
  )

  // Agrupamos por categoria (proxy de partida — el schema de gastos
  // no lleva partida_codigo). Cada grupo lleva su subtotal.
  const grupos = useMemo(() => {
    const list = gastosQ.data ?? []
    const map = new Map()
    for (const g of list) {
      const k = g.categoria ?? 'Sin categoría'
      if (!map.has(k)) map.set(k, { partida: k, items: [], subtotal: 0 })
      const g0 = map.get(k)
      g0.items.push(g)
      g0.subtotal += Number(g.monto ?? 0)
    }
    return Array.from(map.values()).sort((a, b) => a.partida.localeCompare(b.partida))
  }, [gastosQ.data])

  const totalGeneral = grupos.reduce((s, g) => s + g.subtotal, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Mes"
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="min-w-[160px]"
        />
        <Select
          label="Dependencia"
          value={dependenciaId}
          onChange={setDependenciaId}
          placeholder="Todas"
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
          className="min-w-[200px]"
        />
      </div>

      {gastosQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : grupos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay gastos aprobados en este período con los filtros aplicados.
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map(g => (
            <div key={g.partida} className="overflow-x-auto rounded-xl border border-border bg-white shadow-card">
              <header className="flex items-center justify-between gap-3 border-b border-border bg-primary-50 px-4 py-2.5">
                <div>
                  <h3 className="font-sora text-sm font-bold text-primary">{g.partida}</h3>
                  <p className="text-[11px] text-primary-400">
                    {g.items.length} gasto{g.items.length === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-semibold text-primary tabular-nums">
                  {fmtMoney.format(g.subtotal)}
                </span>
              </header>
              <table className="w-full text-left text-sm">
                <thead className="bg-primary-50/40 text-xs uppercase tracking-wide text-primary-500">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Dependencia</th>
                    <th className="px-4 py-2 font-semibold">Descripción</th>
                    <th className="px-4 py-2 text-right font-semibold">Monto</th>
                    <th className="px-4 py-2 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {g.items.map(it => (
                    <tr key={it.id}>
                      <td className="px-4 py-2 text-primary-700">{it.dependencia?.nombre ?? '—'}</td>
                      <td className="px-4 py-2 text-primary-700">{it.descripcion}</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums">
                        {fmtMoney.format(it.monto)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-primary-500">
                        {dateOf(it.fecha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div className="flex items-center justify-between rounded-md border border-border bg-primary-50 px-4 py-3 text-sm">
            <span className="font-medium text-primary-700">Total general</span>
            <span className="font-bold text-primary tabular-nums">{fmtMoney.format(totalGeneral)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Exportar
// ─────────────────────────────────────────────────────────────────

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[Rendicion] audit log:', e.message))
}

// Escapa una celda para CSV: comillas dobles + escapeo interno
// de comillas. Compatible con Excel y Google Sheets.
function csvCell(v) {
  if (v == null) return ''
  return `"${String(v).replace(/"/g, '""')}"`
}
function csvDownload(filename, headers, rows) {
  const lines = [headers, ...rows].map(r => r.map(csvCell).join(','))
  // BOM al inicio para que Excel detecte UTF-8 con acentos.
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ExportTab({ municipioId, partidasTipo }) {
  const [mes, setMes]   = useState(currentMonthYYYYMM())
  const [anio, setAnio] = useState(currentYear())

  const opts = { municipioIdOverride: municipioId }
  const gastosMesQ = useGastos({ mes, estado: 'aprobado' }, opts)
  const { first: yearStart } = monthRange(`${anio}-01`)
  const { next: yearEnd }    = monthRange(`${anio}-12`)
  const gastosAnioQ = useGastos(
    { fechaFrom: yearStart, fechaTo: yearEnd, estado: 'aprobado' },
    opts,
  )
  const presQ = usePresupuestoPartidas(anio, opts)

  const partidaNombre = useMemo(
    () => Object.fromEntries((partidasTipo ?? []).map(p => [p.codigo, p.nombre])),
    [partidasTipo],
  )

  function exportarMensual() {
    const items = gastosMesQ.data ?? []
    const headers = ['Fecha', 'Dependencia', 'Partida', 'Descripción', 'Monto', 'Estado', 'Comprobante']
    const rows = items.map(g => [
      g.fecha ? dateOf(g.fecha) : '',
      g.dependencia?.nombre ?? '',
      g.categoria ?? '',
      g.descripcion ?? '',
      Number(g.monto ?? 0).toFixed(2),
      g.estado ?? '',
      g.comprobante_url ?? '',
    ])
    csvDownload(`rendicion-${mes}-${todayArgYMD()}.csv`, headers, rows)
    logAudit({
      accion: 'export', entidad: 'gastos',
      descripcion: `Exportación CSV de rendición mensual ${mes} (${items.length} filas)`,
    })
  }

  function exportarAnual() {
    const presupuesto = presQ.data ?? []
    const gastos      = gastosAnioQ.data ?? []
    // Ejecutado por dependencia (no por partida — gastos no llevan
    // partida_codigo). Cada fila de presupuesto_partidas hereda el
    // ejecutado total de su dependencia, que es lo que se controla
    // en el resumen SARC.
    const ejecPorDep = new Map()
    for (const g of gastos) {
      ejecPorDep.set(g.dependencia_id, (ejecPorDep.get(g.dependencia_id) ?? 0) + Number(g.monto ?? 0))
    }
    const headers = ['Dependencia', 'Partida', 'Fuente', 'Asignado', 'Ejecutado', 'Disponible', '% Ejecución']
    const rows = presupuesto.map(p => {
      const asignado   = Number(p.monto_asignado ?? 0)
      const ejecutado  = ejecPorDep.get(p.dependencia_id) ?? 0
      const disponible = asignado - ejecutado
      const pct = asignado > 0 ? Math.round((ejecutado / asignado) * 100) : 0
      const partidaLabel = partidaNombre[p.partida_codigo]
        ? `${p.partida_codigo} — ${partidaNombre[p.partida_codigo]}`
        : (p.partida_codigo ?? '')
      return [
        p.dependencia?.nombre ?? '',
        partidaLabel,
        p.fuente ?? '',
        asignado.toFixed(2),
        ejecutado.toFixed(2),
        disponible.toFixed(2),
        `${pct}%`,
      ]
    })
    csvDownload(`presupuesto-${anio}-${todayArgYMD()}.csv`, headers, rows)
    logAudit({
      accion: 'export', entidad: 'presupuesto_partidas',
      descripcion: `Exportación CSV de presupuesto anual ${anio} (${rows.length} filas)`,
    })
  }

  const mensualVacio = (gastosMesQ.data ?? []).length === 0
  const anualVacio   = (presQ.data ?? []).length === 0

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card space-y-3 p-5">
          <header>
            <h3 className="font-sora text-base font-bold text-primary">Rendición mensual</h3>
            <p className="mt-0.5 text-sm text-primary-400">
              Gastos aprobados del período seleccionado.
            </p>
          </header>
          <Input
            label="Mes"
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
          />
          <p className="text-xs text-primary-500">
            {gastosMesQ.isLoading
              ? 'Cargando...'
              : `${(gastosMesQ.data ?? []).length} gasto${(gastosMesQ.data ?? []).length === 1 ? '' : 's'} a exportar`}
          </p>
          <Button
            onClick={exportarMensual}
            disabled={gastosMesQ.isLoading || mensualVacio}
          >
            Exportar Rendición Mensual (CSV)
          </Button>
        </div>

        <div className="card space-y-3 p-5">
          <header>
            <h3 className="font-sora text-base font-bold text-primary">Presupuesto anual</h3>
            <p className="mt-0.5 text-sm text-primary-400">
              Una fila por partida asignada, con ejecutado y % por dependencia.
            </p>
          </header>
          <Select
            label="Año"
            value={String(anio)}
            onChange={v => setAnio(Number(v))}
            options={aniosDisponibles().map(y => ({ value: String(y), label: String(y) }))}
          />
          <p className="text-xs text-primary-500">
            {presQ.isLoading || gastosAnioQ.isLoading
              ? 'Cargando...'
              : `${(presQ.data ?? []).length} partida${(presQ.data ?? []).length === 1 ? '' : 's'} a exportar`}
          </p>
          <Button
            onClick={exportarAnual}
            disabled={presQ.isLoading || gastosAnioQ.isLoading || anualVacio}
          >
            Exportar Presupuesto Anual (CSV)
          </Button>
        </div>
      </div>

      <section
        aria-labelledby="sarc-info"
        className="overflow-hidden rounded-xl border-2 border-accent bg-primary p-5 text-white shadow-card sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-6 w-6" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <h3 id="sarc-info" className="font-sora text-lg font-bold">
              Compatible con SARC
            </h3>
            <p className="mt-1 text-sm text-white/75">
              Los formatos exportados desde acá están alineados con el Sistema de
              Administración y Rendición de Cuentas (SARC) del{' '}
              <strong className="text-white">Tribunal de Cuentas de Santiago del Estero</strong>,
              que rige la rendición de las 137 comisiones municipales de la provincia.
            </p>
            <a
              href={SARC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              Ir al Tribunal de Cuentas
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
