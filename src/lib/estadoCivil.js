// Estado civil — valores exactos del CHECK de vecinos.estado_civil.
// Única fuente de verdad: CRM (VecinoFormModal) y portal (DatosTab)
// importan de acá, nunca redefinen el mapa por su cuenta.
export const ESTADO_CIVIL_LABEL = {
  soltero:             'Soltero/a',
  casado:              'Casado/a',
  union_convivencial:  'Unión convivencial',
  divorciado:          'Divorciado/a',
  viudo:               'Viudo/a',
  separado:            'Separado/a',
}

export const ESTADO_CIVIL_OPTS = Object.entries(ESTADO_CIVIL_LABEL)
  .map(([value, label]) => ({ value, label }))
