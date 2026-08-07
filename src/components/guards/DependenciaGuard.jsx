import { useMemo } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependencias } from '../../hooks/useTurnos'
import Spinner from '../ui/Spinner'

// =============================================================
// DependenciaGuard — control de acceso por dependencia, a nivel
// de RUTA (envuelve la página entera en App.jsx), no de tab.
//
// El bug que esto reemplaza: SalaPrimerosAuxilios.jsx tenía este
// mismo chequeo (miAcceso/puedeGestionar) adentro del componente,
// pero solo delante de la vista principal — los early returns de
// ?tab=landing/bot_ia/profesionales vivían ARRIBA de ese chequeo
// y lo esquivaban sin querer. Puesto afuera, en la ruta, no hay
// rama interna del componente que lo pueda saltear.
//
// Regla:
//   - superadmin / admin_comuna pasan siempre.
//   - el resto necesita una entrada en perfil.dependencias_acceso
//     para la dependencia resuelta, con puede_gestionar o
//     puede_administrar en true (mismo criterio que ya usaba el
//     sidebar en AdminLayout.jsx para decidir qué mostrar).
//   - mientras el perfil, el municipio o el listado de
//     dependencias todavía están resolviendo, se muestra un
//     spinner — nunca el cartel de rechazo. Un falso negativo por
//     timing (mostrar "sin acceso" a alguien que sí tiene acceso,
//     solo porque el dato no llegó todavía) es peor que esperar.
// =============================================================
export default function DependenciaGuard({ match, children }) {
  const { perfil, hasRole, loading: authLoading } = useAuth()
  const { municipioId, loading: municipioLoading } = useEffectiveMunicipioId()
  const esDirector = hasRole(['admin_comuna', 'superadmin'])
  const depsQ = useDependencias(municipioId)

  const dep = useMemo(() => {
    return (depsQ.data ?? []).find(match) ?? null
  }, [depsQ.data, match])

  if (esDirector) return children

  if (authLoading || municipioLoading || depsQ.isLoading) {
    return (
      <div className="flex justify-center p-10">
        <Spinner size="lg" />
      </div>
    )
  }

  const acceso = (perfil?.dependencias_acceso ?? []).find(a => a?.dependencia_id === dep?.id) ?? null
  const tieneAcceso = !!acceso?.puede_gestionar || !!acceso?.puede_administrar

  if (!dep || !tieneAcceso) {
    return (
      <div className="p-6">
        <div className="card border-red-200 bg-red-50 p-8 text-center">
          <p className="text-sm font-semibold text-red-700">No tenés acceso a esta dependencia.</p>
          {dep?.nombre && (
            <p className="mt-1 text-xs text-red-600">{dep.nombre}</p>
          )}
        </div>
      </div>
    )
  }

  return children
}
