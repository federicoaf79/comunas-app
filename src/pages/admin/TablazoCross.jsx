import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { todayArgYMD, timeOf, shortDateOf } from '../../lib/datetime'
import Input from '../../components/ui/Input'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import CalendarioSemanal from '../../components/admin/CalendarioSemanal'

// Colores estándar por tipo de evento — alineados con Sala Primeros Auxilios /
// Juez de Paz / SUM para que el operador reconozca de un vistazo
// la dependencia detrás del bloque.
const COLOR_SALA  = '#1D4ED8'  // azul ok — turnos clínicos
const COLOR_JUEZ  = '#0F1C35'  // navy primary — Juez de Paz
const COLOR_SUM   = '#C9A84C'  // gold accent — reservas SUM
const COLOR_OTRA  = '#64748B'  // slate-500 — resto de las dependencias

function colorPorTipoDep(tipo) {
  const t = (tipo ?? '').toLowerCase()
  if (/caps|salud|sala/.test(t))    return COLOR_SALA
  if (/juzgado|juez|paz/.test(t))   return COLOR_JUEZ
  if (/sum|sal[oó]n/.test(t))       return COLOR_SUM
  return COLOR_OTRA
}

// =============================================================
// Tablero de Turnos y Reservas — toggle Día / Semana.
//
// Vista Día:    lista vertical agrupada por franja horaria. El
//               operador ve la jornada completa de un vistazo.
// Vista Semana: 5 columnas (Lun-Vie) con eventos compactos por día,
//               para anticipar la carga de la semana.
//
// Mezcla turnos (sala / juez / dependencias) y reservas del SUM
// en un único calendario. Los turnos usan estilo navy estándar;
// las reservas se renderizan en gold suave con badge "RESERVA SUM"
// para diferenciarlas visualmente.
//
// Las fechas anteriores a hoy son read-only (sin Confirmar/Cancelar)
// y muestran un badge naranja "HISTÓRICO". El día actual se
// destaca con borde gold en la vista semana.
// =============================================================

// Sentinel de filtro de dependencia para mostrar SOLO reservas SUM.
// No matchea ningún UUID real de dependencia, así que el filtro de
// turnos queda en vacío cuando se elige esta opción.
const FILTRO_SOLO_RESERVAS = '__sum-reservas__'

// Mapeo del slot textual de sum_reservas a horario humano. La
// columna `horario` guarda 'manana' / 'tarde' / 'noche' /
// 'dia_completo' (sin acentos en la DB) — los pasamos a etiqueta y
// extremos para ordenar y mostrar.
const HORARIO_SUM_MAP = {
  manana:       { label: 'Mañana',       hi: '08:00', hf: '13:00' },
  tarde:        { label: 'Tarde',        hi: '14:00', hf: '18:00' },
  noche:        { label: 'Noche',        hi: '19:00', hf: '23:00' },
  dia_completo: { label: 'Día completo', hi: '08:00', hf: '23:00' },
}

function horarioSumLabel(horario) {
  const m = HORARIO_SUM_MAP[(horario ?? '').toLowerCase()]
  if (m) return `${m.hi} – ${m.hf}`
  return horario || '—'
}
function horarioSumHi(horario) {
  return HORARIO_SUM_MAP[(horario ?? '').toLowerCase()]?.hi ?? '08:00'
}

const ESTADO_RESERVA_LABEL = {
  pendiente: 'Pendiente',
  aprobada:  'Aprobada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  realizada: 'Realizada',
}
const ESTADO_RESERVA_CLASS = {
  pendiente: 'estado-pendiente',
  aprobada:  'estado-confirmado',
  rechazada: 'estado-cancelado',
  cancelada: 'estado-cancelado',
  realizada: 'estado-completado',
}

// Fetch de reservas SUM para un rango. Excluye canceladas. Se usa
// con react-query desde ambas vistas (día y semana) — react-query
// dedupea cuando la queryKey coincide.
async function fetchReservasRango({ municipioId, fechaFrom, fechaTo }) {
  let q = supabase
    .from('sum_reservas')
    .select('id, municipio_id, dependencia_id, solicitante, motivo, fecha, horario, estado, costo')
    .neq('estado', 'cancelada')
    .order('fecha', { ascending: true })
  if (municipioId) q = q.eq('municipio_id', municipioId)
  if (fechaFrom)   q = q.gte('fecha', fechaFrom)
  if (fechaTo)     q = q.lte('fecha', fechaTo)
  const { data, error } = await q
  if (error) {
    console.warn('[TablazoCross] fetchReservasRango error:', error.message)
    return []
  }
  return data ?? []
}

function useReservasRango({ municipioId, fechaFrom, fechaTo, enabled = true } = {}) {
  return useQuery({
    queryKey: ['sum-reservas-tablero', municipioId ?? '__ALL__', fechaFrom ?? '', fechaTo ?? ''],
    queryFn:  () => fetchReservasRango({ municipioId, fechaFrom, fechaTo }),
    enabled:  enabled && !!fechaFrom && !!fechaTo,
  })
}

const ESTADOS_OPTS = [
  { value: 'pendiente',  label: 'Pendientes' },
  { value: 'confirmado', label: 'Confirmados' },
  { value: 'en_curso',   label: 'En curso' },
  { value: 'completado', label: 'Completados' },
  { value: 'cancelado',  label: 'Cancelados' },
]

const ESTADO_LABEL = {
  pendiente:  'Pendiente',
  confirmado: 'Confirmado',
  en_curso:   'En curso',
  completado: 'Completado',
  cancelado:  'Cancelado',
  reservado:  'Pendiente',
  atendido:   'Atendido',
}
const ESTADO_CLASS = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
}

const CANAL_CLASS = {
  whatsapp:   'canal-whatsapp',
  sms:        'canal-sms',
  web:        'canal-web',
  presencial: 'canal-presencial',
}

// Color del badge de dependencia según `tipo`. Cero verde — todas
// las variantes caen a navy / azul OK / gold / gris / slate.
function depBadgeClass(tipo) {
  const t = (tipo ?? '').toLowerCase()
  if (/caps|salud|sala/.test(t))                   return 'bg-ok-50 text-ok-700 ring-ok-100'
  if (/juzgado|paz|justicia/.test(t))              return 'bg-primary-100 text-primary-700 ring-primary-200'
  if (/sum|sal[oó]n|cultural/.test(t))             return 'bg-accent-50 text-accent-700 ring-accent-100'
  if (/intendencia|admin|gobierno|comuna/.test(t)) return 'bg-gray-100 text-gray-700 ring-gray-300'
  if (/obra|construc|infra|catastro/.test(t))      return 'bg-slate-100 text-slate-700 ring-slate-200'
  if (/deport|recreaci|polideport/.test(t))        return 'bg-accent-100 text-accent-800 ring-accent-200'
  if (/educ|escuel|biblioteca/.test(t))            return 'bg-accent-50 text-accent-700 ring-accent-100'
  if (/social|familia|asisten/.test(t))            return 'bg-primary-50 text-primary-700 ring-primary-200'
  if (/polic|seguridad/.test(t))                   return 'bg-primary-100 text-primary-700 ring-primary-200'
  return 'bg-primary-50 text-primary-700 ring-primary-200'
}

function vecinoNombre(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// ─────────────────────────────────────────────────────────────────
// Helpers de fecha
// ─────────────────────────────────────────────────────────────────

// "YYYY-MM-DD" en hora local. Nota: la página trabaja con fechas
// como strings — comparamos con orden lexicográfico, que para
// YYYY-MM-DD es equivalente a orden cronológico.
function ymd(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseYmd(s) {
  // new Date("YYYY-MM-DD") interpreta como UTC, lo cual hace que
  // en zonas con offset negativo (Argentina) el día se muestre
  // shifted. Forzamos el parseo local.
  const [y, m, day] = (s ?? '').split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, day ?? 1)
}

function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0) // anchor a mediodía para evitar rollover por DST
  const dow = d.getDay()  // 0 = Dom ... 6 = Sáb
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

// ─────────────────────────────────────────────────────────────────
// Sub-componentes compartidos
// ─────────────────────────────────────────────────────────────────

function HistoricoBadge({ small = false }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full bg-orange-100 font-bold uppercase tracking-wide text-orange-700 ring-1 ring-inset ring-orange-200 ' +
        (small ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-0.5 text-xs')
      }
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7v5l3 2" />
      </svg>
      Histórico
    </span>
  )
}

// Fila completa para Vista Día (con acciones inline al hover).
function TurnoRow({ turno, onConfirmar, onCancelar }) {
  const isFamiliar = !!turno.metadata?.para_familiar
  const nombrePrincipal = isFamiliar
    ? (turno.metadata.familiar_nombre || vecinoNombre(turno.vecino))
    : vecinoNombre(turno.vecino)

  const depNombre = turno.dependencia?.nombre ?? turno.dependencia_nombre ?? '—'
  const depCls    = depBadgeClass(turno.dependencia?.tipo)

  return (
    <li className="group flex flex-wrap items-start gap-3 p-4 transition-colors hover:bg-primary-50/40">
      <span
        className={
          'inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ring-1 ring-inset ' +
          depCls
        }
      >
        {depNombre}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary sm:text-base">
          {nombrePrincipal}
        </p>
        {isFamiliar && turno.vecino && (
          <p className="mt-0.5 text-[11px] text-primary-400">
            Solicitó: {vecinoNombre(turno.vecino)}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={ESTADO_CLASS[turno.estado] ?? 'estado-pendiente'}>
            {ESTADO_LABEL[turno.estado] ?? turno.estado}
          </span>
          {turno.canal && (
            <span className={CANAL_CLASS[turno.canal] ?? 'canal-presencial'}>
              {turno.canal}
            </span>
          )}
          {turno.numero_turno && (
            <span className="font-medium text-primary-400">
              #{turno.numero_turno}
            </span>
          )}
          {isFamiliar && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100"
              title={turno.metadata.vinculo ? `Vínculo: ${turno.metadata.vinculo}` : 'Turno familiar'}
            >
              <span aria-hidden="true">👨‍👩‍👧</span>
              Familiar
            </span>
          )}
        </div>
      </div>

      {(onConfirmar || onCancelar) && (
        <div className="flex shrink-0 gap-3 text-xs font-medium opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          {onConfirmar && (
            <button onClick={onConfirmar} className="text-ok-700 hover:underline">Confirmar</button>
          )}
          {onCancelar && (
            <button onClick={onCancelar} className="text-danger hover:underline">Cancelar</button>
          )}
        </div>
      )}
    </li>
  )
}

// ─────────────────────────────────────────────────────────────────
// Reservas SUM — variantes visuales en gold para diferenciar
// ─────────────────────────────────────────────────────────────────

function ReservaRow({ reserva }) {
  const label = ESTADO_RESERVA_LABEL[reserva.estado] ?? reserva.estado
  const cls   = ESTADO_RESERVA_CLASS[reserva.estado] ?? 'estado-pendiente'
  return (
    <li className="group flex flex-wrap items-start gap-3 border-l-4 border-[#C9A84C] bg-[#C9A84C]/8 p-4 transition-colors hover:bg-[#C9A84C]/15">
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#C9A84C] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-900">
        <span aria-hidden="true">🏛️</span>
        Reserva SUM
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary sm:text-base">
          <span aria-hidden="true">🏛️</span>{' '}
          {reserva.solicitante || 'Reserva SUM'}
        </p>
        <p className="mt-0.5 text-[11px] text-primary-500">
          {reserva.motivo || 'Salón de Usos Múltiples'}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cls}>{label}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-primary-700 ring-1 ring-inset ring-[#C9A84C]/30">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3 w-3">
              <circle cx="12" cy="12" r="9" />
              <path strokeLinecap="round" d="M12 7v5l3 2" />
            </svg>
            {horarioSumLabel(reserva.horario)}
          </span>
        </div>
      </div>
    </li>
  )
}

// (La vista semana ahora usa CalendarioSemanal — los renderers
//  compactos TurnoLineaCompacta y ReservaLineaCompacta quedaron
//  obsoletos y se removieron.)

// ─────────────────────────────────────────────────────────────────
// Vista Día — lista por franja horaria
// ─────────────────────────────────────────────────────────────────

function VistaDia({
  fecha, dependenciaId, estado, isHistorico, municipioId, soloReservas,
}) {
  // Si el usuario eligió "SUM / Reservas" en el filtro, omitimos el
  // fetch de turnos. useTurnos sigue habilitado pero con un
  // dependenciaId imposible para devolver vacío sin pegar a la red.
  const skipTurnos = soloReservas
  const { turnos = [], isLoading: turnosLoading, isFetching: turnosFetching, error: turnosError, updateEstado, cancel } = useTurnos({
    fecha:         skipTurnos ? undefined : fecha,
    dependenciaId: skipTurnos ? undefined : (dependenciaId || undefined),
    estado:        estado || undefined,
  })

  // Reservas SUM solo cuando NO hay filtro de dependencia específico,
  // o cuando el filtro es justamente "SUM / Reservas". Si el usuario
  // filtra por otra dep concreta, ocultamos reservas para no
  // contaminar la vista.
  const mostrarReservas = !dependenciaId || soloReservas
  const reservasQ = useReservasRango({
    municipioId,
    fechaFrom: fecha,
    fechaTo:   fecha,
    enabled:   mostrarReservas && !!fecha,
  })
  const reservas = useMemo(
    () => (mostrarReservas ? (reservasQ.data ?? []) : []),
    [mostrarReservas, reservasQ.data],
  )

  // Unificamos turnos + reservas. Cada item lleva un `kind` para que
  // el render branche entre TurnoRow y ReservaRow sin perder la
  // data tipada original.
  const grupos = useMemo(() => {
    const eventos = []
    if (!skipTurnos) {
      for (const t of (turnos ?? [])) {
        const hora = timeOf(t.fecha_hora) || '—'
        eventos.push({ kind: 'turno', hora, sortKey: hora, data: t })
      }
    }
    for (const r of reservas) {
      const hi = horarioSumHi(r.horario)
      eventos.push({ kind: 'reserva', hora: hi, sortKey: hi, data: r })
    }
    const map = new Map()
    for (const e of eventos) {
      if (!map.has(e.hora)) map.set(e.hora, [])
      map.get(e.hora).push(e)
    }
    return Array.from(map.entries())
      .map(([hora, items]) => ({
        hora,
        items: items.slice().sort((a, b) => a.sortKey.localeCompare(b.sortKey)),
      }))
      .sort((a, b) => a.hora.localeCompare(b.hora))
  }, [turnos, reservas, skipTurnos])

  async function handleConfirmar(id) {
    try {
      await updateEstado.mutateAsync({ id, estado: 'confirmado' })

      // Notificación WA — solo si el turno vino por WhatsApp o el vecino tiene teléfono
      const turno = (turnos ?? []).find(t => t.id === id)
      const telefono = turno?.vecino?.telefono
      if (telefono) {
        const nombre    = turno.vecino?.nombre ?? turno.vecino?.nombre_completo ?? 'Vecino'
        const dep       = turno.dependencia?.nombre ?? turno.dependencia_nombre ?? 'la dependencia'
        const fechaHora = turno.fecha_hora
          ? new Date(turno.fecha_hora).toLocaleString('es-AR', {
              timeZone: 'America/Argentina/Buenos_Aires',
              weekday: 'long', day: 'numeric', month: 'long',
              hour: '2-digit', minute: '2-digit',
            })
          : ''
        const message = `✅ Hola ${nombre}, tu turno en *${dep}* fue *confirmado*${fechaHora ? ` para el ${fechaHora}` : ''}. Si necesitás cancelarlo, respondé este mensaje. — Comisión Municipal`

        // Fire-and-forget — no bloqueamos la UI si falla
        fetch('/api/send-whatsapp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            municipio_id: municipioId,
            to: telefono,
            message,
            tipo: 'confirmacion_turno',
          }),
        }).catch(err => console.warn('[WA] Error enviando notificación:', err))
      }
    } catch (e) {
      alert(`No se pudo confirmar: ${e.message}`)
    }
  }
  async function handleCancelar(id) {
    if (!confirm('¿Cancelar este turno?')) return
    try { await cancel.mutateAsync(id) }
    catch (e) { alert(`No se pudo cancelar: ${e.message}`) }
  }

  const totalTurnos  = skipTurnos ? 0 : (turnos ?? []).length
  const totalReservas = reservas.length
  const total        = totalTurnos + totalReservas
  const isLoading    = (!skipTurnos && turnosLoading) || (mostrarReservas && reservasQ.isLoading)
  const isFetching   = turnosFetching || reservasQ.isFetching
  const error        = turnosError || reservasQ.error

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 text-sm text-primary-400">
        <span>
          {total} evento{total === 1 ? '' : 's'} en la fecha
          {totalReservas > 0 && (
            <span className="text-primary-300">
              {' '}· {totalTurnos} turno{totalTurnos === 1 ? '' : 's'} + {totalReservas} reserva{totalReservas === 1 ? '' : 's'}
            </span>
          )}
        </span>
        {isFetching && !isLoading && <span className="text-primary-300">(actualizando…)</span>}
        {isHistorico && <HistoricoBadge />}
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los datos: {error.message}
        </div>
      )}

      {isLoading && (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      )}

      {!isLoading && !error && grupos.length === 0 && (
        <div className="card p-12 text-center text-sm text-primary-400">
          No hay turnos ni reservas para esta fecha.
        </div>
      )}

      {!isLoading && !error && grupos.length > 0 && (
        <div className="space-y-6">
          {grupos.map(g => (
            <section key={g.hora}>
              <div className="mb-2 flex items-center gap-3">
                <p className="shrink-0 font-sora text-lg font-bold text-primary sm:text-xl">{g.hora}</p>
                <div className="h-px flex-1 bg-border" aria-hidden="true" />
                <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-primary-400">
                  {g.items.length} evento{g.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-card">
                {g.items.map(e => {
                  if (e.kind === 'reserva') {
                    return <ReservaRow key={`r-${e.data.id}`} reserva={e.data} />
                  }
                  const t = e.data
                  const canConfirmar = !isHistorico && t.estado === 'pendiente'
                  const canCancelar  = !isHistorico && t.estado !== 'cancelado' && t.estado !== 'completado'
                  return (
                    <TurnoRow
                      key={`t-${t.id}`}
                      turno={t}
                      onConfirmar={canConfirmar ? () => handleConfirmar(t.id) : null}
                      onCancelar={canCancelar  ? () => handleCancelar(t.id)  : null}
                    />
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Vista Semana — 5 columnas Lun-Vie
// ─────────────────────────────────────────────────────────────────

function VistaSemana({ fecha, dependenciaId, estado, municipioId, soloReservas }) {
  // Para alinearnos con el estándar Mon-Sun de CalendarioSemanal,
  // calculamos el lunes de la semana que contiene `fecha` y armamos
  // el rango Lun-Dom. La grilla del componente se encarga de la
  // distribución y posicionamiento por hora.
  const weekStart = useMemo(() => startOfWeekMonday(parseYmd(fecha)), [fecha])
  const weekEnd   = useMemo(() => addDays(weekStart, 6), [weekStart])
  const fechaFrom = ymd(weekStart)
  const fechaTo   = ymd(weekEnd)

  const skipTurnos       = soloReservas
  const mostrarReservas  = !dependenciaId || soloReservas

  const { turnos = [], isLoading: turnosLoading, isFetching: turnosFetching, error: turnosError } = useTurnos({
    fechaFrom:     skipTurnos ? undefined : fechaFrom,
    fechaTo:       skipTurnos ? undefined : fechaTo,
    dependenciaId: skipTurnos ? undefined : (dependenciaId || undefined),
    estado:        estado || undefined,
  })

  const reservasQ = useReservasRango({
    municipioId,
    fechaFrom,
    fechaTo,
    enabled:   mostrarReservas,
  })
  const reservas = useMemo(
    () => (mostrarReservas ? (reservasQ.data ?? []) : []),
    [mostrarReservas, reservasQ.data],
  )

  // Eventos unificados para CalendarioSemanal. Color por tipo:
  // turnos se mapean al color de SU dependencia; reservas SUM van
  // siempre gold para diferenciarlas. El bloque pendiente queda con
  // borde punteado, el cancelado con opacidad y tachado — lógica
  // ya implementada dentro del componente.
  const eventos = useMemo(() => {
    const out = []
    if (!skipTurnos) {
      for (const t of (turnos ?? [])) {
        out.push({
          id:          t.id,
          tipo:        'turno',
          fecha_hora:  t.fecha_hora,
          titulo:      vecinoNombre(t.vecino),
          subtitulo:   t.dependencia?.nombre ?? t.dependencia_nombre ?? 'Turno',
          estado:      t.estado,
          numero:      t.numero_turno,
          canal:       t.canal ?? '',
          duracion_min: 30,
          color:       colorPorTipoDep(t.dependencia?.tipo),
        })
      }
    }
    for (const r of reservas) {
      const slotHi = horarioSumHi(r.horario)
      out.push({
        id:          r.id,
        tipo:        'reserva',
        fecha:       r.fecha,
        hora:        slotHi,
        duracion_min: 60 * 2,  // bloque visible 2hs; los slots reales pueden ser más largos
        titulo:      r.solicitante || 'Reserva SUM',
        subtitulo:   r.motivo || 'Salón de Usos Múltiples',
        estado:      r.estado,
        color:       COLOR_SUM,
      })
    }
    return out
  }, [turnos, reservas, skipTurnos])

  const totalTurnos   = skipTurnos ? 0 : (turnos ?? []).length
  const totalReservas = reservas.length
  const total         = totalTurnos + totalReservas
  const isLoading     = (!skipTurnos && turnosLoading) || (mostrarReservas && reservasQ.isLoading)
  const isFetching    = turnosFetching || reservasQ.isFetching
  const error         = turnosError || reservasQ.error

  const leyenda = useMemo(() => {
    const out = []
    if (!skipTurnos) {
      out.push({ label: 'Sala Primeros Auxilios',     color: COLOR_SALA })
      out.push({ label: 'Juez de Paz', color: COLOR_JUEZ })
      out.push({ label: 'Otras deps.', color: COLOR_OTRA })
    }
    if (mostrarReservas) {
      out.push({ label: 'Reserva SUM', color: COLOR_SUM })
    }
    return out
  }, [skipTurnos, mostrarReservas])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-sm text-primary-400">
        <span>
          {total} evento{total === 1 ? '' : 's'} en la semana
          {totalReservas > 0 && (
            <span className="text-primary-300">
              {' '}· {totalTurnos} turno{totalTurnos === 1 ? '' : 's'} + {totalReservas} reserva{totalReservas === 1 ? '' : 's'}
            </span>
          )}
        </span>
        {isFetching && !isLoading && <span className="text-primary-300">(actualizando…)</span>}
      </div>

      {error && (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los datos: {error.message}
        </div>
      )}

      <CalendarioSemanal
        weekStart={weekStart}
        loading={isLoading}
        weekLabel={`${shortDateOf(weekStart)} – ${shortDateOf(weekEnd)}`}
        leyenda={leyenda}
        eventos={eventos}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Toggle día / semana
// ─────────────────────────────────────────────────────────────────

function VistaToggle({ vista, onChange }) {
  return (
    <div className="inline-flex rounded-md border border-border bg-white p-0.5 text-sm shadow-sm">
      <button
        type="button"
        onClick={() => onChange('dia')}
        className={
          'rounded px-3 py-1 font-medium transition-colors ' +
          (vista === 'dia' ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50')
        }
      >
        <span aria-hidden="true">📅</span> Día
      </button>
      <button
        type="button"
        onClick={() => onChange('semana')}
        className={
          'rounded px-3 py-1 font-medium transition-colors ' +
          (vista === 'semana' ? 'bg-primary text-white' : 'text-primary-500 hover:bg-primary-50')
        }
      >
        <span aria-hidden="true">📆</span> Semana
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────

export default function TablazoCross() {
  const [vista, setVista]                 = useState('semana')
  const [fecha, setFecha]                 = useState(() => todayArgYMD())
  const [dependenciaId, setDependenciaId] = useState('')
  const [estado, setEstado]               = useState('')

  const { municipioId } = useEffectiveMunicipioId()
  const { data: deps = [] } = useDependencias()
  const depsActivasOpts = useMemo(() => {
    const base = (deps ?? [])
      .filter(d => d.activa !== false)
      .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''))
      .map(d => ({ value: d.id, label: d.nombre }))
    // Opción sintética al principio para filtrar solo reservas SUM.
    return [{ value: FILTRO_SOLO_RESERVAS, label: 'SUM · Reservas de espacios' }, ...base]
  }, [deps])

  const soloReservas = dependenciaId === FILTRO_SOLO_RESERVAS
  const depFiltroReal = soloReservas ? '' : dependenciaId

  const today = todayArgYMD()
  const isHistorico = vista === 'dia' && fecha < today

  // ← / → navegan: 1 día en vista día, 7 días en vista semana.
  function shiftFecha(deltaDias) {
    const d = parseYmd(fecha)
    d.setDate(d.getDate() + deltaDias)
    setFecha(ymd(d))
  }
  function goPrev()  { shiftFecha(vista === 'semana' ? -7 : -1) }
  function goNext()  { shiftFecha(vista === 'semana' ?  7 :  1) }
  function goToday() { setFecha(today) }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Tablero de Turnos y Reservas</h1>
          <p className="mt-1 text-sm text-primary-500">
            Vista consolidada de turnos y reservas de espacios de toda la comisión
            <span className="text-primary-400">
              {' · '}
              {vista === 'dia' ? 'Lista por franja horaria' : 'Vista semanal de Lunes a Viernes'}
            </span>
          </p>
        </div>
        <VistaToggle vista={vista} onChange={setVista} />
      </header>

      {/* Filtros + navegación */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label="Fecha"
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            className="min-w-[160px]"
          />
          <Select
            label="Dependencia"
            value={dependenciaId}
            onChange={setDependenciaId}
            placeholder="Todas"
            options={depsActivasOpts}
            className="min-w-[220px]"
          />
          <Select
            label="Estado"
            value={estado}
            onChange={setEstado}
            placeholder="Todos los estados"
            options={ESTADOS_OPTS}
            className="min-w-[180px]"
          />
        </div>
        <div className="inline-flex gap-2 self-end">
          <button onClick={goPrev}  className="btn-secondary px-3 py-1.5 text-xs">← Anterior</button>
          <button onClick={goToday} className="btn-secondary px-3 py-1.5 text-xs">Hoy</button>
          <button onClick={goNext}  className="btn-secondary px-3 py-1.5 text-xs">Siguiente →</button>
        </div>
      </div>

      {/* Leyenda — tipos de evento + canal de origen */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-white px-3 py-2 text-xs text-primary-600">
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm border-l-4 border-primary bg-white" aria-hidden="true" />
          Turno médico / judicial
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm border-l-4 border-[#C9A84C] bg-[#C9A84C]/15" aria-hidden="true" />
          Reserva de espacio (SUM)
        </span>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <span className="font-semibold text-primary-400 uppercase tracking-wide text-[10px]">Canal</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm border-l-4 border-[#7C3AED] bg-white" aria-hidden="true" />
          WhatsApp
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm border-l-4 border-[#64748B] bg-white" aria-hidden="true" />
          Online
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm border-l-4 border-[#C9A84C] bg-white" aria-hidden="true" />
          Presencial
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-4 rounded-sm border-l-4 border-[#0F1C35] bg-white" aria-hidden="true" />
          Sin canal
        </span>
      </div>

      {vista === 'dia' && (
        <VistaDia
          fecha={fecha}
          dependenciaId={depFiltroReal}
          estado={estado}
          isHistorico={isHistorico}
          municipioId={municipioId}
          soloReservas={soloReservas}
        />
      )}
      {vista === 'semana' && (
        <VistaSemana
          fecha={fecha}
          dependenciaId={depFiltroReal}
          estado={estado}
          municipioId={municipioId}
          soloReservas={soloReservas}
        />
      )}
    </div>
  )
}
