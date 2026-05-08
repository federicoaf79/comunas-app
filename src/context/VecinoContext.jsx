/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// =============================================================
// VecinoContext — "sesión" del Portal del Vecino
//
// IMPORTANTE: esto NO es auth real. Es una sesión client-side
// basada en el match DNI + teléfono contra la tabla `vecinos`.
// La verificación efectiva la hacen las RLS de Supabase (anon
// SELECT/INSERT en vecinos/turnos/dependencias) + la RPC
// `consultas_publicas_por_vecino` para HC. Cualquiera con
// la anon key podría consultar turnos por vecino_id.
//
// La sesión vive en sessionStorage (no localStorage): si el
// vecino cierra la pestaña, se borra. Es un compromiso entre
// comodidad y exposición — un dispositivo compartido no deja
// la sesión persistida en disco.
// =============================================================

const STORAGE_KEY = 'comunas_vecino_session'

const VecinoContext = createContext(null)

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    // Validación mínima — la sesión debe tener al menos id y dni
    // para servir como filtro en las queries.
    if (!obj?.id || !obj?.dni) return null
    return obj
  } catch {
    return null
  }
}

function saveSession(vecino) {
  try {
    if (vecino) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(vecino))
    else        sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* sessionStorage llena o no disponible — no-op */ }
}

export function VecinoProvider({ children }) {
  const [vecinoSession, setSessionState] = useState(() => loadSession())

  const setVecinoSession = useCallback((vecino) => {
    saveSession(vecino)
    setSessionState(vecino)
  }, [])

  const clearVecinoSession = useCallback(() => {
    saveSession(null)
    setSessionState(null)
  }, [])

  // Sincronización entre pestañas — si en otra tab se cierra la
  // sesión, esta también la pierde. Sólo aplica a localStorage en
  // realidad; sessionStorage es per-tab por diseño, pero dejamos
  // el listener por consistencia futura.
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return
      setSessionState(e.newValue ? loadSession() : null)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo(() => ({
    vecinoSession,
    setVecinoSession,
    clearVecinoSession,
    isVecinoLogued: !!vecinoSession?.id,
  }), [vecinoSession, setVecinoSession, clearVecinoSession])

  return <VecinoContext.Provider value={value}>{children}</VecinoContext.Provider>
}

export function useVecino() {
  const ctx = useContext(VecinoContext)
  if (!ctx) throw new Error('useVecino must be used within VecinoProvider')
  return ctx
}
