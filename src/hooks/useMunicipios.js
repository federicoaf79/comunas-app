import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// =============================================================
// useMunicipios — hooks para el panel SuperAdmin de gestión de
// municipios/comisiones.
//
// - useMunicipios(): listado con provincia (vía join a
//   provincias_config) + count de usuarios y dependencias por
//   municipio. Los counts se piden en paralelo después del
//   fetch principal — Supabase no expone count agregado por FK.
//
// - useProvinciasConfig(): catálogo de provincias soportadas
//   por COMUNAS (Santiago del Estero + 6 más). Lo consume el
//   wizard en el paso 1.
//
// - useCreateMunicipio(): mutación que ejecuta los 5 pasos de
//   alta de un municipio:
//     A) INSERT en municipios con provincia_id
//     B) INSERT en dependencias (default según tipo de gobierno)
//     C) UPSERT configuracion_portal clave=normativa_provincial
//     D) UPSERT configuracion_portal clave=datos_municipio
//     E) INSERT presupuesto_partidas (02/03/04 por dependencia)
//
//   Cliente Supabase no soporta transacciones — si A falla se
//   aborta. B/C/D fallando lanzan error para que la UI lo muestre
//   (el municipio quedará huérfano y debe limpiarse a mano). E
//   solo loggea — el sistema no se rompe sin partidas inicializadas.
// =============================================================

const TIMEOUT_MS = 8000

// ─────────────────────────────────────────────────────────────────
// Listado
// ─────────────────────────────────────────────────────────────────

async function fetchMunicipios() {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const { data: muni, error } = await supabase
      .from('municipios')
      .select('id, nombre, slug, activo, created_at, provincia, provincia_id, provincias_config:provincia_id ( id, nombre )')
      .order('nombre', { ascending: true })
      .abortSignal(controller.signal)
    if (error) throw error

    // Counts en paralelo. Usamos head:true para que Supabase no
    // mande las filas — solo el count en headers.
    const counts = await Promise.all((muni ?? []).map(async (m) => {
      const [u, d] = await Promise.all([
        supabase.from('usuarios').select('id', { count: 'exact', head: true }).eq('municipio_id', m.id),
        supabase.from('dependencias').select('id', { count: 'exact', head: true }).eq('municipio_id', m.id),
      ])
      return {
        id: m.id,
        usuarios:     u.count ?? 0,
        dependencias: d.count ?? 0,
      }
    }))
    const countsById = new Map(counts.map(c => [c.id, c]))

    return (muni ?? []).map(m => ({
      ...m,
      // Aplanamos el join — el listado solo necesita el nombre.
      provincia_nombre: m.provincias_config?.nombre ?? m.provincia ?? '—',
      usuarios_count:     countsById.get(m.id)?.usuarios ?? 0,
      dependencias_count: countsById.get(m.id)?.dependencias ?? 0,
    }))
  } finally {
    clearTimeout(t)
  }
}

export function useMunicipios() {
  return useQuery({
    queryKey: ['municipios', 'all'],
    queryFn:  fetchMunicipios,
    staleTime: 30_000,
  })
}

// ─────────────────────────────────────────────────────────────────
// Provincias soportadas
// ─────────────────────────────────────────────────────────────────

// Provincias del catálogo. Si se pasa `paisId` se filtra por país
// (multi-país); sin él trae todas y el wizard filtra en cliente.
export function useProvinciasConfig({ paisId } = {}) {
  return useQuery({
    queryKey: ['provincias-config', paisId ?? '__ALL__'],
    queryFn:  async () => {
      let q = supabase
        .from('provincias_config')
        .select('*')
        .order('nombre', { ascending: true })
      if (paisId) q = q.eq('pais_id', paisId)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
    staleTime: 60 * 60 * 1000, // 1h — el catálogo cambia muy poco
  })
}

// Países soportados (paises_config.activo = true). Se renderiza en
// el paso 1 del wizard cuando hay más de 1. La detección de
// "Argentina" se hace por código o por nombre — depende del schema
// real; el caller intenta ambos.
export function usePaisesConfig() {
  return useQuery({
    queryKey: ['paises-config'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('paises_config')
        .select('*')
        .eq('activo', true)
        .order('nombre', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    staleTime: 60 * 60 * 1000,
  })
}

// ─────────────────────────────────────────────────────────────────
// Wizard — alta de municipio
// ─────────────────────────────────────────────────────────────────

// Mapea el nombre humano de la dependencia al `tipo` que el sidebar
// y los hooks usan para identificarla. Si no matchea, generamos un
// snake_case del nombre. Mantener alineado con LABEL_BY_TIPO de
// AdminLayout.jsx para que el sidebar muestre la etiqueta linda.
function tipoFromNombreDependencia(nombre) {
  const n = (nombre ?? '').toLowerCase()
  if (n.includes('administ'))                    return 'admin'
  if (n.includes('primer') || n.includes('caps')) return 'caps'
  if (n.includes('juez'))                        return 'juzgado'
  if (n.includes('usos') || n.includes('salón') || n.includes('salon')) return 'sum'
  if (n.includes('ayuda') || n.includes('social')) return 'ayuda_social'
  if (n.includes('obras'))                       return 'obras_publicas'
  if (n.includes('cementerio'))                  return 'cementerio'
  if (n.includes('polidep') || n.includes('deporte')) return 'polideportivo'
  if (n.includes('alumbrado'))                   return 'alumbrado'
  if (n.includes('verdes') || n.includes('espacios')) return 'espacios_verdes'
  if (n.includes('policia') || n.includes('policía')) return 'policia'
  if (n.includes('educa'))                       return 'educacion'
  return n
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// Las dependencias núcleo (capa 1) son las que tienen módulo propio
// en el sidebar; el resto cae en "Otras dependencias" (capa 2).
const TIPOS_CAPA_1 = new Set(['admin', 'caps', 'juzgado', 'sum'])

async function createMunicipio(payload, onProgress = () => {}) {
  const {
    nombre, slug, provincia_id, provincia_nombre,
    tipo_gobierno, localidad, departamento, poblacion,
    direccion, telefono, email,
    ley_marco, organo_control,
    dependenciasNombres,
    // PASO F — set de ids de modulos_config a activar en el alta.
    // Si el wizard no lo pasa, no se crean filas (default-open en
    // sidebar vía useTieneModulo).
    modulos,
  } = payload

  // PASO A — INSERT municipio
  onProgress('a:start')
  const { data: muni, error: muniErr } = await supabase
    .from('municipios')
    .insert({
      nombre,
      slug,
      provincia:    provincia_nombre,
      provincia_id,
      activo:       true,
    })
    .select('id, nombre, slug')
    .single()
  if (muniErr) {
    onProgress('a:error')
    throw new Error(`No se pudo crear el municipio: ${muniErr.message}`)
  }
  onProgress('a:done')

  // PASO B — INSERT dependencias
  onProgress('b:start')
  const depsToInsert = (dependenciasNombres ?? []).map(n => {
    const tipo = tipoFromNombreDependencia(n)
    return {
      municipio_id: muni.id,
      nombre:       n,
      tipo,
      capa:         TIPOS_CAPA_1.has(tipo) ? 1 : 2,
      activa:       true,
    }
  })
  const { data: depsCreadas, error: depsErr } = await supabase
    .from('dependencias')
    .insert(depsToInsert)
    .select('id, nombre, tipo')
  if (depsErr) {
    onProgress('b:error')
    throw new Error(`No se pudieron crear las dependencias: ${depsErr.message}`)
  }
  onProgress('b:done')

  // PASO C — normativa_provincial
  onProgress('c:start')
  const { error: cfgNormErr } = await supabase
    .from('configuracion_portal')
    .upsert(
      {
        municipio_id: muni.id,
        clave:        'normativa_provincial',
        valor: {
          provincia_id,
          provincia:      provincia_nombre,
          ley_marco:      ley_marco ?? null,
          organo_control: organo_control ?? null,
          aplicada_at:    new Date().toISOString(),
        },
      },
      { onConflict: 'municipio_id,clave' },
    )
  if (cfgNormErr) {
    onProgress('c:error')
    throw new Error(`No se pudo aplicar la normativa: ${cfgNormErr.message}`)
  }
  onProgress('c:done')

  // PASO D — datos_municipio
  onProgress('d:start')
  const { error: cfgDatosErr } = await supabase
    .from('configuracion_portal')
    .upsert(
      {
        municipio_id: muni.id,
        clave:        'datos_municipio',
        valor: {
          tipo_gobierno: tipo_gobierno ?? null,
          nombre,
          localidad:     localidad     || null,
          departamento:  departamento  || null,
          poblacion:     poblacion     || null,
          direccion:     direccion     || null,
          telefono:      telefono      || null,
          email:         email         || null,
        },
      },
      { onConflict: 'municipio_id,clave' },
    )
  if (cfgDatosErr) {
    onProgress('d:error')
    throw new Error(`No se pudieron guardar los datos: ${cfgDatosErr.message}`)
  }
  onProgress('d:done')

  // PASO E — presupuesto_partidas (no aborta si falla)
  onProgress('e:start')
  const partidaCodigos = ['02', '03', '04']
  const partidasRows = []
  for (const dep of (depsCreadas ?? [])) {
    for (const p of partidaCodigos) {
      partidasRows.push({
        municipio_id:   muni.id,
        dependencia_id: dep.id,
        partida:        p,
        monto_asignado: 0,
      })
    }
  }
  if (partidasRows.length > 0) {
    const { error: partErr } = await supabase
      .from('presupuesto_partidas')
      .insert(partidasRows)
    if (partErr) {
      // Loggear pero no abortar — el sistema funciona sin esta tabla
      // pre-poblada (el módulo de Administración crea filas on demand).
      console.warn('[useMunicipios] presupuesto_partidas:', partErr.message)
      onProgress('e:warn')
    } else {
      onProgress('e:done')
    }
  } else {
    onProgress('e:done')
  }

  // PASO F — modulos_config. Insertamos una fila por módulo activo
  // con `orden` según el índice del array recibido. Si falla,
  // loggeamos pero no abortamos: el sidebar cae al default-open
  // (todos los módulos visibles) hasta que se complete a mano.
  onProgress('f:start')
  if (Array.isArray(modulos) && modulos.length > 0) {
    const modulosRows = modulos.map((id, idx) => ({
      municipio_id: muni.id,
      modulo:       id,
      activo:       true,
      orden:        idx + 1,
    }))
    const { error: modErr } = await supabase
      .from('modulos_config')
      .insert(modulosRows)
    if (modErr) {
      console.warn('[useMunicipios] modulos_config:', modErr.message)
      onProgress('f:warn')
    } else {
      onProgress('f:done')
    }
  } else {
    onProgress('f:done')
  }

  return muni
}

export function useCreateMunicipio() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, onProgress }) => createMunicipio(payload, onProgress),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['municipios'] })
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Helpers públicos para el wizard
// ─────────────────────────────────────────────────────────────────

// Genera un slug url-safe a partir de un nombre humano. Lo usa el
// paso 2 del wizard para autocompletar el campo `slug` editable.
export function slugify(s) {
  return (s ?? '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Listas de dependencias por defecto según tipo de gobierno. La
// comisión municipal arranca con menos servicios que un municipio
// de tercera/segunda categoría — el wizard ofrece estas listas
// pero el superadmin las puede editar antes de crear.
export const DEPENDENCIAS_DEFAULT_COMISION = [
  'Administración',
  'Sala de Primeros Auxilios',
  'Juez de Paz',
  'Salón de Usos Múltiples',
  'Ayuda Social',
  'Obras Públicas',
]

export const DEPENDENCIAS_DEFAULT_MUNICIPIO = [
  'Administración',
  'Sala de Primeros Auxilios',
  'Juez de Paz',
  'Salón de Usos Múltiples',
  'Ayuda Social',
  'Obras Públicas',
  'Cementerio',
  'Polideportivo',
  'Alumbrado Público',
  'Espacios Verdes',
  'Delegación Policial',
  'Educación',
]
