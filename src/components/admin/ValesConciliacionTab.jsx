import { useMemo, useState } from 'react'
import { useValesConciliacion } from '../../hooks/useVales'
import { useProveedores } from '../../hooks/useProveedores'
import { createAuditLog } from '../../hooks/useAuditLog'
import Select from '../ui/Select'
import Input from '../ui/Input'
import Spinner from '../ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../ui/Table'
import { dateTimeOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// ValesConciliacionTab — Vales Electrónicos, Fase 4 parte 1.
//
// Reporte de conciliación: lo que cada comercio usa para cobrarle a
// la comuna. Solo vales 'canjeado' (lo demás no es plata que se deba
// todavía). Agrupado por comercio, con los totales SIEMPRE separados:
// un total en $ (solo vales con monto) + un total por cada unidad
// distinta (solo vales con cantidad+unidad) -- nunca fusionados,
// porque monto y cantidad+unidad son mutuamente excluyentes
// (chk_vales_monto_o_cantidad) y sumarlos juntos no significa nada.
// =============================================================

// Primer y último día del mes actual, en días de Argentina (no el
// TZ del navegador) -- mismo criterio que el resto del módulo Vales
// para "hoy"/"mes actual".
function mesActualDefault() {
  const hoy = todayArgYMD() // 'YYYY-MM-DD'
  const [y, m] = hoy.split('-').map(Number)
  const desde = `${y}-${String(m).padStart(2, '0')}-01`
  const ultimoDia = new Date(y, m, 0).getDate()
  const hasta = `${y}-${String(m).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`
  return { desde, hasta }
}

function detalleVale(v) {
  if (v.monto != null) return `$${Number(v.monto).toLocaleString('es-AR')}`
  if (v.cantidad != null) return `${v.cantidad} ${v.unidad ?? ''}`.trim()
  return '—'
}

function agruparPorComercio(vales) {
  const grupos = new Map()
  for (const v of vales) {
    const key = v.proveedor_id ?? '__SIN_PROVEEDOR__'
    if (!grupos.has(key)) {
      grupos.set(key, { proveedorId: v.proveedor_id, nombre: v.proveedor?.nombre ?? '—', vales: [] })
    }
    grupos.get(key).vales.push(v)
  }
  return [...grupos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
}

// Totales de un comercio: un número en $ + N líneas por unidad
// (agrupadas case-insensitive para que "kg" y "Kg" no se separen).
function totalesComercio(vales) {
  let totalMonto = 0
  let huboMonto = false
  const porUnidad = new Map()
  for (const v of vales) {
    if (v.monto != null) {
      huboMonto = true
      totalMonto += Number(v.monto)
    } else if (v.cantidad != null) {
      const label = (v.unidad ?? '').trim() || '(sin unidad)'
      const key = label.toLowerCase()
      const prev = porUnidad.get(key)
      if (prev) prev.total += Number(v.cantidad)
      else porUnidad.set(key, { label, total: Number(v.cantidad) })
    }
  }
  return {
    totalMonto, huboMonto,
    porUnidad: [...porUnidad.values()].sort((a, b) => a.label.localeCompare(b.label)),
  }
}

// Copia local del patrón de exportarCSV (BOM UTF-8 para Excel) --
// ya usado igual en Administracion.jsx/Auditoria.jsx/Patrimonio.jsx,
// sin una función central real.
function exportarCSV(datos, nombreArchivo, columnas) {
  const headers = columnas.map(c => c.label).join(',')
  const filas = datos.map(row =>
    columnas.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(','),
  )
  const csv = [headers, ...filas].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombreArchivo}-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// Auditoría best-effort: nunca bloquea la exportación si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[ValesConciliacionTab] audit log:', e.message))
}

export default function ValesConciliacionTab() {
  const [{ desde: fechaDesde, hasta: fechaHasta }, setRango] = useState(mesActualDefault)
  const [proveedorId, setProveedorId] = useState('')

  const proveedoresQ = useProveedores()
  const proveedorOpts = useMemo(
    () => (proveedoresQ.data ?? [])
      .map(p => ({ value: p.id, label: p.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [proveedoresQ.data],
  )

  const valesQ = useValesConciliacion({ proveedorId, fechaDesde, fechaHasta })
  const vales = valesQ.data ?? []
  const grupos = useMemo(() => agruparPorComercio(vales), [vales])

  function handleExportar() {
    const filas = vales.map(v => ({
      comercio:      v.proveedor?.nombre ?? '—',
      fecha:         dateTimeOf(v.canjeado_en),
      codigo:        v.codigo,
      vecino:        v.vecino?.nombre_completo ?? '—',
      dni:           v.vecino?.dni ?? '—',
      descripcion:   v.descripcion ?? '',
      monto:         v.monto != null ? v.monto : '',
      cantidad:      v.cantidad != null ? v.cantidad : '',
      unidad:        v.unidad ?? '',
      canjeado_por:  v.canjeador?.nombre_completo ?? '—',
    }))
    exportarCSV(filas, 'vales-conciliacion', [
      { label: 'Comercio',      key: 'comercio' },
      { label: 'Fecha',         key: 'fecha' },
      { label: 'Código',        key: 'codigo' },
      { label: 'Vecino',        key: 'vecino' },
      { label: 'DNI',           key: 'dni' },
      { label: 'Descripción',   key: 'descripcion' },
      { label: 'Monto',         key: 'monto' },
      { label: 'Cantidad',      key: 'cantidad' },
      { label: 'Unidad',        key: 'unidad' },
      { label: 'Canjeado por',  key: 'canjeado_por' },
    ])
    logAudit({
      accion: 'export', entidad: 'vales',
      descripcion: `Exportación CSV de conciliación de vales (${filas.length} filas, ${fechaDesde} a ${fechaHasta})`,
    })
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="card flex flex-wrap items-end gap-4 p-4">
        <Input
          label="Desde"
          type="date"
          value={fechaDesde}
          onChange={e => setRango(r => ({ ...r, desde: e.target.value }))}
        />
        <Input
          label="Hasta"
          type="date"
          value={fechaHasta}
          onChange={e => setRango(r => ({ ...r, hasta: e.target.value }))}
        />
        <div className="min-w-[220px]">
          <Select
            label="Comercio"
            value={proveedorId}
            onChange={setProveedorId}
            options={proveedorOpts}
            placeholder="Todos los comercios"
          />
        </div>
        <button
          type="button"
          onClick={handleExportar}
          disabled={vales.length === 0}
          className="ml-auto inline-flex items-center gap-2 rounded-lg border-2 border-primary bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          Exportar CSV
        </button>
      </div>

      {valesQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : valesQ.error ? (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar el reporte: {valesQ.error.message}
        </div>
      ) : grupos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay vales canjeados en el rango seleccionado.
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map(g => {
            const { totalMonto, huboMonto, porUnidad } = totalesComercio(g.vales)
            return (
              <div key={g.proveedorId ?? g.nombre} className="card overflow-hidden p-0">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#F5F4EF] px-5 py-3">
                  <h3 className="font-sora text-base font-bold text-primary">{g.nombre}</h3>
                  {/* Totales SIEMPRE en líneas separadas -- nunca un solo
                      número fusionado, porque monto y cantidad+unidad son
                      magnitudes distintas (constraint chk_vales_monto_o_cantidad). */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    {huboMonto && (
                      <span className="font-semibold text-primary">
                        Total: ${totalMonto.toLocaleString('es-AR')}
                      </span>
                    )}
                    {porUnidad.map(u => (
                      <span key={u.label} className="font-semibold text-primary">
                        Total: {u.total.toLocaleString('es-AR')} {u.label}
                      </span>
                    ))}
                  </div>
                </div>
                <Table>
                  <THead>
                    <Tr>
                      <Th>Fecha</Th>
                      <Th>Código</Th>
                      <Th>Vecino</Th>
                      <Th>Descripción</Th>
                      <Th>Importe</Th>
                      <Th>Canjeado por</Th>
                    </Tr>
                  </THead>
                  <tbody>
                    {g.vales.map(v => (
                      <Tr key={v.id}>
                        <Td className="whitespace-nowrap text-xs text-primary-400">{dateTimeOf(v.canjeado_en)}</Td>
                        <Td className="font-mono text-xs font-medium text-primary">{v.codigo}</Td>
                        <Td>
                          <p className="font-medium text-primary">{v.vecino?.nombre_completo ?? '—'}</p>
                          <p className="text-xs text-primary-400">DNI {v.vecino?.dni ?? '—'}</p>
                        </Td>
                        <Td className="text-primary-500">{v.descripcion || '—'}</Td>
                        <Td className="text-primary-500">{detalleVale(v)}</Td>
                        <Td className="text-primary-500">{v.canjeador?.nombre_completo ?? '—'}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
