import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)
  const intentionalSignOut = useRef(false)

  async function fetchProfile(userId) {
    const timeout = new Promise(resolve =>
      setTimeout(() => resolve({ data: null, error: new Error('fetchProfile timeout') }), 6000)
    )
    const query = supabase
      .from('profiles')
      .select('id, full_name, email, role, comuna_id, comunas(id, nombre, slug)')
      .eq('id', userId)
      .single()

    const { data, error } = await Promise.race([query, timeout])
    if (error) {
      console.error('Error fetching profile:', error.message)
      return null
    }
    return data
  }

  useEffect(() => {
    let done = false

    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (done) return
        if (session?.user) {
          setSession(session)
          const p = await fetchProfile(session.user.id)
          if (!done && p) setProfile(p)
        } else {
          setSession(null)
        }
      } catch (e) {
        console.error('AuthContext init error:', e)
      } finally {
        if (!done) setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          setSession(null)
          setProfile(null)
          if (!intentionalSignOut.current) setSessionExpired(true)
          intentionalSignOut.current = false
          setLoading(false)
          return
        }
        if (event === 'SIGNED_IN' && session?.user) {
          setSession(session)
          const p = await fetchProfile(session.user.id)
          if (p) setProfile(p)
          setLoading(false)
          return
        }
        if (event === 'TOKEN_REFRESHED') {
          setSession(session)
        }
      }
    )

    return () => {
      done = true
      subscription.unsubscribe()
    }
  }, [])

  async function signIn({ email, password }) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  async function signUp({ email, password, fullName }) {
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
  }

  async function signOut() {
    intentionalSignOut.current = true
    await supabase.auth.signOut()
  }

  async function refreshProfile() {
    if (session?.user) {
      const p = await fetchProfile(session.user.id)
      setProfile(p)
    }
  }

  const value = {
    session,
    user:    session?.user ?? null,
    profile,
    loading,
    sessionExpired,
    role:    profile?.role ?? null,
    comuna:  profile?.comunas ?? null,
    isSuperadmin:   profile?.role === 'superadmin',
    isAdminComuna:  profile?.role === 'admin_comuna',
    isOperador:     profile?.role === 'operador',
    isVecino:       profile?.role === 'vecino',
    signIn,
    signUp,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
