// DerivacionCard — fila/card de una ordenes_derivacion, reusada en
// VecinoHC.jsx (CRM admin), HCTab de AtencionDrawer.jsx y SaludTab del
// portal. `children` es un slot para que cada lugar agregue su propio
// pie (indicador de uso, CTA de reserva, etc.) sin bifurcar el diseño
// base con props de variante.

const ESTADO_BADGE = {
  pendiente:  'inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-700 ring-1 ring-inset ring-accent-100',
  validada:   'inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ok-700 ring-1 ring-inset ring-ok-100',
  rechazada:  'inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-danger ring-1 ring-inset ring-red-100',
}

const ORIGEN_INFO = {
  digital: {
    label: 'Digital · CIC',
    className: 'inline-flex items-center rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-700 ring-1 ring-inset ring-primary-200',
  },
  fisica: {
    label: 'Física · orden subida',
    className: 'inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-600 ring-1 ring-inset ring-primary-200',
  },
}

function formatFecha(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d)) return String(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function DerivacionCard({ derivacion, children }) {
  const d = derivacion
  const origen = ORIGEN_INFO[d.origen] ?? { label: d.origen || '—', className: ORIGEN_INFO.fisica.className }
  const estadoClass = ESTADO_BADGE[d.estado] ?? ESTADO_BADGE.pendiente

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary">
            {d.especialidad_destino || 'Especialidad no especificada'}
          </p>
          <p className="mt-0.5 text-xs text-primary-400">
            {formatFecha(d.created_at)}
            {d.dependencia_destino?.nombre && ` · ${d.dependencia_destino.nombre}`}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <span className={origen.className}>{origen.label}</span>
          <span className={estadoClass}>{d.estado}</span>
        </div>
      </div>
      {(d.diagnostico || d.indicaciones) && (
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
          {d.diagnostico && (
            <div>
              <p className="font-semibold uppercase tracking-wide text-primary-400">Diagnóstico</p>
              <p className="mt-0.5 text-primary-700">{d.diagnostico}</p>
            </div>
          )}
          {d.indicaciones && (
            <div>
              <p className="font-semibold uppercase tracking-wide text-primary-400">Indicaciones</p>
              <p className="mt-0.5 text-primary-700">{d.indicaciones}</p>
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
