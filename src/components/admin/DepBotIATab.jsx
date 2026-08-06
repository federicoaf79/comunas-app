import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'

// Columnas propias de esta pantalla — a propósito NO se piden desde
// useDependencias() (hook compartido por el sidebar, el portal público
// y todos los módulos). Sumarle bot_restricciones ahí lo mandaría al
// front anónimo, y cargar estas columnas en cada carga de página para
// TODAS las dependencias del municipio es peso que nadie más necesita.
// Esta pantalla consulta su propia fila, por id, con solo lo que usa.
const BOT_COLS = 'id, nombre, municipio_id, bot_descripcion, bot_faq, bot_restricciones'

export default function DepBotIATab({ dep }) {
  const depId = dep?.id
  const qc = useQueryClient()

  const botQ = useQuery({
    queryKey: ['dependencia-bot-config', depId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dependencias').select(BOT_COLS).eq('id', depId).single()
      if (error) throw error
      return data
    },
    enabled: !!depId,
  })
  const depData = botQ.data

  const [form, setForm] = useState({ bot_descripcion: '', bot_faq: '', bot_restricciones: '' })
  // useDependencias() (fetchDependencias) no trae estas columnas, así
  // que `dep` nunca las tiene de entrada — el form se hidrata recién
  // cuando esta query propia resuelve.
  useEffect(() => {
    if (!depData) return
    setForm({
      bot_descripcion:   depData.bot_descripcion   ?? '',
      bot_faq:           depData.bot_faq           ?? '',
      bot_restricciones: depData.bot_restricciones ?? '',
    })
  }, [depData])

  const [saving, setSaving]   = useState(false)
  const [ok, setOk]           = useState(false)
  const [error, setError]     = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncOk, setSyncOk]   = useState(false)

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setOk(false) }

  // Sin `depId` no hay a qué dependencia guardarle nada — mostrar el
  // formulario igual (con handleGuardar cortando en silencio si se
  // aprieta "Guardar") deja escribir en campos que nunca se van a
  // persistir, sin ningún aviso. Mismo criterio que ProfesionalesTab:
  // "no pude cargar" tiene que verse distinto de "esto ya está vacío".
  if (!depId) {
    return (
      <div className="card border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">No pudimos cargar la configuración del bot.</p>
        <p className="mt-1 text-xs text-red-600">
          Falta la dependencia para guardar esta configuración. Recargá la página o avisá a soporte
          antes de escribir acá — ningún cambio se va a guardar mientras esto no se resuelva.
        </p>
      </div>
    )
  }

  if (botQ.isLoading) {
    return <div className="flex justify-center py-10"><Spinner size="lg" /></div>
  }

  if (botQ.isError || !depData) {
    return (
      <div className="card border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">No pudimos cargar la configuración del bot.</p>
        <p className="mt-1 text-xs text-red-600">
          Hubo un error consultando la base. Recargá la página antes de escribir acá — ningún cambio
          se va a guardar mientras esto no se resuelva.
        </p>
      </div>
    )
  }

  async function handleGuardar() {
    setSaving(true); setError(''); setOk(false)
    try {
      // .select() al final del update: un 204 sin filas no distingue
      // "guardó" de "no encontró la fila" — con .select(), si vuelve
      // vacío sabemos que no escribió nada y lo decimos, en vez de
      // mostrar "guardado" sin haber confirmado nada.
      const { data: rows, error: err } = await supabase.from('dependencias').update({
        bot_descripcion:   form.bot_descripcion   || null,
        bot_faq:           form.bot_faq           || null,
        bot_restricciones: form.bot_restricciones || null,
      }).eq('id', depId).select(BOT_COLS)
      if (err) throw err
      if (!rows || rows.length === 0) {
        throw new Error('No se guardó: no encontramos la dependencia al confirmar el cambio.')
      }
      qc.setQueryData(['dependencia-bot-config', depId], rows[0])
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
        body: JSON.stringify({ municipio_id: depData.municipio_id }),
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
            <p className="mt-0.5 text-xs text-primary-500">El bot de WhatsApp usa esta información para responder sobre {depData.nombre}.</p>
          </div>
          <button type="button" onClick={handleSync} disabled={syncing} className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50">
            {syncing ? <Spinner size="sm" /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-6.7M20 15a9 9 0 01-15 6.7"/></svg>}
            {syncOk ? '✓ Sincronizado' : 'Sincronizar con bot'}
          </button>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción para el bot</label>
          <textarea rows={3} value={form.bot_descripcion} onChange={e => set('bot_descripcion', e.target.value)} className={inputCls} placeholder={`Descripción de ${depData.nombre} para el bot...`} />
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
