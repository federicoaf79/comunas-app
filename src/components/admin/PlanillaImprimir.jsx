import { medicoGuardia } from '../../lib/mockData'
import { useTurnos } from '../../hooks/useTurnos'
import { useDatosMunicipio } from '../../hooks/useConfigPortal'
import { timeOf, shortDateOf } from '../../lib/datetime'

// =============================================================
// PlanillaImprimir — hoja imprimible de los turnos de un día.
//
// La renderizamos siempre montada pero invisible en pantalla; el
// bloque `@media print` de Sala PA hace visible SOLO este nodo
// (clase `.planilla-print`) durante la impresión, ocultando el
// resto del layout. Eso permite mantener el dev server abierto y
// disparar window.print() sin abrir una ventana nueva.
//
// Carga los turnos del día seleccionado vía useTurnos — el cache
// de react-query queda warm para el resto de la app.
// =============================================================

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

export default function PlanillaImprimir({ fecha, dependenciaId, dependenciaNombre }) {
  // useTurnos siempre activo: el componente está mounted detrás
  // del layout y necesita los datos listos cuando el usuario
  // dispara window.print().
  const { turnos = [], isLoading } = useTurnos({
    fecha,
    dependenciaId: dependenciaId ?? undefined,
  })

  const { datos, identidad } = useDatosMunicipio()
  const muniNombre = datos?.nombre || 'Municipio'
  const logoUrl    = identidad?.logo_url || null

  const ordenados = (turnos ?? [])
    .slice()
    .filter(t => t.estado !== 'cancelado')
    .sort((a, b) => (a.fecha_hora ?? '').localeCompare(b.fecha_hora ?? ''))

  const ahora = new Date()
  const generadoEn = `${shortDateOf(ahora)} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`

  return (
    <div
      className="planilla-print"
      // El display en pantalla queda oculto via @media screen en
      // el style global de Sala PA; en @media print se hace block.
      aria-hidden="true"
    >
      <header className="planilla-header">
        <div className="planilla-header-row">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={muniNombre}
              className="planilla-logo"
            />
          )}
          <div>
            <p className="planilla-muni">{muniNombre}</p>
            <h1 className="planilla-title">SALA DE PRIMEROS AUXILIOS</h1>
            <p className="planilla-sub">{dependenciaNombre || 'CAPS Real Sayana'}</p>
          </div>
        </div>
        <div className="planilla-meta">
          <p><strong>Fecha:</strong> {shortDateOf(fecha)}</p>
          <p><strong>Médico de guardia:</strong> {medicoGuardia.nombre} · {medicoGuardia.matricula}</p>
          <p><strong>Especialidad:</strong> {medicoGuardia.especialidad}</p>
        </div>
      </header>

      <table className="planilla-table">
        <thead>
          <tr>
            <th style={{ width: '60px'  }}>Hora</th>
            <th>Paciente</th>
            <th style={{ width: '90px'  }}>DNI</th>
            <th style={{ width: '110px' }}>Teléfono</th>
            <th>Motivo</th>
            <th style={{ width: '80px'  }}>Estado</th>
            <th style={{ width: '120px' }}>Firma</th>
          </tr>
        </thead>
        <tbody>
          {isLoading && (
            <tr><td colSpan={7} style={{ textAlign: 'center' }}>Cargando turnos…</td></tr>
          )}
          {!isLoading && ordenados.length === 0 && (
            <tr><td colSpan={7} style={{ textAlign: 'center', color: '#666' }}>Sin turnos para esta fecha.</td></tr>
          )}
          {ordenados.map(t => (
            <tr key={t.id}>
              <td>{timeOf(t.fecha_hora) || '—'}</td>
              <td>{nombrePaciente(t)}</td>
              <td>{t.vecino?.dni || '—'}</td>
              <td>{t.vecino?.telefono || '—'}</td>
              <td>{t.motivo || '—'}</td>
              <td style={{ textTransform: 'capitalize' }}>{t.estado}</td>
              <td></td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="planilla-footer">
        <p>Total de turnos del día: <strong>{ordenados.length}</strong></p>
        <p className="planilla-footer-meta">
          Planilla generada por COMUNAS · {generadoEn}
        </p>
      </footer>
    </div>
  )
}
