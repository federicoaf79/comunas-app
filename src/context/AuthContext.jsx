import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

// Orden de prioridad: el primer rol que matchea define la ruta destino.
// `superadmin` no requiere municipio_id (gestión global).
const ROLE_HOME = [
  ['superadmin',   '/superadmin'],
  ['admin_comuna', '/admin'],
  ['operador',     '/admin'],
  ['vecino',       '/portal'],
]

export function homeRouteFor(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return null
  for (const [role, path] of ROLE_HOME) {
    if (roles.includes(role)) return path
  }
  return null
}

const PERFIL_TIMEOUT_MS = 10_000

// Race entre la query y un timeout. Si gana el timeout devolvemos un error
// marcado con __timeout para distinguirlo de errores reales (RLS, validación).
function withTimeout(promise, ms) {
  const timeout = new Promise(resolve =>
    setTimeout(
      () => resolve({ data: null, error: { message: 'timeout', __timeout: true } }),
      ms,
    ),
  )
  return Promise.race([promise, timeout])
}

// Ejecuta una query y la reintenta una vez si la primera vez salió por timeout.
async function tryQuery(queryFn, label) {
  let result = await withTimeout(queryFn(), PERFIL_TIMEOUT_MS)
  if (result.error?.__timeout) {
    console.warn(`[AuthContext] ${label} timeout, reintentando una vez...`)
    result = await withTimeout(queryFn(), PERFIL_TIMEOUT_MS)
  }
  return result
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)
  const intentionalSignOut    = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const fetchPerfil = useCallback(async (userId) => {
    // Query 1: perfil base sin JOIN. El JOIN embebido a municipios bajo RLS
    // resultaba lento (cada fila joineada se evalúa contra las policies del
    // target), causando timeouts. Hacemos dos queries simples en su lugar.
    const { data: perfilData, error: perfilError } = await tryQuery(
      () =>
        supabase
          .from('usuarios')
          .select('id, municipio_id, roles, dependencias_ids, nombre, email, activo')
          .eq('id', userId)
          .maybeSingle(),
      'fetchPerfil(usuarios)',
    )

    if (perfilError) {
      console.error('[AuthContext] Error cargando perfil:', perfilError)
      return null
    }
    if (!perfilData) return null

    // Query 2: municipio. Sólo si el usuario tiene uno asignado.
    // Superadmin tiene municipio_id = null por diseño y debe poder
    // entrar igual.
    let municipio = null
    if (perfilData.municipio_id) {
      const { data: municipioData, error: municipioError } = await tryQuery(
        () =>
          supabase
            .from('municipios')
            .select('id, nombre, slug')
            .eq('id', perfilData.municipio_id)
            .maybeSingle(),
        'fetchPerfil(municipios)',
      )

      if (municipioError) {
        // No abortamos el perfil entero si falla el municipio: el usuario
        // puede seguir usando la app aunque le falte el nombre del municipio.
        console.warn('[AuthContext] No se pudo cargar el municipio (perfil OK):', municipioError)
      } else {
        municipio = municipioData
      }
    }

    return { ...perfilData, municipio }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return

        if (session?.user) {
          setUser(session.user)
          const p = await fetchPerfil(session.user.id)
          if (!cancelled) setPerfil(p)
        } else {
          setUser(null)
          setPerfil(null)
        }
      } catch (e) {
        console.error('AuthContext init error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setUser(null)
          setPerfil(null)
          if (!intentionalSignOut.current) setSessionExpired(true)
          intentionalSignOut.current = false
          setLoading(false)
          return
        }

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          const p = await fetchPerfil(session.user.id)
          setPerfil(p)
          setLoading(false)
          return
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }

        if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user)
          const p = await fetchPerfil(session.user.id)
          setPerfil(p)
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [fetchPerfil])

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
    await supabase.auth.signOut()
  }, [])

  const refreshPerfil = useCallback(async () => {
    if (user?.id) {
      const p = await fetchPerfil(user.id)
      setPerfil(p)
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
