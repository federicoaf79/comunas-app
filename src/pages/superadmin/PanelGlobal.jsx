import Card from '../../components/ui/Card'

// Placeholder del Panel Global del SuperAdmin — KPIs cross-municipio
// (consumo de SMS, usuarios totales, comisiones activas, etc.).
// La pantalla real se cablea cuando estén las queries agregadas.
export default function PanelGlobal() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Panel global</h1>
        <p className="text-sm text-primary-400">
          Vista cross-municipio del sistema. (En construcción)
        </p>
      </header>

      <Card>
        <p className="text-sm text-primary-500">
          Próximamente: comisiones activas, usuarios totales, consumo de SMS,
          turnos del mes y reportes consolidados.
        </p>
      </Card>
    </div>
  )
}
