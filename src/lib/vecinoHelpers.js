// Señales de completitud de datos de un vecino — compartidas entre el
// importador (post-alta, ImportadorVecinos.jsx) y el CRM (filtro manual,
// CrmVecinos.jsx).
//
// Son dos señales DISTINTAS a propósito, no una "corrección" de la otra:
// - vecinoSinContacto: ni teléfono ni email — nadie puede contactar a ese
//   vecino por ningún canal. Es el criterio histórico del importador.
// - vecinoSinEmail: no tiene email, tenga o no teléfono. Más amplio que
//   el anterior (a alguien con teléfono pero sin email lo agarra esta
//   señal y no la otra) — es la que importa antes de dar de alta staff,
//   porque el vínculo usuarios↔vecinos es únicamente por email
//   (current_vecino_id() matchea por ahí).
export function vecinoSinContacto(vecino) {
  return !vecino?.telefono && !vecino?.email
}

export function vecinoSinEmail(vecino) {
  return !vecino?.email
}
