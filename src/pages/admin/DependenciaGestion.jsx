import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import NuevoTurnoModal from '../../components/admin/NuevoTurnoModal'
import { dateTimeOf } from '../../lib/datetime'

// =============================================================
// /admin/dependencia-gestion/:dependenciaId — módulo genérico para
// dependencias que NO tienen página admin propia (Ayuda Social,
// Polideportivo, Cementerio, Velatorio, Delegación Policial,
// Escuelas, Jardín, Espacios Verdes…).
//
// OJO — no confundir con DependenciaGeneral.jsx, que es el módulo
// viejo keyeado por :tipo (Beneficiarios/Reclamos/Inventario). Este
// es nuevo, keyeado por el UUID de la fila (:dependenciaId), y solo
// tiene 3 tabs: Información | Turnos | Historial. Ruta distinta a
// propósito para que ambos coexistan sin pisarse en React Router.
//
// Mismo estilo de tabs que ObrasPublicas.jsx (botones con borde
// inferior). Paleta COMUNAS — navy/gold/azul, cero verde.
// =============================================================

const TABS = [
  { value: 'info',      label: 'Información' },
  { value: 'turnos',    label: 'Turnos' },
  { value: 'historial', label: 'Historial' },
]

// Columnas reales de `dependencias` (ver schema + migrations
// 20260513_dependencias_portal_extras y 20260517_dependencias_
// responsable). `responsable` puede no existir si ese migration no
// se aplicó → retry defensivo sin esa columna.
const DEP_COLS_FULL =
  'id, municipio_id, nombre, tipo, activo, descripcion_larga, horario_atencion, telefono, email_contacto, direccion, responsable'
const DEP_COLS_BASE =
  'id, municipio_id, nombre, tipo, activo, descripcion_larga, horario_atencion, telefono, email_contacto, direccion'

async function fetchDependencia(id) {
  let { data, error } = await supabase
    .from('dependencias').select(DEP_COLS_FULL).eq('id', id).maybeSingle()
  if (error && /column .* does not exist|42703/i.test(error.message ?? '')) {
    ;({ data, error } = await supabase
      .from('dependencias').select(DEP_COLS_BASE).eq('id', id).maybeSingle())
  }
  if (error) throw error
  return data
}

const ESTADO_TURNO_CLS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  reservado:  'estado-pendiente',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  atendido:   'estado-atendido',
  cancelado:  'estado-cancelado',
  ausente:    'estado-cancelado',
}
function TurnoEstadoBadge({ estado }) {
  const cls = ESTADO_TURNO_CLS[estado] ?? 'estado-pendiente'
  return <span className={cls}>{estado ?? '—'}</span>
}

function vecinoLabel(v) {
  if (!v) return '—'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || '—'
}

// "YYYY-MM-DD · HH:MM" → { fecha, hora } separados para la tabla.
function splitFechaHora(iso) {
  if (!iso) return { fecha: '—', hora: '—' }
  const s = dateTimeOf(iso) // ya viene en hora Argentina
  const [fecha, hora] = s.split(' · ')
  return { fecha: fecha ?? '—', hora: hora ?? '—' }
}

// ─────────────────────────────────────────────────────────────────
// TAB 1 · Información
// ─────────────────────────────────────────────────────────────────

function TabInformacion({ dep, dependenciaId }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(() => ({
    nombre:           dep.nombre ?? '',
    descripcion_larga: dep.descripcion_larga ?? '',
    horario_atencion: dep.horario_atencion ?? '',
    telefono:         dep.telefono ?? '',
    email_contacto:   dep.email_contacto ?? '',
    direccion:        dep.direccion ?? '',
    responsable:      dep.responsable ?? '',
    activo:           dep.activo !== false,
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [okMsg, setOkMsg]   = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  async function handleSave() {
    setError(''); setOkMsg('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true)
    const patchFull = {
      nombre:            form.nombre.trim(),
      descripcion_larga: form.descripcion_larga.trim() || null,
      horario_atencion:  form.horario_atencion.trim() || null,
      telefono:          form.telefono.trim() || null,
      email_contacto:    form.email_contacto.trim() || null,
      direccion:         form.direccion.trim() || null,
      responsable:       form.responsable.trim() || null,
      activo:            !!form.activo,
    }
    try {
      let { error } = await supabase
        .from('dependencias').update(patchFull).eq('id', dependenciaId)
      if (error && /column .* does not exist|42703/i.test(error.message ?? '')) {
        // `responsable` no existe en esta instancia — reintento sin él.
        const { responsable: _omit, ...patchBase } = patchFull
        ;({ error } = await supabase
          .from('dependencias').update(patchBase).eq('id', dependenciaId))
      }
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['dependencia-gestion', dependenciaId] })
      qc.invalidateQueries({ queryKey: ['dependencias-admin'] })
      setOkMsg('Datos guardados.')
    } catch (e) {
      setError(e?.message ?? 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="card space-y-4 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre *"
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
        />
        <Input
          label="Responsable"
          value={form.responsable}
          onChange={e => set('responsable', e.target.value)}
          placeholder="Nombre del encargado/a"
        />
        <Input
          label="Horario de atención"
          value={form.horario_atencion}
          onChange={e => set('horario_atencion', e.target.value)}
          placeholder="Lun a Vie 7:00 – 13:00"
        />
        <Input
          label="Teléfono"
          value={form.telefono}
          onChange={e => set('telefono', e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={form.email_contacto}
          onChange={e => set('email_contacto', e.target.value)}
        />
        <Input
          label="Dirección"
          value={form.direccion}
          onChange={e => set('direccion', e.target.value)}
        />
        <div className="sm:col-span-2">
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Descripción
          </label>
          <textarea
            rows={3}
            value={form.descripcion_larga}
            onChange={e => set('descripcion_larga', e.target.value)}
            className="input-field resize-y"
            placeholder="Qué hace esta dependencia, servicios que ofrece…"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-primary-700">
          <input
            type="checkbox"
            checked={form.activo}
            onChange={e => set('activo', e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          Dependencia activa
        </label>
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}
      {okMsg && (
        <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">{okMsg}</div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving}>Guardar cambios</Button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Turnos
// ─────────────────────────────────────────────────────────────────

const TURNOS_COLS = `
  id, fecha_hora, estado, dependencia_id, municipio_id,
  vecino:vecino_id ( id, dni, nombre_completo, apellido, nombre )
`

function TabTurnos({ dep, dependenciaId }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['dependencia-gestion-turnos', dependenciaId],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('turnos')
        .select(TURNOS_COLS)
        .eq('dependencia_id', dependenciaId)
        .order('fecha_hora', { ascending: false })
        .limit(50)
      if (error) {
        console.warn('[DependenciaGestion] turnos:', error.message)
        return []
      }
      return data ?? []
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setModalOpen(true)}>+ Nuevo turno</Button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : turnos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay turnos registrados para esta dependencia.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Fecha</Th>
              <Th>Hora</Th>
              <Th>Vecino</Th>
              <Th>DNI</Th>
              <Th>Estado</Th>
            </Tr>
          </THead>
          <tbody>
            {turnos.map(t => {
              const { fecha, hora } = splitFechaHora(t.fecha_hora)
              return (
                <Tr key={t.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">{fecha}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{hora}</Td>
                  <Td className="font-medium text-primary">{vecinoLabel(t.vecino)}</Td>
                  <Td className="font-mono text-xs text-primary-500">{t.vecino?.dni ?? '—'}</Td>
                  <Td><TurnoEstadoBadge estado={t.estado} /></Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {modalOpen && (
        <NuevoTurnoModal
          open
          onClose={() => setModalOpen(false)}
          dependencia={{ id: dep.id, municipio_id: dep.municipio_id, nombre: dep.nombre }}
          onCreated={() => {
            setModalOpen(false)
            qc.invalidateQueries({ queryKey: ['dependencia-gestion-turnos', dependenciaId] })
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Historial (audit_log)
// ─────────────────────────────────────────────────────────────────

function TabHistorial({ dependenciaId }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['dependencia-gestion-historial', dependenciaId],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('accion, descripcion, created_at, usuarios:usuario_id ( nombre )')
        .eq('entidad', 'dependencias')
        .eq('entidad_id', dependenciaId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) {
        // Si audit_log no existe o RLS bloquea, degradamos a vacío.
        console.warn('[DependenciaGestion] historial:', error.message)
        return []
      }
      return data ?? []
    },
  })

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }
  if (rows.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-primary-400">
        Sin actividad registrada.
      </div>
    )
  }
  return (
    <Table>
      <THead>
        <Tr>
          <Th>Fecha</Th>
          <Th>Usuario</Th>
          <Th>Acción</Th>
          <Th>Descripción</Th>
        </Tr>
      </THead>
      <tbody>
        {rows.map((r, i) => (
          <Tr key={i}>
            <Td className="whitespace-nowrap font-mono text-xs">{dateTimeOf(r.created_at)}</Td>
            <Td className="text-sm">{r.usuarios?.nombre ?? '—'}</Td>
            <Td><span className="badge-neutral">{r.accion ?? '—'}</span></Td>
            <Td className="text-sm text-primary-500">{r.descripcion ?? '—'}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function DependenciaGestion() {
  const { dependenciaId } = useParams()
  const { perfil } = useAuth()
  const [tab, setTab] = useState('info')

  const { data: dep, isLoading, error } = useQuery({
    queryKey: ['dependencia-gestion', dependenciaId],
    queryFn:  () => fetchDependencia(dependenciaId),
    enabled:  !!perfil && !!dependenciaId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12"><Spinner size="lg" /></div>
    )
  }
  if (error || !dep) {
    return (
      <div className="space-y-5">
        <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
          ← Volver
        </Link>
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">Dependencia no encontrada</p>
          <p className="mt-2 text-sm text-primary-500">
            {error?.message ?? 'No pudimos cargar esta dependencia.'}
          </p>
        </div>
      </div>
    )
  }

  const activa = dep.activo !== false

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">{dep.nombre}</h1>
          <p className="mt-1 text-sm text-primary-400">
            Gestión de dependencia municipal
          </p>
        </div>
        <span
          className={
            'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ' +
            (activa
              ? 'bg-ok-50 text-ok-700 ring-ok-100'
              : 'bg-gray-100 text-gray-600 ring-gray-200')
          }
        >
          {activa ? 'Activa' : 'Inactiva'}
        </span>
      </header>

      {/* Tabs — mismo patrón que ObrasPublicas / AtencionDetalle */}
      <nav role="tablist" className="flex overflow-x-auto border-b border-border">
        {TABS.map(t => {
          const active = tab === t.value
          return (
            <button
              key={t.value}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.value)}
              className={
                'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ' +
                (active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-primary-400 hover:border-primary-200 hover:text-primary-700')
              }
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      <div key={tab} className="animate-fade-in">
        {tab === 'info'      && <TabInformacion dep={dep} dependenciaId={dependenciaId} />}
        {tab === 'turnos'    && <TabTurnos dep={dep} dependenciaId={dependenciaId} />}
        {tab === 'historial' && <TabHistorial dependenciaId={dependenciaId} />}
      </div>
    </div>
  )
}
