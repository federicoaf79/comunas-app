import { VALE_ESTADOS } from '../../lib/valeEstado'

// =============================================================
// EstadoBadge — badge de estado de vale para pantallas de staff.
//
// Vive en su propio archivo (no dentro de ValesEmitidos.jsx) para
// que ValeDetalleModal.jsx pueda importarlo sin crear un ciclo
// página -> modal -> página.
//
// Estilo propio (badge sólido) -- distinto del pill suave que usa el
// portal del vecino (VALE_UI en lib/valeEstado.js), a propósito: son
// contextos distintos. Lo que NO puede duplicarse es la LISTA de
// estados, por eso se valida contra VALE_ESTADOS más abajo.
// =============================================================

const ESTADO_BADGES = {
  emitido:  { bg: 'bg-[#0F1C35]',  text: 'text-white',   label: 'Emitido' },
  abierto:  { bg: 'bg-[#1D4ED8]',  text: 'text-white',   label: 'Abierto' },
  canjeado: { bg: 'bg-ok',         text: 'text-white',   label: 'Canjeado' },
  vencido:  { bg: 'bg-slate-400',  text: 'text-white',   label: 'Vencido' },
  quemado:  { bg: 'bg-slate-400',  text: 'text-white',   label: 'Quemado' },
  cancelado:{ bg: 'bg-red-100',    text: 'text-red-700', label: 'Cancelado' },
}

if (import.meta.env.DEV) {
  const faltantes = VALE_ESTADOS.filter(e => !(e in ESTADO_BADGES))
  if (faltantes.length) {
    console.warn(`ESTADO_BADGES no cubre estos estados de VALE_ESTADOS: ${faltantes.join(', ')}`)
  }
}

// Un estado sin mapear se muestra crudo y en gris neutro -- tiene que
// verse raro, no disfrazarse del más inocuo (ya pasó con 'quemado'
// antes de existir en este mapa: se mostraba como "Emitido").
export function EstadoBadge({ estado }) {
  const b = ESTADO_BADGES[estado] ?? { bg: 'bg-slate-200', text: 'text-slate-600', label: estado }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.bg} ${b.text}`}>
      {b.label}
    </span>
  )
}
