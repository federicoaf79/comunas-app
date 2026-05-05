import Card from '../../components/ui/Card'

export default function SuperadminDashboard() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-primary">Superadmin</h1>
        <p className="text-sm text-primary-400">Gestión global de comisiones municipales.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Comisiones activas</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">Usuarios totales</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
        </Card>
        <Card>
          <h3 className="text-sm font-semibold text-primary-700">SMS del mes</h3>
          <p className="mt-1 text-3xl font-bold text-primary">—</p>
        </Card>
      </div>
    </div>
  )
}
