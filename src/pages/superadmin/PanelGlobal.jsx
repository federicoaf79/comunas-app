// Placeholder del Panel Global del SuperAdmin — KPIs cross-municipio
// (consumo de SMS, usuarios totales, comisiones activas, etc.).
// La pantalla real se cablea cuando estén las queries agregadas.
export default function PanelGlobal() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Panel global</h1>
        <p className="text-sm text-primary-400">
          Vista cross-municipio del sistema
        </p>
      </header>

      <div className="rounded-xl border border-primary-200 bg-primary p-8 shadow-lg">
        <div className="flex items-start gap-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-12 w-12 shrink-0 text-accent"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          <div>
            <h2 className="font-sora text-xl font-bold text-accent">
              Panel global en desarrollo
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-white/90">
              Próximamente: métricas cross-municipio, consumo de SMS y usuarios activos.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
