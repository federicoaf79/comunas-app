// Estados reales en DB (CHECK vales_estado_check):
// emitido | abierto | canjeado | vencido | quemado | cancelado
//
// El pg_cron 'expirar-vales' corre cada 5 min y persiste vencido/quemado.
// Este helper cubre SOLO esa ventana de hasta 5 min en la que la fila
// todavía dice 'emitido'/'abierto' pero el reloj ya pasó. No es la
// fuente de verdad: la autoridad es el server (RPCs + cron).

const TERMINALES = ['canjeado', 'vencido', 'quemado', 'cancelado']

export function estadoEfectivo(vale, ahora = Date.now()) {
  if (!vale) return null
  if (TERMINALES.includes(vale.estado)) return vale.estado

  if (vale.estado === 'abierto') {
    if (!vale.vence_apertura_en) return 'abierto'
    return ahora <= new Date(vale.vence_apertura_en).getTime()
      ? 'abierto'
      : 'quemado'
  }

  if (vale.estado === 'emitido') {
    const finVigencia =
      new Date(vale.emitido_en).getTime() + vale.vigencia_horas * 3600_000
    return ahora <= finVigencia ? 'emitido' : 'vencido'
  }

  return vale.estado
}

// Milisegundos restantes de la ventana de canje. Devuelve 0 si venció.
// Usa el reloj del dispositivo contra vence_apertura_en (timestamp del
// server). Si el celular tiene la hora mal puesta el countdown se ve
// corrido, pero es COSMÉTICO: quien acepta o rechaza el canje es
// canjear_vale() en el server, nunca esta cuenta.
export function msRestantes(vale) {
  if (!vale?.vence_apertura_en) return 0
  const restante = new Date(vale.vence_apertura_en).getTime() - Date.now()
  return restante > 0 ? restante : 0
}

export function formatearCountdown(ms) {
  const total = Math.floor(ms / 1000)
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

// Presentación. CERO VERDE: activo en azul, terminales en gris.
export const VALE_UI = {
  emitido:   { label: 'Disponible',  color: '#1D4ED8', bg: '#EFF6FF' },
  abierto:   { label: 'En uso',      color: '#C9A84C', bg: '#FDF8EC' },
  canjeado:  { label: 'Canjeado',    color: '#0F1C35', bg: '#F5F4EF' },
  vencido:   { label: 'Vencido',     color: '#64748B', bg: '#F1F5F9' },
  quemado:   { label: 'Perdido',     color: '#64748B', bg: '#F1F5F9' },
  cancelado: { label: 'Cancelado',   color: '#64748B', bg: '#F1F5F9' },
}
