// =============================================================
// Integración Google Calendar — DESACTIVADA
//
// Stubs listos para activar cuando estén las credenciales OAuth.
// Mientras tanto las funciones devuelven null/no-op para que el
// resto del código pueda llamarlas sin condicionales por todos lados.
// =============================================================

export function isCalendarEnabled() {
  // Cuando se cargue VITE_GOOGLE_CLIENT_ID en .env, este check
  // pasa a true y el resto de las funciones empiezan a operar.
  return !!import.meta.env.VITE_GOOGLE_CLIENT_ID
}

// TODO: integrar Google Calendar API.
// Plan de implementación cuando estén las credenciales:
//   1. Autenticar con OAuth 2.0 — scope: https://www.googleapis.com/auth/calendar.events
//      (VITE_GOOGLE_CLIENT_ID + flow PKCE en el browser, o vía backend con service account).
//   2. POST a calendar.events.insert con:
//        summary:        `Turno ${profesional?.nombre ?? ''} - #${turno.numero_turno ?? ''}`
//        description:    motivo / observaciones del turno
//        start.dateTime: turno.fecha_hora
//        end.dateTime:   turno.fecha_hora + duración default (configurable por dependencia)
//        attendees:      [{ email: vecino.email }] cuando corresponda
//        reminders:      24h y 1h antes
//   3. Retornar el `event.id` de Google para persistir en
//      turnos.calendar_event_id — useTurnos.createTurno se encarga
//      de la actualización de la fila.
export async function createCalendarEvent(_turno, _profesional) {
  if (!isCalendarEnabled()) return null
  return null
}

// TODO: calendar.events.delete({ calendarId, eventId })
export async function deleteCalendarEvent(_calendarEventId) {
  if (!isCalendarEnabled() || !_calendarEventId) return
  // no-op
}
