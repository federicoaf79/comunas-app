import { medicoGuardia } from '../../lib/mockData'
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
// El elemento se monta siempre pero está oculto en pantalla; el
// bloque `@media print` definido en SalaPrimerosAuxilios.jsx hace
// visible SOLO este nodo durante la impresión.
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
  duracionTurnoMin = 30,
}) {
  // useTurnos siempre activo: el componente está mounted detrás
  // del layout y necesita los datos listos cuando el usuario
  // dispara window.print().
  const { turnos = [], isLoading } = useTurnos({
    fecha,
    dependenciaId: dependenciaId ?? undefined,
  })

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
            <h1 className="planilla-title">SALA DE PRIMEROS AUXILIOS</h1>
            <p className="planilla-sub">
              CAPS — {muniNombre}
            </p>
          </div>
        </div>

        <div className="planilla-meta">
          <p>
            <strong>Turnos del día:</strong>{' '}
            {fechaLarga || shortDateOf(fecha)}
          </p>
          <p style={{ textAlign: 'right' }}>
            <strong>Médico de guardia:</strong> {medicoGuardia.nombre}
            <br />
            Mat. {medicoGuardia.matricula} · {medicoGuardia.desde} – {medicoGuardia.hasta}
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
  )
}
