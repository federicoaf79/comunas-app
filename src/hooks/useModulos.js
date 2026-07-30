import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase, supabasePublic } from '../lib/supabase'

// =============================================================
// useModulos — gating del producto por módulos contratados.
//
// Cada municipio tiene una fila por módulo en `modulos_config`:
//   id, municipio_id, modulo, activo bool, orden int, config jsonb
//
// El sidebar y los gates de páginas leen esta tabla para decidir
// qué entradas mostrar. Si un municipio NO tiene filas en
// modulos_config (caso legacy o instancia fresca), `useTieneModulo`
// devuelve true por default — preferimos mostrar todo a romper la
// experiencia con un sidebar vacío.
// =============================================================

export function useModulosActivos(municipioId) {
  return useQuery({
    queryKey: ['modulos', municipioId ?? '__NONE__'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('modulos_config')
        .select('modulo, activo, orden, config')
        .eq('municipio_id', municipioId)
        .eq('activo', true)
        .order('orden')
      if (error) throw error
      return data ?? []
    },
    enabled:   !!municipioId,
    staleTime: 5 * 60_000,
  })
}

// Hook útil para chequeo puntual en una página. Devuelve true
// cuando el módulo está activo, o cuando todavía no hay config —
// así el primer arranque post-deploy no rompe nada.
export function useTieneModulo(municipioId, modulo) {
  const { data } = useModulosActivos(municipioId)
  if (!data || data.length === 0) return true
  return data.some(m => m.modulo === modulo)
}

// Variante pública (portal, sin sesión) de useModulosActivos — misma
// tabla, cliente `supabasePublic` en vez del autenticado. Requiere la
// policy de SELECT pública sobre `modulos_config` (creada julio 2026).
export function useModulosConfigPublico(municipioId) {
  return useQuery({
    queryKey: ['modulos-config-publico', municipioId ?? '__NONE__'],
    queryFn:  async () => {
      const { data, error } = await supabasePublic
        .from('modulos_config')
        .select('modulo, config')
        .eq('municipio_id', municipioId)
      if (error) throw error
      return data ?? []
    },
    enabled:   !!municipioId,
    staleTime: 5 * 60_000,
  })
}

// Catálogo público de módulos. Lo consumen:
//   - El wizard de alta de municipio (paso 2.5) para renderizar
//     las cards seleccionables agrupadas por categoría.
//   - La futura pantalla de Config. General > Módulos (toggle ON/OFF
//     post-alta) para sincronizar nombres e íconos.
//
// IMPORTANTE: el `id` se persiste en modulos_config.modulo. No
// renombrar sin migrar las filas existentes.
export const MODULOS_DISPONIBLES = [
  { id: 'portal_web',     label: 'Portal Web público',            icono: '🌐', categoria: 'VECINO' },
  { id: 'crm_vecinal',    label: 'CRM Vecinal',                   icono: '👥', categoria: 'VECINO' },
  { id: 'turnos',         label: 'Turnos online',                 icono: '📅', categoria: 'VECINO' },
  { id: 'tablero_turnos', label: 'Tablero de turnos',             icono: '📋', categoria: 'VECINO' },
  { id: 'reclamos',       label: 'Reclamos',                      icono: '📢', categoria: 'VECINO' },
  { id: 'sala_pa',        label: 'Sala de Primeros Auxilios',     icono: '🏥', categoria: 'SALUD' },
  { id: 'cic_salud',      label: 'CIC — Servicios de Salud',      icono: '⚕️', categoria: 'SALUD' },
  { id: 'odontologia',    label: 'Consultorio Odontológico',      icono: '🦷', categoria: 'SALUD' },
  { id: 'mensajeria',     label: 'Mensajería SMS/WhatsApp',       icono: '💬', categoria: 'COMUNICACION' },
  { id: 'juez_paz',       label: 'Juez de Paz',                   icono: '⚖️', categoria: 'SERVICIOS' },
  { id: 'sum',            label: 'SUM — Salón de Usos Múltiples', icono: '🏛️', categoria: 'SERVICIOS' },
  { id: 'vales',          label: 'Vales Electrónicos',            icono: '🎫', categoria: 'SERVICIOS' },
  { id: 'administracion', label: 'Administración y ERP',          icono: '💰', categoria: 'ADMIN' },
  { id: 'rendicion',      label: 'Rendición de Cuentas',          icono: '📊', categoria: 'ADMIN' },
  { id: 'usuarios',       label: 'Usuarios y roles',              icono: '👤', categoria: 'ADMIN' },
  { id: 'inventario',     label: 'Inventario',                    icono: '📦', categoria: 'RECURSOS' },
  { id: 'flota',          label: 'Flota vehicular',               icono: '🚗', categoria: 'RECURSOS' },
  { id: 'seguros',        label: 'Seguros',                       icono: '🛡️', categoria: 'RECURSOS' },
  { id: 'patrimonio',     label: 'Patrimonio municipal',          icono: '🏢', categoria: 'RECURSOS' },
]

// Descripción corta opcional por módulo — la usa el wizard como
// segunda línea bajo el nombre. La lista vive separada del array
// principal para no engordar el catálogo cuando solo hace falta
// id/label.
export const MODULOS_DESC = {
  portal_web:     'Sitio público con noticias, trámites y datos del municipio.',
  crm_vecinal:    'Padrón de vecinos con búsqueda, fichas y barrio.',
  // El control efectivo hoy es dependencias.modulo_turnos (por dependencia,
  // ya cableado — decisión de julio 2026 para Sala PA/Juez de Paz). Este
  // toggle a nivel módulo todavía no gatea nada por sí solo — ver nota en
  // CLAUDE.md antes de asumir que apagarlo tiene efecto real.
  turnos:         'Reserva online de turnos en CAPS, juzgado, SUM y otras dependencias. Hoy el ajuste fino real es por dependencia (ver nota).',
  tablero_turnos: 'Vista día/semana cross-dependencia para coordinar la agenda.',
  reclamos:       'Reclamos y denuncias del vecino, con seguimiento de estado y canal.',
  sala_pa:        'Consultas clínicas, vacunas y agenda del médico de guardia.',
  cic_salud:      'Turnos y atención médica general del Centro Integrador Comunitario.',
  odontologia:    'Agenda, profesionales y atención del consultorio odontológico.',
  mensajeria:     'Envío saliente de SMS y WhatsApp a vecinos (requiere proveedor).',
  juez_paz:       'Mediaciones, certificaciones y trámites del Juzgado de Paz.',
  sum:            'Reservas y costos del Salón de Usos Múltiples.',
  administracion: 'Gastos, ingresos, presupuesto y partidas presupuestarias.',
  rendicion:      'Reportes mensuales y anuales compatibles SARC.',
  inventario:     'Stock por dependencia, movimientos y órdenes de compra.',
  flota:          'Vehículos, combustible, service y alertas de vencimientos.',
  seguros:        'Pólizas por vehículo, bien o entidad, con vigencia y archivo adjunto.',
  patrimonio:     'Inmuebles, muebles de capital y valuación para Tribunal de Cuentas.',
  usuarios:       'Alta y permisos de operadores municipales.',
  vales:          'Vales electrónicos canjeables en comercios adheridos, con QR y ventana de canje.',
}

// Mapa categoría → label en español, para el header de cada grupo
// en el wizard. Mantener sincronizado con los valores del catálogo.
export const CATEGORIA_LABEL = {
  VECINO:        'Atención al vecino',
  SALUD:         'Salud',
  COMUNICACION:  'Comunicaciones',
  SERVICIOS:     'Servicios municipales',
  ADMIN:         'Administración',
  RECURSOS:      'Recursos',
}

// Orden estable de las categorías en el wizard.
export const CATEGORIA_ORDEN = ['VECINO', 'SALUD', 'COMUNICACION', 'SERVICIOS', 'ADMIN', 'RECURSOS']

// =============================================================
// Gestión de módulos por tenant — superadmin (/superadmin/modulos)
//
// A diferencia de useModulosActivos() (que filtra activo=true para el
// gating del sidebar), acá hace falta ver TODAS las filas de un tenant
// — activas e inactivas — para poder togglearlas.
// =============================================================

export function useModulosConfigTenant(municipioId) {
  return useQuery({
    queryKey: ['modulos-config-tenant', municipioId ?? '__NONE__'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('modulos_config')
        .select('id, municipio_id, modulo, activo, orden, config, created_at')
        .eq('municipio_id', municipioId)
        .order('orden', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled:   !!municipioId,
    staleTime: 30_000,
  })
}

// Update genérico de una fila — activo, orden y/o config (merge hecho
// por el caller antes de llamar, acá se manda el objeto config final
// completo porque un UPDATE de Supabase reemplaza la columna jsonb
// entera, no la mergea).
export function useUpdateModuloConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, patch }) => {
      const { data, error } = await supabase
        .from('modulos_config')
        .update(patch)
        .eq('id', id)
        .select('id, municipio_id, modulo, activo, orden, config')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: ['modulos-config-tenant', row.municipio_id] })
      qc.invalidateQueries({ queryKey: ['modulos', row.municipio_id] })
      qc.invalidateQueries({ queryKey: ['modulos-config-publico', row.municipio_id] })
    },
  })
}

// Diff catálogo vs. filas reales del tenant → inserta las que falten,
// siempre INACTIVAS por default (que el superadmin decida prenderlas,
// nunca activar algo que el municipio no pidió por el solo hecho de
// sincronizar). orden continúa desde el máximo existente.
export function useSincronizarModulosFaltantes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ municipioId, modulosFaltantes }) => {
      if (!municipioId || !modulosFaltantes?.length) return []
      const { data: existentes, error: fetchErr } = await supabase
        .from('modulos_config')
        .select('orden')
        .eq('municipio_id', municipioId)
        .order('orden', { ascending: false })
        .limit(1)
      if (fetchErr) throw fetchErr
      const ordenBase = existentes?.[0]?.orden ?? 0
      const rows = modulosFaltantes.map((modulo, idx) => ({
        municipio_id: municipioId,
        modulo,
        activo:       false,
        orden:        ordenBase + idx + 1,
        config:       {},
      }))
      const { data, error } = await supabase
        .from('modulos_config')
        .insert(rows)
        .select('id, municipio_id, modulo, activo, orden, config')
      if (error) throw error
      return data ?? []
    },
    onSuccess: (_rows, { municipioId }) => {
      qc.invalidateQueries({ queryKey: ['modulos-config-tenant', municipioId] })
      qc.invalidateQueries({ queryKey: ['modulos', municipioId] })
    },
  })
}

// Módulos pre-seleccionados al abrir el paso del wizard.
//
// Criterio de entrega (confirmado 2026-07-30): un tenant nuevo nace con
// TODOS los módulos del catálogo activos por default, y el municipio pide
// desactivar lo que no usa — nunca al revés. Un módulo olvidado en el
// wizard (como pasó con cic_salud/reclamos/seguros antes de este fix)
// queda invisible para el municipio sin que nadie se entere; un módulo
// de más y desactivado a pedido es un caso visible y reversible. El
// wizard sigue permitiendo destildar antes de crear.
export const MODULOS_DEFAULT_ON = new Set(MODULOS_DISPONIBLES.map(m => m.id))
