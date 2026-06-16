// =============================================================
// useSubdomainTenant — detección del slug del municipio desde
// el subdominio de la URL actual.
//
// Arquitectura multi-tenant:
//   - demo.comunas.lat → slug 'real-sayana' (fallback default)
//   - realsayana.comunas.lat → slug 'real-sayana'
//   - admin.comunas.lat → NO resuelve municipio (panel superadmin)
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
      // Subdominios reservados caen al fallback (www, demo, app, admin)
      if (!['www', 'demo', 'app', 'admin'].includes(sub)) {
        // Conversión camelCase → kebab-case
        // realSayana → real-sayana
        slug = sub.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
      }
    }
  }
  return slug
}

// =============================================================
// isAdminDomain — detecta si estamos en el dominio del panel
// de superadmin (admin.comunas.lat).
//
// Cuando es true, el router NO debe mostrar el portal ciudadano
// y solo permite acceso a usuarios con rol superadmin.
// =============================================================

export function isAdminDomain() {
  const hostname = window.location.hostname
  return hostname === 'admin.comunas.lat' || hostname.startsWith('admin.')
}

// =============================================================
// isLandingDomain — detecta si estamos en el dominio raíz
// de ventas (comunas.lat o www.comunas.lat).
//
// En producción: solo comunas.lat y www.comunas.lat
// En desarrollo: también localhost / 127.0.0.1
// Casos edge: hostnames sin punto (dev local sin dominio)
// =============================================================

export function isLandingDomain() {
  const h = window.location.hostname

  return h === 'comunas.lat' ||
         h === 'www.comunas.lat' ||
         h === 'localhost' ||
         h === '127.0.0.1' ||
         !h.includes('.')  // caso edge: hostname sin dominio
}
