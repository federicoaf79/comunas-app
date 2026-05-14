import PortalFormPage from '../../components/portal/PortalFormPage'
import SacarTurnoFormPortal from '../../components/portal/SacarTurnoFormPortal'

export default function SacarTurno() {
  return (
    <PortalFormPage
      titulo="Sacar turno online"
      descripcion="Completá el formulario y te confirmamos por WhatsApp o SMS en menos de 24 horas."
      compact
    >
      <SacarTurnoFormPortal />
    </PortalFormPage>
  )
}
