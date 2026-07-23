#!/usr/bin/env node
/**
 * seed-vecino-demo.js
 * Crear vecino demo con datos en TODOS los módulos del portal
 *
 * REQUISITOS:
 * - .env.local con SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
 * - Node 18+
 *
 * USO: node scripts/seed-vecino-demo.js
 */

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Leer .env.local manualmente (sin dependencia de dotenv)
function loadEnv() {
  try {
    const envPath = resolve(__dirname, '../.env.local')
    const content = readFileSync(envPath, 'utf-8')
    const env = {}
    content.split('\n').forEach(line => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const [, key, value] = match
        // Remover comillas si existen
        const cleanValue = value.trim().replace(/^["']|["']$/g, '')
        env[key.trim()] = cleanValue
      }
    })
    return env
  } catch (e) {
    console.error('Error loading .env.local:', e.message)
    return {}
  }
}

const env = loadEnv()
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ ERROR: Faltan variables de entorno')
  console.error('   VITE_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗')
  if (SUPABASE_SERVICE_ROLE_KEY) {
    console.error('   (Longitud del key:', SUPABASE_SERVICE_ROLE_KEY.length, 'chars)')
    console.error('   (Primeros 20 chars:', SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...)')
  }
  console.error('\nAsegurate de tener un archivo .env.local en la raíz del proyecto con:')
  console.error('  VITE_SUPABASE_URL=https://tu-proyecto.supabase.co')
  console.error('  SUPABASE_SERVICE_ROLE_KEY=tu-service-role-key-completo')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// ═══════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════

const MUNICIPIO_ID = '654d0e86-255d-4498-b5c9-80d91793d318' // Real Sayana
const EMAIL = 'vecino.demo@realsayana.gob.ar'
const PASSWORD = randomBytes(16).toString('base64') // Generar password segura random
const DNI = '99888777'
const NOMBRE = 'Demo'
const APELLIDO = 'Vecino'
const TELEFONO = '+5493854123456'

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function logSection(title) {
  console.log('\n' + '='.repeat(70))
  console.log(`  ${title}`)
  console.log('='.repeat(70))
}

function logSuccess(msg) {
  console.log(`✅ ${msg}`)
}

function logError(msg, error) {
  console.error(`❌ ${msg}`)
  if (error) console.error('   ', error)
}

// Busca un registro existente por igualdad exacta de todos los campos
// de `match` y lo actualiza con `data`; si no existe, inserta
// `{...match, ...data}`. Hace re-ejecutable el resto del script sin
// duplicar filas — antes cada corrida sumaba atenciones/turnos/
// reservas/reclamo/beneficiario nuevos (ej: 13 turnos tras varias
// corridas en vez de 3).
async function upsertByMatch(table, match, data) {
  let q = supabase.from(table).select('id')
  for (const [k, v] of Object.entries(match)) q = q.eq(k, v)
  const { data: existing, error: findError } = await q.maybeSingle()
  if (findError) throw findError

  if (existing) {
    const { data: row, error } = await supabase
      .from(table)
      .update(data)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return { row, created: false }
  }

  const { data: row, error } = await supabase
    .from(table)
    .insert({ ...match, ...data })
    .select()
    .single()
  if (error) throw error
  return { row, created: true }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n🚀 SEED VECINO DEMO — Real Sayana')
  console.log('━'.repeat(70))

  const resultados = {
    user_id: null,
    vecino_id: null,
    atenciones: [],
    turnos: [],
    reservas: [],
    reclamos: [],
    beneficiarios: []
  }

  try {
    // ─────────────────────────────────────────────────────────────────
    // 1. CREAR O BUSCAR USUARIO EN AUTH (idempotencia)
    // ─────────────────────────────────────────────────────────────────
    logSection('1. Crear o buscar usuario en Supabase Auth')

    let authUser = null

    // Primero intentar buscar si ya existe
    const { data: existingUsers } = await supabase.auth.admin.listUsers()
    const existingUser = existingUsers?.users?.find(u => u.email === EMAIL)

    if (existingUser) {
      authUser = existingUser
      logSuccess(`Usuario ya existe: ${EMAIL}`)
      logSuccess(`User ID: ${existingUser.id}`)
      console.log('   ℹ️  Reutilizando usuario existente (idempotencia)')

      // Resetear password a la generada en este script para que el output sea correcto
      await supabase.auth.admin.updateUserById(existingUser.id, {
        password: PASSWORD
      })
      logSuccess(`Password actualizada`)
    } else {
      // Crear nuevo usuario
      const { data: newUser, error: authError } = await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: {
          nombre: NOMBRE,
          apellido: APELLIDO
        }
      })

      if (authError) {
        logError('Error al crear usuario en Auth', authError)
        throw authError
      }

      authUser = newUser.user
      logSuccess(`Usuario creado: ${EMAIL}`)
      logSuccess(`User ID: ${authUser.id}`)
      logSuccess(`Password: ${PASSWORD}`)
    }

    resultados.user_id = authUser.id

    // ─────────────────────────────────────────────────────────────────
    // 2. CREAR O ACTUALIZAR VECINO EN DB (idempotencia)
    // ─────────────────────────────────────────────────────────────────
    logSection('2. Crear o actualizar vecino en tabla vecinos')

    // Primero buscar si ya existe vecino con ese user_id
    const { data: existingVecino } = await supabase
      .from('vecinos')
      .select('*')
      .eq('user_id', authUser.id)
      .maybeSingle()

    let vecino = null

    if (existingVecino) {
      // Actualizar vecino existente
      const { data: updated, error: updateError } = await supabase
        .from('vecinos')
        .update({
          dni: DNI,
          apellido: APELLIDO,
          nombre: NOMBRE,
          nombre_completo: `${APELLIDO}, ${NOMBRE}`,
          fecha_nac: '1990-01-15',
          sexo: 'M',
          telefono: TELEFONO,
          email: EMAIL,
          direccion: 'Av. San Martín 123',
          localidad: 'Real Sayana',
          grupo_sanguineo: 'O+',
          alergias: ['Polen'],
          sin_alergias_conocidas: false,
          contacto_emergencia_nombre: 'María Vecino',
          contacto_emergencia_telefono: '+5493854987654'
        })
        .eq('id', existingVecino.id)
        .select()
        .single()

      if (updateError) {
        logError('Error al actualizar vecino', updateError)
        throw updateError
      }

      vecino = updated
      logSuccess(`Vecino actualizado: ${APELLIDO}, ${NOMBRE}`)
      logSuccess(`Vecino ID: ${vecino.id}`)
      console.log('   ℹ️  Reutilizando vecino existente (idempotencia)')
    } else {
      // Crear nuevo vecino
      const { data: newVecino, error: vecinoError } = await supabase
        .from('vecinos')
        .insert({
          municipio_id: MUNICIPIO_ID,
          user_id: authUser.id,
          dni: DNI,
          apellido: APELLIDO,
          nombre: NOMBRE,
          nombre_completo: `${APELLIDO}, ${NOMBRE}`,
          fecha_nac: '1990-01-15',
          sexo: 'M',
          telefono: TELEFONO,
          email: EMAIL,
          direccion: 'Av. San Martín 123',
          localidad: 'Real Sayana',
          grupo_sanguineo: 'O+',
          alergias: ['Polen'],
          sin_alergias_conocidas: false,
          contacto_emergencia_nombre: 'María Vecino',
          contacto_emergencia_telefono: '+5493854987654'
        })
        .select()
        .single()

      if (vecinoError) {
        logError('Error al crear vecino', vecinoError)
        throw vecinoError
      }

      vecino = newVecino
      logSuccess(`Vecino creado: ${APELLIDO}, ${NOMBRE}`)
      logSuccess(`Vecino ID: ${vecino.id}`)
    }

    logSuccess(`DNI: ${DNI}`)
    resultados.vecino_id = vecino.id

    // ─────────────────────────────────────────────────────────────────
    // 3. BUSCAR DEPENDENCIAS
    // ─────────────────────────────────────────────────────────────────
    logSection('3. Buscar dependencias de Real Sayana')

    const { data: dependencias, error: depsError } = await supabase
      .from('dependencias')
      .select('id, nombre, tipo')
      .eq('municipio_id', MUNICIPIO_ID)
      .eq('activa', true)

    if (depsError || !dependencias || dependencias.length === 0) {
      logError('No se encontraron dependencias activas', depsError)
      throw new Error('Sin dependencias')
    }

    logSuccess(`${dependencias.length} dependencias encontradas:`)
    dependencias.forEach(d => console.log(`   - ${d.nombre} (${d.tipo})`))

    // Mapear dependencias por tipo
    const depSalud = dependencias.find(d => ['caps', 'salud', 'sala'].includes(d.tipo))
    const depJuzgado = dependencias.find(d => d.tipo === 'juzgado')
    const depPolideportivo = dependencias.find(d => ['polideportivo', 'deporte'].includes(d.tipo))
    const depOdontologia = dependencias.find(d => d.tipo === 'odontologia')
    const depSocial = dependencias.find(d => ['social', 'ayuda_social'].includes(d.tipo))

    // ─────────────────────────────────────────────────────────────────
    // 4. CREAR ATENCIÓN (Historia Clínica)
    // ─────────────────────────────────────────────────────────────────
    if (depSalud) {
      logSection('4. Crear atención médica (Historia Clínica)')

      try {
        const { row: atencion, created } = await upsertByMatch(
          'atenciones',
          { vecino_id: vecino.id, dependencia_id: depSalud.id, motivo: 'Control de rutina y vacunación' },
          {
            municipio_id: MUNICIPIO_ID,
            fecha_hora: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // Hace 30 días
            diagnostico: 'Paciente en buen estado general. Sin patologías detectadas.',
            tratamiento: 'Vacuna antigripal administrada',
            indicaciones: 'Continuar con controles anuales. Mantener actividad física regular.',
            signos_vitales: JSON.stringify({
              presion_arterial: '120/80',
              frecuencia_cardiaca: 72,
              temperatura: 36.5,
              peso: 75,
              altura: 175
            }),
            estado: 'cerrada'
          }
        )
        resultados.atenciones.push(atencion.id)
        logSuccess(`Atención ${created ? 'creada' : 'actualizada'} en ${depSalud.nombre}`)
        logSuccess(`Atención ID: ${atencion.id}`)
      } catch (atencionError) {
        logError('Error al crear atención', atencionError)
      }
    } else {
      console.log('⚠️  Sin dependencia de salud — saltear atención')
    }

    // ─────────────────────────────────────────────────────────────────
    // 5. CREAR TURNOS MÉDICOS/LEGALES
    // ─────────────────────────────────────────────────────────────────
    logSection('5. Crear turnos médicos/legales')

    const turnosDef = []

    // Turno 1: CAPS - Confirmado (en 7 días)
    if (depSalud) {
      const fecha1 = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      turnosDef.push({
        match: { vecino_id: vecino.id, dependencia_id: depSalud.id, motivo: 'Control de seguimiento' },
        data: {
          municipio_id: MUNICIPIO_ID,
          fecha: fecha1.toISOString().split('T')[0],
          hora_inicio: '09:00',
          hora_fin: '09:30',
          estado: 'confirmado',
          espacio_id: null // No es reserva deportiva
        }
      })
    }

    // Turno 2: Juzgado - Pendiente (en 14 días)
    if (depJuzgado) {
      const fecha2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      turnosDef.push({
        match: { vecino_id: vecino.id, dependencia_id: depJuzgado.id, motivo: 'Certificación de firma' },
        data: {
          municipio_id: MUNICIPIO_ID,
          fecha: fecha2.toISOString().split('T')[0],
          hora_inicio: '10:00',
          hora_fin: '10:30',
          estado: 'pendiente',
          espacio_id: null
        }
      })
    }

    // Turno 3: Odontología - Cancelado (hace 5 días)
    if (depOdontologia) {
      const fecha3 = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
      turnosDef.push({
        match: { vecino_id: vecino.id, dependencia_id: depOdontologia.id, motivo: 'Limpieza dental' },
        data: {
          municipio_id: MUNICIPIO_ID,
          fecha: fecha3.toISOString().split('T')[0],
          hora_inicio: '14:00',
          hora_fin: '14:30',
          estado: 'cancelado',
          espacio_id: null
        }
      })
    }

    if (turnosDef.length > 0) {
      for (const t of turnosDef) {
        try {
          const { row: turno, created } = await upsertByMatch('turnos_agenda', t.match, t.data)
          resultados.turnos.push(turno.id)
          logSuccess(`Turno ${turno.estado} ${created ? 'creado' : 'actualizado'} para ${turno.fecha}`)
        } catch (turnoError) {
          logError('Error al crear turno', turnoError)
        }
      }
    } else {
      console.log('⚠️  Sin dependencias para turnos — saltear')
    }

    // ─────────────────────────────────────────────────────────────────
    // 6. CREAR RESERVAS DEPORTIVAS
    // ─────────────────────────────────────────────────────────────────
    if (depPolideportivo) {
      logSection('6. Crear reservas del Polideportivo')

      // Buscar espacio deportivo
      const { data: espacios } = await supabase
        .from('espacios_deportivos')
        .select('id')
        .eq('municipio_id', MUNICIPIO_ID)
        .eq('activo', true)
        .limit(1)

      if (espacios && espacios.length > 0) {
        const espacioId = espacios[0].id

        const reservasDef = [
          // Reserva 1: Pendiente (mañana)
          {
            match: { vecino_id: vecino.id, espacio_id: espacioId, motivo: 'Fútbol salón — Partido amistoso con amigos' },
            data: {
              municipio_id: MUNICIPIO_ID,
              dependencia_id: depPolideportivo.id,
              fecha: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              hora_inicio: '18:00',
              hora_fin: '19:30',
              estado: 'pendiente'
            }
          },
          // Reserva 2: Confirmada (en 3 días)
          {
            match: { vecino_id: vecino.id, espacio_id: espacioId, motivo: 'Básquet' },
            data: {
              municipio_id: MUNICIPIO_ID,
              dependencia_id: depPolideportivo.id,
              fecha: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              hora_inicio: '20:00',
              hora_fin: '21:00',
              estado: 'confirmado'
            }
          }
        ]

        for (const r of reservasDef) {
          try {
            const { row: reserva, created } = await upsertByMatch('turnos_agenda', r.match, r.data)
            resultados.reservas.push(reserva.id)
            logSuccess(`Reserva ${reserva.estado} ${created ? 'creada' : 'actualizada'} para ${reserva.fecha} ${reserva.hora_inicio}-${reserva.hora_fin}`)
          } catch (reservaError) {
            logError('Error al crear reserva', reservaError)
          }
        }
      } else {
        console.log('⚠️  Sin espacios deportivos — saltear reservas')
      }
    } else {
      console.log('⚠️  Sin dependencia Polideportivo — saltear reservas')
    }

    // ─────────────────────────────────────────────────────────────────
    // 7. CREAR RECLAMO
    // ─────────────────────────────────────────────────────────────────
    logSection('7. Crear reclamo comunitario')

    try {
      const { row: reclamo, created } = await upsertByMatch(
        'reclamos',
        { vecino_id: vecino.id, tipo: 'alumbrado', descripcion: 'Farola sin funcionar en esquina de Av. San Martín y Belgrano' },
        { municipio_id: MUNICIPIO_ID, ubicacion: 'Av. San Martín y Belgrano', estado: 'en_proceso', prioridad: 'normal' }
      )
      resultados.reclamos.push(reclamo.id)
      logSuccess(`Reclamo ${created ? 'creado' : 'actualizado'}: ${reclamo.tipo}`)
      logSuccess(`Reclamo ID: ${reclamo.id}`)
    } catch (reclamoError) {
      logError('Error al crear reclamo', reclamoError)
    }

    // ─────────────────────────────────────────────────────────────────
    // 8. CREAR BENEFICIARIO (Ayuda Social)
    // ─────────────────────────────────────────────────────────────────
    if (depSocial) {
      logSection('8. Crear beneficiario de Ayuda Social')

      try {
        const { row: beneficiario, created } = await upsertByMatch(
          'beneficiarios',
          { vecino_id: vecino.id, tipo_ayuda: 'bolson_alimentos' },
          {
            municipio_id: MUNICIPIO_ID,
            descripcion: 'Bolsón mensual de alimentos',
            estado: 'activo',
            fecha_inicio: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // Hace 3 meses
          }
        )
        resultados.beneficiarios.push(beneficiario.id)
        logSuccess(`Beneficiario ${created ? 'creado' : 'actualizado'}: ${beneficiario.tipo_ayuda}`)
        logSuccess(`Beneficiario ID: ${beneficiario.id}`)
      } catch (beneficiarioError) {
        logError('Error al crear beneficiario', beneficiarioError)
      }
    } else {
      console.log('⚠️  Sin dependencia de Ayuda Social — saltear beneficiario')
    }

    // ─────────────────────────────────────────────────────────────────
    // 9. RESUMEN FINAL
    // ─────────────────────────────────────────────────────────────────
    logSection('🎉 VECINO DEMO CREADO EXITOSAMENTE')

    console.log('\n📧 CREDENCIALES DE ACCESO:')
    console.log('━'.repeat(70))
    console.log(`   Email:    ${EMAIL}`)
    console.log(`   Password: ${PASSWORD}`)
    console.log('━'.repeat(70))
    console.log('⚠️  IMPORTANTE: Guardar estas credenciales en un lugar seguro.')
    console.log('   La password fue generada aleatoriamente y no se puede recuperar.')

    console.log('\n📊 IDS DE REGISTROS CREADOS:')
    console.log('━'.repeat(70))
    console.log(`   User ID:         ${resultados.user_id}`)
    console.log(`   Vecino ID:       ${resultados.vecino_id}`)
    console.log(`   Atenciones:      ${resultados.atenciones.length > 0 ? resultados.atenciones.join(', ') : 'ninguna'}`)
    console.log(`   Turnos:          ${resultados.turnos.length > 0 ? resultados.turnos.join(', ') : 'ninguno'}`)
    console.log(`   Reservas:        ${resultados.reservas.length > 0 ? resultados.reservas.join(', ') : 'ninguna'}`)
    console.log(`   Reclamos:        ${resultados.reclamos.length > 0 ? resultados.reclamos.join(', ') : 'ninguno'}`)
    console.log(`   Beneficiarios:   ${resultados.beneficiarios.length > 0 ? resultados.beneficiarios.join(', ') : 'ninguno'}`)
    console.log('━'.repeat(70))

    console.log('\n🚀 PRÓXIMOS PASOS:')
    console.log('   1. Ir a https://realsayana.comunas.lat/portal/login')
    console.log(`   2. Iniciar sesión con ${EMAIL}`)
    console.log('   3. Explorar todas las secciones del portal:')
    console.log('      - Mi cuenta (Dashboard)')
    console.log('      - Mi salud (Historia Clínica)')
    console.log('      - Mis turnos')
    console.log('      - Mis reservas (Polideportivo)')
    console.log('      - Mis reclamos')

    console.log('\n✅ Script completado exitosamente.\n')

  } catch (error) {
    console.error('\n💥 ERROR FATAL:', error.message)
    console.error(error)
    process.exit(1)
  }
}

// Ejecutar
main()
