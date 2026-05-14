// =============================================================
// Defaults para las claves de `configuracion_portal` que viven en
// el frontend cuando todavía no se persistieron desde el admin.
//
// Se usan desde:
//   - PortalPublico (HeroCarousel)
//   - TramitesPortal (página /portal/tramites)
//   - ConfigPortal (admin: tabs "Hero Carousel" y "Trámites")
//
// Mantener este archivo en sync con las migrations de whitelist
// (20260514_hero_carousel_anon.sql, 20260514_tramites_portal_anon.sql).
// =============================================================

export const HERO_CAROUSEL_DEFAULT = {
  activo:             true,
  velocidad_segundos: 30,
  mostrar_titulo:     true,
  mostrar_categoria:  true,
}

// Opciones de velocidad expuestas en el admin — el frontend acepta
// cualquier número, pero el slider del admin se limita a estos
// valores para mantener UX consistente entre municipios.
export const HERO_CAROUSEL_VELOCIDADES = [15, 30, 45, 60]

// Cada trámite tiene 4 campos editables desde el admin (titulo /
// descripcion / activo) + 4 inmutables (id / icono / tipo / url),
// más una versión futura donde se podrán agregar/eliminar items.
//
// Tipos soportados (afectan el badge y el comportamiento del CTA):
//   turno      → Link a `url` · badge navy
//   reserva    → Link a `url` · badge gold
//   presencial → muestra hint "se hace en Administración" · badge gray
//   reclamo    → Link a `url` · badge naranja
//
// Íconos válidos: salud, justicia, edificio, construccion, social,
//                 documento, comercio, alumbrado.
// Si llegara un valor no soportado, la UI cae a un ícono genérico.
export const TRAMITES_PORTAL_DEFAULT = [
  {
    id:          'turno-sala-pa',
    titulo:      'Turno Sala de Primeros Auxilios',
    descripcion: 'Solicitá turno médico para atención en la Sala PA.',
    icono:       'salud',
    tipo:        'turno',
    url:         '/portal/turno',
    activo:      true,
  },
  {
    id:          'turno-juez-paz',
    titulo:      'Turno Juez de Paz',
    descripcion: 'Certificaciones, actas y mediaciones civiles.',
    icono:       'justicia',
    tipo:        'turno',
    url:         '/portal/turno',
    activo:      true,
  },
  {
    id:          'turno-sum',
    titulo:      'Reserva Salón de Usos Múltiples',
    descripcion: 'Reservá el SUM para eventos y reuniones comunitarias.',
    icono:       'edificio',
    tipo:        'reserva',
    url:         '/portal/turno',
    activo:      true,
  },
  {
    id:          'permiso-construccion',
    titulo:      'Permiso de Construcción',
    descripcion: 'Iniciá el trámite de permiso ante la Comisión.',
    icono:       'construccion',
    tipo:        'presencial',
    url:         '#tramite-presencial',
    activo:      true,
  },
  {
    id:          'ayuda-social',
    titulo:      'Solicitud de Ayuda Social',
    descripcion: 'Asistencia social del municipio para vecinos en situación de vulnerabilidad.',
    icono:       'social',
    tipo:        'presencial',
    url:         '#tramite-presencial',
    activo:      true,
  },
  {
    id:          'ddjj-domicilio',
    titulo:      'Declaración Jurada de Domicilio',
    descripcion: 'Acreditá tu residencia en la comuna.',
    icono:       'documento',
    tipo:        'presencial',
    url:         '#tramite-presencial',
    activo:      true,
  },
  {
    id:          'habilitacion-comercial',
    titulo:      'Habilitación Comercial',
    descripcion: 'Iniciá el trámite para habilitar tu comercio en la comuna.',
    icono:       'comercio',
    tipo:        'presencial',
    url:         '#tramite-presencial',
    activo:      true,
  },
  {
    id:          'alumbrado-reclamo',
    titulo:      'Reclamo de Alumbrado Público',
    descripcion: 'Reportá una luminaria apagada o con desperfectos.',
    icono:       'alumbrado',
    tipo:        'reclamo',
    url:         '#tramite-presencial',
    activo:      true,
  },
]

// Badge + behavior por `tipo` de trámite. Usado tanto en el portal
// público como en el admin para que se vean iguales.
export const TRAMITE_TIPO_META = {
  turno:      { label: 'Turno online',   cls: 'bg-primary-100 text-primary-700 ring-primary-200' },
  reserva:    { label: 'Reserva online', cls: 'bg-accent-50 text-accent-700 ring-accent-100' },
  presencial: { label: 'Presencial',     cls: 'bg-gray-100 text-gray-700 ring-gray-200' },
  reclamo:    { label: 'Reclamo',        cls: 'bg-orange-50 text-orange-700 ring-orange-100' },
}

export const TRAMITE_PRESENCIAL_HINT =
  'Este trámite se realiza de forma presencial en Administración Municipal. Lunes a Viernes 7:00–13:00.'
