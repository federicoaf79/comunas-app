import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import Spinner from '../ui/Spinner'

const LANDING_TEMPLATES = [
  { value: 'estandar',       label: 'Estándar',       desc: 'Hero + Servicios + Contacto + Mapa', icon: '📋' },
  { value: 'espacio_fisico', label: 'Espacio físico',  desc: 'Hero + Galería + Servicios + Contacto + Mapa', icon: '🏛️' },
  { value: 'administrativa', label: 'Administrativa',  desc: 'Hero + Trámites + Archivos + Contacto + Mapa', icon: '📁' },
]

export default function DepLandingTab({ dep }) {
  const [form, setForm] = useState({
    landing_template:         dep?.landing_template         ?? 'estandar',
    landing_hero_descripcion: dep?.landing_hero_descripcion ?? '',
    descripcion_larga:        dep?.descripcion_larga        ?? '',
    horario_atencion:         dep?.horario_atencion         ?? '',
    telefono:                 dep?.telefono                 ?? '',
    email_contacto:           dep?.email_contacto           ?? '',
    direccion:                dep?.direccion                ?? '',
    responsable:              dep?.responsable              ?? '',
    servicios:                Array.isArray(dep?.servicios) ? dep.servicios.join('\n') : '',
    landing_tramites:         Array.isArray(dep?.landing_tramites) ? dep.landing_tramites.join('\n') : '',
  })
  const [saving, setSaving] = useState(false)
  const [ok, setOk]         = useState(false)
  const [error, setError]   = useState('')

  function set(field, value) { setForm(p => ({ ...p, [field]: value })); setOk(false) }

  async function handleGuardar() {
    if (!dep?.id) return
    setSaving(true); setError(''); setOk(false)
    try {
      const { error: err } = await supabase.from('dependencias').update({
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
      }).eq('id', dep.id)
      if (err) throw err
      setOk(true)
    } catch(e) { setError(e.message || 'Error al guardar') }
    finally { setSaving(false) }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="mb-3 font-sora text-sm font-bold text-primary">Template de landing</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {LANDING_TEMPLATES.map(t => {
            const isActive = form.landing_template === t.value
            const isSaved  = dep?.landing_template === t.value || (!dep?.landing_template && t.value === 'estandar')
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
        <a href={`/portal/dependencia/${dep?.tipo}`} target="_blank" rel="noopener noreferrer" className="btn-secondary text-xs">Ver en portal →</a>
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
