import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'

export default function DepBotIATab({ dep }) {
  const [form, setForm] = useState({
    bot_descripcion:   dep?.bot_descripcion   ?? '',
    bot_faq:           dep?.bot_faq           ?? '',
    bot_restricciones: dep?.bot_restricciones ?? '',
  })
  const [saving, setSaving]   = useState(false)
  const [ok, setOk]           = useState(false)
  const [error, setError]     = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncOk, setSyncOk]   = useState(false)

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setOk(false) }

  async function handleGuardar() {
    if (!dep?.id) return
    setSaving(true); setError(''); setOk(false)
    try {
      const { error: err } = await supabase.from('dependencias').update({
        bot_descripcion:   form.bot_descripcion   || null,
        bot_faq:           form.bot_faq           || null,
        bot_restricciones: form.bot_restricciones || null,
      }).eq('id', dep.id)
      if (err) throw err
      setOk(true)
    } catch(e) { setError(e.message || 'Error al guardar') }
    finally { setSaving(false) }
  }

  async function handleSync() {
    setSyncing(true); setSyncOk(false)
    try {
      const res = await fetch('/api/sync-planb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': 'comunas-sync-2026' },
      })
      if (!res.ok) throw new Error('Error al sincronizar')
      setSyncOk(true)
      setTimeout(() => setSyncOk(false), 3000)
    } catch(e) { setError(e.message) }
    finally { setSyncing(false) }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-sora text-sm font-bold text-primary">Configuración del Bot IA</h3>
            <p className="mt-0.5 text-xs text-primary-500">El bot de WhatsApp usa esta información para responder sobre {dep?.nombre}.</p>
          </div>
          <button type="button" onClick={handleSync} disabled={syncing} className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50">
            {syncing ? <Spinner size="sm" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-6.7M20 15a9 9 0 01-15 6.7"/></svg>}
            {syncOk ? '✓ Sincronizado' : 'Sincronizar con bot'}
          </button>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción para el bot</label>
          <textarea rows={3} value={form.bot_descripcion} onChange={e => set('bot_descripcion', e.target.value)} className={inputCls} placeholder={`Descripción de ${dep?.nombre} para el bot...`} />
          <p className="mt-1 text-[11px] text-primary-400">El bot usa esto para presentar la dependencia a los vecinos.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Preguntas frecuentes (FAQ)</label>
          <textarea rows={6} value={form.bot_faq} onChange={e => set('bot_faq', e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder={"**¿Cuándo atienden?** Lunes a viernes 8-13hs\n**¿Necesito turno?** Sí, pedilo por este chat"} />
          <p className="mt-1 text-[11px] text-primary-400">Formato: **Pregunta** Respuesta. Una por línea.</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Restricciones del bot</label>
          <textarea rows={3} value={form.bot_restricciones} onChange={e => set('bot_restricciones', e.target.value)} className={inputCls} placeholder="Ej: No dar información sobre precios." />
          <p className="mt-1 text-[11px] text-primary-400">Qué NO debe responder el bot sobre esta dependencia.</p>
        </div>
        {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}
        {ok && <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">Configuración guardada.</div>}
        <div className="flex justify-end">
          <button type="button" disabled={saving} onClick={handleGuardar} className="btn-primary flex items-center gap-2 disabled:opacity-50">
            {saving && <Spinner size="sm" />}
            {saving ? 'Guardando...' : 'Guardar configuración bot'}
          </button>
        </div>
      </div>
    </div>
  )
}
