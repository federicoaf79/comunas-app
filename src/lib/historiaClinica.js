// =============================================================
// historiaClinica — constantes y validadores para los campos
// obligatorios de la primera Historia Clínica de un vecino.
//
// Se usa desde:
//   - HistoriaClinicaForm (form reusable)
//   - TurnoPresencialModal (Sala Primeros Auxilios — crear vecino + HC)
//   - AtencionDrawer (Sala Primeros Auxilios — banner si vecino existente con HC
//     incompleta)
//
// Los campos exigidos son los acordados con dirección de Sala Primeros Auxilios:
// nombre, fecha_nac, dni, telefono, sexo, grupo_sanguineo, alergias
// (con check de "sin alergias conocidas"), barrio/localidad y
// contacto de emergencia (nombre + teléfono).
// =============================================================

export const GRUPOS_SANGUINEOS = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
]

export const GRUPOS_SANGUINEOS_OPTS =
  GRUPOS_SANGUINEOS.map(g => ({ value: g, label: g }))

// La DB persiste 'F' / 'M' / 'X' (CHECK constraint del schema
// original). En la UI mostramos "Otro" para X.
export const SEXO_OPTS = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'X', label: 'Otro' },
]

// DNI argentino: 7 u 8 dígitos. Los DNIs viejos pre-1968 podían tener
// 6, pero el sistema no los acepta para nuevos vecinos.
export function validateDniArg(dni) {
  const t = String(dni ?? '').replace(/[^\d]/g, '')
  if (!t) return { ok: false, error: 'El DNI es obligatorio.' }
  if (!/^\d{7,8}$/.test(t)) {
    return { ok: false, error: 'El DNI debe tener 7 u 8 dígitos.' }
  }
  return { ok: true, value: t }
}

// Normaliza un teléfono argentino a formato E.164 (+549XXXXXXXXXX).
// Acepta entradas tipo "0385 4-110-001", "+54 9 3854 110001",
// "3854110001", etc. Devuelve { ok, value, error }. Si la entrada
// ya viene con +XX (no +54), la pasa tal cual sin agregar 549.
export function normalizePhoneE164(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: false, error: 'El teléfono es obligatorio.' }

  // Si tiene + y no es +54, asumimos que ya está en E.164 (extranjero).
  if (/^\+[^5]\d{6,}$/.test(s) || /^\+5[^4]\d{6,}$/.test(s)) {
    const digits = s.replace(/[^\d+]/g, '')
    return { ok: true, value: digits }
  }

  // Limpiamos todo lo que no sea dígito (incluso el '+' si estaba).
  let digits = s.replace(/[^\d]/g, '')

  // Sacamos prefijos de marcado internacional / nacional.
  if (digits.startsWith('0054')) digits = digits.slice(4)
  else if (digits.startsWith('54')) digits = digits.slice(2)
  else if (digits.startsWith('0'))  digits = digits.slice(1)

  // El '9' indicativo de celular en Argentina — si no está, lo
  // agregamos (asumimos celular, que es lo que usa SMS/WhatsApp).
  if (digits.startsWith('15')) {
    // viejo prefijo nacional de celular — el 15 va después del
    // código de área. Sin más info no podemos reconstruir el área.
    return { ok: false, error: 'Teléfono ambiguo: ingresá el código de área (ej: 3854).' }
  }
  if (!digits.startsWith('9')) digits = '9' + digits

  // Sanity check de longitud — móvil arg con 9 + cód.área + abonado
  // queda entre 11 y 13 dígitos. Sin el 9 inicial, 10-12.
  if (digits.length < 11 || digits.length > 13) {
    return { ok: false, error: 'Número de teléfono inválido (esperamos 10 u 11 dígitos sin código país).' }
  }

  return { ok: true, value: `+54${digits}` }
}

// Fecha de nacimiento en 'YYYY-MM-DD' — no puede ser futura ni
// estar a más de 120 años atrás.
export function validateFechaNac(iso) {
  if (!iso) return { ok: false, error: 'La fecha de nacimiento es obligatoria.' }
  // Parseamos como local para evitar TZ shifts (la string ya viene
  // de un <input type="date"> y siempre es YYYY-MM-DD).
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return { ok: false, error: 'Fecha inválida.' }
  const dt = new Date(y, m - 1, d)
  if (isNaN(dt)) return { ok: false, error: 'Fecha inválida.' }

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  if (dt > hoy) return { ok: false, error: 'La fecha no puede ser futura.' }

  const limite = new Date(hoy.getFullYear() - 120, hoy.getMonth(), hoy.getDate())
  if (dt < limite) return { ok: false, error: 'La fecha excede los 120 años.' }

  return { ok: true, value: iso }
}

// Devuelve la lista de campos obligatorios que falten en un vecino
// existente. Se usa para mostrar el banner "HC incompleta" en el
// flujo de atención cuando el vecino fue creado antes de Sala Primeros Auxilios
// y no completó los datos clínicos básicos.
//
// Reglas:
//   - nombre_completo: bien si tiene apellido y nombre, o si tiene
//     nombre_completo no vacío.
//   - alergias: el array puede ser vacío PERO solo si está marcada
//     sin_alergias_conocidas. Sin esa confirmación falta el dato.
export function camposHCFaltantes(vecino) {
  if (!vecino) return ['todos los datos']
  const faltan = []

  const tieneNombre = (vecino.apellido && vecino.nombre) ||
                      (vecino.nombre_completo && vecino.nombre_completo.trim())
  if (!tieneNombre) faltan.push('Nombre completo')

  if (!vecino.fecha_nac) faltan.push('Fecha de nacimiento')

  if (!vecino.dni || !/^\d{7,8}$/.test(String(vecino.dni))) {
    faltan.push('DNI')
  }
  if (!vecino.telefono) faltan.push('Teléfono')
  if (!vecino.sexo)     faltan.push('Sexo')

  if (!vecino.grupo_sanguineo) faltan.push('Grupo sanguíneo')

  const alergiasArr = Array.isArray(vecino.alergias) ? vecino.alergias : []
  if (alergiasArr.length === 0 && !vecino.sin_alergias_conocidas) {
    faltan.push('Alergias (confirmar)')
  }

  if (!vecino.barrio && !vecino.localidad) {
    faltan.push('Barrio o localidad')
  }

  if (!vecino.contacto_emergencia_nombre)   faltan.push('Contacto de emergencia (nombre)')
  if (!vecino.contacto_emergencia_telefono) faltan.push('Contacto de emergencia (teléfono)')

  return faltan
}

export function hcCompleta(vecino) {
  return camposHCFaltantes(vecino).length === 0
}

// "Pérez, Juan" → { apellido: 'Pérez', nombre: 'Juan' }
// "Pérez Juan"  → { apellido: 'Pérez', nombre: 'Juan' }
// "Juan"        → { apellido: '',      nombre: 'Juan' }
export function splitApellidoNombre(s) {
  const t = (s ?? '').trim()
  if (!t) return { apellido: '', nombre: '' }
  if (t.includes(',')) {
    const [ap, ...resto] = t.split(',')
    return { apellido: ap.trim(), nombre: resto.join(',').trim() }
  }
  const parts = t.split(/\s+/)
  if (parts.length === 1) return { apellido: '', nombre: parts[0] }
  return { apellido: parts[0], nombre: parts.slice(1).join(' ') }
}
