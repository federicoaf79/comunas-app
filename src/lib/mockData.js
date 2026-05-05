// Mock data para el panel admin de COMUNAS — Real Sayana piloto.
// Se reemplaza por queries reales a Supabase cuando esté lista la conexión.

export const dependencias = [
  { id: 'dep-intendencia', nombre: 'Intendencia',          tipo: 'intendencia',  capa: 1 },
  { id: 'dep-caps',        nombre: 'CAPS Real Sayana',     tipo: 'caps',         capa: 1 },
  { id: 'dep-juzgado',     nombre: 'Juzgado de Paz',       tipo: 'juzgado',      capa: 1 },
  { id: 'dep-catastro',    nombre: 'Catastro y Tierras',   tipo: 'catastro',     capa: 2 },
  { id: 'dep-bromato',     nombre: 'Bromatología',         tipo: 'bromatologia', capa: 2 },
]

export const barrios = [
  'Centro',
  'San Cayetano',
  'Las Lomas',
  'Villa Nueva',
  'La Estación',
  'Norte',
  'Loteo Municipal',
]

export const vecinos = [
  { id: 'v1',  dni: '32145678', apellido: 'Acosta',     nombre: 'María',     barrio: 'Centro',          telefono: '+543854100001', email: 'maria.acosta@gmail.com', fecha_nac: '1985-04-12', sexo: 'F', direccion: 'Belgrano 234' },
  { id: 'v2',  dni: '28997431', apellido: 'Barrionuevo', nombre: 'Juan',     barrio: 'San Cayetano',    telefono: '+543854100002', email: '',                       fecha_nac: '1979-09-08', sexo: 'M', direccion: 'Av. Libertad 110' },
  { id: 'v3',  dni: '40123987', apellido: 'Carrizo',    nombre: 'Lucía',    barrio: 'Las Lomas',       telefono: '+543854100003', email: 'lucia.c@hotmail.com',    fecha_nac: '1998-01-25', sexo: 'F', direccion: 'Sarmiento 45' },
  { id: 'v4',  dni: '38877456', apellido: 'Díaz',       nombre: 'Roberto',  barrio: 'Centro',          telefono: '+543854100004', email: '',                       fecha_nac: '1992-06-30', sexo: 'M', direccion: 'Mitre 902' },
  { id: 'v5',  dni: '25667890', apellido: 'Espíndola',  nombre: 'Carla',    barrio: 'Villa Nueva',     telefono: '+543854100005', email: 'carla.e@gmail.com',      fecha_nac: '1975-11-15', sexo: 'F', direccion: 'San Martín 1450' },
  { id: 'v6',  dni: '41223344', apellido: 'Farías',     nombre: 'Tomás',    barrio: 'Norte',           telefono: '+543854100006', email: '',                       fecha_nac: '2000-03-22', sexo: 'M', direccion: 'Las Heras 78' },
  { id: 'v7',  dni: '35887112', apellido: 'González',   nombre: 'Patricia', barrio: 'La Estación',     telefono: '+543854100007', email: 'patri.g@gmail.com',      fecha_nac: '1989-07-04', sexo: 'F', direccion: 'Roca 312' },
  { id: 'v8',  dni: '30456123', apellido: 'Herrera',    nombre: 'Diego',    barrio: 'Centro',          telefono: '+543854100008', email: '',                       fecha_nac: '1983-12-19', sexo: 'M', direccion: 'Independencia 89' },
  { id: 'v9',  dni: '37665012', apellido: 'Ibarra',     nombre: 'Sofía',    barrio: 'Las Lomas',       telefono: '+543854100009', email: 'sofi.i@gmail.com',       fecha_nac: '1991-08-11', sexo: 'F', direccion: '25 de Mayo 56' },
  { id: 'v10', dni: '29334556', apellido: 'Juárez',     nombre: 'Mariano',  barrio: 'San Cayetano',    telefono: '+543854100010', email: '',                       fecha_nac: '1980-02-28', sexo: 'M', direccion: 'Pellegrini 700' },
  { id: 'v11', dni: '42778122', apellido: 'Korol',      nombre: 'Ana',      barrio: 'Centro',          telefono: '+543854100011', email: 'ana.korol@gmail.com',    fecha_nac: '2001-05-17', sexo: 'F', direccion: 'Rivadavia 234' },
  { id: 'v12', dni: '26889012', apellido: 'López',      nombre: 'Hugo',     barrio: 'Loteo Municipal', telefono: '+543854100012', email: '',                       fecha_nac: '1973-10-09', sexo: 'M', direccion: 'Calle 5 N°120' },
  { id: 'v13', dni: '33456789', apellido: 'Molina',     nombre: 'Verónica', barrio: 'Villa Nueva',     telefono: '+543854100013', email: 'vero.m@gmail.com',       fecha_nac: '1987-04-03', sexo: 'F', direccion: 'Las Acacias 22' },
  { id: 'v14', dni: '40998772', apellido: 'Núñez',      nombre: 'Federico', barrio: 'Norte',           telefono: '+543854100014', email: '',                       fecha_nac: '1996-11-26', sexo: 'M', direccion: 'Tucumán 1100' },
  { id: 'v15', dni: '36554311', apellido: 'Olivera',    nombre: 'Romina',   barrio: 'La Estación',     telefono: '+543854100015', email: 'romi.o@gmail.com',       fecha_nac: '1990-01-13', sexo: 'F', direccion: 'Estación 14' },
  { id: 'v16', dni: '31002211', apellido: 'Paz',        nombre: 'Sebastián',barrio: 'Centro',          telefono: '+543854100016', email: '',                       fecha_nac: '1984-07-29', sexo: 'M', direccion: 'San Lorenzo 99' },
  { id: 'v17', dni: '38221334', apellido: 'Quinteros',  nombre: 'Camila',   barrio: 'Las Lomas',       telefono: '+543854100017', email: 'cami.q@gmail.com',       fecha_nac: '1993-09-21', sexo: 'F', direccion: 'Yrigoyen 502' },
  { id: 'v18', dni: '34889765', apellido: 'Ruiz',       nombre: 'Pablo',    barrio: 'San Cayetano',    telefono: '+543854100018', email: '',                       fecha_nac: '1988-03-07', sexo: 'M', direccion: 'Necochea 41' },
  { id: 'v19', dni: '27445566', apellido: 'Sosa',       nombre: 'Gabriela', barrio: 'Loteo Municipal', telefono: '+543854100019', email: 'gabi.s@gmail.com',       fecha_nac: '1976-12-02', sexo: 'F', direccion: 'Calle 8 N°45' },
  { id: 'v20', dni: '43112998', apellido: 'Toranzo',    nombre: 'Ignacio',  barrio: 'Norte',           telefono: '+543854100020', email: '',                       fecha_nac: '2002-08-14', sexo: 'M', direccion: 'Avellaneda 200' },
]

export const hcConsultas = [
  { id: 'hc1', vecino_id: 'v1', dependencia_id: 'dep-caps', medico: 'Dra. Ramírez', fecha: '2026-04-28T10:30', motivo: 'Control general',   diagnostico: 'Tensión arterial elevada', indicaciones: 'Reducir consumo de sal. Volver en 30 días.' },
  { id: 'hc2', vecino_id: 'v1', dependencia_id: 'dep-caps', medico: 'Dr. Soria',    fecha: '2026-03-12T09:00', motivo: 'Cefalea',           diagnostico: 'Cefalea tensional',         indicaciones: 'Ibuprofeno 400mg cada 8hs si dolor.' },
  { id: 'hc3', vecino_id: 'v3', dependencia_id: 'dep-caps', medico: 'Dra. Ramírez', fecha: '2026-04-20T11:15', motivo: 'Tos persistente',   diagnostico: 'Bronquitis aguda',          indicaciones: 'Amoxicilina 500mg/8h x 7 días.' },
  { id: 'hc4', vecino_id: 'v7', dependencia_id: 'dep-caps', medico: 'Dr. Soria',    fecha: '2026-04-30T15:00', motivo: 'Dolor lumbar',      diagnostico: 'Lumbalgia mecánica',        indicaciones: 'Reposo relativo. Diclofenac 50mg/12h.' },
  { id: 'hc5', vecino_id: 'v9', dependencia_id: 'dep-caps', medico: 'Dra. Ramírez', fecha: '2026-04-15T08:45', motivo: 'Control prenatal',  diagnostico: 'Embarazo 22 semanas — normal', indicaciones: 'Vitaminas. Próximo control en 4 semanas.' },
]

const TODAY = '2026-05-05'

// Canal de origen del turno: web (autogestión vecino), sms, whatsapp,
// presencial (lo cargó el operador en la dependencia).
export const turnos = [
  { id: 't1',  vecino_id: 'v1',  dependencia_id: 'dep-caps',        medico: 'Dra. Ramírez', fecha: TODAY, hora: '08:30', estado: 'confirmado', motivo: 'Control',                       canal: 'web' },
  { id: 't2',  vecino_id: 'v3',  dependencia_id: 'dep-caps',        medico: 'Dr. Soria',    fecha: TODAY, hora: '09:00', estado: 'reservado',  motivo: 'Receta crónica',                canal: 'presencial' },
  { id: 't3',  vecino_id: 'v5',  dependencia_id: 'dep-caps',        medico: 'Dra. Ramírez', fecha: TODAY, hora: '09:30', estado: 'confirmado', motivo: 'Control glucemia',              canal: 'sms' },
  { id: 't4',  vecino_id: 'v7',  dependencia_id: 'dep-caps',        medico: 'Dr. Soria',    fecha: TODAY, hora: '10:00', estado: 'atendido',   motivo: 'Curaciones',                    canal: 'presencial' },
  { id: 't5',  vecino_id: 'v9',  dependencia_id: 'dep-caps',        medico: 'Dra. Ramírez', fecha: TODAY, hora: '10:30', estado: 'reservado',  motivo: 'Control prenatal',              canal: 'web' },
  { id: 't6',  vecino_id: 'v2',  dependencia_id: 'dep-juzgado',     medico: null,           fecha: TODAY, hora: '09:00', estado: 'confirmado', motivo: 'Mediación vecinal',             canal: 'presencial' },
  { id: 't7',  vecino_id: 'v4',  dependencia_id: 'dep-juzgado',     medico: null,           fecha: TODAY, hora: '11:00', estado: 'reservado',  motivo: 'Certificación de firma',        canal: 'web' },
  { id: 't8',  vecino_id: 'v8',  dependencia_id: 'dep-catastro',    medico: null,           fecha: TODAY, hora: '08:30', estado: 'confirmado', motivo: 'Plano de mensura',              canal: 'presencial' },
  { id: 't9',  vecino_id: 'v12', dependencia_id: 'dep-catastro',    medico: null,           fecha: TODAY, hora: '10:00', estado: 'cancelado',  motivo: 'Inscripción de boleto',         canal: 'sms' },
  { id: 't10', vecino_id: 'v15', dependencia_id: 'dep-bromato',     medico: null,           fecha: TODAY, hora: '09:00', estado: 'confirmado', motivo: 'Habilitación local',            canal: 'web' },
  { id: 't11', vecino_id: 'v18', dependencia_id: 'dep-bromato',     medico: null,           fecha: TODAY, hora: '11:30', estado: 'reservado',  motivo: 'Renovación carnet manipulador', canal: 'whatsapp' },
  { id: 't12', vecino_id: 'v11', dependencia_id: 'dep-intendencia', medico: null,           fecha: TODAY, hora: '10:00', estado: 'confirmado', motivo: 'Reunión presupuesto barrial',   canal: 'presencial' },
]

export const mensajes = [
  { id: 'm1',  vecino_id: 'v1',  telefono: '+543854100001', canal: 'sms',      direction: 'out', mensaje: 'Le recordamos su turno mañana 8:30 con Dra. Ramírez en el CAPS.', estado: 'delivered', fecha: '2026-05-04T18:00' },
  { id: 'm2',  vecino_id: 'v3',  telefono: '+543854100003', canal: 'whatsapp', direction: 'out', mensaje: 'Hola Lucía, su receta crónica ya está lista para retirar.',         estado: 'delivered', fecha: '2026-05-04T16:30' },
  { id: 'm3',  vecino_id: 'v5',  telefono: '+543854100005', canal: 'sms',      direction: 'out', mensaje: 'Recordatorio: turno control glucemia mañana 9:30.',                  estado: 'sent',      fecha: '2026-05-04T15:00' },
  { id: 'm4',  vecino_id: 'v7',  telefono: '+543854100007', canal: 'whatsapp', direction: 'in',  mensaje: '¿Puedo cambiar mi turno del jueves para más tarde?',                  estado: 'received',  fecha: '2026-05-04T14:20' },
  { id: 'm5',  vecino_id: 'v8',  telefono: '+543854100008', canal: 'sms',      direction: 'out', mensaje: 'Su trámite de catastro requiere documentación adicional. Acercarse.', estado: 'delivered', fecha: '2026-05-04T11:00' },
  { id: 'm6',  vecino_id: 'v15', telefono: '+543854100015', canal: 'whatsapp', direction: 'out', mensaje: 'Habilitación bromatológica aprobada. Pase a retirar el certificado.', estado: 'delivered', fecha: '2026-05-04T10:00' },
  { id: 'm7',  vecino_id: 'v2',  telefono: '+543854100002', canal: 'sms',      direction: 'out', mensaje: 'Audiencia de mediación confirmada para hoy 9:00 — Juzgado de Paz.',  estado: 'delivered', fecha: '2026-05-05T07:30' },
  { id: 'm8',  vecino_id: 'v12', telefono: '+543854100012', canal: 'sms',      direction: 'out', mensaje: 'Su turno de catastro fue cancelado. Reagende llamando al 4123-456.', estado: 'failed',    fecha: '2026-05-04T09:15', error: 'Número fuera de servicio' },
  { id: 'm9',  vecino_id: 'v9',  telefono: '+543854100009', canal: 'whatsapp', direction: 'in',  mensaje: 'Gracias por la atención de hoy.',                                     estado: 'received',  fecha: '2026-05-04T20:45' },
  { id: 'm10', vecino_id: 'v18', telefono: '+543854100018', canal: 'sms',      direction: 'out', mensaje: 'Carnet de manipulador vence en 30 días. Pase a renovarlo.',          estado: 'delivered', fecha: '2026-05-03T12:00' },
  { id: 'm11', vecino_id: 'v11', telefono: '+543854100011', canal: 'whatsapp', direction: 'out', mensaje: 'Reunión de presupuesto barrial — hoy 10hs en Intendencia.',           estado: 'delivered', fecha: '2026-05-05T07:00' },
  { id: 'm12', vecino_id: 'v4',  telefono: '+543854100004', canal: 'sms',      direction: 'out', mensaje: 'Su denuncia por luminaria fundida fue recibida. Folio 0042.',         estado: 'delivered', fecha: '2026-05-02T14:10' },
]

export const denuncias = [
  { id: 'dn1', vecino_id: 'v4',  tipo: 'alumbrado',       asunto: 'Luminaria fundida en Mitre 902',  estado: 'abierta',    fecha: '2026-05-02' },
  { id: 'dn2', vecino_id: 'v11', tipo: 'residuos',        asunto: 'Falta recolección hace 3 días',   estado: 'en_proceso', fecha: '2026-05-03' },
  { id: 'dn3', vecino_id: 'v14', tipo: 'infraestructura', asunto: 'Pozo en calle Tucumán al 1100',   estado: 'abierta',    fecha: '2026-05-04' },
  { id: 'dn4', vecino_id: 'v6',  tipo: 'seguridad',       asunto: 'Robos repetidos en plaza Norte',  estado: 'abierta',    fecha: '2026-05-05' },
  { id: 'dn5', vecino_id: 'v17', tipo: 'alumbrado',       asunto: 'Calle entera sin luz — Yrigoyen', estado: 'abierta',    fecha: '2026-05-04' },
  { id: 'dn6', vecino_id: 'v10', tipo: 'residuos',        asunto: 'Microbasural en esquina',         estado: 'resuelta',   fecha: '2026-04-28' },
]

// ============================================================
// Sala de Primeros Auxilios
// ============================================================

export const medicoGuardia = {
  nombre:        'Dra. Laura Ramírez',
  matricula:     'MN 28471',
  especialidad:  'Medicina general',
  telefono:      '+543854110001',
  desde:         '08:00',
  hasta:         '20:00',
}

// Mapa vecino_id -> array de alergias / alertas médicas relevantes.
// Vecinos no presentes acá no tienen alergias registradas.
export const alergiasVecino = {
  v1: ['Penicilina'],
  v3: ['AINEs (ibuprofeno, naproxeno)'],
  v5: ['Sulfas'],
  v7: ['Maní', 'Mariscos'],
  v9: ['Dipirona', 'Látex'],
}

export const recetas = [
  { id: 'r1', vecino_id: 'v1', medico: 'Dra. Ramírez', medicamento: 'Amlodipina 5mg',   posologia: '1 comprimido por día',     fecha: '2026-05-04T11:30', foto_url: '' },
  { id: 'r2', vecino_id: 'v7', medico: 'Dr. Soria',    medicamento: 'Diclofenac 50mg',  posologia: '1 cada 12hs por 5 días',   fecha: '2026-05-03T15:00', foto_url: '' },
  { id: 'r3', vecino_id: 'v3', medico: 'Dra. Ramírez', medicamento: 'Amoxicilina 500mg', posologia: '1 cada 8hs por 7 días',   fecha: '2026-04-20T11:15', foto_url: '' },
]

// ============================================================
// Portal web — noticias
// ============================================================

export const noticias = [
  {
    id: 'n1',
    titulo: 'Apertura de la Sala de Primeros Auxilios los sábados',
    resumen: 'Desde el sábado 10 de mayo la Sala atiende en horario ampliado.',
    contenido: 'A partir del próximo sábado, la Sala de Primeros Auxilios de Real Sayana atenderá los sábados de 9 a 14. Esta ampliación del horario busca cubrir la demanda creciente de los vecinos del cordón rural.',
    imagen_url: '',
    publicado: true,
    fecha_publicacion: '2026-05-02',
    autor: 'Intendencia',
  },
  {
    id: 'n2',
    titulo: 'Calendario de vacunación antigripal 2026',
    resumen: 'Mayores de 65 y embarazadas pueden vacunarse en el CAPS desde el lunes.',
    contenido: 'El CAPS Real Sayana inicia la campaña de vacunación antigripal el lunes 6 de mayo. Inscripción en mesa de entrada o por WhatsApp al 3854-110001.',
    imagen_url: '',
    publicado: true,
    fecha_publicacion: '2026-05-04',
    autor: 'CAPS',
  },
  {
    id: 'n3',
    titulo: 'Reunión del Concejo de Vecinos',
    resumen: '',
    contenido: 'Borrador en revisión.',
    imagen_url: '',
    publicado: false,
    fecha_publicacion: null,
    autor: 'Intendencia',
  },
  {
    id: 'n4',
    titulo: 'Cierre temporal de calle Mitre por obras',
    resumen: 'Del 8 al 12 de mayo no habrá circulación entre Belgrano y Sarmiento.',
    contenido: 'Se realizarán trabajos de bacheo y nuevo pavimento. Se solicita a los vecinos circular por calles paralelas y respetar la señalización.',
    imagen_url: '',
    publicado: true,
    fecha_publicacion: '2026-05-03',
    autor: 'Obras Públicas',
  },
]

// Helpers
export function vecinoById(id)        { return vecinos.find(v => v.id === id) }
export function dependenciaById(id)   { return dependencias.find(d => d.id === id) }
export function consultasByVecino(id) { return hcConsultas.filter(c => c.vecino_id === id) }
export function turnosByVecino(id)    { return turnos.filter(t => t.vecino_id === id) }
export function mensajesByVecino(id)  { return mensajes.filter(m => m.vecino_id === id) }
export function turnosHoy()           { return turnos }
export function turnosCAPSHoy()       { return turnos.filter(t => t.dependencia_id === 'dep-caps') }
export function mensajesDelMes()      { return mensajes }
export function denunciasAbiertas()   { return denuncias.filter(d => d.estado === 'abierta') }
export function alergiasOf(vecinoId)        { return alergiasVecino[vecinoId] ?? [] }
export function vecinoTieneAlergias(vId)    { return alergiasOf(vId).length > 0 }
export function recetasByVecino(id)         { return recetas.filter(r => r.vecino_id === id) }
