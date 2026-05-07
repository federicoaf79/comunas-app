import { ARG_TZ, timeOf, shortDateOf } from '../../lib/datetime'

// Layout: 30-min slots desde 07:00 hasta 20:00 (26 slots, 13 horas).
const SLOT_HEIGHT_PX = 40
const PX_PER_MIN     = SLOT_HEIGHT_PX / 30
const START_HOUR     = 7
const END_HOUR       = 20
const SLOTS_COUNT    = (END_HOUR - START_HOUR) * 2
const TOTAL_HEIGHT   = SLOTS_COUNT * SLOT_HEIGHT_PX

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

// Mapeo profesional → especialidad → color.
// Source priorizado: prof.especialidad (si la columna existe en la
// DB en el futuro), luego prof.nombre como fallback.
//
// Accesibilidad daltónica: además del color, cada especialidad tiene
// un marcador geométrico distintivo:
//   - clinico_general: solo bg navy
//   - cardiologo:      bg azul + borde IZQUIERDO 3px blanco
//   - pediatra:        bg gold + borde SUPERIOR 3px blanco
//   - otros:           bg slate-400 (#94A3B8) — más suave que gray-500
//                      para no competir visualmente con navy
const COLOR_BY_SPEC = {
  clinico_general: {
    solid:  'bg-primary text-white',
    dashed: 'bg-white border-2 border-dashed border-primary text-primary',
  },
  cardiologo: {
    solid:  'bg-ok text-white border-l-[3px] border-l-white',
    dashed: 'bg-white border-2 border-dashed border-ok text-ok',
  },
  pediatra: {
    solid:  'bg-accent text-primary border-t-[3px] border-t-white',
    dashed: 'bg-white border-2 border-dashed border-accent text-accent-700',
  },
  otros: {
    solid:  'bg-slate-400 text-white/90',
    dashed: 'bg-white border-2 border-dashed border-slate-400 text-slate-700',
  },
}

const SPEC_LABEL = {
  clinico_general: 'Clínico general',
  cardiologo:      'Cardiólogo',
  pediatra:        'Pediatra',
  otros:           'Sin especialidad asignada',
}

// Patrones case-insensitive para detectar especialidad. Cubren las
// variantes con/sin tilde y los términos sinónimos más comunes.
// Orden importa: la primera regex que matchea define la especialidad.
const SPEC_PATTERNS = [
  ['cardiologo',      /cardi[oó]log|cardiolog[ií]a|cardio/i],
  ['pediatra',        /pediatr[ií]a|pediatra|pediat/i],
  ['clinico_general', /medicina\s*general|cl[ií]nic[oa](?:\s*general)?|m[eé]dic[oa]\s*general|cl[ií]nica?/i],
]

function specOf(prof) {
  if (!prof) return 'otros'
  // Buscamos primero en `especialidad` (si vino del join), luego en
  // el nombre. Ambos en el mismo string para hacer un solo barrido.
  const text = `${prof.especialidad ?? ''} ${prof.nombre ?? ''}`
  for (const [key, pattern] of SPEC_PATTERNS) {
    if (pattern.test(text)) return key
  }
  return 'otros'
}

function blockClasses(spec, estado) {
  const c = COLOR_BY_SPEC[spec] ?? COLOR_BY_SPEC.otros
  if (estado === 'cancelado') return `${c.solid} opacity-40 line-through`
  if (estado === 'pendiente') return c.dashed
  return c.solid
}

function vecinoLabel(v) {
  if (!v) return 'Sin vecino'
  if (v.apellido) return `${v.apellido}${v.nombre ? `, ${v.nombre[0]}.` : ''}`
  return v.nombre_completo || v.nombre || 'Vecino'
}

// Minutos desde el inicio del calendario (07:00) en hora Argentina.
// IMPORTANTE: usamos `timeOf()` (Intl con timeZone='America/Argentina/Buenos_Aires')
// en vez de `new Date(...).getHours()` — Date.getHours devuelve la
// hora local del browser, que puede ser UTC en servers de preview o
// dev containers, y eso movía los bloques 3hs respecto al horario
// real Argentina. timeOf garantiza la conversión correcta.
function minutosDesdeInicio(iso) {
  const hm = timeOf(iso)              // "HH:MM" en TZ Argentina
  if (!hm) return null
  const [h, m] = hm.split(':').map(Number)
  return (h * 60 + m) - START_HOUR * 60
}

// "YYYY-MM-DD" del Date en TZ Argentina. Lo usamos como key para
// agrupar turnos por día sin caer en errores de offset.
const _ymdArgFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARG_TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
})
function ymdArg(d) {
  return _ymdArgFmt.format(d instanceof Date ? d : new Date(d))
}

export default function CalendarioSemanal({ weekStart, turnos = [] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const turnosByDay = days.map(day => {
    const key = ymdArg(day)
    return turnos.filter(t => ymdArg(t.fecha_hora) === key)
  })

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-card">
      {/* Header: días de la semana */}
      <div className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))] border-b border-border bg-primary-50">
        <div />
        {days.map((d, i) => (
          <div key={i} className="border-l border-border px-2 py-2 text-center">
            <p className="text-xs font-semibold text-primary">{DAY_LABELS[i]}</p>
            <p className="text-[11px] text-primary-400">{shortDateOf(d)}</p>
          </div>
        ))}
      </div>

      {/* Cuerpo: grilla horaria */}
      <div
        className="grid grid-cols-[60px_repeat(7,minmax(120px,1fr))]"
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
                {isHour ? `${String(h).padStart(2,'0')}:00` : ''}
              </div>
            )
          })}
        </div>

        {/* Columnas de días */}
        {days.map((_day, di) => (
          <div
            key={di}
            className="relative border-l border-border"
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

            {/* Bloques de turno */}
            {turnosByDay[di].map(t => {
              // Posición vertical: timeOf garantiza conversión a TZ Argentina.
              const startMin = minutosDesdeInicio(t.fecha_hora)
              if (startMin == null) return null
              const top = startMin * PX_PER_MIN
              if (top + SLOT_HEIGHT_PX < 0 || top > TOTAL_HEIGHT) return null

              const spec = specOf(t.profesional)
              const cls  = blockClasses(spec, t.estado)
              const profNombre = t.profesional?.nombre ?? t.profesional_nombre ?? ''
              // Para bloques sin especialidad, el subtítulo da contexto:
              // motivo del turno si existe en la fila, o "Sala PA" como
              // default — evita que se vea solo como un cuadro gris vacío.
              const subtext = spec === 'otros'
                ? (t.motivo || 'Sala PA')
                : profNombre
              const tooltip = [
                timeOf(t.fecha_hora),
                vecinoLabel(t.vecino),
                profNombre,
                t.estado,
              ].filter(Boolean).join(' · ')

              return (
                <div
                  key={t.id}
                  title={tooltip}
                  className={`absolute left-1 right-1 overflow-hidden rounded-md px-1.5 py-0.5 text-[10px] leading-tight ${cls}`}
                  style={{ top, height: SLOT_HEIGHT_PX }}
                >
                  <p className="truncate font-semibold">
                    {timeOf(t.fecha_hora)} · {vecinoLabel(t.vecino)}
                  </p>
                  {subtext && (
                    <p className="truncate text-[9px] opacity-80">{subtext}</p>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// Exportado para que la página pueda renderizar la leyenda usando
// los mismos colores y labels que los bloques.
export { COLOR_BY_SPEC, SPEC_LABEL }
