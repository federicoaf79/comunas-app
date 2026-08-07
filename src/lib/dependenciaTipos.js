// Predicados para resolver la dependencia de tipo único (una sola
// por municipio, sin ruta por :id) que corresponde a cada página
// especial (Sala Primeros Auxilios, CIC Salud, Odontología).
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
