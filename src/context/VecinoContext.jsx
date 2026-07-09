/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

// =============================================================
// VecinoContext — Sesión del Portal del Vecino
//
// Soporta DOS modos de autenticación:
// 1. Supabase Auth (email + password) → vecinos.user_id vinculado
// 2. Acceso rápido (DNI + teléfono) → sesión client-side temporal
//
// La sesión vive en localStorage (persiste entre pestañas y
// cierres de navegador). Para dispositivos compartidos, el vecino
// debe cerrar sesión manualmente.
//
// Al iniciar, intenta restaurar sesión de Supabase Auth si existe.
// =============================================================

const STORAGE_KEY = 'comunas_vecino_session'

const VecinoContext = createContext(null)

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    // Validación mínima — la sesión debe tener al menos id y dni
    if (!obj?.id || !obj?.dni) return null
    return obj
  } catch {
    return null
  }
}

function saveSession(vecino) {
  try {
    if (vecino) localStorage.setItem(STORAGE_KEY, JSON.stringify(vecino))
    else        localStorage.removeItem(STORAGE_KEY)
  } catch { /* localStorage llena o no disponible — no-op */ }
}

export function VecinoProvider({ children }) {
  const [vecinoSession, setSessionState] = useState(() => loadSession())
  const [authLoading, setAuthLoading] = useState(true)

  // Al montar, verificar si hay sesión de Supabase Auth
  useEffect(() => {
    let cancelled = false

    async function restoreAuthSession() {
      try {
        const { data: { user } } = await supabase.auth.getUser()

        if (user && !cancelled) {
          // Solo buscar vecino si estamos en rutas del portal
          // NO ejecutar en /admin, /superadmin o /login para evitar queries innecesarias
          const path = window.location.pathname
          const isPortalRoute = path.startsWith('/portal')
          const isAdminRoute = path.startsWith('/admin') || path.startsWith('/superadmin') || path.startsWith('/login')

          if (isPortalRoute && !isAdminRoute) {
            // Hay sesión de Auth → buscar vecino vinculado
            const { data: vecino } = await supabase
              .from('vecinos')
              .select('*')
              .eq('user_id', user.id)
              .maybeSingle()  // maybeSingle() no falla si no encuentra nada

            if (vecino) {
              const sessionData = {
                ...vecino,
                auth_mode: 'supabase',
                user_email: user.email,
              }
              saveSession(sessionData)
              setSessionState(sessionData)
            }
          }
        }
      } catch (e) {
        console.warn('[VecinoContext] Error restaurando sesión:', e)
      } finally {
        if (!cancelled) setAuthLoading(false)
      }
    }

    restoreAuthSession()
    return () => { cancelled = true }
  }, [])

  const setVecinoSession = useCallback((vecino) => {
    saveSession(vecino)
    setSessionState(vecino)
  }, [])

  const clearVecinoSession = useCallback(async () => {
    // Si es sesión de Auth, hacer signOut
    if (vecinoSession?.auth_mode === 'supabase') {
      try {
        await supabase.auth.signOut()
      } catch (e) {
        console.warn('[VecinoContext] Error en signOut:', e)
      }
    }
    saveSession(null)
    setSessionState(null)
  }, [vecinoSession])

  // Sincronización entre pestañas
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return
      setSessionState(e.newValue ? loadSession() : null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Listener de cambios en Auth state
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_OUT') {
          saveSession(null)
          setSessionState(null)
        } else if (event === 'SIGNED_IN' && session?.user) {
          // Solo cargar vecino si estamos en rutas del portal
          const path = window.location.pathname
          const isPortalRoute = path.startsWith('/portal')
          const isAdminRoute = path.startsWith('/admin') || path.startsWith('/superadmin') || path.startsWith('/login')

          if (isPortalRoute && !isAdminRoute) {
            // Cargar vecino vinculado
            try {
              const { data: vecino } = await supabase
                .from('vecinos')
                .select('*')
                .eq('user_id', session.user.id)
                .maybeSingle()  // maybeSingle() no falla si no encuentra nada

              if (vecino) {
                const sessionData = {
                  ...vecino,
                  auth_mode: 'supabase',
                  user_email: session.user.email,
                }
                saveSession(sessionData)
                setSessionState(sessionData)
              }
            } catch (e) {
              console.warn('[VecinoContext] Error cargando vecino tras signin:', e)
            }
          }
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const value = useMemo(() => ({
    vecinoSession,
    setVecinoSession,
    clearVecinoSession,
    isVecinoLogued: !!vecinoSession?.id,
    authLoading,
  }), [vecinoSession, setVecinoSession, clearVecinoSession, authLoading])

  return <VecinoContext.Provider value={value}>{children}</VecinoContext.Provider>
}

export function useVecino() {
  const ctx = useContext(VecinoContext)
  if (!ctx) throw new Error('useVecino must be used within VecinoProvider')
  return ctx
}
