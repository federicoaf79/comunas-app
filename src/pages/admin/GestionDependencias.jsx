import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { createAuditLog } from '../../hooks/useAuditLog'
import Spinner from '../../components/ui/Spinner'

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[GestionDependencias] audit log:', e.message))
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[#1D4ED8]' : 'bg-primary-200'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

const TEMPLATE_OPTS = [
  { value: 'estandar',       label: 'Estándar' },
  { value: 'espacio_fisico', label: 'Espacio físico' },
  { value: 'administrativa', label: 'Administrativa' },
]

export default function GestionDependencias() {
  const { municipioId } = useEffectiveMunicipioId()
  const [deps, setDeps] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState({})
  const [ok, setOk] = useState({})

  useEffect(() => {
    if (!municipioId) return
    supabase
      .from('dependencias')
      .select('id, nombre, tipo, activa, modulo_turnos, modulo_erp, modulo_bot, landing_template')
      .eq('municipio_id', municipioId)
      .order('nombre')
      .then(({ data }) => {
        if (data) setDeps(data)
        setLoading(false)
      })
  }, [municipioId])

  async function updateField(id, field, value) {
    const dep = deps.find(d => d.id === id)
    setDeps(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
    setSaving(prev => ({ ...prev, [id]: true }))
    setOk(prev => ({ ...prev, [id]: false }))
    await supabase.from('dependencias').update({ [field]: value }).eq('id', id)
    setSaving(prev => ({ ...prev, [id]: false }))
    setOk(prev => ({ ...prev, [id]: true }))
    setTimeout(() => setOk(prev => ({ ...prev, [id]: false })), 2000)
    logAudit({
      accion: 'update', entidad: 'dependencias', entidadId: id,
      descripcion: `Dependencia "${dep?.nombre ?? id}" — ${field} → ${value}`,
    })
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Configuración de dependencias</h1>
        <p className="mt-1 text-sm text-primary-500">
          Activá o desactivá módulos por dependencia y definí el template de su página pública. Los cambios se aplican de inmediato.
        </p>
      </header>

      {/* Leyenda de templates */}
      <div className="rounded-xl border border-border bg-white p-4 text-sm">
        <p className="mb-2 font-semibold text-primary">¿Qué define el template de landing?</p>
        <p className="mb-3 text-xs text-primary-500">El template determina la estructura y secciones que se muestran en la página pública de cada dependencia en el portal ciudadano.</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-3">
            <p className="font-sora text-xs font-bold text-primary">📋 Estándar</p>
            <p className="mt-1 text-[11px] text-primary-500">Hero + lista de servicios + datos de contacto + mapa. Para la mayoría de dependencias administrativas.</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="font-sora text-xs font-bold text-primary">🏛️ Espacio físico</p>
            <p className="mt-1 text-[11px] text-primary-500">Hero + galería de fotos + servicios + contacto + mapa. Para dependencias con instalaciones físicas (cementerio, polideportivo, SUM).</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="font-sora text-xs font-bold text-primary">📁 Administrativa</p>
            <p className="mt-1 text-[11px] text-primary-500">Hero + trámites y requisitos + archivos descargables + contacto + mapa. Para oficinas con trámites formales (Juez de Paz, Registro Civil).</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-primary-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-primary">Dependencia</th>
              <th className="px-4 py-3 text-center font-semibold text-primary">
                <span title="Si está activa, la dependencia aparece en el portal ciudadano y en el sistema">Activa</span>
              </th>
              <th className="px-4 py-3 text-center font-semibold text-primary">
                <span title="Permite que los vecinos saquen turnos online para esta dependencia">Turnos</span>
              </th>
              <th className="px-4 py-3 text-center font-semibold text-primary">
                <span title="Habilita el módulo de administración: gastos, ingresos, solicitudes de compra">ERP / Admin</span>
              </th>
              <th className="px-4 py-3 text-center font-semibold text-primary">
                <span title="El bot de WhatsApp responderá preguntas sobre esta dependencia con su información específica">Bot IA</span>
              </th>
              <th className="px-4 py-3 text-center font-semibold text-primary">
                <span title="Define la estructura visual de la página pública de esta dependencia en el portal ciudadano">Template landing</span>
              </th>
              <th className="px-4 py-3 text-center font-semibold text-primary"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {deps.map(dep => (
              <tr key={dep.id} className="hover:bg-primary-50/40 transition-colors">
                <td className="px-4 py-3 font-medium text-primary">{dep.nombre}</td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={dep.activa ?? false}
                    onChange={v => updateField(dep.id, 'activa', v)}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={dep.modulo_turnos ?? false}
                    onChange={v => updateField(dep.id, 'modulo_turnos', v)}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={dep.modulo_erp ?? false}
                    onChange={v => updateField(dep.id, 'modulo_erp', v)}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <Toggle
                    checked={dep.modulo_bot ?? false}
                    onChange={v => updateField(dep.id, 'modulo_bot', v)}
                  />
                </td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={dep.landing_template ?? 'estandar'}
                    onChange={e => updateField(dep.id, 'landing_template', e.target.value)}
                    className="rounded-md border border-border bg-white px-2 py-1 text-xs text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {TEMPLATE_OPTS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-center w-8">
                  {saving[dep.id] && <Spinner size="sm" />}
                  {ok[dep.id] && (
                    <span className="text-[#1D4ED8] font-bold text-xs">✓</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
