// Mapea tipo de dependencia → nombre de módulo en modulos_config.
// Se usa para resolver la config de un módulo (ej. `solo_informativo`)
// a partir del tipo de una dependencia — tanto en el sidebar admin
// (AdminLayout.jsx) como en el portal público (DependenciaPublica.jsx).
//
// OJO: esto es puramente para leer `config`, no dispara ningún gate
// on/off de módulo contratado — esos siguen atados solo a los
// `modulo` que cada entrada ya declaraba explícitamente.
export const MODULO_POR_TIPO = {
  salud:   'sala_pa',
  sala:    'sala_pa',
  caps:    'sala_pa',
  juzgado: 'juez_paz',
}

export function moduloParaTipo(tipo) {
  return MODULO_POR_TIPO[(tipo ?? '').toLowerCase()] ?? null
}
