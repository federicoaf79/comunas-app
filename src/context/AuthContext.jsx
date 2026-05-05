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

const PERFIL_SELECT = `
  id,
  municipio_id,
  roles,
  dependencias_ids,
  nombre,
  email,
  activo,
  municipios:municipio_id ( id, nombre, slug, provincia, activo )
`

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [perfil, setPerfil]   = useState(null)
  const [loading, setLoading] = useState(true)
  const intentionalSignOut    = useRef(false)
  const [sessionExpired, setSessionExpired] = useState(false)

  const fetchPerfil = useCallback(async (userId) => {
    const PERFIL_TIMEOUT_MS = 10_000

    async function attempt() {
      const timeout = new Promise(resolve =>
        setTimeout(() => resolve({ data: null, error: { message: 'fetchPerfil timeout', __timeout: true } }), PERFIL_TIMEOUT_MS)
      )
      const query = supabase
        .from('usuarios')
        .select(PERFIL_SELECT)
        .eq('id', userId)
        .maybeSingle()
      return Promise.race([query, timeout])
    }

    let { data, error } = await attempt()

    if (error?.__timeout) {
      console.warn('[AuthContext] fetchPerfil timeout, reintentando una vez...')
      ;({ data, error } = await attempt())
    }

    if (error) {
      console.error('[AuthContext] Error cargando perfil:', error)
      return null
    }
    return data
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
    municipio: perfil?.municipios ?? null,
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
