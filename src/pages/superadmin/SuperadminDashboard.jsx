import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../../components/ui/Spinner'

// ─── Status de servicios externos ────────────────────────────────
const SERVICES = [
  { id: 'supabase', label: 'Supabase',    url: 'https://status.supabase.com/api/v2/summary.json',       color: '#3ECF8E' },
  { id: 'vercel',   label: 'Vercel',      url: 'https://www.vercel-status.com/api/v2/summary.json',     color: '#000000' },
  { id: 'github',   label: 'GitHub',      url: 'https://www.githubstatus.com/api/v2/summary.json',      color: '#24292F' },
]

const INDICATOR_LABEL = {
  none:     { text: 'Operacional',     cls: 'text-[#1D4ED8]',   dot: 'bg-[#1D4ED8]' },
  minor:    { text: 'Degradado',       cls: 'text-[#C9A84C]',   dot: 'bg-[#C9A84C]' },
  major:    { text: 'Falla parcial',   cls: 'text-danger',      dot: 'bg-danger' },
  critical: { text: 'Falla crítica',   cls: 'text-danger',      dot: 'bg-danger' },
  unknown:  { text: 'Desconocido',     cls: 'text-primary-400', dot: 'bg-primary-300' },
}

function useServiceStatus() {
  const [statuses, setStatuses] = useState({})
  const [loading, setLoading] = useState(true)

  async function fetchAll() {
    setLoading(true)
    const results = await Promise.allSettled(
      SERVICES.map(async (svc) => {
        const res = await fetch(svc.url, { signal: AbortSignal.timeout(5000) })
        const data = await res.json()
        return { id: svc.id, indicator: data.status?.indicator ?? 'unknown', description: data.status?.description ?? '' }
      })
    )
    const map = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        map[r.value.id] = r.value
      } else {
        map[SERVICES[i].id] = { id: SERVICES[i].id, indicator: 'unknown', description: 'Sin respuesta' }
      }
    })
    setStatuses(map)
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])
  return { statuses, loading, refetch: fetchAll }
}

function useGlobalMetrics() {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      try {
        const [
          { count: municipios },
          { count: usuarios },
          { count: turnos },
          { count: mensajes },
        ] = await Promise.all([
          supabase.from('municipios').select('id', { count: 'exact', head: true }),
          supabase.from('usuarios').select('id', { count: 'exact', head: true }),
          supabase.from('turnos').select('id', { count: 'exact', head: true }),
          supabase.from('mensajes_whatsapp').select('id', { count: 'exact', head: true }),
        ])
        setMetrics({ municipios, usuarios, turnos, mensajes })
      } catch (e) {
        console.warn('metrics error', e.message)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  return { metrics, loading }
}

function useTenantMetrics() {
  const [tenants, setTenants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      try {
        const { data: munis } = await supabase
          .from('municipios')
          .select('id, nombre, activo')
          .order('nombre')

        if (!munis?.length) { setLoading(false); return }

        const results = await Promise.all(
          munis.map(async (m) => {
            const [
              { count: vecinos },
              { count: turnos },
              { count: mensajes },
              { count: usuarios },
            ] = await Promise.all([
              supabase.from('vecinos').select('id', { count: 'exact', head: true }).eq('municipio_id', m.id),
              supabase.from('turnos').select('id', { count: 'exact', head: true }).eq('municipio_id', m.id),
              supabase.from('mensajes_whatsapp').select('id', { count: 'exact', head: true }).eq('municipio_id', m.id),
              supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('municipio_id', m.id),
            ])
            return { ...m, vecinos: vecinos ?? 0, turnos: turnos ?? 0, mensajes: mensajes ?? 0, usuarios: usuarios ?? 0 }
          })
        )
        setTenants(results)
      } catch (e) {
        console.warn('tenant metrics error', e.message)
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [])

  return { tenants, loading }
}

export default function SuperadminDashboard() {
  const { statuses, loading: svcLoading, refetch } = useServiceStatus()
  const { metrics, loading: metricsLoading } = useGlobalMetrics()
  const { tenants, loading: tenantsLoading } = useTenantMetrics()
  const [lastCheck, setLastCheck] = useState(new Date())

  function handleRefresh() {
    refetch()
    setLastCheck(new Date())
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Panel SuperAdmin</h1>
          <p className="mt-1 text-sm text-primary-500">Estado global de la plataforma Comunas.lat</p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="btn-secondary flex items-center gap-2 text-xs"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-6.7M20 15a9 9 0 01-15 6.7" />
          </svg>
          Actualizar · {lastCheck.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </button>
      </header>

      {/* ── Métricas globales ── */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: 'Municipios activos', value: metrics?.municipios },
          { label: 'Usuarios totales',   value: metrics?.usuarios },
          { label: 'Turnos registrados', value: metrics?.turnos },
          { label: 'Mensajes WhatsApp',  value: metrics?.mensajes },
        ].map(m => (
          <div key={m.label} className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">{m.label}</p>
            <p className="mt-1 font-sora text-3xl font-bold text-primary">
              {metricsLoading ? <Spinner size="sm" /> : (m.value?.toLocaleString('es-AR') ?? '—')}
            </p>
          </div>
        ))}
      </div>

      {/* ── Estado de servicios ── */}
      <div className="card p-5">
        <h2 className="mb-4 font-sora text-sm font-bold text-primary">Estado de servicios</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {SERVICES.map(svc => {
            const s = statuses[svc.id]
            const ind = INDICATOR_LABEL[s?.indicator ?? 'unknown']
            return (
              <div key={svc.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <div className={`h-2.5 w-2.5 rounded-full shrink-0 ${svcLoading ? 'bg-primary-200 animate-pulse' : ind.dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-primary">{svc.label}</p>
                  <p className={`text-xs ${ind.cls}`}>{svcLoading ? 'Verificando…' : ind.text}</p>
                </div>
                <a href={svc.url.replace('/api/v2/summary.json', '')} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-[11px] text-primary-400 hover:text-primary">
                  Ver →
                </a>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Métricas por tenant ── */}
      <div className="card overflow-hidden p-0">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="font-sora text-sm font-bold text-primary">Métricas por municipio</h2>
          <span className="text-xs text-primary-400">{tenants.length} municipios</span>
        </div>
        {tenantsLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : tenants.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-primary-400">Sin municipios registrados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-primary-50">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-primary">Municipio</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-primary">Estado</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-primary">Vecinos</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-primary">Turnos</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-primary">Mensajes WA</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-primary">Usuarios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {tenants.map(t => (
                  <tr key={t.id} className="hover:bg-primary-50/40 transition-colors">
                    <td className="px-5 py-3 font-medium text-primary">{t.nombre}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        t.activo ? 'bg-[#1D4ED8]/10 text-[#1D4ED8]' : 'bg-primary-100 text-primary-400'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${t.activo ? 'bg-[#1D4ED8]' : 'bg-primary-300'}`} />
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-primary">{t.vecinos.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-primary">{t.turnos.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-primary">{t.mensajes.toLocaleString('es-AR')}</td>
                    <td className="px-4 py-3 text-center text-primary">{t.usuarios.toLocaleString('es-AR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
