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

  const fetchPerfil = useCallback(async (userId) => {
    // Query 1: perfil base, sin joins. Sin envoltorio de timeout —
    // Supabase maneja sus propios reintentos sobre el fetch global.
    const { data: perfilData, error: perfilError } = await supabase
      .from('usuarios')
      .select('id, municipio_id, roles, dependencias_ids, nombre, email, activo')
      .eq('id', userId)
      .single()

    if (perfilError) {
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

        // Hidratar desde sessionStorage si el cache pertenece a este
        // usuario. Permite que el router siga inmediatamente sin
        // esperar al round-trip a Supabase.
        const cached = loadCachedPerfil()
        const cacheMatches = cached && cached.id === session.user.id
        if (cacheMatches) {
          setPerfil(cached)
          setLoading(false)
        }

        // Fetch real para refrescar (incluso si había cache).
        const fresh = await fetchPerfil(session.user.id)
        if (cancelled) return
        if (fresh) {
          setPerfil(fresh)
          saveCachedPerfil(fresh)
        } else if (!cacheMatches) {
          // No había cache utilizable y el fetch falló: queda en null.
          setPerfil(null)
        }
        // Si fetch falló pero teníamos cache, lo dejamos en pantalla.
      } catch (e) {
        console.error('[AuthContext] init error:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
          setUser(session.user)
          const p = await fetchPerfil(session.user.id)
          if (p) {
            setPerfil(p)
            saveCachedPerfil(p)
          } else {
            setPerfil(null)
            clearCachedPerfil()
          }
          setLoading(false)
          return
        }

        if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        }

        if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user)
          const p = await fetchPerfil(session.user.id)
          if (p) {
            setPerfil(p)
            saveCachedPerfil(p)
          }
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
    clearCachedPerfil()
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
