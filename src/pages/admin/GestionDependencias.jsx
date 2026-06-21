import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import Spinner from '../../components/ui/Spinner'

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
  const municipioId = useEffectiveMunicipioId()
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
    setDeps(prev => prev.map(d => d.id === id ? { ...d, [field]: value } : d))
    setSaving(prev => ({ ...prev, [id]: true }))
    setOk(prev => ({ ...prev, [id]: false }))
    await supabase.from('dependencias').update({ [field]: value }).eq('id', id)
    setSaving(prev => ({ ...prev, [id]: false }))
    setOk(prev => ({ ...prev, [id]: true }))
    setTimeout(() => setOk(prev => ({ ...prev, [id]: false })), 2000)
  }

  if (loading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Gestión de dependencias</h1>
        <p className="mt-1 text-sm text-primary-500">
          Activá o desactivá módulos por dependencia. Los cambios se aplican de inmediato.
        </p>
      </header>

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-card">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-primary-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-primary">Dependencia</th>
              <th className="px-4 py-3 text-center font-semibold text-primary">Activa</th>
              <th className="px-4 py-3 text-center font-semibold text-primary">Turnos</th>
              <th className="px-4 py-3 text-center font-semibold text-primary">ERP</th>
              <th className="px-4 py-3 text-center font-semibold text-primary">Bot IA</th>
              <th className="px-4 py-3 text-center font-semibold text-primary">Template landing</th>
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
