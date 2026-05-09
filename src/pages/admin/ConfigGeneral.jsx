import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  useConfigClaveAdmin, useUpsertConfigClave,
} from '../../hooks/useConfigPortal'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import Spinner from '../../components/ui/Spinner'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'

// Para superadmin (perfil.municipio_id = null), tomamos el primer
// municipio activo como destino del upsert. Sin esto, todas las
// secciones tirarían "Tu usuario no tiene un municipio asignado"
// al guardar.
function useEffectiveMunicipioId() {
  const { perfil, hasRole } = useAuth()
  const propio = perfil?.municipio_id ?? null
  const necesitaFallback = !propio && hasRole('superadmin')
  const fallbackQ = useQuery({
    queryKey: ['first-active-municipio'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('municipios')
        .select('id')
        .eq('activo', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (error) {
        console.warn('[ConfigGeneral] fallback municipio fetch error:', error.message)
        return null
      }
      return data?.id ?? null
    },
    enabled:  necesitaFallback,
    staleTime: 60 * 60 * 1000,
  })
  return propio ?? fallbackQ.data ?? null
}

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
          <RedesSocialesSection  disabled={sinMunicipio} municipioId={municipioId} />
          <DatosMunicipioSection disabled={sinMunicipio} municipioId={municipioId} />
          <PlanBSection          disabled={sinMunicipio} municipioId={municipioId} />
        </div>
      )}
    </div>
  )
}
