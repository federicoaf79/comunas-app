import { useState, useMemo } from 'react'
import { useReclamos, useUpdateReclamoAdmin } from '../../hooks/useReclamos'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import Spinner from '../../components/ui/Spinner'

const ESTADO_BADGES = {
  pendiente:   { bg: 'bg-[#0F1C35]', text: 'text-white', ring: 'ring-[#0F1C35]/20', label: 'Pendiente' },
  en_proceso:  { bg: 'bg-[#1D4ED8]', text: 'text-white', ring: 'ring-blue-200', label: 'En proceso' },
  resuelto:    { bg: 'bg-[#1e40af]', text: 'text-white', ring: 'ring-blue-300', label: 'Resuelto' },
  abierto:     { bg: 'bg-[#0F1C35]', text: 'text-white', ring: 'ring-[#0F1C35]/20', label: 'Abierto' },
  cerrado:     { bg: 'bg-slate-500', text: 'text-white', ring: 'ring-slate-200', label: 'Cerrado' },
  rechazado:   { bg: 'bg-red-100', text: 'text-red-700', ring: 'ring-red-200', label: 'Rechazado' },
}

const TIPO_LABELS = {
  escombros:    'Escombros',
  ramas:        'Ramas y poda',
  restos_poda:  'Residuo de gran tamaño',
  otro:         'Otro',
}

function ReclamoDetalleModal({ reclamo, onClose, onUpdate, dependencias }) {
  const [form, setForm] = useState({
    estado: reclamo.estado,
    dependencia_asignada_id: reclamo.dependencia_asignada_id || '',
    notas_admin: reclamo.notas_admin || '',
  })
  const updateMut = useUpdateReclamoAdmin()

  async function handleSave() {
    try {
      await updateMut.mutateAsync({
        id: reclamo.id,
        estado: form.estado,
        dependencia_asignada_id: form.dependencia_asignada_id || null,
        notas_admin: form.notas_admin || null,
      })
      onUpdate()
      onClose()
    } catch (e) {
      alert('Error: ' + e.message)
    }
  }

  const badge = ESTADO_BADGES[reclamo.estado] || ESTADO_BADGES.pendiente
  const tipoLabel = TIPO_LABELS[reclamo.tipo] || reclamo.tipo

  const fechaFormateada = new Date(reclamo.created_at).toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const vecinoNombre = reclamo.vecino?.nombre_completo
    || (reclamo.vecino?.nombre && reclamo.vecino?.apellido ? `${reclamo.vecino.nombre} ${reclamo.vecino.apellido}` : null)
    || 'Anónimo'

  const inputCls = 'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/50 px-4 py-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-sora text-lg font-bold text-primary">Detalle del reclamo</h2>
          <button onClick={onClose} className="rounded-md p-1.5 text-primary-400 hover:bg-primary-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="grid gap-6 p-6 md:grid-cols-2">
          {/* Col 1: Info */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}>
                {badge.label}
              </span>
              <span className="text-xs text-primary-600 capitalize">{fechaFormateada}</span>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Vecino</p>
              <p className="mt-1 text-sm font-semibold text-primary">{vecinoNombre}</p>
              {reclamo.vecino?.telefono && <p className="text-xs text-primary-600">{reclamo.vecino.telefono}</p>}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Tipo</p>
              <p className="mt-1 text-sm font-semibold text-primary">{tipoLabel}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Dirección</p>
              <p className="mt-1 text-sm text-primary-700">{reclamo.ubicacion}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción</p>
              <p className="mt-1 text-sm text-primary-700 whitespace-pre-wrap">{reclamo.descripcion}</p>
            </div>

            {reclamo.fotos_urls && reclamo.fotos_urls.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary-500">Fotos</p>
                <div className="grid grid-cols-2 gap-2">
                  {reclamo.fotos_urls.map((url, idx) => (
                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                      <img src={url} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Col 2: Gestión */}
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Estado</label>
              <select value={form.estado} onChange={e => setForm(p => ({ ...p, estado: e.target.value }))} className={inputCls}>
                <option value="pendiente">Pendiente</option>
                <option value="en_proceso">En proceso</option>
                <option value="resuelto">Resuelto</option>
                <option value="cerrado">Cerrado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Asignar a dependencia</label>
              <select value={form.dependencia_asignada_id} onChange={e => setForm(p => ({ ...p, dependencia_asignada_id: e.target.value }))} className={inputCls}>
                <option value="">Sin asignar</option>
                {dependencias.map(d => (
                  <option key={d.id} value={d.id}>{d.nombre}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Notas internas</label>
              <textarea
                value={form.notas_admin}
                onChange={e => setForm(p => ({ ...p, notas_admin: e.target.value }))}
                placeholder="Notas visibles solo para administradores"
                rows={6}
                className={inputCls}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-border bg-white px-4 py-2.5 font-sora text-sm font-semibold text-primary hover:bg-primary-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={updateMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-4 py-2.5 font-sora text-sm font-semibold text-white hover:bg-[#1e40af] disabled:opacity-50"
              >
                {updateMut.isPending && <Spinner size="sm" />}
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Reclamos() {
  const { municipioId } = useEffectiveMunicipioId()
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const { data: reclamos = [], isLoading } = useReclamos({ estado: filtroEstado || undefined })
  const { data: dependencias = [] } = useDependencias(municipioId)
  const [reclamoSeleccionado, setReclamoSeleccionado] = useState(null)

  const reclamosFiltrados = useMemo(() => {
    let result = reclamos
    if (filtroTipo) result = result.filter(r => r.tipo === filtroTipo)
    return result
  }, [reclamos, filtroTipo])

  if (isLoading) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-sora text-xl font-bold text-primary">Reclamos comunitarios</h1>
        <p className="mt-1 text-sm text-primary-600">{reclamosFiltrados.length} reclamo{reclamosFiltrados.length === 1 ? '' : 's'}</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        >
          <option value="">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_proceso">En proceso</option>
          <option value="resuelto">Resuelto</option>
        </select>

        <select
          value={filtroTipo}
          onChange={e => setFiltroTipo(e.target.value)}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABELS).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {reclamosFiltrados.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-primary-400">No hay reclamos para mostrar</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reclamosFiltrados.map(r => {
            const badge = ESTADO_BADGES[r.estado] || ESTADO_BADGES.pendiente
            const tipoLabel = TIPO_LABELS[r.tipo] || r.tipo
            const vecinoNombre = r.vecino?.nombre_completo || r.vecino?.nombre || 'Anónimo'
            const primeraFoto = r.fotos_urls?.[0]
            const fechaFormateada = new Date(r.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })

            return (
              <button
                key={r.id}
                onClick={() => setReclamoSeleccionado(r)}
                className="w-full rounded-xl border border-border bg-white p-4 text-left shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex gap-4">
                  {primeraFoto ? (
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                      <img src={primeraFoto} alt="Foto" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-border bg-primary-50">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 text-primary-400">
                        <path strokeLinecap="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset ${badge.bg} ${badge.text} ${badge.ring}`}>
                        {badge.label}
                      </span>
                      <span className="text-xs text-primary-500">{fechaFormateada}</span>
                      <span className="text-xs text-primary-500">· {tipoLabel}</span>
                    </div>
                    <p className="mb-1 text-sm font-semibold text-primary">{vecinoNombre}</p>
                    <p className="mb-1 text-xs text-primary-600">{r.ubicacion}</p>
                    <p className="line-clamp-1 text-xs text-primary-500">{r.descripcion}</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {reclamoSeleccionado && (
        <ReclamoDetalleModal
          reclamo={reclamoSeleccionado}
          onClose={() => setReclamoSeleccionado(null)}
          onUpdate={() => {}}
          dependencias={dependencias.filter(d => d.activa)}
        />
      )}
    </div>
  )
}
