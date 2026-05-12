import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

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
  { id: 'sala_pa',        label: 'Sala de Primeros Auxilios',     icono: '🏥', categoria: 'SALUD' },
  { id: 'mensajeria',     label: 'Mensajería SMS/WhatsApp',       icono: '💬', categoria: 'COMUNICACION' },
  { id: 'juez_paz',       label: 'Juez de Paz',                   icono: '⚖️', categoria: 'SERVICIOS' },
  { id: 'sum',            label: 'SUM — Salón de Usos Múltiples', icono: '🏛️', categoria: 'SERVICIOS' },
  { id: 'administracion', label: 'Administración y ERP',          icono: '💰', categoria: 'ADMIN' },
  { id: 'rendicion',      label: 'Rendición de Cuentas',          icono: '📊', categoria: 'ADMIN' },
  { id: 'inventario',     label: 'Inventario',                    icono: '📦', categoria: 'RECURSOS' },
  { id: 'flota',          label: 'Flota vehicular',               icono: '🚗', categoria: 'RECURSOS' },
  { id: 'usuarios',       label: 'Usuarios y roles',              icono: '👤', categoria: 'ADMIN' },
]

// Descripción corta opcional por módulo — la usa el wizard como
// segunda línea bajo el nombre. La lista vive separada del array
// principal para no engordar el catálogo cuando solo hace falta
// id/label.
export const MODULOS_DESC = {
  portal_web:     'Sitio público con noticias, trámites y datos del municipio.',
  crm_vecinal:    'Padrón de vecinos con búsqueda, fichas y barrio.',
  turnos:         'Reserva online de turnos en CAPS, juzgado, SUM y otras dependencias.',
  tablero_turnos: 'Vista día/semana cross-dependencia para coordinar la agenda.',
  sala_pa:        'Consultas clínicas, vacunas y agenda del médico de guardia.',
  mensajeria:     'Envío saliente de SMS y WhatsApp a vecinos (requiere proveedor).',
  juez_paz:       'Mediaciones, certificaciones y trámites del Juzgado de Paz.',
  sum:            'Reservas y costos del Salón de Usos Múltiples.',
  administracion: 'Gastos, ingresos, presupuesto y partidas presupuestarias.',
  rendicion:      'Reportes mensuales y anuales compatibles SARC.',
  inventario:     'Stock por dependencia, movimientos y órdenes de compra.',
  flota:          'Vehículos, combustible, service y alertas de vencimientos.',
  usuarios:       'Alta y permisos de operadores municipales.',
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

// Módulos pre-seleccionados al abrir el paso del wizard. Todos
// excepto Mensajería (requiere proveedor) y Flota (opcional).
export const MODULOS_DEFAULT_ON = new Set(
  MODULOS_DISPONIBLES
    .filter(m => m.id !== 'mensajeria' && m.id !== 'flota')
    .map(m => m.id)
)
