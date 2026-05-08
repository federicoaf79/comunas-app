// =============================================================
// Helpers compartidos por las vistas de noticias (portal home,
// listado completo y detalle). Centralizan el mapeo
// categoría → color de fondo del placeholder y categoría → ícono
// SVG, además de un getResumen consistente.
//
// PROHIBIDO el verde — los colores de categoría caen a tonos
// pastel navy/azul/gold/cream sin pasar nunca por verde.
// =============================================================

// Mapa categoría → color de fondo del placeholder (HEX). Tonos
// pastel y suaves para mantener un look editorial sin ruido.
export function bgColorForCategoria(categoria) {
  const c = (categoria ?? '').toLowerCase()
  if (/salud|caps|m[eé]dic/.test(c))            return '#DBEAFE' // azul claro
  if (/educ|escuel/.test(c))                    return '#FEF3C7' // gold claro
  if (/obra|infra|catastro/.test(c))            return '#E2E8F0' // slate
  if (/deport/.test(c))                         return '#E0E7FF' // navy claro
  if (/social|comunidad|familia/.test(c))       return '#F5F4EF' // cream
  if (/servic|tr[aá]mite/.test(c))              return '#F1F5F9' // gris
  if (/instituc|gobierno|comuna|gesti|administraci/.test(c)) return '#E8ECF5' // navy muy claro
  return '#F5F4EF'
}

// Ícono representativo por categoría — SVG inline, dibujado en
// `currentColor` para heredar el color del wrapper (typically navy).
export function iconForCategoria(categoria, sizeClass = 'h-12 w-12') {
  const c = (categoria ?? '').toLowerCase()
  // Salud — cruz médica
  if (/salud|caps|m[eé]dic/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={sizeClass}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />
      </svg>
    )
  }
  // Educación — libro abierto
  if (/educ|escuel/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={sizeClass}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 0 1 2-2h6v16H5a2 2 0 0 0-2 2V5zM21 5a2 2 0 0 0-2-2h-6v16h6a2 2 0 0 1 2 2V5z" />
      </svg>
    )
  }
  // Obras — engranaje
  if (/obra|infra|catastro/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={sizeClass}>
        <circle cx="12" cy="12" r="3.2" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
      </svg>
    )
  }
  // Deportes — pelota
  if (/deport/.test(c)) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={sizeClass}>
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l3 5-3 4-3-4 3-5zM3 12l5 3 4-3-4-3-5 3zM21 12l-5 3-4-3 4-3 5 3zM12 21l-3-5 3-4 3 4-3 5z" />
      </svg>
    )
  }
  // Default — megáfono
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={sizeClass}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
    </svg>
  )
}

// Deriva un resumen corto. Prioriza `resumen` si está presente,
// si no toma los primeros `max` caracteres del cuerpo y agrega
// elipsis cuando trunca.
export function getResumen(noticia, max = 180) {
  if (noticia.resumen?.trim()) return noticia.resumen
  const cuerpo = noticia.cuerpo?.trim()
  if (!cuerpo) return null
  return cuerpo.length > max ? `${cuerpo.slice(0, max).trimEnd()}…` : cuerpo
}
