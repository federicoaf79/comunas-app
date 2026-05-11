import { useRef, useState } from 'react'
import {
  useConfigClaveAdmin, useUpsertConfigClave,
} from '../../hooks/useConfigPortal'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import Spinner from '../../components/ui/Spinner'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

// =============================================================
// /admin/config-general — settings institucionales del portal.
//
// 3 secciones independientes que comparten estructura: leen su
// clave de configuracion_portal, mantienen estado local del form,
// y guardan con upsert al hacer click en Guardar.
//
//   redes_sociales  → Facebook / Instagram / WhatsApp / Twitter / YouTube
//   datos_municipio → Nombre / dirección / teléfono / email / horario
//   planb_config    → toggle ON/OFF + número + mensaje + apiKey + apiUrl
//
// Cada sección se separa en un wrapper que muestra el spinner
// mientras carga y un Form interno que se monta SOLO cuando la
// data persistida ya está disponible — así el `useState` inicial
// del form arranca con los valores correctos sin necesidad de
// useEffect → setState (anti-pattern flagged por eslint).
// =============================================================

const DEFAULT_REDES = {
  facebook:  '',
  instagram: '',
  whatsapp:  '',
  twitter:   '',
  youtube:   '',
}

const DEFAULT_DATOS = {
  nombre_oficial: '',
  direccion:      '',
  telefono:       '',
  email:          '',
  horario:        '',
}

const DEFAULT_PLANB = {
  enabled:           false,
  numero:            '',
  mensaje_bienvenida: '',
  api_key:           '',
  api_url:           'https://plan-b.lat/api/v1',
}

function SectionShell({ title, desc, children, error, ok }) {
  return (
    <section className="card p-5 sm:p-6">
      <header className="mb-4">
        <h2 className="text-lg font-bold text-primary">{title}</h2>
        {desc && <p className="mt-1 text-sm text-primary-500">{desc}</p>}
      </header>
      {error && (
        <div className="mb-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {error}
        </div>
      )}
      {ok && (
        <div className="mb-4 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">
          {ok}
        </div>
      )}
      {children}
    </section>
  )
}

function LoadingShell({ title }) {
  return (
    <section className="card flex items-center justify-center p-12">
      <div className="text-center">
        <Spinner />
        <p className="mt-2 text-sm text-primary-400">{title}</p>
      </div>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección 1 — Redes Sociales
// ─────────────────────────────────────────────────────────────────

function RedesSocialesForm({ initial, disabled, municipioId }) {
  const upsertMut = useUpsertConfigClave('redes_sociales', { municipioIdOverride: municipioId })
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [ok, setOk]       = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function handleSave() {
    setError(''); setOk('')
    try {
      await upsertMut.mutateAsync(form)
      setOk('Redes guardadas.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar las redes.')
    }
  }

  return (
    <SectionShell
      title="Redes sociales"
      desc="Links a las redes oficiales del municipio. Aparecen en el footer del portal público."
      error={error}
      ok={ok}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Facebook URL"
          value={form.facebook}
          onChange={e => set('facebook', e.target.value)}
          placeholder="https://facebook.com/..."
          type="url"
        />
        <Input
          label="Instagram URL"
          value={form.instagram}
          onChange={e => set('instagram', e.target.value)}
          placeholder="https://instagram.com/..."
          type="url"
        />
        <Input
          label="WhatsApp"
          value={form.whatsapp}
          onChange={e => set('whatsapp', e.target.value)}
          placeholder="+54 9 3854 110001"
          inputMode="tel"
        />
        <Input
          label="Twitter / X URL (opcional)"
          value={form.twitter}
          onChange={e => set('twitter', e.target.value)}
          placeholder="https://x.com/..."
          type="url"
        />
        <Input
          label="YouTube URL (opcional)"
          value={form.youtube}
          onChange={e => set('youtube', e.target.value)}
          placeholder="https://youtube.com/..."
          type="url"
        />
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={handleSave} loading={upsertMut.isPending} disabled={disabled}>
          Guardar redes
        </Button>
      </div>
    </SectionShell>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección 0 — Identidad visual (logo)
// ─────────────────────────────────────────────────────────────────

const DEFAULT_IDENTIDAD = { logo_url: '', favicon_url: '' }

// Sube el archivo al bucket 'avatares' con path
// `<municipioId>/logo_oficial`. upsert=true para que la misma ruta
// se sobreescriba en cada upload (no acumulamos archivos). Devuelve
// la URL pública con cache-buster — sin él, el browser conserva el
// PNG anterior porque la URL no cambia entre uploads.
async function uploadLogoToStorage({ file, municipioId }) {
  if (!municipioId) throw new Error('Tu usuario no tiene un municipio asignado.')
  const path = `${municipioId}/logo_oficial`
  const { error } = await supabase.storage
    .from('avatares')
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert:      true,
    })
  if (error) {
    console.error('[IdentidadVisual] upload error:', error)
    throw new Error(error.message ?? 'No pudimos subir el logo.')
  }
  const { data } = supabase.storage.from('avatares').getPublicUrl(path)
  return `${data.publicUrl}?v=${Date.now()}`
}

function IdentidadVisualForm({ initial, disabled, municipioId }) {
  const upsertMut = useUpsertConfigClave('identidad_visual', { municipioIdOverride: municipioId })
  const [logoUrl, setLogoUrl] = useState(initial?.logo_url ?? '')
  const [file, setFile]       = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState('')
  const [ok, setOk]                 = useState('')
  const inputRef = useRef(null)

  function onPickFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(''); setOk('')
    // Liberamos el URL del preview anterior antes de crear uno nuevo
    // para no leakear blobs en cada selección.
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(f)
    setPreviewUrl(URL.createObjectURL(f))
  }

  async function handleUpload() {
    if (!file) {
      inputRef.current?.click()
      return
    }
    setError(''); setOk(''); setUploading(true)
    try {
      const url = await uploadLogoToStorage({ file, municipioId })
      await upsertMut.mutateAsync({
        ...DEFAULT_IDENTIDAD,
        ...(initial ?? {}),
        logo_url: url,
      })
      setLogoUrl(url)
      setFile(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl('')
      setOk('Logo actualizado. Va a aparecer en el portal, header del sistema y página de ingreso.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos subir el logo.')
    } finally {
      setUploading(false)
    }
  }

  const mostrado = previewUrl || logoUrl

  return (
    <SectionShell
      title="Identidad visual"
      desc="Logo institucional del municipio. Se usa en el portal ciudadano, el sistema de gestión y los documentos generados."
      error={error}
      ok={ok}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Preview circular 120px */}
        <div className="flex shrink-0 flex-col items-center gap-2">
          <div className="flex h-[120px] w-[120px] items-center justify-center overflow-hidden rounded-full border-2 border-accent bg-primary-50 shadow-inner">
            {mostrado ? (
              <img
                src={mostrado}
                alt="Logo del municipio"
                className="h-full w-full object-cover"
              />
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-12 w-12 text-primary-300" aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="9" cy="9" r="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 15l-5-5L5 21" />
              </svg>
            )}
          </div>
          {previewUrl && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700">
              Sin guardar
            </span>
          )}
        </div>

        {/* Controles */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,image/svg+xml"
            onChange={onPickFile}
            disabled={disabled || uploading}
            className="block w-full text-sm text-primary-700 file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-primary-700 disabled:opacity-50"
          />
          <p className="text-xs text-primary-400">
            PNG o SVG. Mínimo 200×200px. Se usa en el portal, documentos y encabezados.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={handleUpload}
              loading={uploading || upsertMut.isPending}
              disabled={disabled || (!file && !!logoUrl) || uploading}
            >
              {file ? 'Subir logo' : 'Elegir archivo'}
            </Button>
            {logoUrl && !file && (
              <a
                href={logoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-accent hover:underline"
              >
                Ver archivo actual →
              </a>
            )}
          </div>
        </div>
      </div>
    </SectionShell>
  )
}

function IdentidadVisualSection({ disabled, municipioId }) {
  const { data, isLoading } = useConfigClaveAdmin(
    'identidad_visual', DEFAULT_IDENTIDAD, { municipioIdOverride: municipioId },
  )
  if (isLoading) return <LoadingShell title="Cargando identidad visual..." />
  return <IdentidadVisualForm initial={data ?? DEFAULT_IDENTIDAD} disabled={disabled} municipioId={municipioId} />
}

function RedesSocialesSection({ disabled, municipioId }) {
  const { data, isLoading } = useConfigClaveAdmin(
    'redes_sociales', DEFAULT_REDES, { municipioIdOverride: municipioId },
  )
  if (isLoading) return <LoadingShell title="Cargando redes sociales..." />
  return (
    <RedesSocialesForm
      initial={{ ...DEFAULT_REDES, ...(data ?? {}) }}
      disabled={disabled}
      municipioId={municipioId}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección 2 — Datos del municipio
// ─────────────────────────────────────────────────────────────────

function DatosMunicipioForm({ initial, disabled, municipioId }) {
  const upsertMut = useUpsertConfigClave('datos_municipio', { municipioIdOverride: municipioId })
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [ok, setOk]       = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function handleSave() {
    setError(''); setOk('')
    try {
      await upsertMut.mutateAsync(form)
      setOk('Datos guardados.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar los datos.')
    }
  }

  return (
    <SectionShell
      title="Datos del municipio"
      desc="Información institucional que el portal muestra en el footer y en páginas internas."
      error={error}
      ok={ok}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Input
            label="Nombre oficial"
            value={form.nombre_oficial}
            onChange={e => set('nombre_oficial', e.target.value)}
            placeholder="Comisión Municipal Real Sayana"
          />
        </div>
        <Input
          label="Dirección"
          value={form.direccion}
          onChange={e => set('direccion', e.target.value)}
          placeholder="Av. San Martín s/n"
        />
        <Input
          label="Teléfono"
          value={form.telefono}
          onChange={e => set('telefono', e.target.value)}
          placeholder="(0385) 4-110-001"
          inputMode="tel"
        />
        <Input
          label="Email institucional"
          value={form.email}
          onChange={e => set('email', e.target.value)}
          placeholder="info@realsayana.gob.ar"
          type="email"
          autoComplete="email"
        />
        <Input
          label="Horario de atención general"
          value={form.horario}
          onChange={e => set('horario', e.target.value)}
          placeholder="L-V 7:00 – 13:00"
        />
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={handleSave} loading={upsertMut.isPending} disabled={disabled}>
          Guardar datos
        </Button>
      </div>
    </SectionShell>
  )
}

function DatosMunicipioSection({ disabled, municipioId }) {
  const { data, isLoading } = useConfigClaveAdmin(
    'datos_municipio', DEFAULT_DATOS, { municipioIdOverride: municipioId },
  )
  if (isLoading) return <LoadingShell title="Cargando datos del municipio..." />
  return (
    <DatosMunicipioForm
      initial={{ ...DEFAULT_DATOS, ...(data ?? {}) }}
      disabled={disabled}
      municipioId={municipioId}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección 3 — Plan-B (WhatsApp Business)
// ─────────────────────────────────────────────────────────────────

async function testPlanBConnection({ apiUrl, apiKey, numero, mensaje }) {
  if (!apiUrl || !apiKey || !numero) {
    throw new Error('Completá URL, API key y número antes de probar.')
  }
  const url = `${apiUrl.replace(/\/$/, '')}/messages/send`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      to:   numero,
      body: mensaje?.trim() || 'Prueba de conexión desde COMUNAS.',
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${text ? ` — ${text.slice(0, 200)}` : ''}`)
  }
  return await res.json().catch(() => ({}))
}

function PlanBForm({ initial, disabled, municipioId }) {
  const upsertMut = useUpsertConfigClave('planb_config', { municipioIdOverride: municipioId })
  const [form, setForm] = useState(initial)
  const [error, setError] = useState('')
  const [ok, setOk]       = useState('')
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState(null) // 'ok' | 'fail' | null
  const [testMessage, setTestMessage] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function handleSave() {
    setError(''); setOk('')
    try {
      await upsertMut.mutateAsync(form)
      setOk('Configuración Plan-B guardada.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la configuración.')
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    setTestMessage('')
    try {
      await testPlanBConnection({
        apiUrl:  form.api_url,
        apiKey:  form.api_key,
        numero:  form.numero,
        mensaje: form.mensaje_bienvenida,
      })
      setTestResult('ok')
      setTestMessage('Conectado — el mensaje de prueba fue aceptado por Plan-B.')
    } catch (e) {
      setTestResult('fail')
      setTestMessage(e?.message ?? 'No pudimos conectar con Plan-B.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <SectionShell
      title="WhatsApp Business (Plan-B)"
      desc="Conexión al gateway Plan-B para enviar mensajes WhatsApp desde el sistema. La API key se guarda solo para staff (no expuesta a anon)."
      error={error}
      ok={ok}
    >
      <label className="mb-4 flex items-start gap-3 rounded-md border border-border bg-primary-50 p-3 text-sm">
        <input
          type="checkbox"
          checked={!!form.enabled}
          onChange={e => set('enabled', e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-primary"
        />
        <span className="flex-1">
          <span className="block font-semibold text-primary">Activar WhatsApp</span>
          <span className="block text-xs text-primary-500">
            Cuando está activo, los flujos de turnos / recordatorios pueden enviar
            mensajes WhatsApp vía Plan-B.
          </span>
        </span>
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Número de WhatsApp Business"
          value={form.numero}
          onChange={e => set('numero', e.target.value)}
          placeholder="+54 9 3854 110001"
          inputMode="tel"
        />
        <Input
          label="URL de Plan-B"
          value={form.api_url}
          onChange={e => set('api_url', e.target.value)}
          placeholder="https://plan-b.lat/api/v1"
          type="url"
        />
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Mensaje de bienvenida automático
          </label>
          <textarea
            value={form.mensaje_bienvenida}
            onChange={e => set('mensaje_bienvenida', e.target.value)}
            rows={3}
            className="input-field resize-y"
            placeholder="Hola! Tu turno fue confirmado. Te esperamos en la Sala PA."
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            label="API key de Plan-B"
            value={form.api_key}
            onChange={e => set('api_key', e.target.value)}
            placeholder="••••••••••••••••"
            type="password"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={handleTest}
            loading={testing}
            disabled={disabled || !form.api_key || !form.numero}
          >
            Probar conexión
          </Button>
          {testResult === 'ok' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-50 px-3 py-1 text-xs font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
              <span className="h-2 w-2 rounded-full bg-ok" /> Conectado
            </span>
          )}
          {testResult === 'fail' && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-danger ring-1 ring-inset ring-red-100">
              <span className="h-2 w-2 rounded-full bg-danger" /> Error
            </span>
          )}
        </div>
        <Button onClick={handleSave} loading={upsertMut.isPending} disabled={disabled}>
          Guardar Plan-B
        </Button>
      </div>
      {testMessage && (
        <p className={
          'mt-3 text-xs ' +
          (testResult === 'ok' ? 'text-ok-700' : 'text-danger')
        }>
          {testMessage}
        </p>
      )}
    </SectionShell>
  )
}

function PlanBSection({ disabled, municipioId }) {
  const { data, isLoading } = useConfigClaveAdmin(
    'planb_config', DEFAULT_PLANB, { municipioIdOverride: municipioId },
  )
  if (isLoading) return <LoadingShell title="Cargando Plan-B..." />
  return (
    <PlanBForm
      initial={{ ...DEFAULT_PLANB, ...(data ?? {}) }}
      disabled={disabled}
      municipioId={municipioId}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Marco Legal y Normativo — referencias institucionales
//
// Solo se muestra a admin_comuna / superadmin (los operadores no
// la necesitan en su día a día). Es informativa: 3 bloques con
// íconos + texto + link a la fuente externa correspondiente.
// ─────────────────────────────────────────────────────────────────

const NORMATIVA_BLOQUES = [
  {
    titulo: 'Ley Provincial N° 6706',
    texto:
      'Regula el funcionamiento de las Comisiones Municipales de ' +
      'Santiago del Estero. COMUNAS implementa los procesos ' +
      'administrativos y financieros conforme a sus disposiciones, ' +
      'con las mismas atribuciones reconocidas a los Municipios de ' +
      'Tercera Categoría.',
    linkLabel: 'Ver ley orgánica N° 5590 (supletoria)',
    linkHref:  'http://municipios.unq.edu.ar/modules/mislibros/archivos/Ley_Organica_Santiago_del_Estero.pdf',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5zM14 3v5h5" />
        <path strokeLinecap="round" d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    titulo: 'SARC — Tribunal de Cuentas SGO',
    texto:
      'El Tribunal de Cuentas de Santiago del Estero implementó en ' +
      '2022 el Sistema de Administración y Rendición de Cuentas ' +
      '(SARC) para las 137 comisiones municipales. El módulo de ' +
      'Administración de COMUNAS genera reportes compatibles con ' +
      'los requerimientos de rendición de cuentas provinciales.',
    linkLabel: 'Ir al Tribunal de Cuentas',
    linkHref:  'http://www.tcse.gob.ar/index.php/rendiciones/municipalidades-y-comisiones/',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18M5 8l7-3 7 3M4 14h6M14 14h6M5 14l-2 6h6l-2-6M17 14l-2 6h6l-2-6" />
      </svg>
    ),
  },
  {
    titulo: 'Clasificación de Partidas Presupuestarias',
    texto:
      'El módulo financiero organiza los gastos según la ' +
      'clasificación económica estándar: Partida 02 (Bienes de ' +
      'consumo), Partida 03 (Servicios no personales), Partida 04 ' +
      '(Bienes de capital) y Partida 05 (Transferencias). ' +
      'Compatible con el esquema de rendición provincial.',
    linkLabel: 'Ver clasificación presupuestaria municipal',
    linkHref:  'https://rdi.uncoma.edu.ar/bitstream/handle/uncomaid/18526/presupuesto%20municipal-%20DANGELO-final%2020-5-2014.pdf',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 14l4-4 4 4 5-6" />
      </svg>
    ),
  },
]

function MarcoNormativoSection() {
  return (
    <section
      aria-labelledby="marco-normativo-h2"
      className="overflow-hidden rounded-xl border-2 border-accent bg-primary text-white shadow-card"
    >
      <header className="px-5 py-5 sm:px-6">
        <h2 id="marco-normativo-h2" className="font-sora text-xl font-bold sm:text-2xl">
          Marco Legal y Normativo
        </h2>
        <p className="mt-1 text-sm text-white/70 sm:text-base">
          COMUNAS está construido en conformidad con la legislación vigente
          para comisiones municipales de la Provincia de Santiago del Estero.
        </p>
      </header>

      <div className="grid gap-3 px-5 pb-5 sm:px-6 lg:grid-cols-3">
        {NORMATIVA_BLOQUES.map(b => (
          <article
            key={b.titulo}
            className="flex h-full flex-col gap-3 rounded-lg bg-white/5 p-4 ring-1 ring-inset ring-white/10"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent">
              {b.icon}
            </div>
            <h3 className="font-sora text-base font-bold leading-tight text-white">
              {b.titulo}
            </h3>
            <p className="text-sm leading-relaxed text-white/75">
              {b.texto}
            </p>
            <a
              href={b.linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:underline"
            >
              {b.linkLabel}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </article>
        ))}
      </div>

      <footer className="border-t border-white/10 px-5 py-3 sm:px-6">
        <p className="text-xs text-white/50">
          Última revisión normativa: mayo 2026 · Ante dudas legales,
          consultá al Tribunal de Cuentas de Santiago del Estero o a tu
          asesor jurídico.
        </p>
      </footer>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function ConfigGeneral() {
  const { perfil, hasRole } = useAuth()
  const municipioId  = useEffectiveMunicipioId()
  const sinMunicipio = !municipioId
  // Caso especial: superadmin con perfil cargado pero municipio
  // todavía resolviendo via fallback. Mostramos un loading sutil
  // en vez de el banner gold de "sin municipio".
  const esperandoFallback =
    !perfil?.municipio_id && hasRole('superadmin') && !municipioId

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Configuración general</h1>
        <p className="text-sm text-primary-400">
          Datos institucionales, redes sociales y conexión con WhatsApp Business.
        </p>
      </header>

      {esperandoFallback && (
        <div className="card flex items-center justify-center p-12">
          <Spinner />
        </div>
      )}

      {!esperandoFallback && sinMunicipio && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          Tu usuario no tiene un municipio asignado y tampoco encontramos un
          municipio activo de fallback. Pedile al administrador que configure
          al menos un municipio.
        </div>
      )}

      {!esperandoFallback && !sinMunicipio && (
        <div className="space-y-5">
          <IdentidadVisualSection disabled={sinMunicipio} municipioId={municipioId} />
          <RedesSocialesSection   disabled={sinMunicipio} municipioId={municipioId} />
          <DatosMunicipioSection  disabled={sinMunicipio} municipioId={municipioId} />
          <PlanBSection           disabled={sinMunicipio} municipioId={municipioId} />
        </div>
      )}

      {(hasRole('admin_comuna') || hasRole('superadmin')) && (
        <MarcoNormativoSection />
      )}
    </div>
  )
}
