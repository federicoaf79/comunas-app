import { useRef, useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useConfigClaveAdmin, useUpsertConfigClave,
  useSalaPaConfigAdmin, useUpsertSalaPaConfig, DEFAULT_SALA_PA_CONFIG,
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
    // El botón "Subir logo" queda disabled cuando no hay file, así
    // que este early-return es defensivo nada más.
    if (!file) return
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

        {/* Controles. Antes había dos botones que abrían el file
            picker (el chrome del <input type="file"> + un <Button>
            "Elegir archivo"). Ahora el input es sr-only y la única
            forma de abrirlo es con el botón "Seleccionar archivo".
            El segundo botón ("Subir logo") solo es activo cuando
            ya hay un archivo elegido. */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,image/svg+xml"
            onChange={onPickFile}
            disabled={disabled || uploading}
            className="sr-only"
          />
          {file && (
            <p className="truncate text-xs text-primary-700">
              <span className="font-semibold">Seleccionado:</span> {file.name}
            </p>
          )}
          <p className="text-xs text-primary-400">
            Formato PNG transparente · Mínimo 400×200px · Máx 500KB.
            Se muestra a 40px de alto (ancho automático, máx 160px) en
            los headers del portal y del panel.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
            >
              Seleccionar archivo
            </Button>
            <Button
              onClick={handleUpload}
              loading={uploading || upsertMut.isPending}
              disabled={disabled || !file || uploading}
            >
              Subir logo
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
            placeholder="Hola! Tu turno fue confirmado. Te esperamos en la Sala Primeros Auxilios."
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
// Sección 4 — WhatsApp & Bot
// ─────────────────────────────────────────────────────────────────

const DEFAULT_BOT_CONFIG = {
  bot_nombre: '',
  bot_bienvenida: '',
  bot_tono: 'amigable',
  bot_dependencias: [],
  bot_horario: 'Lunes a Viernes de 8:00 a 13:00',
  whatsapp_numero: '',
  whatsapp_modo: 'sandbox',
  municipio_nombre: '',
}

const TONOS_BOT = [
  { value: 'formal', label: 'Formal', desc: 'Usted, lenguaje institucional' },
  { value: 'amigable', label: 'Amigable', desc: 'Vos, cercano pero respetuoso (recomendado)' },
  { value: 'neutro', label: 'Neutro', desc: 'Tú, estándar' },
]

function WhatsAppBotForm({ municipioId, disabled }) {
  const { perfil } = useAuth()
  const [form, setForm] = useState(DEFAULT_BOT_CONFIG)
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [provisionando, setProvisionando] = useState(false)
  const [configurado, setConfigurado] = useState(false)
  const [error, setError] = useState('')
  const [orgId, setOrgId] = useState(null)

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  // Cargar configuración actual
  useEffect(() => {
    if (!municipioId) return
    supabase
      .from('configuracion_portal')
      .select('clave, valor')
      .eq('municipio_id', municipioId)
      .in('clave', [
        'bot_nombre', 'bot_bienvenida', 'bot_tono',
        'bot_dependencias', 'bot_horario',
        'whatsapp_numero', 'whatsapp_modo', 'plan_b_org_id',
        'datos_municipio'
      ])
      .then(({ data }) => {
        if (!data) return
        const cfg = {}
        data.forEach(r => {
          let valor = r.valor
          if (typeof valor === 'string') {
            valor = valor.replace(/^"|"$/g, '')
            if (r.clave === 'bot_dependencias') {
              try {
                valor = JSON.parse(r.valor)
              } catch {
                valor = []
              }
            }
          }
          if (r.clave === 'datos_municipio') {
            try {
              const datos = JSON.parse(r.valor)
              cfg.municipio_nombre = datos.nombre_oficial || ''
            } catch {}
          } else {
            cfg[r.clave] = valor
          }
        })
        setConfigurado(!!cfg.plan_b_org_id)
        setOrgId(cfg.plan_b_org_id || null)
        setForm(prev => ({ ...prev, ...cfg }))
      })
  }, [municipioId])

  // Cargar dependencias del municipio
  const { data: deps = [] } = useQuery({
    queryKey: ['dependencias-wa', municipioId],
    queryFn: async () => {
      if (!municipioId) return []
      const { data } = await supabase
        .from('dependencias')
        .select('id, nombre, tipo')
        .eq('municipio_id', municipioId)
        .eq('activa', true)
        .order('nombre')
      return data ?? []
    },
    enabled: !!municipioId && configurado,
  })

  async function handleConectar() {
    if (!perfil?.municipio?.slug) {
      setError('No se encontró el slug del municipio')
      return
    }
    setProvisionando(true)
    setError('')
    try {
      const res = await fetch('/api/provision-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          municipio_id: municipioId,
          municipio_slug: perfil.municipio.slug,
          nombre: perfil.municipio.nombre,
          provincia: perfil.municipio.provincia,
        })
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Error al provisionar WhatsApp')
      }
      if (data.ok) {
        setConfigurado(true)
        setOrgId(data.org_id)
        setForm(prev => ({
          ...prev,
          whatsapp_numero: data.numero_asignado,
          whatsapp_modo: 'sandbox'
        }))
      }
    } catch (e) {
      setError(e.message || 'No pudimos conectar WhatsApp')
    } finally {
      setProvisionando(false)
    }
  }

  async function handleGuardar() {
    setGuardando(true)
    setGuardado(false)
    setError('')
    try {
      // 1. Guardar config en configuracion_portal
      const configs = [
        { clave: 'bot_nombre', valor: `"${form.bot_nombre}"` },
        { clave: 'bot_bienvenida', valor: `"${form.bot_bienvenida}"` },
        { clave: 'bot_tono', valor: `"${form.bot_tono}"` },
        { clave: 'bot_horario', valor: `"${form.bot_horario}"` },
        { clave: 'bot_dependencias', valor: JSON.stringify(form.bot_dependencias) },
      ]

      for (const { clave, valor } of configs) {
        const { error: err } = await supabase
          .from('configuracion_portal')
          .upsert(
            { municipio_id: municipioId, clave, valor },
            { onConflict: 'municipio_id,clave' }
          )
        if (err) throw err
      }

      // 2. Actualizar system prompt en Plan-B
      if (orgId) {
        const tono = form.bot_tono === 'formal'
          ? 'Tratá al vecino de "usted" y usá lenguaje institucional.'
          : form.bot_tono === 'neutro'
          ? 'Tratá al vecino de "tú" con lenguaje estándar.'
          : 'Tratá al vecino de "vos" con lenguaje cercano y amigable.'

        const depsHabilitadas = deps
          .filter(d => form.bot_dependencias?.includes(d.id))
          .map(d => d.nombre)
          .join(', ')

        const systemPrompt =
`Tu nombre es ${form.bot_nombre || 'Asistente Municipal'}.
Sos el asistente oficial de ${form.municipio_nombre || 'la Comisión Municipal'}.
${tono}

Horario de atención: ${form.bot_horario}

Podés tomar turnos para: ${depsHabilitadas || 'consultar disponibilidad'}.

Cuando el vecino pide un turno:
1. Preguntá para qué dependencia
2. Informá los horarios disponibles
3. Pedí nombre completo y DNI
4. Confirmá el turno

Mensaje de bienvenida: ${form.bot_bienvenida}

Siempre respondé en español argentino.
Si no podés resolver algo, indicá que se comuniquen
directamente con el municipio.`

        // Actualizar bot-config en Plan-B via proxy seguro
        const botConfigRes = await fetch('/api/update-bot-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            org_id: orgId,
            system_prompt: systemPrompt,
            knowledge_base: [],
            modo: form.whatsapp_modo ?? 'sandbox',
          }),
        })
        if (!botConfigRes.ok) {
          const err = await botConfigRes.json()
          throw new Error(err.error ?? 'Error al actualizar bot en Plan-B')
        }
      }

      setGuardado(true)
      setTimeout(() => setGuardado(false), 3000)
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la configuración del bot')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <SectionShell
      title="WhatsApp & Bot"
      desc="Configuración del asistente de WhatsApp para turnos y consultas. Powered by Plan-B."
      error={error}
      ok={guardado ? 'Configuración guardada y bot actualizado.' : ''}
    >
      {/* Estado de conexión */}
      <div className={
        'mb-5 rounded-lg border-2 p-4 ' +
        (configurado
          ? 'border-ok bg-ok-50/50'
          : 'border-accent bg-accent-50/50')
      }>
        <div className="flex items-start gap-3">
          <div className="shrink-0 text-2xl">
            {configurado ? '✅' : '⚠️'}
          </div>
          <div className="min-w-0 flex-1">
            {configurado ? (
              <>
                <p className="font-semibold text-primary">
                  WhatsApp conectado · Número: {form.whatsapp_numero || '—'}
                </p>
                <span className={
                  'mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider ' +
                  (form.whatsapp_modo === 'produccion'
                    ? 'bg-ok text-ok-900'
                    : 'bg-accent/20 text-accent-700')
                }>
                  {form.whatsapp_modo === 'produccion' ? 'Producción' : 'Sandbox'}
                </span>
              </>
            ) : (
              <>
                <p className="font-semibold text-primary">
                  WhatsApp no configurado para este municipio
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleConectar}
                  loading={provisionando}
                  disabled={disabled}
                  className="mt-2"
                >
                  Conectar WhatsApp
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Configuración del bot (solo si está conectado) */}
      {configurado && (
        <div className="space-y-5">
          {/* Personalización del bot */}
          <div>
            <h3 className="mb-3 text-sm font-bold text-primary">Personalización del bot</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Nombre del asistente"
                value={form.bot_nombre}
                onChange={e => set('bot_nombre', e.target.value)}
                placeholder="Ej: Asistente Municipal Real Sayana"
                hint="Este nombre aparece en los mensajes de WhatsApp"
              />
              <Input
                label="Horario de atención"
                value={form.bot_horario}
                onChange={e => set('bot_horario', e.target.value)}
                placeholder="Ej: Lunes a Viernes de 8:00 a 13:00"
                hint="El bot informa este horario cuando le preguntan"
              />
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-primary-700">
                  Mensaje de bienvenida
                </label>
                <textarea
                  value={form.bot_bienvenida}
                  onChange={e => set('bot_bienvenida', e.target.value)}
                  rows={3}
                  className="input-field resize-y"
                  placeholder={`Ej: Hola! Soy el asistente de ${form.municipio_nombre || 'la Comisión Municipal'}. Puedo ayudarte a sacar turnos y responder consultas. ¿En qué te puedo ayudar?`}
                />
                <p className="mt-1 text-xs text-primary-400">
                  Se envía cuando el vecino escribe por primera vez
                </p>
              </div>
            </div>
          </div>

          {/* Tono del bot */}
          <div>
            <label className="mb-2 block text-sm font-medium text-primary-700">
              Tono de comunicación
            </label>
            <div className="space-y-2">
              {TONOS_BOT.map(t => (
                <label key={t.value} className="flex items-start gap-3 rounded-md border border-border bg-white p-3 cursor-pointer hover:bg-primary-50">
                  <input
                    type="radio"
                    name="bot_tono"
                    value={t.value}
                    checked={form.bot_tono === t.value}
                    onChange={e => set('bot_tono', e.target.value)}
                    className="mt-0.5 h-4 w-4 accent-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-primary">{t.label}</p>
                    <p className="text-xs text-primary-500">{t.desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Dependencias con turnos */}
          <div>
            <h3 className="mb-1 text-sm font-bold text-primary">
              ¿En qué dependencias se pueden sacar turnos?
            </h3>
            <p className="mb-3 text-xs text-primary-500">
              El bot solo ofrecerá turnos en las dependencias que actives acá.
            </p>
            {deps.length === 0 ? (
              <p className="text-xs text-primary-400">
                No hay dependencias activas para este municipio.
              </p>
            ) : (
              <div className="divide-y divide-border rounded-lg border border-border bg-white">
                {deps.map(dep => (
                  <label key={dep.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-primary-50">
                    <input
                      type="checkbox"
                      checked={form.bot_dependencias?.includes(dep.id)}
                      onChange={e => {
                        const arr = form.bot_dependencias ?? []
                        set('bot_dependencias', e.target.checked
                          ? [...arr, dep.id]
                          : arr.filter(id => id !== dep.id)
                        )
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="text-sm text-primary">{dep.nombre}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Botón guardar */}
          <div className="flex justify-end">
            <Button
              onClick={handleGuardar}
              loading={guardando}
              disabled={disabled}
            >
              Guardar y actualizar bot
            </Button>
          </div>
        </div>
      )}
    </SectionShell>
  )
}

function WhatsAppBotSection({ disabled, municipioId }) {
  return <WhatsAppBotForm municipioId={municipioId} disabled={disabled} />
}

// ─────────────────────────────────────────────────────────────────
// Sección 5 — Sala Primeros Auxilios (duración estándar de turno)
// ─────────────────────────────────────────────────────────────────

const DURACION_MIN = 10
const DURACION_MAX = 60

function SalaPaForm({ initial, disabled, municipioId }) {
  const upsertMut = useUpsertSalaPaConfig({ municipioIdOverride: municipioId })
  const [duracion, setDuracion] = useState(
    Number(initial?.duracion_turno_min ?? DEFAULT_SALA_PA_CONFIG.duracion_turno_min),
  )
  const [error, setError] = useState('')
  const [ok, setOk]       = useState('')

  const valor = Number(duracion) || DEFAULT_SALA_PA_CONFIG.duracion_turno_min
  const fueraDeRango = valor < DURACION_MIN || valor > DURACION_MAX

  async function handleSave() {
    setError(''); setOk('')
    if (fueraDeRango) {
      setError(`La duración debe estar entre ${DURACION_MIN} y ${DURACION_MAX} minutos.`)
      return
    }
    try {
      await upsertMut.mutateAsync({
        ...DEFAULT_SALA_PA_CONFIG,
        ...(initial ?? {}),
        duracion_turno_min: valor,
      })
      setOk('Configuración de Sala Primeros Auxilios guardada.')
    } catch (e) {
      setError(e?.message ?? 'No pudimos guardar la configuración.')
    }
  }

  return (
    <SectionShell
      title="Sala de Primeros Auxilios"
      desc="Parámetros operativos de la Sala Primeros Auxilios. La duración estándar de turno se muestra en la planilla imprimible y, a partir del Sprint 3, va a controlar el espaciado del calendario semanal."
      error={error}
      ok={ok}
    >
      <div className="grid gap-4 sm:max-w-md">
        <div>
          <Input
            label="Duración estándar de turno (minutos)"
            type="number"
            min={DURACION_MIN}
            max={DURACION_MAX}
            step="5"
            value={duracion}
            onChange={e => setDuracion(e.target.value)}
            inputMode="numeric"
          />
          <p className="mt-1 text-xs text-primary-400">
            Mínimo {DURACION_MIN} min · Máximo {DURACION_MAX} min · Default {DEFAULT_SALA_PA_CONFIG.duracion_turno_min} min.
          </p>
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={handleSave} loading={upsertMut.isPending} disabled={disabled || fueraDeRango}>
          Guardar Sala Primeros Auxilios
        </Button>
      </div>
    </SectionShell>
  )
}

function SalaPaSection({ disabled, municipioId }) {
  const { data, isLoading } = useSalaPaConfigAdmin({ municipioIdOverride: municipioId })
  if (isLoading) return <LoadingShell title="Cargando configuración de Sala Primeros Auxilios..." />
  return (
    <SalaPaForm
      initial={{ ...DEFAULT_SALA_PA_CONFIG, ...(data ?? {}) }}
      disabled={disabled}
      municipioId={municipioId}
    />
  )
}

// ─────────────────────────────────────────────────────────────────
// Sección 5 — Bot IA por Dependencia
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
  const { hasRole } = useAuth()
  const { municipioId, loading } = useEffectiveMunicipioId()
  const sinMunicipio = !municipioId

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Configuración general</h1>
        <p className="text-sm text-primary-400">
          Datos institucionales, redes sociales y conexión con WhatsApp Business.
        </p>
      </header>

      {loading && (
        <div className="card flex items-center justify-center p-12">
          <Spinner />
        </div>
      )}

      {!loading && sinMunicipio && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          Tu usuario no tiene un municipio asignado y tampoco encontramos un
          municipio activo de fallback. Pedile al administrador que configure
          al menos un municipio.
        </div>
      )}

      {!loading && !sinMunicipio && (
        <div className="space-y-5">
          <IdentidadVisualSection disabled={sinMunicipio} municipioId={municipioId} />
          <RedesSocialesSection   disabled={sinMunicipio} municipioId={municipioId} />
          <DatosMunicipioSection  disabled={sinMunicipio} municipioId={municipioId} />
          <PlanBSection           disabled={sinMunicipio} municipioId={municipioId} />
          <WhatsAppBotSection       disabled={sinMunicipio} municipioId={municipioId} />
          <SalaPaSection            disabled={sinMunicipio} municipioId={municipioId} />
        </div>
      )}

      {(hasRole('admin_comuna') || hasRole('superadmin')) && (
        <MarcoNormativoSection />
      )}
    </div>
  )
}
