import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

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
      .select('id, municipio_id, roles, dependencias_ids, dependencias_acceso, nombre, email, activo')
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
  }, [fetchPerfil])

  const signIn = useCallback(async ({ email, password }) => {
    const result = await supabase.auth.signInWithPassword({ email, password })

    // Auditoría de acceso. Se registra acá —en el login interactivo
    // exitoso— y NO en onAuthStateChange: SIGNED_IN también dispara
    // en session-restore y token-refresh; signIn solo lo llama el
    // usuario al enviar credenciales, así que es "el primer login
    // de la sesión" por construcción. try/catch silencioso: si la
    // auditoría falla (RLS, red), el login no se bloquea.
    const uid = result?.data?.user?.id
    if (uid && !result.error) {
      try {
        const u = await fetchPerfil(uid)
        if (u) {
          await supabase.from('audit_log').insert({
            municipio_id:  u.municipio_id ?? null,
            usuario_id:    u.id,
            accion:        'LOGIN',
            entidad:       'auth',
            entidad_id:    u.id,
            descripcion:   `Inicio de sesión — ${u.nombre} (${u.email})`,
            datos_despues: {
              roles:     u.roles ?? [],
              timestamp: new Date().toISOString(),
            },
          })
        }
      } catch { /* no bloquear el login si falla la auditoría */ }
    }

    return result
  }, [fetchPerfil])

  const signUp = useCallback(async ({ email, password, nombre }) => {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    })
  }, [])

  const signOut = useCallback(async () => {
    intentionalSignOut.current = true
    clearCachedPerfil()
    // Limpiar cache de "usuarios sin perfil" al hacer signOut
    // (podría ser un usuario diferente en el próximo login)
    noPerfilCache.current.clear()
    await supabase.auth.signOut()
  }, [])

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
