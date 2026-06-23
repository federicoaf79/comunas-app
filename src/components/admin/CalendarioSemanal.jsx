import { useMemo } from 'react'
import { ARG_TZ, timeOf, shortDateOf } from '../../lib/datetime'
import Spinner from '../ui/Spinner'

// =============================================================
// CalendarioSemanal — vista semanal estándar de eventos.
//
// Diseñado para ser reutilizado por Sala Primeros Auxilios, Juez de Paz, SUM y
// TablazoCross. Recibe una lista uniforme de "eventos" y un mapa
// de color por tipo; el render se encarga de posicionarlos en una
// grilla horaria 07:00–20:00 con 7 columnas (Lun-Dom).
//
// Estructura del evento esperada:
//   {
//     id:           string                      (key React)
//     tipo:         string                      (lookup en colorPorTipo)
//     fecha_hora:   string ISO timestamptz      (preferido)
//     hora:         string "HH:MM"              (fallback si no hay fecha_hora — combinado con `fecha`)
//     fecha:        string "YYYY-MM-DD"         (fallback si no hay fecha_hora)
//     duracion_min: number                      (default 30)
//     titulo:       string                      (línea principal del bloque)
//     subtitulo:    string                      (línea secundaria)
//     estado:       string                      (pendiente | cancelado | confirmado | …)
//     numero:       string|number               (opcional, se muestra como #N)
//     color:        string '#RRGGBB'            (opcional, override de colorPorTipo[tipo])
//   }
//
// Estados visuales:
//   pendiente   → borde punteado del color del tipo, fondo blanco
//   cancelado   → opacity-40 + line-through
//   resto       → bloque sólido (fondo del color del tipo, texto auto)
//
// Mobile-first: la grilla mantiene un min-width grande y el wrapper
// hace overflow-x-auto para que en pantallas chicas se pueda scrollear.
// =============================================================

const SLOT_HEIGHT_PX = 40
const PX_PER_MIN     = SLOT_HEIGHT_PX / 30
const START_HOUR     = 7
const END_HOUR       = 20
const SLOTS_COUNT    = (END_HOUR - START_HOUR) * 2
const TOTAL_HEIGHT   = SLOTS_COUNT * SLOT_HEIGHT_PX

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Decide texto blanco u oscuro contra un fondo `#RRGGBB` según la
// luminancia relativa. Mantiene los bloques legibles cuando el
// caller pasa colores distintos (gold reclama navy; navy reclama
// blanco).
function pickFg(bg) {
  if (!bg || typeof bg !== 'string') return '#FFFFFF'
  const hex = bg.replace('#', '')
  if (hex.length !== 6) return '#FFFFFF'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#0F1C35' : '#FFFFFF'
}

// "YYYY-MM-DD" del Date en TZ Argentina — clave estable para
// agrupar eventos por día sin sufrir errores de offset.
const _ymdArgFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARG_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
})
function ymdArg(d) {
  return _ymdArgFmt.format(d instanceof Date ? d : new Date(d))
}

// Minutos desde el inicio del calendario (07:00). timeOf() ya
// devuelve "HH:MM" en TZ Argentina, así que evitamos el bug de
// Date.getHours en runtimes con offset distinto.
function minutosDesdeInicio(iso) {
  const hm = timeOf(iso)
  if (!hm) return null
  const [h, m] = hm.split(':').map(Number)
  return (h * 60 + m) - START_HOUR * 60
}

// Si el evento no trae `fecha_hora`, construimos uno con
// fecha + hora en TZ Argentina. Esto cubre los eventos sintéticos
// (ej. reservas SUM con slot textual).
function isoDeEvento(ev) {
  if (ev?.fecha_hora) return ev.fecha_hora
  const f = (ev?.fecha ?? '').slice(0, 10)
  const h = (ev?.hora ?? '').slice(0, 5)
  if (!f || !h) return null
  return `${f}T${h}:00-03:00`
}

// Resuelve el color de fondo del bloque. Prioridad:
//   1. evento.color (override explícito)
//   2. colorPorTipo[evento.tipo]
//   3. gris slate como fallback
function colorDeEvento(ev, colorPorTipo) {
  if (ev?.color) return ev.color
  if (colorPorTipo && ev?.tipo && colorPorTipo[ev.tipo]) return colorPorTipo[ev.tipo]
  return '#64748B' // slate-500
}

function borderDeCanal(canal) {
  switch ((canal ?? '').toLowerCase()) {
    case 'whatsapp':   return '4px solid #7C3AED'
    case 'online':     return '4px solid #64748B'
    case 'presencial': return '4px solid #C9A84C'
    default:           return '4px solid #0F1C35'
  }
}

function CalendarioBloque({ evento, top, height, bg, fg, onClick }) {
  const estado = (evento.estado ?? '').toLowerCase()
  const isPendiente = estado === 'pendiente' || estado === 'reservado'
  const isCancelado = estado === 'cancelado' || estado === 'rechazada' || estado === 'cancelada'

  // Pendiente: fondo blanco con borde punteado del color del tipo.
  // Sólido: bg del tipo + texto auto. Cancelado: opacidad + tachado.
  const canal = evento.canal ?? ''
  const style = isPendiente
    ? {
        top, height,
        backgroundColor: '#FFFFFF',
        color: bg,
        border: `2px dashed ${bg}`,
        borderLeft: borderDeCanal(canal),
      }
    : {
        top, height,
        backgroundColor: bg,
        color: fg,
        border: '1px solid rgba(0,0,0,0.05)',
        borderLeft: borderDeCanal(canal),
      }

  const cls =
    'absolute left-1 right-1 overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight transition-shadow'
    + (onClick ? ' cursor-pointer hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent' : '')
    + (isCancelado ? ' opacity-40 line-through' : '')

  const tooltip = [
    timeOf(isoDeEvento(evento)) || evento.hora,
    evento.titulo,
    evento.subtitulo,
    evento.estado,
  ].filter(Boolean).join(' · ')

  const content = (
    <>
      <p className="truncate font-semibold">
        {timeOf(isoDeEvento(evento)) || evento.hora || '—'}
        {evento.numero ? ` · #${evento.numero}` : ''}
        {evento.titulo ? ` · ${evento.titulo}` : ''}
      </p>
      {evento.subtitulo && (
        <p className="truncate text-[9px] opacity-80">{evento.subtitulo}</p>
      )}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        title={tooltip}
        onClick={() => onClick(evento)}
        className={cls + ' text-left'}
        style={style}
      >
        {content}
      </button>
    )
  }
  return (
    <div title={tooltip} className={cls} style={style}>
      {content}
    </div>
  )
}

export default function CalendarioSemanal({
  weekStart,
  eventos = [],
  loading = false,
  onEventoClick,
  colorPorTipo,
  leyenda,
  onPrev, onToday, onNext,
  weekLabel,
}) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      return d
    }),
    [weekStart],
  )

  const eventosPorDia = useMemo(() => {
    const map = days.map(d => ({ ymd: ymdArg(d), items: [] }))
    for (const ev of (eventos ?? [])) {
      const iso = isoDeEvento(ev)
      if (!iso) continue
      const key = ymdArg(iso)
      const col = map.find(d => d.ymd === key)
      if (col) col.items.push(ev)
    }
    return map.map(d => d.items)
  }, [eventos, days])

  const todayYmd = ymdArg(new Date())
  const weekRange = weekLabel || `${shortDateOf(days[0])} – ${shortDateOf(days[6])}`

  return (
    <div className="space-y-3">
      {/* Navegación + rango — opcional. Si no se pasan callbacks la
          barra se omite por completo y el calendario queda standalone. */}
      {(onPrev || onToday || onNext) && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Semana anterior
          </button>
          <div className="flex items-center gap-3 text-sm">
            {onToday && (
              <button
                type="button"
                onClick={onToday}
                className="font-medium text-primary hover:underline"
              >
                Esta semana
              </button>
            )}
            <span className="font-semibold text-primary">{weekRange}</span>
          </div>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Semana siguiente →
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-card">
        {/* Header con días de la semana */}
        <div className="grid min-w-[840px] grid-cols-[60px_repeat(7,minmax(110px,1fr))] border-b border-border bg-primary-50">
          <div />
          {days.map((d, i) => {
            const isToday = ymdArg(d) === todayYmd
            return (
              <div
                key={i}
                className={`border-l border-border px-2 py-2 text-center ${
                  isToday ? 'bg-[#F5F4EF]' : ''
                }`}
              >
                <p className="font-sora text-xs font-bold text-primary">{DAY_LABELS[i]}</p>
                <p className="text-[11px] text-primary-400">{shortDateOf(d)}</p>
              </div>
            )
          })}
        </div>

        {/* Cuerpo con grilla horaria */}
        <div
          className="grid min-w-[840px] grid-cols-[60px_repeat(7,minmax(110px,1fr))]"
          style={{ height: TOTAL_HEIGHT }}
        >
          {/* Columna de horas */}
          <div className="relative bg-primary-50/40">
            {Array.from({ length: SLOTS_COUNT }, (_, i) => {
              const totalMin = i * 30
              const h = START_HOUR + Math.floor(totalMin / 60)
              const m = totalMin % 60
              const isHour = m === 0
              return (
                <div
                  key={i}
                  className={`absolute left-0 right-0 px-1 text-[10px] text-primary-400 ${
                    isHour ? 'border-t border-border' : ''
                  }`}
                  style={{ top: i * SLOT_HEIGHT_PX, height: SLOT_HEIGHT_PX }}
                >
                  {isHour ? `${String(h).padStart(2, '0')}:00` : ''}
                </div>
              )
            })}
          </div>

          {/* 7 columnas de días */}
          {days.map((day, di) => {
            const isToday = ymdArg(day) === todayYmd
            return (
              <div
                key={di}
                className={`relative border-l border-border ${isToday ? 'bg-[#F5F4EF]' : ''}`}
                style={{ height: TOTAL_HEIGHT }}
              >
                {/* Líneas de la grilla */}
                {Array.from({ length: SLOTS_COUNT }, (_, i) => (
                  <div
                    key={i}
                    className={`absolute left-0 right-0 ${
                      i % 2 === 0 ? 'border-t border-border' : 'border-t border-border/40'
                    }`}
                    style={{ top: i * SLOT_HEIGHT_PX }}
                  />
                ))}

                {/* Bloques del día */}
                {eventosPorDia[di].map(ev => {
                  const iso = isoDeEvento(ev)
                  if (!iso) return null
                  const startMin = minutosDesdeInicio(iso)
                  if (startMin == null) return null
                  const duracion = Math.max(15, Number(ev.duracion_min ?? 30))
                  const top    = Math.max(0, startMin * PX_PER_MIN)
                  const height = Math.max(SLOT_HEIGHT_PX - 2, duracion * PX_PER_MIN - 2)
                  if (top > TOTAL_HEIGHT) return null
                  const bg = colorDeEvento(ev, colorPorTipo)
                  const fg = pickFg(bg)
                  return (
                    <CalendarioBloque
                      key={ev.id}
                      evento={ev}
                      top={top}
                      height={Math.min(height, TOTAL_HEIGHT - top)}
                      bg={bg}
                      fg={fg}
                      onClick={onEventoClick}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Estado de carga superpuesto */}
        {loading && (
          <div className="border-t border-border bg-primary-50/40 px-4 py-3">
            <div className="flex items-center justify-center gap-2 text-xs text-primary-500">
              <Spinner size="sm" /> Cargando eventos…
            </div>
          </div>
        )}
      </div>

      {/* Leyenda — chips de color + label */}
      {Array.isArray(leyenda) && leyenda.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-white px-4 py-2 text-xs text-primary-600">
          {leyenda.map((l, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-5 rounded"
                style={{ backgroundColor: l.color }}
                aria-hidden="true"
              />
              <span>{l.label}</span>
            </span>
          ))}
          <span className="ml-auto inline-flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-3 w-5 rounded border-2 border-dashed border-primary" />
              Pendiente
            </span>
            <span className="inline-flex items-center gap-1 line-through opacity-50">
              <span className="inline-block h-3 w-5 rounded bg-primary opacity-50" />
              Cancelado
            </span>
          </span>
        </div>
      )}
    </div>
  )
}
