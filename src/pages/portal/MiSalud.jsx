import PortalFormPage from '../../components/portal/PortalFormPage'
import MiSaludForm from '../../components/portal/MiSaludForm'

export default function MiSalud() {
  return (
    <PortalFormPage
      titulo="Mi Salud"
      descripcion="Consultá el resumen de tus últimas atenciones en la Sala de Primeros Auxilios. Verificamos tu identidad cruzando DNI y teléfono registrado."
    >
      <MiSaludForm />
    </PortalFormPage>
  )
}
