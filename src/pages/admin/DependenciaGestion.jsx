import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import Spinner from '../../components/ui/Spinner'
import Tabs from '../../components/ui/Tabs'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import NuevoTurnoModal from '../../components/admin/NuevoTurnoModal'
import { dateTimeOf } from '../../lib/datetime'
import AdministracionTab from '../../components/admin/AdministracionTab'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useUpdateEstadoTurnoAgenda } from '../../hooks/useTurnosAgenda'

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

const TABS_INFO = [
  { value: 'info',      label: 'Información pública' },
  { value: 'equipo',    label: 'Equipo' },
  { value: 'turnos',    label: 'Turnos' },
  { value: 'historial', label: 'Historial' },
]

// Columnas reales de `dependencias` (ver schema + migrations
// 20260513_dependencias_portal_extras y 20260517_dependencias_
// responsable). `responsable` puede no existir si ese migration no
// se aplicó → retry defensivo sin esa columna.
const DEP_COLS_FULL =
  'id, municipio_id, nombre, tipo, activa, descripcion_larga, horario_atencion, telefono, email_contacto, direccion, responsable, servicios'
const DEP_COLS_BASE =
  'id, municipio_id, nombre, tipo, activa, descripcion_larga, horario_atencion, telefono, email_contacto, direccion, servicios'

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

// Extrae { fecha, hora } de un turno. Si hora_inicio es null (Polideportivo/Agencia)
// → muestra solo fecha. Si tiene hora_inicio → fecha + rango horario.
function turnoFechaHora(t) {
  if (!t.fecha) return { fecha: '—', hora: '—' }
  const fecha = dateTimeOf(t.fecha).split(' · ')[0] // "DD/MM/YYYY"
  if (!t.hora_inicio) return { fecha, hora: '—' } // sin horario fijo
  const horaIni = t.hora_inicio.substring(0, 5) // "HH:MM"
  const horaFin = t.hora_fin ? t.hora_fin.substring(0, 5) : ''
  const hora = horaFin ? `${horaIni} - ${horaFin}` : horaIni
  return { fecha, hora }
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
    activa:           dep.activa !== false,
    servicios:        Array.isArray(dep.servicios) ? dep.servicios.join('\n') : '',
  }))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [okMsg, setOkMsg]   = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  const esPolideportivo = ['polideportivo', 'deporte'].includes((dep.tipo ?? '').toLowerCase())

  async function handleSave() {
    setError(''); setOkMsg('')
    if (!form.nombre.trim()) { setError('El nombre es obligatorio.'); return }
    setSaving(true)

    // Parsear servicios (deportes/actividades) desde textarea → array
    const serviciosArray = form.servicios.trim()
      ? form.servicios.split('\n').map(s => s.trim()).filter(Boolean)
      : null

    const patchFull = {
      nombre:            form.nombre.trim(),
      descripcion_larga: form.descripcion_larga.trim() || null,
      horario_atencion:  form.horario_atencion.trim() || null,
      telefono:          form.telefono.trim() || null,
      email_contacto:    form.email_contacto.trim() || null,
      direccion:         form.direccion.trim() || null,
      responsable:       form.responsable.trim() || null,
      activa:            !!form.activa,
      servicios:         serviciosArray,
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

  // Detección de información incompleta
  const informacionIncompleta = !form.nombre.trim() || !form.descripcion_larga.trim() || !form.horario_atencion.trim()

  return (
    <div className="space-y-4">
      {/* Banner de información incompleta */}
      {informacionIncompleta && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-600">⚠️</span>
              <p className="text-sm text-amber-800">
                Esta dependencia tiene información incompleta. Los vecinos no podrán encontrar sus datos en el portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => document.getElementById('info-form')?.scrollIntoView({ behavior: 'smooth' })}
              className="shrink-0 text-xs font-semibold text-amber-700 hover:underline"
            >
              Completar ahora →
            </button>
          </div>
        </div>
      )}

      {/* Aviso de información pública */}
      <div className="rounded-lg border border-ok-200 bg-ok-50 p-4">
        <div className="flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 shrink-0 text-ok-700">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
          </svg>
          <p className="text-sm leading-relaxed text-ok-800">
            Esta información es pública y aparece en el portal ciudadano cuando los vecinos buscan esta dependencia.
          </p>
        </div>
      </div>

      <div id="info-form" className="card space-y-4 p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Nombre *"
          value={form.nombre}
          onChange={e => set('nombre', e.target.value)}
          placeholder="Ej: Espacios Verdes y Jardines"
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
          placeholder="Ej: Lunes a Viernes 8:00 – 13:00"
        />
        <Input
          label="Teléfono"
          value={form.telefono}
          onChange={e => set('telefono', e.target.value)}
          placeholder="Ej: 0385 4-000000"
        />
        <Input
          label="Email"
          type="email"
          value={form.email_contacto}
          onChange={e => set('email_contacto', e.target.value)}
          placeholder="Ej: area@municipio.gob.ar"
        />
        <Input
          label="Dirección"
          value={form.direccion}
          onChange={e => set('direccion', e.target.value)}
          placeholder="Ej: Av. Principal 123"
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
            placeholder="Agregá una descripción para que los vecinos sepan qué hace esta dependencia, qué servicios ofrece y cómo pueden acceder"
          />
        </div>
        {esPolideportivo && (
          <div className="sm:col-span-2">
            <label className="mb-1.5 block text-sm font-medium text-primary-700">
              Deportes y actividades disponibles
            </label>
            <textarea
              rows={4}
              value={form.servicios}
              onChange={e => set('servicios', e.target.value)}
              className="input-field resize-y font-mono text-sm"
              placeholder="Fútbol&#10;Básquet&#10;Vóley&#10;Natación&#10;Gimnasio&#10;Yoga&#10;(uno por línea)"
            />
            <p className="mt-1 text-xs text-primary-500">
              Listá las actividades deportivas que ofrece el polideportivo. Una por línea.
            </p>
          </div>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-primary-700">
          <input
            type="checkbox"
            checked={form.activa}
            onChange={e => set('activa', e.target.checked)}
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
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 2 · Equipo
// ─────────────────────────────────────────────────────────────────

function TabEquipo({ dep }) {
  const { data: usuarios = [], isLoading } = useQuery({
    queryKey: ['dependencia-equipo', dep.municipio_id],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, email, roles')
        .eq('municipio_id', dep.municipio_id)
        .order('nombre', { ascending: true })
      if (error) {
        console.warn('[DependenciaGestion] equipo:', error.message)
        return []
      }
      return data ?? []
    },
  })

  if (isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }

  // Si no hay usuarios o el campo dependencias no existe, mostrar card informativa
  if (usuarios.length === 0) {
    return (
      <div className="card border-ok-200 bg-ok-50 p-8">
        <div className="flex items-start gap-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6 shrink-0 text-ok-700">
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M12 16v-4M12 8h.01" />
          </svg>
          <div>
            <h3 className="font-sora text-base font-semibold text-ok-800">
              Próximamente podrás asignar responsables a esta dependencia
            </h3>
            <p className="mt-1 text-sm text-ok-700">
              Para configurar el equipo de trabajo, creá usuarios desde el módulo Usuarios y asignalos a esta dependencia.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="card border-ok-200 bg-ok-50 p-4">
        <p className="text-sm text-ok-800">
          Mostrando todos los usuarios del municipio. Para asignar responsables específicos a esta dependencia, configurá los roles desde <Link to="/admin/usuarios" className="font-semibold underline">Usuarios</Link>.
        </p>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th>Nombre</Th>
            <Th>Email</Th>
            <Th>Rol principal</Th>
          </Tr>
        </THead>
        <tbody>
          {usuarios.map(u => {
            const rolPrincipal = u.roles?.[0] ?? '—'
            return (
              <Tr key={u.id}>
                <Td className="font-medium text-primary">{u.nombre ?? '—'}</Td>
                <Td className="text-sm text-primary-500">{u.email ?? '—'}</Td>
                <Td>
                  <span className="badge-neutral">{rolPrincipal}</span>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 3 · Turnos
// ─────────────────────────────────────────────────────────────────

const TURNOS_COLS = `
  id, fecha, hora_inicio, hora_fin, estado, dependencia_id, municipio_id,
  motivo, notas_vecino, notas_admin, orden_ruta,
  vecino:vecino_id ( id, dni, nombre_completo, apellido, nombre )
`

// Helper: obtener lunes y domingo de una semana (offset: 0=actual, -1=anterior, +1=siguiente)
function getSemana(offset = 0) {
  const hoy = new Date()
  const dia = hoy.getDay() === 0 ? 7 : hoy.getDay()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - dia + 1 + offset * 7)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)
  const fmt = d => d.toISOString().split('T')[0]
  return { desde: fmt(lunes), hasta: fmt(domingo) }
}

// Helper: formatear rango de fechas "14 al 20 de julio"
function formatRangoSemana(desde, hasta) {
  const dDesde = new Date(desde + 'T12:00:00')
  const dHasta = new Date(hasta + 'T12:00:00')
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  return `${dDesde.getDate()} al ${dHasta.getDate()} de ${meses[dHasta.getMonth()]}`
}

// ─────────────────────────────────────────────────────────────────
// TAB 3A · Turnos y hoja de ruta (Agencia de Desarrollo)
// ─────────────────────────────────────────────────────────────────

const SECCIONES_AGENCIA = [
  { value: 'solicitudes', label: 'Solicitudes' },
  { value: 'hoja_ruta',   label: 'Hoja de ruta' },
  { value: 'atendidos',   label: 'Historial de atendidos' },
]

function TabTurnosAgencia({ dep, dependenciaId }) {
  const qc = useQueryClient()
  const [seccion, setSeccion] = useState('solicitudes')
  const [modalOpen, setModalOpen] = useState(false)
  const [offsetSemana, setOffsetSemana] = useState(0)
  const [draggedId, setDraggedId] = useState(null)
  const updateEstadoMut = useUpdateEstadoTurnoAgenda()

  const { desde, hasta } = getSemana(offsetSemana)

  // Query turnos para Solicitudes (todos los estados menos atendido)
  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['agencia-turnos-solicitudes', dependenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(TURNOS_COLS)
        .eq('dependencia_id', dependenciaId)
        .neq('estado', 'atendido')
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(50)
      if (error) {
        console.warn('[TabTurnosAgencia] solicitudes:', error.message)
        return []
      }
      return data ?? []
    },
  })

  // Query hoja de ruta (confirmados de la semana seleccionada)
  const { data: hojaRuta = [], isLoading: loadingRuta } = useQuery({
    queryKey: ['agencia-hoja-ruta', dependenciaId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(TURNOS_COLS)
        .eq('dependencia_id', dependenciaId)
        .eq('estado', 'confirmado')
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .order('orden_ruta', { ascending: true, nullsFirst: false })
        .order('fecha', { ascending: true })
      if (error) {
        console.warn('[TabTurnosAgencia] hoja_ruta:', error.message)
        return []
      }
      return data ?? []
    },
    enabled: seccion === 'hoja_ruta',
  })

  // Query atendidos (agrupados por semana)
  const { data: atendidos = [], isLoading: loadingAtendidos } = useQuery({
    queryKey: ['agencia-atendidos', dependenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(TURNOS_COLS)
        .eq('dependencia_id', dependenciaId)
        .eq('estado', 'atendido')
        .order('fecha', { ascending: false })
        .limit(100)
      if (error) {
        console.warn('[TabTurnosAgencia] atendidos:', error.message)
        return []
      }
      return data ?? []
    },
    enabled: seccion === 'atendidos',
  })

  async function handleEstado(id, estado) {
    await updateEstadoMut.mutateAsync({ id, estado })
    qc.invalidateQueries({ queryKey: ['agencia-turnos-solicitudes', dependenciaId] })
    qc.invalidateQueries({ queryKey: ['agencia-hoja-ruta', dependenciaId] })
  }

  async function handleReordenar(items) {
    try {
      await Promise.all(
        items.map((item, idx) =>
          supabase
            .from('turnos_agenda')
            .update({ orden_ruta: idx + 1 })
            .eq('id', item.id)
        )
      )
      qc.invalidateQueries({ queryKey: ['agencia-hoja-ruta', dependenciaId, desde, hasta] })
    } catch (err) {
      console.error('[TabTurnosAgencia] reordenar:', err)
    }
  }

  function handleDragStart(e, id) {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver(e) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e, targetId) {
    e.preventDefault()
    if (!draggedId || draggedId === targetId) return

    const items = [...hojaRuta]
    const dragIdx = items.findIndex(t => t.id === draggedId)
    const targetIdx = items.findIndex(t => t.id === targetId)

    if (dragIdx === -1 || targetIdx === -1) return

    const [draggedItem] = items.splice(dragIdx, 1)
    items.splice(targetIdx, 0, draggedItem)

    handleReordenar(items)
    setDraggedId(null)
  }

  // Renderizado según sección activa
  return (
    <div className="space-y-4">
      <Tabs tabs={SECCIONES_AGENCIA} value={seccion} onChange={setSeccion} />

      {seccion === 'solicitudes' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setModalOpen(true)}>+ Nuevo turno</Button>
          </div>

          {isLoading ? (
            <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
          ) : turnos.length === 0 ? (
            <div className="card p-10 text-center text-sm text-primary-400">
              No hay solicitudes registradas.
            </div>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th>Fecha</Th>
                  <Th>Hora</Th>
                  <Th>Vecino</Th>
                  <Th>DNI</Th>
                  <Th>Detalle</Th>
                  <Th>Estado</Th>
                  <Th>Acciones</Th>
                </Tr>
              </THead>
              <tbody>
                {turnos.map(t => {
                  const { fecha, hora } = turnoFechaHora(t)
                  return (
                    <Tr key={t.id}>
                      <Td className="whitespace-nowrap font-mono text-xs">{fecha}</Td>
                      <Td className="whitespace-nowrap font-mono text-xs">{hora}</Td>
                      <Td className="font-medium text-primary">{vecinoLabel(t.vecino)}</Td>
                      <Td className="font-mono text-xs text-primary-500">{t.vecino?.dni ?? '—'}</Td>
                      <Td className="max-w-xs">
                        {t.motivo && <p className="text-xs font-semibold text-primary">{t.motivo}</p>}
                        {t.notas_vecino && (
                          <p className="text-xs text-primary-600" title={t.notas_vecino}>
                            {t.notas_vecino.length > 60 ? t.notas_vecino.substring(0, 60) + '…' : t.notas_vecino}
                          </p>
                        )}
                        {!t.motivo && !t.notas_vecino && <span className="text-xs text-primary-300">—</span>}
                      </Td>
                      <Td><TurnoEstadoBadge estado={t.estado} /></Td>
                      <Td>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {t.estado === 'pendiente' && (
                            <button onClick={() => handleEstado(t.id, 'confirmado')} className="text-ok-700 hover:underline">
                              Confirmar
                            </button>
                          )}
                          {t.estado === 'confirmado' && (
                            <button onClick={() => handleEstado(t.id, 'atendido')} className="text-primary-700 hover:underline">
                              Marcar atendido
                            </button>
                          )}
                          {(t.estado === 'pendiente' || t.estado === 'confirmado') && (
                            <button onClick={() => handleEstado(t.id, 'cancelado')} className="text-danger hover:underline">
                              Cancelar
                            </button>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {seccion === 'hoja_ruta' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setOffsetSemana(o => o - 1)}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-background"
              >
                ← Anterior
              </button>
              <span className="font-sora text-sm font-semibold text-primary">
                Semana del {formatRangoSemana(desde, hasta)}
              </span>
              <button
                onClick={() => setOffsetSemana(o => o + 1)}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-background"
              >
                Siguiente →
              </button>
            </div>
            <Button variant="outline" onClick={() => window.print()}>
              📄 Imprimir hoja de ruta
            </Button>
          </div>

          {loadingRuta ? (
            <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
          ) : hojaRuta.length === 0 ? (
            <div className="card p-10 text-center text-sm text-primary-400">
              No hay servicios confirmados para esta semana.
            </div>
          ) : (
            <div className="card p-4">
              <div className="hoja-ruta-print">
                <h2 className="mb-4 font-sora text-lg font-bold text-primary print-only">
                  Hoja de Ruta — Semana del {formatRangoSemana(desde, hasta)}
                </h2>
                <div className="space-y-2">
                  {hojaRuta.map((t, idx) => (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={e => handleDragStart(e, t.id)}
                      onDragOver={handleDragOver}
                      onDrop={e => handleDrop(e, t.id)}
                      className="no-print-drag flex items-start gap-4 rounded border border-border bg-white p-3 cursor-move hover:bg-background/50"
                    >
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary font-sora text-sm font-bold text-white">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-primary">
                          {vecinoLabel(t.vecino)} {t.vecino?.dni && <span className="text-xs text-primary-400">DNI {t.vecino.dni}</span>}
                        </p>
                        {t.motivo && <p className="mt-1 text-xs font-semibold text-accent-700">{t.motivo}</p>}
                        {t.notas_vecino && <p className="mt-1 text-xs text-primary-600">{t.notas_vecino}</p>}
                        <p className="mt-1 text-xs text-primary-400">📅 {dateTimeOf(t.fecha).split(' · ')[0]}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {seccion === 'atendidos' && (
        <div className="space-y-6">
          {loadingAtendidos ? (
            <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
          ) : atendidos.length === 0 ? (
            <div className="card p-10 text-center text-sm text-primary-400">
              No hay servicios atendidos registrados.
            </div>
          ) : (
            (() => {
              // Agrupar por semana
              const grouped = {}
              atendidos.forEach(t => {
                const d = new Date(t.fecha + 'T12:00:00')
                const dia = d.getDay() === 0 ? 7 : d.getDay()
                const lunes = new Date(d)
                lunes.setDate(d.getDate() - dia + 1)
                const domingo = new Date(lunes)
                domingo.setDate(lunes.getDate() + 6)
                const key = lunes.toISOString().split('T')[0]
                if (!grouped[key]) grouped[key] = { desde: key, hasta: domingo.toISOString().split('T')[0], items: [] }
                grouped[key].items.push(t)
              })
              const semanas = Object.values(grouped).sort((a, b) => b.desde.localeCompare(a.desde))

              return semanas.map(sem => (
                <div key={sem.desde}>
                  <h3 className="mb-3 font-sora text-sm font-semibold text-primary">
                    Semana del {formatRangoSemana(sem.desde, sem.hasta)}
                  </h3>
                  <div className="card">
                    <Table>
                      <THead>
                        <Tr>
                          <Th>Fecha</Th>
                          <Th>Vecino</Th>
                          <Th>DNI</Th>
                          <Th>Detalle</Th>
                        </Tr>
                      </THead>
                      <tbody>
                        {sem.items.map(t => (
                          <Tr key={t.id}>
                            <Td className="whitespace-nowrap font-mono text-xs">{dateTimeOf(t.fecha).split(' · ')[0]}</Td>
                            <Td className="font-medium text-primary">{vecinoLabel(t.vecino)}</Td>
                            <Td className="font-mono text-xs text-primary-500">{t.vecino?.dni ?? '—'}</Td>
                            <Td className="max-w-xs text-xs text-primary-600">
                              {t.motivo && <span className="font-semibold">{t.motivo}</span>}
                              {t.notas_vecino && ` · ${t.notas_vecino.substring(0, 60)}${t.notas_vecino.length > 60 ? '…' : ''}`}
                            </Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </div>
              ))
            })()
          )}
        </div>
      )}

      {modalOpen && (
        <NuevoTurnoModal
          open
          onClose={() => setModalOpen(false)}
          dependencia={{ id: dep.id, municipio_id: dep.municipio_id, nombre: dep.nombre }}
          onCreated={() => {
            setModalOpen(false)
            qc.invalidateQueries({ queryKey: ['agencia-turnos-solicitudes', dependenciaId] })
          }}
        />
      )}

      <style>{`
        .print-only { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body * { visibility: hidden !important; }
          .hoja-ruta-print, .hoja-ruta-print * { visibility: visible !important; }
          .hoja-ruta-print {
            position: absolute !important;
            left: 0;
            top: 0;
            width: 100%;
            color: #000;
            background: #fff;
          }
          .print-only { display: block !important; }
          .no-print-drag {
            cursor: default !important;
            border: 1px solid #ddd !important;
            background: #fff !important;
          }
        }
      `}</style>
    </div>
  )
}

function TabTurnos({ dep, dependenciaId }) {
  const qc = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const updateEstadoMut = useUpdateEstadoTurnoAgenda()

  const { data: turnos = [], isLoading } = useQuery({
    queryKey: ['dependencia-gestion-turnos', dependenciaId],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('turnos_agenda')
        .select(TURNOS_COLS)
        .eq('dependencia_id', dependenciaId)
        .order('fecha', { ascending: false })
        .order('hora_inicio', { ascending: false })
        .limit(50)
      if (error) {
        console.warn('[DependenciaGestion] turnos:', error.message)
        return []
      }
      return data ?? []
    },
  })

  async function handleEstado(id, estado) {
    await updateEstadoMut.mutateAsync({ id, estado })
    qc.invalidateQueries({ queryKey: ['dependencia-gestion-turnos', dependenciaId] })
  }

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
              <Th>Detalle</Th>
              <Th>Estado</Th>
              <Th>Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {turnos.map(t => {
              const { fecha, hora } = turnoFechaHora(t)
              return (
                <Tr key={t.id}>
                  <Td className="whitespace-nowrap font-mono text-xs">{fecha}</Td>
                  <Td className="whitespace-nowrap font-mono text-xs">{hora}</Td>
                  <Td className="font-medium text-primary">{vecinoLabel(t.vecino)}</Td>
                  <Td className="font-mono text-xs text-primary-500">{t.vecino?.dni ?? '—'}</Td>
                  <Td className="max-w-xs">
                    {t.motivo && <p className="text-xs font-semibold text-primary">{t.motivo}</p>}
                    {t.notas_vecino && (
                      <p className="text-xs text-primary-600" title={t.notas_vecino}>
                        {t.notas_vecino.length > 60 ? t.notas_vecino.substring(0, 60) + '…' : t.notas_vecino}
                      </p>
                    )}
                    {!t.motivo && !t.notas_vecino && <span className="text-xs text-primary-300">—</span>}
                  </Td>
                  <Td><TurnoEstadoBadge estado={t.estado} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {t.estado === 'pendiente' && (
                        <button onClick={() => handleEstado(t.id, 'confirmado')} className="text-ok-700 hover:underline">
                          Confirmar
                        </button>
                      )}
                      {t.estado === 'confirmado' && (
                        <button onClick={() => handleEstado(t.id, 'atendido')} className="text-primary-700 hover:underline">
                          Marcar atendido
                        </button>
                      )}
                      {(t.estado === 'pendiente' || t.estado === 'confirmado') && (
                        <button onClick={() => handleEstado(t.id, 'cancelado')} className="text-danger hover:underline">
                          Cancelar
                        </button>
                      )}
                    </div>
                  </Td>
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
// TAB 4 · Historial (audit_log)
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
// TAB 5 · Landing pública (redirect)
// ─────────────────────────────────────────────────────────────────

function LandingRedirectTab({ dep }) {
  return (
    <div className="card p-6 text-center space-y-3">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto h-10 w-10 text-primary-300">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4m0 4h.01" />
      </svg>
      <p className="font-sora font-semibold text-primary">Configuración de Landing pública</p>
      <p className="text-sm text-primary-500">
        Editá el contenido, template y secciones que los vecinos ven en el portal ciudadano para esta dependencia.
      </p>
      <a
        href={`/admin/dependencia/${dep.tipo}?tab=landing`}
        className="btn-primary inline-flex items-center gap-2"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        Ir a configuración de landing
      </a>
      <p className="text-xs text-primary-400">
        También podés acceder desde el portal: <a href={`/portal/dependencia/${dep.tipo}`} target="_blank" rel="noopener noreferrer" className="underline">Ver página pública →</a>
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// TAB 6 · Bot IA
// ─────────────────────────────────────────────────────────────────

function TabBotIA({ dep }) {
  const [form, setForm] = useState({
    bot_descripcion:   dep.bot_descripcion   ?? '',
    bot_faq:           dep.bot_faq           ?? '',
    bot_restricciones: dep.bot_restricciones ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [ok, setOk]         = useState(false)
  const [error, setError]   = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncOk, setSyncOk]   = useState(false)

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setOk(false)
  }

  async function handleGuardar() {
    setSaving(true)
    setError('')
    setOk(false)
    try {
      const { error: err } = await supabase
        .from('dependencias')
        .update({
          bot_descripcion:   form.bot_descripcion   || null,
          bot_faq:           form.bot_faq           || null,
          bot_restricciones: form.bot_restricciones || null,
        })
        .eq('id', dep.id)
      if (err) throw err
      setOk(true)
    } catch (e) {
      setError(e.message || 'No pudimos guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncOk(false)
    try {
      const res = await fetch('/api/sync-planb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': 'comunas-sync-2026',
        },
      })
      if (!res.ok) throw new Error('Error al sincronizar con Plan-B')
      setSyncOk(true)
      setTimeout(() => setSyncOk(false), 3000)
    } catch (e) {
      setError(e.message || 'Error al sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const inputCls = 'w-full rounded-md border border-border bg-white px-3 py-2 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <div className="space-y-5">
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-sora text-sm font-bold text-primary">Configuración del Bot IA</h3>
            <p className="mt-0.5 text-xs text-primary-500">
              Esta información le permite al bot de WhatsApp responder preguntas específicas sobre {dep.nombre}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="btn-secondary text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            {syncing ? <Spinner size="sm" /> : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-6.7M20 15a9 9 0 01-15 6.7" />
              </svg>
            )}
            {syncOk ? '✓ Sincronizado' : 'Sincronizar con bot'}
          </button>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
            Descripción para el bot
          </label>
          <textarea
            rows={3}
            value={form.bot_descripcion}
            onChange={e => set('bot_descripcion', e.target.value)}
            placeholder={`Descripción de ${dep.nombre} para que el bot responda preguntas generales...`}
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-primary-400">El bot usa esto para presentar y describir la dependencia a los vecinos.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
            Preguntas frecuentes (FAQ)
          </label>
          <textarea
            rows={6}
            value={form.bot_faq}
            onChange={e => set('bot_faq', e.target.value)}
            placeholder={"**¿Cuándo atienden?** Lunes a viernes 8-13hs\n**¿Necesito turno?** Sí, pedilo por este chat"}
            className={`${inputCls} font-mono text-xs`}
          />
          <p className="mt-1 text-[11px] text-primary-400">Formato: **Pregunta** Respuesta. Una por línea.</p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary-500">
            Restricciones del bot
          </label>
          <textarea
            rows={3}
            value={form.bot_restricciones}
            onChange={e => set('bot_restricciones', e.target.value)}
            placeholder="Ej: No dar información sobre precios. No confirmar turnos sin validación manual."
            className={inputCls}
          />
          <p className="mt-1 text-[11px] text-primary-400">Qué NO debe responder el bot sobre esta dependencia.</p>
        </div>

        {error && <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>}
        {ok && <div className="rounded-md border border-ok-100 bg-ok-50 p-3 text-sm text-ok-700">Configuración guardada correctamente.</div>}

        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleGuardar}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Spinner size="sm" /> : null}
            {saving ? 'Guardando...' : 'Guardar configuración bot'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function DependenciaGestion() {
  const { dependenciaId } = useParams()
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') || 'info'
  function setTab(value) {
    setSearchParams(value === 'info' ? {} : { tab: value })
  }

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

  const activa = dep.activa !== false

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          <h1 className="font-sora text-2xl font-bold text-primary">{dep.nombre}</h1>
          <p className="mt-1 text-sm text-primary-500">
            Configurá la información pública y el equipo de esta dependencia.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-ok-50 px-2.5 py-1 text-xs font-medium text-ok-700 ring-1 ring-inset ring-ok-100">
            Visible en portal ciudadano
          </span>
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
        </div>
      </header>

      {/* Tabs — solo para info/equipo/turnos/historial */}
      {['info','equipo','turnos','historial'].includes(tab) && (
        <div className="flex gap-1 border-b border-border">
          {TABS_INFO.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === t.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-primary-500 hover:text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Breadcrumb para landing/bot_ia/administracion */}
      {['landing','bot_ia','administracion'].includes(tab) && (
        <div className="flex items-center gap-2 text-sm text-primary-500 pb-2 border-b border-border">
          <button onClick={() => setTab('info')} className="hover:text-primary transition-colors">
            ← Volver a Información
          </button>
        </div>
      )}

      <div key={tab} className="animate-fade-in">
        {tab === 'info'      && <TabInformacion dep={dep} dependenciaId={dependenciaId} />}
        {tab === 'landing'   && dep && <LandingRedirectTab dep={dep} />}
        {tab === 'bot_ia'    && dep && <TabBotIA dep={dep} />}
        {tab === 'equipo'    && <TabEquipo dep={dep} />}
        {tab === 'turnos'    && (
          (dep.tipo === 'agencia_desarrollo' || dep.tipo === 'desarrollo')
            ? <TabTurnosAgencia dep={dep} dependenciaId={dependenciaId} />
            : <TabTurnos dep={dep} dependenciaId={dependenciaId} />
        )}
        {tab === 'administracion' && dep && (
          <AdministracionTab
            dependenciaId={dep.id}
            dependenciaNombre={dep.nombre}
            municipioId={municipioId}
            canApprove={true}
            canCreate={true}
          />
        )}
        {tab === 'historial' && <TabHistorial dependenciaId={dependenciaId} />}
      </div>
    </div>
  )
}
