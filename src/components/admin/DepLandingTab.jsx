import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'

// Columnas propias de esta pantalla — a propósito NO se piden desde
// useDependencias() (hook compartido por el sidebar, el portal público
// y todos los módulos). landing_archivos/landing_tramites pueden ser
// blobs grandes que hoy nadie más necesita en cada carga de página.
// Esta pantalla consulta su propia fila, por id, con solo lo que usa.
const LANDING_COLS = 'id, nombre, tipo, landing_template, landing_hero_descripcion, descripcion_larga, horario_atencion, telefono, email_contacto, direccion, responsable, servicios, landing_tramites'

const LANDING_TEMPLATES = [
  { value: 'estandar',       label: 'Estándar',       desc: 'Hero + Servicios + Contacto + Mapa', icon: '📋' },
  { value: 'espacio_fisico', label: 'Espacio físico',  desc: 'Hero + Galería + Servicios + Contacto + Mapa', icon: '🏛️' },
  { value: 'administrativa', label: 'Administrativa',  desc: 'Hero + Trámites + Archivos + Contacto + Mapa', icon: '📁' },
]

export default function DepLandingTab({ dep }) {
  const depId = dep?.id
  const qc = useQueryClient()

  const landingQ = useQuery({
    queryKey: ['dependencia-landing-config', depId],
    queryFn: async () => {
      const { data, error } = await supabase.from('dependencias').select(LANDING_COLS).eq('id', depId).single()
      if (error) throw error
      return data
    },
    enabled: !!depId,
  })
  const depData = landingQ.data

  const [form, setForm] = useState({
    landing_template: 'estandar', landing_hero_descripcion: '', descripcion_larga: '',
    horario_atencion: '', telefono: '', email_contacto: '', direccion: '', responsable: '',
    servicios: '', landing_tramites: '',
  })
  // useDependencias() (fetchDependencias) no trae estas columnas, así
  // que `dep` nunca las tiene de entrada — el form se hidrata recién
  // cuando esta query propia resuelve.
  useEffect(() => {
    if (!depData) return
    setForm({
      landing_template:         depData.landing_template         ?? 'estandar',
      landing_hero_descripcion: depData.landing_hero_descripcion ?? '',
      descripcion_larga:        depData.descripcion_larga        ?? '',
      horario_atencion:         depData.horario_atencion         ?? '',
      telefono:                 depData.telefono                 ?? '',
      email_contacto:           depData.email_contacto           ?? '',
      direccion:                depData.direccion                ?? '',
      responsable:              depData.responsable              ?? '',
      servicios:                Array.isArray(depData.servicios) ? depData.servicios.join('\n') : '',
      landing_tramites:         Array.isArray(depData.landing_tramites) ? depData.landing_tramites.join('\n') : '',
    })
  }, [depData])

  const [saving, setSaving] = useState(false)
  const [ok, setOk]         = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setOk(false) }

  // Sin `depId` no hay a qué dependencia guardarle nada — mismo criterio
  // que DepBotIATab: mostrar el formulario igual dejaría escribir en
  // campos que nunca se van a persistir, sin ningún aviso.
  if (!depId) {
    return (
      <div className="card border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">No pudimos cargar la configuración de landing.</p>
        <p className="mt-1 text-xs text-red-600">
          Falta la dependencia para guardar esta configuración. Recargá la página o avisá a soporte
          antes de escribir acá — ningún cambio se va a guardar mientras esto no se resuelva.
        </p>
      </div>
    )
  }

  if (landingQ.isLoading) {
    return <div className="flex justify-center py-10"><Spinner size="lg" /></div>
  }

  if (landingQ.isError || !depData) {
    return (
      <div className="card border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">No pudimos cargar la configuración de landing.</p>
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
        landing_template:         form.landing_template,
        landing_hero_descripcion: form.landing_hero_descripcion || null,
        descripcion_larga:        form.descripcion_larga || null,
        horario_atencion:         form.horario_atencion || null,
        telefono:                 form.telefono || null,
        email_contacto:           form.email_contacto || null,
        direccion:                form.direccion || null,
        responsable:              form.responsable || null,
        servicios:                form.servicios.split('\n').map(s=>s.trim()).filter(Boolean),
        landing_tramites:         form.landing_tramites.split('\n').map(s=>s.trim()).filter(Boolean),
      }).eq('id', depId).select(LANDING_COLS)
      if (err) throw err
      if (!rows || rows.length === 0) {
        throw new Error('No se guardó: no encontramos la dependencia al confirmar el cambio.')
      }
      qc.setQueryData(['dependencia-landing-config', depId], rows[0])
      setOk(true)
    } catch(e) { setError(e.message || 'Error al guardar') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-5 pb-24">
      <div className="card p-5">
        <h3 className="mb-3 font-sora text-sm font-bold text-primary">Template de landing</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {LANDING_TEMPLATES.map(t => {
            const isActive = form.landing_template === t.value
            const isSaved  = depData.landing_template === t.value || (!depData.landing_template && t.value === 'estandar')
            return (
              <button key={t.value} type="button" onClick={() => set('landing_template', t.value)}
                className={`relative rounded-xl border-2 p-4 text-left transition-all ${isActive ? 'border-[#1D4ED8] bg-[#1D4ED8]/5' : 'border-border hover:border-primary-300'}`}>
                {isSaved && <span className="absolute top-2 right-2 rounded-full bg-[#C9A84C] px-2 py-0.5 text-[9px] font-bold uppercase text-primary-900">Activo</span>}
                {isActive && !isSaved && <span className="absolute top-2 right-2 rounded-full bg-[#1D4ED8] px-2 py-0.5 text-[9px] font-bold uppercase text-white">Seleccionado</span>}
                <span className="text-xl">{t.icon}</span>
                <p className="mt-1 font-sora text-xs font-bold text-primary">{t.label}</p>
                <p className="mt-0.5 text-[10px] text-primary-400">{t.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h3 className="font-sora text-sm font-bold text-primary">Información pública</h3>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción corta (hero)</label>
          <input type="text" value={form.landing_hero_descripcion} onChange={e => set('landing_hero_descripcion', e.target.value)} className={inputCls} placeholder="Descripción breve para el hero de la landing..." />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Descripción larga</label>
          <textarea rows={3} value={form.descripcion_larga} onChange={e => set('descripcion_larga', e.target.value)} className={inputCls} placeholder="Descripción completa..." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Horario</label><input type="text" value={form.horario_atencion} onChange={e => set('horario_atencion', e.target.value)} className={inputCls} placeholder="Lun a Vie · 8:00 – 13:00" /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Teléfono</label><input type="text" value={form.telefono} onChange={e => set('telefono', e.target.value)} className={inputCls} placeholder="+54 9 385 XXX-XXXX" /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Email</label><input type="email" value={form.email_contacto} onChange={e => set('email_contacto', e.target.value)} className={inputCls} placeholder="dep@municipio.gob.ar" /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Dirección</label><input type="text" value={form.direccion} onChange={e => set('direccion', e.target.value)} className={inputCls} placeholder="Av. San Martín s/n" /></div>
          <div><label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Responsable</label><input type="text" value={form.responsable} onChange={e => set('responsable', e.target.value)} className={inputCls} placeholder="Nombre del responsable" /></div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Servicios (uno por línea)</label>
          <textarea rows={4} value={form.servicios} onChange={e => set('servicios', e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder={"Servicio 1\nServicio 2"} />
        </div>
        {form.landing_template === 'administrativa' && (
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Trámites (uno por línea)</label>
            <textarea rows={4} value={form.landing_tramites} onChange={e => set('landing_tramites', e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder={"Trámite: requisitos\nOtro trámite: requisitos"} />
          </div>
        )}
      </div>

      <div className="card p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-primary">Vista pública</p>
          <p className="text-xs text-primary-500">Así ve el vecino esta dependencia en el portal</p>
        </div>
        <a href={`/portal/dependencia/${depData.tipo}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">Ver en portal →</a>
      </div>

      {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}
      {ok && <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">Landing guardada correctamente.</div>}
      <div className="flex justify-end">
        <button type="button" disabled={saving} onClick={handleGuardar} className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {saving && <Spinner size="sm" />}
          {saving ? 'Guardando...' : 'Guardar landing'}
        </button>
      </div>
    </div>
  )
}
