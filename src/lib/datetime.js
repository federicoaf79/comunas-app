// =============================================================
// Helpers de fecha/hora — TZ Argentina
//
// La DB guarda timestamptz (UTC). Toda la UI muestra al usuario
// en hora Argentina (UTC-3). Los filtros que arman rangos de
// fecha también usan offset -03:00 explícito para que Postgres
// los interprete bien.
// =============================================================

export const ARG_TZ     = 'America/Argentina/Buenos_Aires'
export const ARG_OFFSET = '-03:00'

const _timeFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARG_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const _dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: ARG_TZ,
  year:  'numeric',
  month: '2-digit',
  day:   '2-digit',
})

const _shortDateFmt = new Intl.DateTimeFormat('es-AR', {
  timeZone: ARG_TZ,
  day:   '2-digit',
  month: 'short',
})

// "HH:MM" en horario Argentina.
export function timeOf(iso) {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d)) return ''
  return _timeFmt.format(d)
}

// "YYYY-MM-DD" en horario Argentina.
export function dateOf(iso) {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d)) return ''
  return _dateFmt.format(d)
}

// "YYYY-MM-DD · HH:MM" en horario Argentina.
export function dateTimeOf(iso) {
  if (!iso) return '—'
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d)) return String(iso)
  return `${_dateFmt.format(d)} · ${_timeFmt.format(d)}`
}

// "DD MMM" en horario Argentina (para headers de calendario).
export function shortDateOf(iso) {
  if (!iso) return ''
  const d = iso instanceof Date ? iso : new Date(iso)
  if (isNaN(d)) return ''
  return _shortDateFmt.format(d)
}

// Hoy como string YYYY-MM-DD en horario Argentina.
export function todayArgYMD() {
  return _dateFmt.format(new Date())
}
