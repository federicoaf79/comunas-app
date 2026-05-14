import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local'
  )
}

// =============================================================
// Cliente principal — con auth/persistencia. Lo usan AuthContext,
// las páginas /admin y todos los hooks que escriben con sesión.
// =============================================================
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
    // Storage key namespaceado al proyecto. Evita colisiones si el
    // mismo origen alguna vez monta otro cliente Supabase.
    storageKey: 'comunas-auth',
    // Deshabilita el Web Locks API que coordina refresh de tokens
    // entre pestañas. Si una pestaña queda colgada, otra "roba" el
    // lock y supabase-js tira NavigatorLockAcquireTimeoutError
    // ("Lock was not released within 5000ms"). Sin lock cada pestaña
    // maneja sus propios tokens en paralelo — aceptable para esta
    // app, donde los usuarios típicamente trabajan en una sola tab.
    lock: false,
  },
  global: {
    fetch: (...args) => fetch(...args),
  },
})

// =============================================================
// Cliente público — sin auth/persistencia. Lo usa el Portal
// Ciudadano (lecturas anon) y cualquier otro flujo no autenticado.
//
// Por qué un segundo cliente:
// El cliente principal arriba persiste sesión bajo storageKey
// 'comunas-auth' y, aún con `lock: false`, Supabase JS de v2
// chequea sesión en cada query — al montarse el portal y disparar
// 7+ queries anon en paralelo el lock interno se peleaba:
//   "Lock:comunas-auth was released because another request stole it"
// y queries fallaban intermitentemente.
//
// `supabasePublic` resuelve el problema por construcción:
//   - persistSession: false  → no toca localStorage, no levanta lock.
//   - autoRefreshToken: false → sin timer de refresh.
//   - detectSessionInUrl: false → no parsea URL al boot.
// La instancia interna de GoTrueClient queda inerte; las queries
// pasan directo al REST con la anon key. Como no comparte la
// storageKey con el cliente principal, tampoco dispara el warning
// "Multiple GoTrueClient instances detected".
//
// REGLA: solo el admin panel + AuthContext usan `supabase`. El
// resto del portal público usa `supabasePublic` (directo o vía el
// alias `supabaseAnon` en supabaseAnon.js, que re-exporta este
// cliente para no romper imports históricos).
// =============================================================
export const supabasePublic = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:    false,
    autoRefreshToken:  false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { 'x-client-info': 'comunas-portal-public' },
    fetch: (...args) => fetch(...args),
  },
})
