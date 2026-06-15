// =============================================================
// useSubdomainTenant — detección del slug del municipio desde
// el subdominio de la URL actual.
//
// Arquitectura multi-tenant:
//   - demo.comunas.lat → slug 'real-sayana' (fallback default)
//   - realsayana.comunas.lat → slug 'real-sayana'
//   - localhost / 127.0.0.1 → slug 'real-sayana' (dev local)
//
// Conversión de slug:
//   - Si el subdominio viene camelCase (ej: realSayana), lo
//     convierte a kebab-case (real-sayana) para matchear con
//     municipios.slug en la DB.
//
// NO hace query a Supabase — solo parsea el hostname. La query
// la hace usePortalMunicipioId (que ya existe y usa el slug
// para buscar en DB).
// =============================================================

export function useSubdomainTenant() {
  const hostname = window.location.hostname
  let slug = 'real-sayana' // fallback para localhost y demo

  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    const parts = hostname.split('.')
    if (parts.length >= 3) {
      const sub = parts[0]
      // Subdominio reservados caen al fallback (www, demo, app)
      if (!['www', 'demo', 'app'].includes(sub)) {
        // Conversión camelCase → kebab-case
        // realSayana → real-sayana
        slug = sub.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
      }
    }
  }
  return slug
}
