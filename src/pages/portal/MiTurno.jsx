import PortalFormPage from '../../components/portal/PortalFormPage'
import ConsultarTurnoFormPortal from '../../components/portal/ConsultarTurnoFormPortal'

export default function MiTurno() {
  return (
    <PortalFormPage
      titulo="Consultar mi turno"
      descripcion="Ingresá tu DNI o el número de turno para ver el estado de tu solicitud."
    >
      <ConsultarTurnoFormPortal />
    </PortalFormPage>
  )
}
