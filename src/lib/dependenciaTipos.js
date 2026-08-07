// Predicados para resolver la dependencia de tipo único (una sola
// por municipio, sin ruta por :id) que corresponde a cada página
// especial (Sala Primeros Auxilios, CIC Salud, Odontología, Ayuda
// Social, Juez de Paz, SUM).
//
// Compartidos entre la página real (que los usa para resolver sus
// propios datos) y DependenciaGuard (que los usa para resolver el
// mismo id y chequear acceso) — un solo lugar para que ambos lados
// no diverjan con el tiempo. Ya pasó una vez con DepBotIATab: dos
// implementaciones del mismo chequeo, una quedó desactualizada.

function tipoDe(d) {
  return (d?.tipo ?? '').toLowerCase()
}

// Bases viejas usan 'caps' / 'sala' / 'primeros_auxilios', las nuevas
// tienden a 'salud'. Resolver por listado evita falsos negativos del
// filtro estricto tipo='caps'.
const TIPOS_SALA_PA = ['salud', 'caps', 'sala', 'primeros_auxilios']
export const matchSalaPA = (d) => TIPOS_SALA_PA.includes(tipoDe(d))

export const matchCicSalud = (d) => tipoDe(d) === 'cic_salud'

export const matchOdontologia = (d) => tipoDe(d) === 'odontologia' || d?.slug === 'consultorio-odontologico'

// Verificado en prod 2026-08-07: la dependencia real es tipo 'social',
// no 'ayuda_social' — la página anterior toleraba las dos, pero la
// segunda no corresponde a ningún dato real.
export const matchAyudaSocial = (d) => tipoDe(d) === 'social'

// Tolera variaciones del seed inicial entre municipios (juzgado /
// juez_paz / juez), tal como ya lo resolvía JuezDePaz.jsx.
const TIPOS_JUEZ_PAZ = ['juzgado', 'juez_paz', 'juez']
export const matchJuezDePaz = (d) => TIPOS_JUEZ_PAZ.includes(tipoDe(d))

// Tolera variaciones del seed (sum / salon / salon_usos_multiples),
// tal como ya lo resolvía SUM.jsx.
const TIPOS_SUM = ['sum', 'salon', 'salon_usos_multiples']
export const matchSum = (d) => TIPOS_SUM.includes(tipoDe(d))
