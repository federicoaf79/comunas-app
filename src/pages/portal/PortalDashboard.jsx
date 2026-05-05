import Card from '../../components/ui/Card'

export default function PortalDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Mi portal</h1>
        <p className="text-sm text-primary-400">Tus turnos, trámites y notificaciones de la comuna.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Próximos turnos</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Trámites activos</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Notificaciones</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
        </Card>
      </div>
    </div>
  )
}
