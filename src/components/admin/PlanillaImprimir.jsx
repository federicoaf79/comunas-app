import { useMedicoGuardia } from '../../hooks/useMedicoGuardia'
import { useTurnos } from '../../hooks/useTurnos'
import { useDatosMunicipio } from '../../hooks/useConfigPortal'
import { timeOf, longDateOf, shortDateOf } from '../../lib/datetime'

// =============================================================
// PlanillaImprimir — hoja imprimible A4 (portrait) de los turnos
// de un día. Estructura aproximada:
//
//   HEADER  ~20%  Logo + título centrado + fecha + médico de guardia
//   TABLA   ~70%  HORA · PACIENTE · DNI · TELÉFONO · MOTIVO · ATENDIDO
//                 Altura de fila 35px; filas vacías de relleno para
//                 que la planilla siempre llene una hoja.
//   FOOTER  ~10%  Total, duración por turno, generado por COMUNAS,
//                 línea de firma del médico.
//
// El elemento se monta siempre pero está oculto en pantalla (regla
// `.planilla-print { display: none }` co-localizada acá mismo, ver
// abajo — no depende de que la página que lo use declare ese CSS).
// El resto de las reglas `@media print` (posicionamiento, tipografía)
// vive en la página que expone el botón "Imprimir" (hoy: solo
// SalaPrimerosAuxilios.jsx) y hace visible SOLO este nodo durante
// la impresión.
// =============================================================

// Cantidad mínima de filas que la planilla siempre muestra. Si hay
// menos turnos, completamos con filas vacías para que el operador
// pueda anotar pacientes que llegan sin turno previo (común en
// salas rurales).
const FILAS_MINIMAS = 12

function nombrePaciente(t) {
  if (t?.metadata?.sin_registro && t?.metadata?.nombre_libre) {
    return `${t.metadata.nombre_libre} (sin registro)`
  }
  const v = t?.vecino
  if (!v) {
    if (t?.motivo) return t.motivo
    return 'Sin paciente asignado'
  }
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

export default function PlanillaImprimir({
  fecha,
  dependenciaId,
  municipioId,
  duracionTurnoMin = 30,
  dependenciaNombre = 'Sala de Primeros Auxilios',
  subtitulo = 'CAPS',
}) {
  // useTurnos siempre activo: el componente está mounted detrás
  // del layout y necesita los datos listos cuando el usuario
  // dispara window.print().
  const { turnos = [], isLoading } = useTurnos({
    fecha,
    dependenciaId: dependenciaId ?? undefined,
  })

  const { data: medicoGuardia } = useMedicoGuardia(municipioId)

  const { datos, identidad } = useDatosMunicipio()
  const muniNombre = datos?.nombre || datos?.nombre_oficial || 'Comisión Municipal Real Sayana'
  const logoUrl    = identidad?.logo_url || null

  // Turnos del día ordenados por hora, descartando los cancelados.
  const ordenados = (turnos ?? [])
    .slice()
    .filter(t => t.estado !== 'cancelado')
    .sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))

  // Filas vacías de relleno — calculadas tras los reales para que
  // la planilla siempre tenga al menos FILAS_MINIMAS líneas.
  const filasVacias = Math.max(0, FILAS_MINIMAS - ordenados.length)

  const ahora = new Date()
  const generadoEn = `${shortDateOf(ahora)} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  const fechaLarga = longDateOf(fecha)

  return (
    <>
      {/* Regla base "oculto en pantalla" co-localizada con el componente:
          no depender de que la página que lo monta declare este CSS —
          ver hallazgo de auditoría 2026-07-23 (Odontologia.jsx montaba
          esta planilla sin nunca ocultarla). El resto de las reglas de
          @media print (posicionamiento, tipografía, etc.) sigue viviendo
          en la página que expone el botón "Imprimir" (hoy solo Sala de
          Primeros Auxilios). */}
      <style>{`.planilla-print { display: none; }`}</style>
      <div className="planilla-print" aria-hidden="true">
      {/* ===== HEADER ===== */}
      <header className="planilla-header">
        <div className="planilla-header-row">
          {logoUrl ? (
            <img src={logoUrl} alt={muniNombre} className="planilla-logo" />
          ) : (
            <div className="planilla-logo" aria-hidden="true" />
          )}
          <div className="planilla-titles">
            <h1 className="planilla-title">{dependenciaNombre.toUpperCase()}</h1>
            <p className="planilla-sub">
              {subtitulo ? `${subtitulo} — ${muniNombre}` : muniNombre}
            </p>
          </div>
        </div>

        <div className="planilla-meta">
          <p>
            <strong>Turnos del día:</strong>{' '}
            {fechaLarga || shortDateOf(fecha)}
          </p>
          <p style={{ textAlign: 'right' }}>
            <strong>Médico de guardia:</strong>{' '}
            {medicoGuardia ? (
              <>
                {medicoGuardia.nombre}
                <br />
                Mat. {medicoGuardia.matricula || '—'} · {medicoGuardia.hora_desde} – {medicoGuardia.hora_hasta}
              </>
            ) : (
              'Sin guardia asignada'
            )}
          </p>
        </div>
      </header>

      {/* ===== TABLA ===== */}
      <table className="planilla-table">
        <colgroup>
          <col className="col-hora" />
          <col className="col-paciente" />
          <col className="col-dni" />
          <col className="col-telefono" />
          <col className="col-motivo" />
          <col className="col-atendido" />
        </colgroup>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Paciente</th>
            <th>DNI</th>
            <th>Teléfono</th>
            <th>Motivo</th>
            <th>Atendido</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', color: '#666' }}>
                Cargando turnos…
              </td>
            </tr>
          )}

          {!isLoading && ordenados.map(t => (
            <tr key={t.id}>
              <td>{timeOf(t.fecha_hora) || '—'}</td>
              <td>{nombrePaciente(t)}</td>
              <td>{t.vecino?.dni || '—'}</td>
              <td>{t.vecino?.telefono || '—'}</td>
              <td>{t.motivo || '—'}</td>
              <td className="col-atendido-cell">□</td>
            </tr>
          ))}

          {/* Filas vacías de relleno — preservan la altura de la
              hoja para que el operador pueda anotar a mano. */}
          {!isLoading && Array.from({ length: filasVacias }).map((_, i) => (
            <tr key={`empty-${i}`} className="row-empty">
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td>&nbsp;</td>
              <td className="col-atendido-cell" style={{ color: '#000' }}>□</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ===== FOOTER ===== */}
      <footer className="planilla-footer">
        <div className="planilla-footer-left">
          <p>
            <strong>Total de turnos programados:</strong> {ordenados.length}
          </p>
          <p>
            <strong>Duración por turno:</strong> {duracionTurnoMin} min
          </p>
          <p className="planilla-footer-meta">
            Generado por COMUNAS — {generadoEn}
          </p>
        </div>
        <div className="planilla-footer-right">
          <div className="planilla-footer-firma">
            Firma del médico
          </div>
        </div>
      </footer>
      </div>
    </>
  )
}
