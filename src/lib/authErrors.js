// Traduce los mensajes de error más comunes que devuelve Supabase Auth
// (siempre en inglés) a texto entendible para un empleado municipal.
//
// Si el mensaje no matchea ningún caso conocido, se devuelve tal cual —
// preferible mostrar el original (que al menos alguien puede buscar o
// reportar) antes que inventar una traducción incorrecta para un caso
// que no vimos todavía.
const MAPEOS = [
  [/invalid login credentials/i,        'Email o contraseña incorrectos.'],
  [/email not confirmed/i,              'Todavía no confirmaste tu email. Revisá tu casilla de entrada.'],
  [/user already registered/i,          'Ya existe una cuenta con este email. Si es tuya, iniciá sesión o usá "¿Olvidaste tu contraseña?".'],
  [/password should be at least/i,      'La contraseña tiene que tener al menos 6 caracteres.'],
  [/new password should be different/i, 'La nueva contraseña tiene que ser diferente de la anterior.'],
  [/auth session missing/i,             'Tu sesión expiró. Volvé a abrir el link que te enviamos por email.'],
  [/rate limit/i,                       'Demasiados intentos. Esperá unos minutos y probá de nuevo.'],
]

export function traducirErrorAuth(message) {
  if (!message) return null
  const match = MAPEOS.find(([regex]) => regex.test(message))
  return match ? match[1] : message
}
