import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error(
    'Faltan variables de entorno de Supabase. Definí VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.'
  )
}

// Cliente Supabase para flujos PÚBLICOS (Portal Ciudadano).
//
// Diferencias con el cliente principal:
// - persistSession=false / autoRefreshToken=false: no guarda ni
//   renueva token de auth. Cada request usa la anon key.
// - detectSessionInUrl=false: ignora callbacks de OAuth.
// - lock=false: no toma el navigator lock que coordina refresh
//   entre pestañas (no aplica con persistSession off).
//
// Uso: portal público que debe comportarse igual para visitantes
// anónimos y para usuarios logueados que pasan por la página pública.
// Si usáramos el cliente principal, un usuario logueado mandaría su
// JWT y la query se evaluaría bajo SU contexto de RLS (puede traer
// borradores u otras sorpresas según las policies).
export const supabaseAnon = createClient(url, key, {
  auth: {
    persistSession:    false,
    autoRefreshToken:  false,
    detectSessionInUrl: false,
    lock: false,
  },
  global: {
    fetch: (...args) => fetch(...args),
  },
})
