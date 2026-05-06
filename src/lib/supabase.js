import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Faltan variables de entorno de Supabase. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession:    true,
    autoRefreshToken:  true,
    detectSessionInUrl: true,
    // Deshabilita el Web Locks API que coordina refresh de tokens
    // entre pestañas. Si una pestaña queda colgada, otra "roba" el
    // lock y supabase-js tira NavigatorLockAcquireTimeoutError.
    // Sin lock cada pestaña maneja sus propios tokens en paralelo.
    lock: false,
  },
  global: {
    fetch: (...args) => fetch(...args),
  },
})
