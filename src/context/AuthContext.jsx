import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { registrarAcceso } from '../hooks/useAuditLog'

const AuthContext = createContext(null)

// Orden de prioridad: el primer rol que matchea define la ruta destino.
// `superadmin` no requiere municipio_id (gestión global).
const ROLE_HOME = [
  ['superadmin',    '/superadmin'],
  ['admin_comuna',  '/admin'],
  ['admin_portal',  '/admin'],
  ['usuario_admin', '/admin'],
  ['subadmin',      '/admin'],
  ['usuario_sub',   '/admin'],
  ['reporting',     '/admin'],
  ['operador',      '/admin'],
  ['vecino',        '/portal'],
]

export function homeRouteFor(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return null
  for (const [role, path] of ROLE_HOME) {
    if (roles.includes(role)) return path
  }
  return null
}

// Cache del perfil en sessionStorage. Hace que la navegación entre
// rutas sea instantánea aún con hard reload: el perfil se hidrata
// desde el cache mientras el fetch real corre en background para
// refrescar.
const PERFIL_CACHE_KEY = 'comunas_perfil'

function loadCachedPerfil() {
  try {
    const raw = sessionStorage.getItem(PERFIL_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function saveCachedPerfil(perfil) {
  try {
    if (perfil) sessionStorage.setItem(PERFIL_CACHE_KEY, JSON.stringify(perfil))
  } catch { /* sessionStorage no disponible / cuota llena */ }
}

function clearCachedPerfil() {
  try { sessionStorage.removeItem(PERFIL_CACHE_KEY) } catch { /* no-op */ }
}

export function AuthProvider({ children }) {
  const qc = useQueryClient()
  const [user, setUser]       = useState(null)
  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)
  const intentionalSignOut    = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(false)
  // Cache de usuarios que NO tienen perfil en tabla 'usuarios'
  // (ej: vecinos con sesión Supabase Auth pero sin row en 'usuarios').
  // Evita reintentar fetchPerfil en cada re-render cuando ya sabemos
  // que el usuario NO es staff.
  const noPerfilCache = useRef(new Set())

  const fetchPerfil = useCallback(async (userId) => {
    // Si ya sabemos que este usuario NO tiene perfil (porque una
    // consulta real anterior devolvió "no rows"), retornar null
    // inmediatamente sin repetir la query. Esto evita errores 406
    // repetidos en consola para sesiones de vecino puro — pero solo
    // después de haber confirmado con una consulta real, nunca de
    // antemano. Una cuenta puede ser staff Y vecino a la vez (caso
    // normal del producto, no la excepción) — adivinar "es vecino
    // → no puede ser staff" rompía el acceso al panel admin para esas
    // cuentas duales.
    if (noPerfilCache.current.has(userId)) {
      return null
    }
    // Query 1: perfil base, sin joins. Sin envoltorio de timeout —
    // Supabase maneja sus propios reintentos sobre el fetch global.
    const { data: perfilData, error: perfilError } = await supabase
      .from('usuarios')
      .select('id, municipio_id, roles, dependencias_ids, dependencias_acceso, nombre, email, activo, modulos_acceso, puede_emitir_vales')
      .eq('id', userId)
      .single()

    if (perfilError) {
      // PGRST116 = "no rows returned" — el usuario no existe en tabla 'usuarios'.
      // Esto es ESPERADO para vecinos con sesión Supabase Auth (tienen user_id
      // en tabla 'vecinos', pero NO row en 'usuarios'). Cachear este resultado
      // negativo para NO volver a intentar fetchPerfil para el mismo userId.
      if (perfilError.code === 'PGRST116') {
        noPerfilCache.current.add(userId)
        return null
      }
      // Otros errores (red, timeout, permisos) SÍ se loguean y NO se cachean
      // (podría ser transitorio y queremos reintentar).
      console.error('[AuthContext] Error cargando perfil:', perfilError)
      return null
    }

    // Query 2: municipio. Sólo si el usuario tiene uno asignado
    // (superadmin tiene municipio_id = null por diseño).
    let municipio = null
    if (perfilData.municipio_id) {
      const { data: municipioData, error: municipioError } = await supabase
        .from('municipios')
        .select('id, nombre, slug')
        .eq('id', perfilData.municipio_id)
        .single()

      if (municipioError) {
        // No abortamos el perfil si falla el municipio — el usuario entra igual.
        console.warn('[AuthContext] No se pudo cargar el municipio (perfil OK):', municipioError)
      } else {
        municipio = municipioData
      }
    }

    return { ...perfilData, municipio }
  }, [])

  useEffect(() => {
    let cancelled = false

    // Fire-and-forget: refresca el perfil contra Supabase y actualiza
    // el cache. NUNCA bloquea el render — si el fetch falla o cuelga,
    // el usuario sigue trabajando con el cache. Cualquier error se
    // ignora silenciosamente.
    function refreshPerfilInBackground(userId) {
      fetchPerfil(userId)
        .then(fresh => {
          if (cancelled || !fresh) return
          setPerfil(fresh)
          saveCachedPerfil(fresh)
        })
        .catch(() => { /* silenciar — el cache se mantiene */ })
    }

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return

        if (!session?.user) {
          clearCachedPerfil()
          setUser(null)
          setPerfil(null)
          return
        }

        setUser(session.user)

        // sessionStorage es la fuente de verdad para el render.
        // Si hay cache válido para este usuario, lo usamos
        // INMEDIATAMENTE y disparamos un refresh en background sin
        // bloquear la UI.
        const cached = loadCachedPerfil()
        if (cached && cached.id === session.user.id) {
          setPerfil(cached)
          refreshPerfilInBackground(session.user.id)
          return
        }

        // Sin cache: no nos queda otra que esperar el fetch antes
        // de poder mostrar contenido (típicamente primer login en
        // la pestaña, post-signOut, o cache fue invalidado).
        const fresh = await fetchPerfil(session.user.id)
        if (cancelled) return
        if (fresh) {
          setPerfil(fresh)
          saveCachedPerfil(fresh)
        } else {
          setPerfil(null)
        }
      } catch (e) {
        console.error('[AuthContext] init error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          clearCachedPerfil()
          setUser(null)
          setPerfil(null)
          // Defensa de fondo: cubre también el caso de un SIGNED_OUT
          // que no pasó por signOut() (expiración de token, sign-out
          // disparado desde otra pestaña) — el cache de React Query no
          // debe sobrevivir a NINGÚN cierre de sesión, intencional o no.
          qc.clear()
          if (!intentionalSignOut.current) setSessionExpired(true)
          intentionalSignOut.current = false
          setLoading(false)
          return
        }

        if (event === 'SIGNED_IN' && session?.user) {
          // Diferir el trabajo async con setTimeout para salir de la
          // cadena síncrona de notificación de Supabase — si se hace
          // await fetchPerfil() directamente acá, se genera un deadlock
          // (Supabase espera a que este callback termine antes de resolver
          // signInWithPassword(), pero fetchPerfil espera al cliente).
          setTimeout(async () => {
            setUser(session.user)

            // Mismo patrón: cache primero, fetch en background.
            const cached = loadCachedPerfil()
            if (cached && cached.id === session.user.id) {
              setPerfil(cached)
              setLoading(false)
              refreshPerfilInBackground(session.user.id)
              return
            }

            // Login fresco sin cache — esperamos el fetch.
            const p = await fetchPerfil(session.user.id)
            if (p) {
              setPerfil(p)
              saveCachedPerfil(p)
            } else {
              setPerfil(null)
              clearCachedPerfil()
            }
            setLoading(false)
          }, 0)
          return
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }

        if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user)
          // USER_UPDATED siempre en background — el usuario ya está
          // viendo la app, no debería congelarse esperando la query.
          refreshPerfilInBackground(session.user.id)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [fetchPerfil, qc])

  // La auditoría de login YA NO se registra acá. Antes dependía de
  // fetchPerfil(uid) para tener nombre/municipio antes de escribir, y
  // eso perdía el registro de cualquier login real cuyo fetch fallara
  // (o cuyo usuario no tuviera fila en `usuarios` todavía) sin dejar
  // rastro ni error visible. Ahora cada página que llama a signIn()
  // (Login.jsx, Acceso.jsx) registra el acceso ella misma con su
  // propio `via`, vía registrarAcceso() en useAuditLog.js — apenas
  // confirma que hay un user.id, sin esperar nada más.
  const signIn = useCallback(async ({ email, password }) => {
    return supabase.auth.signInWithPassword({ email, password })
  }, [])

  const signUp = useCallback(async ({ email, password, nombre }) => {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    })
  }, [])

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true
    // El registro de logout tiene que salir ANTES de supabase.auth.signOut():
    // una vez cerrada la sesión el insert sale como anon y la policy de
    // audit_log lo rechaza. signOut() es una acción directa del usuario
    // (botón "Salir"), no el callback de onAuthStateChange, así que este
    // await es seguro -- no es la zona frágil del deadlock.
    //
    // La identidad (userId/email) sale de la sesión VIVA
    // (supabase.auth.getSession(), sin viaje de red -- lee el token ya
    // en memoria), NUNCA de `user` en React state. Motivo real
    // (2026-08-06): `user`/`perfil` se actualizan recién en el
    // setTimeout(0) de onAuthStateChange (ver esa zona frágil más
    // abajo) -- entre un signInWithPassword() de OTRA persona en la
    // misma pestaña y que ese setTimeout corra, hay una ventana donde
    // este estado todavía es el de la sesión ANTERIOR mientras la
    // sesión de Supabase Auth ya cambió. Caso real: Login.jsx llama a
    // este signOut() cuando rechaza una cuenta recién autenticada (sin
    // fila en `usuarios`) -- si `user` seguía siendo el de un login
    // previo en la misma pestaña, el insert intentaba escribir con la
    // identidad de la persona EQUIVOCADA. `perfil?.id` (más abajo) sí
    // sigue viniendo de React state -- registrarAcceso() lo valida
    // contra la sesión viva antes de usarlo, así que una versión vieja
    // de `perfil` ya no puede producir una fila mal atribuida.
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      await registrarAcceso({
        resultado: 'logout',
        via: 'login_staff',
        userId: session.user.id,
        email: session.user.email,
        usuarioId: perfil?.id ?? null,
        municipioId: perfil?.municipio_id ?? null,
      })
    }
    clearCachedPerfil()
    // Limpiar cache de "usuarios sin perfil" al hacer signOut
    // (podría ser un usuario diferente en el próximo login)
    noPerfilCache.current.clear()
    // Fix central del bug de sesión arrastrada: sin esto, cualquier
    // query de React Query ya resuelta en memoria (ej. ['vecinos', ...],
    // ['gastos', ...]) sigue sirviendo los datos de ESTA cuenta al
    // instante en que el próximo usuario loguea en la misma pestaña,
    // hasta que cada query individual decida refetchear. clear() vacía
    // el cache entero de una sola vez, antes de que exista la
    // posibilidad de que otro usuario lo lea.
    qc.clear()
    await supabase.auth.signOut()
  }, [qc, perfil])

  const refreshPerfil = useCallback(async () => {
    if (user?.id) {
      const p = await fetchPerfil(user.id)
      if (p) {
        setPerfil(p)
        saveCachedPerfil(p)
      }
    }
  }, [user, fetchPerfil])

  const hasRole = useCallback((role) => {
    if (!perfil?.roles) return false
    return Array.isArray(role)
      ? role.some(r => perfil.roles.includes(r))
      : perfil.roles.includes(role)
  }, [perfil])

  const hasDep = useCallback((depId) => {
    if (!perfil?.dependencias_ids) return false
    return perfil.dependencias_ids.includes(depId)
  }, [perfil])

  const value = useMemo(() => ({
    user,
    perfil,
    municipio: perfil?.municipio ?? null,
    homeRoute: homeRouteFor(perfil?.roles),
    loading,
    sessionExpired,
    signIn,
    signUp,
    signOut,
    refreshPerfil,
    hasRole,
    hasDep,
  }), [user, perfil, loading, sessionExpired, signIn, signUp, signOut, refreshPerfil, hasRole, hasDep])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
