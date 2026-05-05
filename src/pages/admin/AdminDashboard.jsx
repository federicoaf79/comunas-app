import Card from '../../components/ui/Card'

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Panel de la comuna</h1>
        <p className="text-sm text-primary-400">CRM, historia clínica, turnos y SMS para tu comisión municipal.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Vecinos</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
          <p className="mt-1 text-xs text-primary-400">CRM municipal</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Turnos del día</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
          <p className="mt-1 text-xs text-primary-400">Agenda</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Historias clínicas</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
          <p className="mt-1 text-xs text-primary-400">HC del CAPS</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">SMS enviados</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
          <p className="mt-1 text-xs text-primary-400">Notificaciones</p>
        </Card>
      </div>

      <Card>
        <p className="text-sm text-primary-500">
          Próximamente: módulos de CRM, HC, Turnos y SMS.
        </p>
      </Card>
    </div>
  )
}
