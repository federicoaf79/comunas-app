import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  useFuentesRssAdmin, useUpsertFuentesRss,
} from '../../hooks/useConfigPortal'
import {
  useAutoridadesAdmin, useCreateAutoridad,
  useUpdateAutoridad, useDeleteAutoridad,
} from '../../hooks/useAutoridades'
import {
  useHistoriaMunicipioAdmin, useUpdateHistoria, uploadFotoHistoria,
} from '../../hooks/useHistoriaMunicipio'
import {
  useDependenciasAdmin, useUpdateDependenciaPublica, uploadFotoDependencia,
} from '../../hooks/useDependenciaPublica'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependenciaByTipo } from '../../hooks/useTurnos'
import { useAuth } from '../../context/AuthContext'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import FuenteRssFormModal from '../../components/admin/FuenteRssFormModal'
import AutoridadFormModal from '../../components/admin/AutoridadFormModal'
import AdministracionTab from '../../components/admin/AdministracionTab'

// =============================================================
// Configuración del portal — CMS del Portal Ciudadano.
//
// La página no renderiza una barra de tabs interna: navega entre
// sub-secciones leyendo el ?tab= que pone el sidebar
// (AdminLayout NavGroup "Portal Web").
//
// Secciones (?tab= → interno):
//   sin ?tab / 'rss'   → 'rss'           Fuentes RSS
//   'autoridades'      → 'autoridades'   CRUD autoridades
//   'historia'         → 'historia'      Historia del municipio
//   'dependencias'     → 'dependencias'  UPDATE campos públicos
//   'admin'            → 'administracion' Tab financiero
// =============================================================

const SECCION_LABEL = {
  rss:            'Fuentes RSS',
  autoridades:    'Autoridades',
  historia:       'Historia',
  dependencias:   'Dependencias',
  administracion: 'Administración',
}
const SECCIONES_VALIDAS = new Set(Object.keys(SECCION_LABEL))

// ─────────────────────────────────────────────────────────────────
// TAB 1 · Fuentes RSS
// ─────────────────────────────────────────────────────────────────

function FuenteRow({ fuente, onToggle, onEdit, onDelete, busy }) {
  const palabras = (fuente.palabras_clave ?? []).filter(Boolean)
  return (
    <li className="card flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={fuente.active ? 'badge-ok' : 'badge-neutral'}>
            {fuente.active ? 'Activa' : 'Inactiva'}
          </span>
          <p className="font-sora text-base font-semibold text-primary">
            {fuente.label}
          </p>
        </div>
        <p className="mt-1 truncate text-xs text-primary-400 sm:text-sm">
          {fuente.url}
        </p>
        {palabras.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {palabras.map(k => (
              <span
                key={k}
                className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[11px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button onClick={() => onToggle(fuente)} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
          {fuente.active ? 'Desactivar' : 'Activar'}
        </button>
        <button onClick={() => onEdit(fuente)} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">
          Editar
        </button>
        <button onClick={() => onDelete(fuente)} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50 hover:text-danger">
          Eliminar
        </button>
      </div>
    </li>
  )
}

function TabFuentesRss({ sinMunicipio }) {
  const { data: fuentes = [], isLoading, error } = useFuentesRssAdmin()
  const upsertMut = useUpsertFuentesRss()
  const [editing, setEditing]     = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [saveError, setSaveError] = useState('')

  function openNew()        { setEditing(null);   setSaveError(''); setModalOpen(true) }
  function openEdit(fuente) { setEditing(fuente); setSaveError(''); setModalOpen(true) }

  async function persist(next) {
    setSaveError('')
    try { await upsertMut.mutateAsync(next) }
    catch (e) { setSaveError(e?.message ?? 'No pudimos guardar los cambios.'); throw e }
  }

  async function handleToggle(fuente) {
    const next = fuentes.map(f => f.key === fuente.key ? { ...f, active: !f.active } : f)
    try { await persist(next) } catch { /* error visible en banner */ }
  }
  async function handleDelete(fuente) {
    if (!confirm(`¿Eliminar la fuente "${fuente.label}"?`)) return
    const next = fuentes.filter(f => f.key !== fuente.key)
    try { await persist(next) } catch { /* error visible en banner */ }
  }
  async function handleSave(formFuente) {
    let next
    if (editing) {
      next = fuentes.map(f => f.key === editing.key ? { ...formFuente } : f)
    } else {
      const exists = fuentes.some(f => f.key === formFuente.key)
      const final  = exists ? { ...formFuente, key: `${formFuente.key}-${Date.now()}` } : formFuente
      next = [...fuentes, final]
    }
    try { await persist(next); setModalOpen(false); setEditing(null) }
    catch { /* error visible en banner */ }
  }

  const activas   = fuentes.filter(f => f.active)
  const inactivas = fuentes.filter(f => !f.active)

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Noticias externas</h2>
          <p className="text-sm text-primary-500">
            Fuentes RSS que alimentan la sección "Noticias de Argentina" del
            portal público. {activas.length} activa{activas.length === 1 ? '' : 's'}
            {inactivas.length > 0 && ` · ${inactivas.length} inactiva${inactivas.length === 1 ? '' : 's'}`}.
          </p>
        </div>
        <Button onClick={openNew} disabled={sinMunicipio || upsertMut.isPending}>
          + Agregar fuente
        </Button>
      </header>

      {saveError && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {saveError}
        </div>
      )}
      {error && !isLoading && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          No pudimos cargar la configuración. {error.message}
        </div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : fuentes.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          Todavía no hay fuentes configuradas. Agregá la primera con <strong>+ Agregar fuente</strong>.
        </div>
      ) : (
        <ul className="space-y-3">
          {fuentes.map(f => (
            <FuenteRow
              key={f.key}
              fuente={f}
              onToggle={handleToggle}
              onEdit={openEdit}
              onDelete={handleDelete}
              busy={upsertMut.isPending}
            />
          ))}
        </ul>
      )}

      <FuenteRssFormModal
        key={editing?.key ?? 'new'}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        fuente={editing}
        saving={upsertMut.isPending}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Autoridades
// ─────────────────────────────────────────────────────────────────

function initialsFor(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function TabAutoridades({ municipioId, sinMunicipio }) {
  const { data: autoridades = [], isLoading } = useAutoridadesAdmin({ municipioIdOverride: municipioId })
  const createMut = useCreateAutoridad({ municipioIdOverride: municipioId })
  const updateMut = useUpdateAutoridad()
  const deleteMut = useDeleteAutoridad()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState(null)
  const [error, setError]         = useState('')

  function openNew()       { setEditing(null);  setError(''); setModalOpen(true) }
  function openEdit(a)     { setEditing(a);     setError(''); setModalOpen(true) }

  async function handleSave(form) {
    setError('')
    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, ...form })
      } else {
        await createMut.mutateAsync(form)
      }
      setModalOpen(false); setEditing(null)
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la autoridad.')
    }
  }

  async function handleDelete(a) {
    if (!confirm(`¿Eliminar a "${a.nombre}" del listado?`)) return
    setError('')
    try { await deleteMut.mutateAsync(a.id) }
    catch (e) { setError(e?.message ?? 'No pudimos eliminar.') }
  }

  // Mover ↑/↓ — intercambia el `orden` con el vecino. Si dos filas
  // comparten orden las consideramos en el orden actual del array.
  async function move(a, dir) {
    const sorted = [...autoridades].sort((x, y) => (x.orden ?? 0) - (y.orden ?? 0))
    const idx = sorted.findIndex(x => x.id === a.id)
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    const aOrden = a.orden ?? 0
    const oOrden = other.orden ?? 0
    const newA = aOrden === oOrden ? oOrden + dir : oOrden
    const newO = aOrden === oOrden ? aOrden     : aOrden
    setError('')
    try {
      await Promise.all([
        updateMut.mutateAsync({ id: a.id, orden: newA }),
        updateMut.mutateAsync({ id: other.id, orden: newO }),
      ])
    } catch (e) {
      setError(e?.message ?? 'No pudimos reordenar.')
    }
  }

  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-primary">Autoridades del municipio</h2>
          <p className="text-sm text-primary-500">
            Listado que se muestra en el bloque "Autoridades de la Comisión Municipal" del portal.
          </p>
        </div>
        <Button onClick={openNew} disabled={sinMunicipio || busy}>
          + Agregar autoridad
        </Button>
      </header>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : autoridades.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          Todavía no hay autoridades cargadas. Agregá la primera con <strong>+ Agregar autoridad</strong>.
        </div>
      ) : (
        <ul className="space-y-3">
          {autoridades.map((a, idx) => (
            <li key={a.id} className="card flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
              <div className="flex min-w-0 flex-1 items-center gap-4">
                {a.foto_url ? (
                  <img src={a.foto_url} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-accent/60" loading="lazy" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white ring-2 ring-accent/60">
                    {initialsFor(a.nombre)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={a.activo ? 'badge-ok' : 'badge-neutral'}>
                      {a.activo ? 'Visible' : 'Oculto'}
                    </span>
                    <p className="font-sora text-base font-semibold text-primary">{a.nombre}</p>
                  </div>
                  <p className="text-xs font-semibold text-accent-700">{a.cargo}</p>
                  <p className="text-xs text-primary-400">Orden: {a.orden ?? 0}</p>
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button onClick={() => move(a, -1)} disabled={busy || idx === 0} aria-label="Subir" className="btn-ghost px-2 py-1.5 text-xs">↑</button>
                <button onClick={() => move(a, +1)} disabled={busy || idx === autoridades.length - 1} aria-label="Bajar" className="btn-ghost px-2 py-1.5 text-xs">↓</button>
                <button onClick={() => openEdit(a)} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs">Editar</button>
                <button onClick={() => handleDelete(a)} disabled={busy} className="btn-ghost px-3 py-1.5 text-xs text-danger hover:bg-red-50 hover:text-danger">Eliminar</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AutoridadFormModal
        key={editing?.id ?? 'new'}
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        autoridad={editing}
        municipioId={municipioId}
        saving={createMut.isPending || updateMut.isPending}
      />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Historia
// ─────────────────────────────────────────────────────────────────

const HISTORIA_EMPTY = {
  fundacion: '',
  resena: '',
  importancia_regional: '',
  recursos_naturales: '',
  fotos: [],
}

function TabHistoria({ municipioId, sinMunicipio }) {
  const { data: persisted, isLoading } = useHistoriaMunicipioAdmin({ municipioIdOverride: municipioId })
  const updateMut = useUpdateHistoria({ municipioIdOverride: municipioId })

  const [form, setForm]       = useState(HISTORIA_EMPTY)
  const [error, setError]     = useState('')
  const [okMsg, setOkMsg]     = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  // Hidratamos el form cuando llega la query del backend.
  useEffect(() => {
    if (!persisted) return
    setForm({ ...HISTORIA_EMPTY, ...persisted })
  }, [persisted])

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const fotos = Array.isArray(form.fotos) ? form.fotos : []
  const maxAlcanzado = fotos.length >= 5

  async function handleFiles(e) {
    setError('')
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    const restantes = Math.max(0, 5 - fotos.length)
    const aSubir = files.slice(0, restantes)
    if (files.length > restantes) {
      setError('Solo se permiten hasta 5 fotos. Las restantes se ignoraron.')
    }
    setUploading(true)
    try {
      const urls = []
      for (const f of aSubir) {
        if (!/^image\//.test(f.type)) continue
        const url = await uploadFotoHistoria({ file: f, municipioId })
        urls.push(url)
      }
      set('fotos', [...fotos, ...urls])
    } catch (e2) {
      setError(e2?.message ?? 'No pudimos subir alguna foto.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function removeFoto(idx) {
    set('fotos', fotos.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setError(''); setOkMsg('')
    try {
      const fundacion = form.fundacion === '' ? null : Number(form.fundacion)
      await updateMut.mutateAsync({
        fundacion,
        resena: form.resena || '',
        importancia_regional: form.importancia_regional || '',
        recursos_naturales: form.recursos_naturales || '',
        fotos,
      })
      setOkMsg('Historia guardada correctamente.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la historia.')
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-bold text-primary">Historia del municipio</h2>
        <p className="text-sm text-primary-500">
          Contenido que se muestra en la sección "Nuestra historia" del portal.
          Las fotos se suben al bucket <strong>noticias</strong> dentro de la carpeta de tu municipio.
        </p>
      </header>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : (
        <div className="card space-y-4 p-5 sm:p-6">
          <Input
            label="Año de fundación"
            type="number"
            value={form.fundacion ?? ''}
            onChange={e => set('fundacion', e.target.value)}
            placeholder="Ej: 1952"
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary-700">Reseña histórica</label>
            <textarea
              value={form.resena}
              onChange={e => set('resena', e.target.value)}
              rows={6}
              className="input-field resize-y"
              placeholder="Contá cómo se fundó la comunidad, hitos importantes, familias pioneras…"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary-700">Importancia regional</label>
            <textarea
              value={form.importancia_regional}
              onChange={e => set('importancia_regional', e.target.value)}
              rows={4}
              className="input-field resize-y"
              placeholder="Qué papel cumple la comunidad en la región / departamento."
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-primary-700">Recursos naturales</label>
            <textarea
              value={form.recursos_naturales}
              onChange={e => set('recursos_naturales', e.target.value)}
              rows={4}
              className="input-field resize-y"
              placeholder="Ríos, cerros, suelos productivos, biodiversidad."
            />
          </div>

          <div>
            <p className="mb-1.5 text-sm font-medium text-primary-700">
              Fotos ({fotos.length}/5)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFiles}
              disabled={maxAlcanzado || uploading || sinMunicipio}
              className="block w-full text-sm text-primary-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-600 disabled:opacity-50"
            />
            {uploading && (
              <div className="mt-2 flex items-center gap-2 text-xs text-primary-500">
                <Spinner size="sm" /> Subiendo fotos…
              </div>
            )}
            {fotos.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {fotos.map((url, idx) => (
                  <div key={url + idx} className="group relative overflow-hidden rounded-lg border border-border">
                    <img src={url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                    <button
                      type="button"
                      onClick={() => removeFoto(idx)}
                      aria-label="Quitar foto"
                      className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-900/80 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                        <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
          )}
          {okMsg && (
            <div className="rounded-md border border-primary-100 bg-primary-50 p-3 text-sm text-primary-700">{okMsg}</div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSave} loading={updateMut.isPending} disabled={sinMunicipio || uploading}>
              Guardar historia
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 4 · Dependencias
// ─────────────────────────────────────────────────────────────────

const CANAL_OPTIONS = [
  { value: 'presencial', label: 'Presencial' },
  { value: 'online',     label: 'Online' },
  { value: 'mixto',      label: 'Mixto' },
]

const DEP_EMPTY = {
  descripcion_larga: '',
  servicios: [],
  fotos: [],
  canal_atencion: '',
  email_contacto: '',
  whatsapp: '',
}

function TabDependencias({ municipioId, sinMunicipio }) {
  const { data: deps = [], isLoading } = useDependenciasAdmin({ municipioIdOverride: municipioId })
  const updateMut = useUpdateDependenciaPublica()
  const [selectedId, setSelectedId] = useState('')
  const [form, setForm]   = useState(DEP_EMPTY)
  const [error, setError] = useState('')
  const [okMsg, setOkMsg] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

  const dep = deps.find(d => d.id === selectedId) ?? null

  // Sincronizamos el form al cambiar de dependencia o cuando llega
  // el listado y todavía no hay selección.
  useEffect(() => {
    if (!selectedId && deps.length > 0) {
      const first = deps.find(d => d.activo !== false) ?? deps[0]
      setSelectedId(first.id)
      return
    }
    if (dep) {
      setForm({
        descripcion_larga: dep.descripcion_larga ?? '',
        servicios:         Array.isArray(dep.servicios) ? dep.servicios : [],
        fotos:             Array.isArray(dep.fotos) ? dep.fotos : [],
        canal_atencion:    dep.canal_atencion ?? '',
        email_contacto:    dep.email_contacto ?? '',
        whatsapp:          dep.whatsapp ?? '',
      })
      setOkMsg(''); setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, deps.length])

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  function addTag() {
    const v = tagInput.trim()
    if (!v) return
    if (form.servicios.includes(v)) { setTagInput(''); return }
    set('servicios', [...form.servicios, v])
    setTagInput('')
  }
  function removeTag(tag) {
    set('servicios', form.servicios.filter(t => t !== tag))
  }

  async function handleFiles(e) {
    setError('')
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !dep) return
    const restantes = Math.max(0, 4 - form.fotos.length)
    const aSubir = files.slice(0, restantes)
    if (files.length > restantes) {
      setError('Solo se permiten hasta 4 fotos por dependencia. Las restantes se ignoraron.')
    }
    setUploading(true)
    try {
      const urls = []
      for (const f of aSubir) {
        if (!/^image\//.test(f.type)) continue
        const url = await uploadFotoDependencia({ file: f, municipioId, tipo: dep.tipo })
        urls.push(url)
      }
      set('fotos', [...form.fotos, ...urls])
    } catch (e2) {
      setError(e2?.message ?? 'No pudimos subir alguna foto.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }
  function removeFoto(idx) {
    set('fotos', form.fotos.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setError(''); setOkMsg('')
    if (!dep) return
    try {
      await updateMut.mutateAsync({
        id: dep.id,
        descripcion_larga: form.descripcion_larga || null,
        servicios:         form.servicios,
        fotos:             form.fotos,
        canal_atencion:    form.canal_atencion || null,
        email_contacto:    form.email_contacto || null,
        whatsapp:          (form.whatsapp ?? '').replace(/[^0-9]/g, '') || null,
      })
      setOkMsg('Cambios guardados correctamente.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la dependencia.')
    }
  }

  const depOptions = deps.map(d => ({
    value: d.id,
    label: `${d.nombre}${d.activo === false ? ' (inactiva)' : ''}`,
  }))

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-lg font-bold text-primary">Dependencias municipales</h2>
        <p className="text-sm text-primary-500">
          Información pública que cada dependencia muestra en su página de detalle
          (<code className="rounded bg-primary-50 px-1 py-0.5 text-[11px]">/portal/dependencia/:tipo</code>).
        </p>
      </header>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : deps.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          Tu municipio no tiene dependencias cargadas todavía.
        </div>
      ) : (
        <>
          <div className="card p-5 sm:p-6">
            <Select
              label="Dependencia a editar"
              value={selectedId}
              onChange={setSelectedId}
              options={depOptions}
              placeholder="Elegí una dependencia…"
            />
          </div>

          {dep && (
            <div className="card space-y-4 p-5 sm:p-6">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-primary-700">Descripción larga</label>
                <textarea
                  value={form.descripcion_larga}
                  onChange={e => set('descripcion_larga', e.target.value)}
                  rows={5}
                  className="input-field resize-y"
                  placeholder="Texto que aparece como bajada en la página de la dependencia."
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-primary-700">
                  Servicios que ofrece
                </label>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-white p-2">
                  {form.servicios.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1 text-xs font-semibold text-accent-700 ring-1 ring-inset ring-accent-100 hover:bg-accent-100"
                    >
                      {tag}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-3 w-3">
                        <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                      </svg>
                    </button>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); addTag() }
                      if (e.key === 'Backspace' && !tagInput && form.servicios.length > 0) {
                        removeTag(form.servicios[form.servicios.length - 1])
                      }
                    }}
                    onBlur={addTag}
                    placeholder="Escribí un servicio y apretá Enter…"
                    className="min-w-[160px] flex-1 border-0 bg-transparent px-1 py-1 text-sm text-primary outline-none focus:ring-0"
                  />
                </div>
                <p className="mt-1 text-xs text-primary-400">
                  Clic en un tag para eliminarlo.
                </p>
              </div>

              <div>
                <p className="mb-1.5 text-sm font-medium text-primary-700">
                  Fotos del lugar ({form.fotos.length}/4)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFiles}
                  disabled={form.fotos.length >= 4 || uploading || sinMunicipio}
                  className="block w-full text-sm text-primary-700 file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-600 disabled:opacity-50"
                />
                {uploading && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-primary-500">
                    <Spinner size="sm" /> Subiendo fotos…
                  </div>
                )}
                {form.fotos.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {form.fotos.map((url, idx) => (
                      <div key={url + idx} className="group relative overflow-hidden rounded-lg border border-border">
                        <img src={url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removeFoto(idx)}
                          aria-label="Quitar foto"
                          className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-900/80 text-white opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4">
                            <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Select
                  label="Canal de atención"
                  value={form.canal_atencion}
                  onChange={v => set('canal_atencion', v)}
                  options={CANAL_OPTIONS}
                  placeholder="Sin definir"
                />
                <Input
                  label="WhatsApp (solo número)"
                  value={form.whatsapp}
                  onChange={e => set('whatsapp', e.target.value)}
                  placeholder="3854110001"
                  inputMode="numeric"
                />
              </div>
              <Input
                label="Email de contacto"
                type="email"
                value={form.email_contacto}
                onChange={e => set('email_contacto', e.target.value)}
                placeholder="dependencia@municipio.gob.ar"
              />

              {error && (
                <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
              )}
              {okMsg && (
                <div className="rounded-md border border-primary-100 bg-primary-50 p-3 text-sm text-primary-700">{okMsg}</div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSave} loading={updateMut.isPending} disabled={sinMunicipio || uploading}>
                  Guardar dependencia
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal — tabs container
// ─────────────────────────────────────────────────────────────────

export default function ConfigPortal() {
  const { perfil, hasRole } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  const sinMunicipio = !municipioId
  const canApprove   = hasRole(['admin_comuna', 'superadmin'])
  const canCreate    = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])

  // Dependencia que representa al Portal Web en la tabla
  // dependencias. Si el municipio no la tiene creada, el tab
  // Administración muestra el empty state estándar — no rompe.
  const { data: depPortal = null } = useDependenciaByTipo('portal')

  // Lectura del ?tab= desde URL. Aliases:
  //   'admin' → 'administracion'
  //   sin ?tab → 'rss'
  // Si el valor no está en SECCIONES_VALIDAS, cae a 'rss'.
  const [searchParams] = useSearchParams()
  const tabParam = searchParams.get('tab') || ''
  const seccion  = tabParam === 'admin'
    ? 'administracion'
    : (SECCIONES_VALIDAS.has(tabParam) ? tabParam : 'rss')

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Configuración del portal</h1>
        <p className="mt-1 text-sm text-primary-500">
          <span className="text-primary-400">Portal Web</span>
          <span className="mx-1.5 text-primary-300">›</span>
          <span className="font-medium text-primary-700">{SECCION_LABEL[seccion] ?? '—'}</span>
        </p>
      </header>

      {sinMunicipio && !perfil?.roles?.includes('superadmin') && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          Tu usuario no tiene un municipio asignado, así que no podés guardar cambios.
          Pedile al administrador que lo configure.
        </div>
      )}

      {seccion === 'rss'            && <TabFuentesRss sinMunicipio={sinMunicipio} />}
      {seccion === 'autoridades'    && <TabAutoridades municipioId={municipioId} sinMunicipio={sinMunicipio} />}
      {seccion === 'historia'       && <TabHistoria   municipioId={municipioId} sinMunicipio={sinMunicipio} />}
      {seccion === 'dependencias'   && <TabDependencias municipioId={municipioId} sinMunicipio={sinMunicipio} />}
      {seccion === 'administracion' && (
        <AdministracionTab
          dependenciaId={depPortal?.id ?? null}
          dependenciaNombre={depPortal?.nombre ?? 'Portal Web'}
          municipioId={municipioId}
          canApprove={canApprove}
          canCreate={canCreate}
        />
      )}
    </div>
  )
}
