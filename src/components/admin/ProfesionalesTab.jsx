import { useState } from 'react'
import { useProfesionales, useUpsertProfesional, useDeleteProfesional, useProfesionalEnAgenda } from '../../hooks/useProfesionales'
import Spinner from '../ui/Spinner'

const ESPECIALIDADES = [
  { value: 'general',     label: 'Medicina general' },
  { value: 'obstetra',    label: 'Obstetricia' },
  { value: 'ecografia',   label: 'Ecografía' },
  { value: 'pediatria',   label: 'Pediatría' },
  { value: 'odontologia', label: 'Odontología' },
  { value: 'posta_rural', label: 'Posta sanitaria rural' },
  { value: 'otro',        label: 'Otro' },
]

const DIAS = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo']

const EMPTY = {
  nombre: '', especialidad: 'general', matricula: '',
  telefono: '', email: '',
  dias_atencion: [], hora_desde: '08:00', hora_hasta: '13:00',
  frecuencia_nota: '', activo: true,
}

function BadgeAgendaPublica({ profesionalId }) {
  const { data: enAgenda = false, isLoading } = useProfesionalEnAgenda(profesionalId)

  if (isLoading) return null

  if (enAgenda) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">
        📅 En agenda pública
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
      Sin publicar
    </span>
  )
}

function ProfesionalForm({ initial, municipioId, dependenciaId, onClose }) {
  const [form, setForm] = useState(initial ?? EMPTY)
  const upsert = useUpsertProfesional()
  const [error, setError] = useState('')

  function set(f, v) { setForm(p => ({ ...p, [f]: v })) }

  function toggleDia(dia) {
    setForm(p => ({
      ...p,
      dias_atencion: p.dias_atencion.includes(dia)
        ? p.dias_atencion.filter(d => d !== dia)
        : [...p.dias_atencion, dia]
    }))
  }

  async function handleSubmit() {
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    setError('')
    try {
      await upsert.mutateAsync({
        ...(initial?.id ? { id: initial.id } : { municipio_id: municipioId, dependencia_id: dependenciaId }),
        ...form,
      })
      onClose()
    } catch (e) { setError(e.message) }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Nombre completo *</label>
          <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)}
            placeholder="Dra. Laura Ramírez" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Especialidad</label>
          <select value={form.especialidad} onChange={e => set('especialidad', e.target.value)} className={inputCls}>
            {ESPECIALIDADES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Matrícula</label>
          <input type="text" value={form.matricula} onChange={e => set('matricula', e.target.value)}
            placeholder="MN 28471" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Teléfono</label>
          <input type="text" value={form.telefono} onChange={e => set('telefono', e.target.value)}
            placeholder="+54 9 385 XXX-XXXX" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            placeholder="dr@municipio.gob.ar" className={inputCls} />
        </div>
      </div>

      {/* Días de atención */}
      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-primary-500">Días de atención</label>
        <div className="flex flex-wrap gap-2">
          {DIAS.map(dia => (
            <button key={dia} type="button" onClick={() => toggleDia(dia)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all capitalize ${
                form.dias_atencion.includes(dia)
                  ? 'bg-[#1D4ED8] text-white'
                  : 'bg-primary-100 text-primary-500 hover:bg-primary-200'
              }`}>
              {dia}
            </button>
          ))}
        </div>
      </div>

      {/* Horario */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Desde</label>
          <input type="time" value={form.hora_desde} onChange={e => set('hora_desde', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">Hasta</label>
          <input type="time" value={form.hora_hasta} onChange={e => set('hora_hasta', e.target.value)} className={inputCls} />
        </div>
      </div>

      {/* Frecuencia nota */}
      <div>
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
          Nota de frecuencia (opcional)
        </label>
        <input type="text" value={form.frecuencia_nota} onChange={e => set('frecuencia_nota', e.target.value)}
          placeholder="Ej: 1er y 3er lunes de cada mes · Solo con turno previo"
          className={inputCls} />
        <p className="mt-1 text-[11px] text-primary-400">Texto libre visible en el portal para el vecino.</p>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="activo" checked={form.activo} onChange={e => set('activo', e.target.checked)}
          className="h-4 w-4 rounded border-border accent-primary" />
        <label htmlFor="activo" className="text-sm text-primary-700">Profesional activo</label>
      </div>

      {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="button" onClick={handleSubmit} disabled={upsert.isPending}
          className="btn-primary flex items-center gap-2 disabled:opacity-50">
          {upsert.isPending && <Spinner size="sm" />}
          {initial?.id ? 'Guardar cambios' : 'Agregar profesional'}
        </button>
      </div>
    </div>
  )
}

export default function ProfesionalesTab({ municipioId, dependenciaId }) {
  const { data: profesionales = [], isLoading } = useProfesionales(municipioId, dependenciaId)
  const deleteMut = useDeleteProfesional()
  const [modal, setModal] = useState(null) // null | 'new' | profesional

  const activos   = profesionales.filter(p => p.activo)
  const inactivos = profesionales.filter(p => !p.activo)

  function formatHorario(p) {
    if (!p.hora_desde && !p.hora_hasta) return null
    return `${p.hora_desde ?? ''} – ${p.hora_hasta ?? ''}`
  }

  function formatDias(dias) {
    if (!dias?.length) return null
    return dias.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(' · ')
  }

  if (isLoading) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-sora text-base font-bold text-primary">Profesionales</h3>
          <p className="mt-0.5 text-xs text-primary-500">
            {activos.length} activos · Los vecinos ven su horario en el portal ciudadano.
          </p>
        </div>
        <button type="button" onClick={() => setModal('new')} className="btn-primary text-sm flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
          Agregar profesional
        </button>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h3 className="font-sora font-semibold text-primary">
                {modal === 'new' ? 'Agregar profesional' : `Editar — ${modal.nombre}`}
              </h3>
              <button type="button" onClick={() => setModal(null)}
                className="rounded-md p-1.5 text-primary-400 hover:bg-primary-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <ProfesionalForm
                initial={modal === 'new' ? null : modal}
                municipioId={municipioId}
                dependenciaId={dependenciaId}
                onClose={() => setModal(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Lista activos */}
      {activos.length === 0 && inactivos.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-primary-400">No hay profesionales cargados todavía.</p>
          <button type="button" onClick={() => setModal('new')} className="btn-primary mt-4">
            Agregar el primero
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {activos.map(p => (
            <div key={p.id} className="card p-4 flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
                {p.nombre.split(' ').filter(w => /^[A-ZÁ-Ú]/.test(w)).slice(0,2).map(w=>w[0]).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-sora text-sm font-bold text-primary">{p.nombre}</p>
                  <BadgeAgendaPublica profesionalId={p.id} />
                </div>
                <p className="text-xs text-primary-500">
                  {ESPECIALIDADES.find(e => e.value === p.especialidad)?.label ?? p.especialidad}
                  {p.matricula ? ` · ${p.matricula}` : ''}
                </p>
                {formatDias(p.dias_atencion) && (
                  <p className="mt-1 text-xs text-primary-600">
                    📅 {formatDias(p.dias_atencion)}
                    {formatHorario(p) ? ` · ${formatHorario(p)}` : ''}
                  </p>
                )}
                {p.frecuencia_nota && (
                  <p className="mt-0.5 text-xs text-primary-400 italic">{p.frecuencia_nota}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button type="button" onClick={() => setModal(p)}
                  className="rounded-md p-1.5 text-primary-400 hover:bg-primary-50 hover:text-primary">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button type="button"
                  onClick={() => { if(confirm(`¿Eliminar a ${p.nombre}?`)) deleteMut.mutate(p.id) }}
                  className="rounded-md p-1.5 text-primary-400 hover:bg-red-50 hover:text-danger">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {inactivos.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-primary-400 hover:text-primary">
                {inactivos.length} profesional{inactivos.length > 1 ? 'es' : ''} inactivo{inactivos.length > 1 ? 's' : ''}
              </summary>
              <div className="mt-2 space-y-2 opacity-50">
                {inactivos.map(p => (
                  <div key={p.id} className="card p-3 flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-200 text-xs font-bold text-primary-500">
                      {p.nombre.split(' ').filter(w => /^[A-ZÁ-Ú]/.test(w)).slice(0,2).map(w=>w[0]).join('')}
                    </div>
                    <p className="text-sm text-primary-500">{p.nombre}</p>
                    <button type="button" onClick={() => setModal(p)} className="ml-auto text-xs text-primary-400 hover:text-primary">Editar</button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
