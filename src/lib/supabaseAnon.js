// Re-exporta `supabasePublic` bajo el nombre histórico `supabaseAnon`.
//
// Históricamente este archivo creó su propio `createClient`, pero
// el warning "Multiple GoTrueClient instances detected" nos hizo
// re-apuntar al cliente principal. El problema fue que el cliente
// principal mantiene un lock interno ('Lock:comunas-auth') que
// peleaba con las queries paralelas del portal:
//   "Lock:comunas-auth was released because another request stole it"
// — por eso supabase.js ahora exporta `supabasePublic`, un cliente
// SIN persistencia ni auth lock (persistSession/autoRefreshToken/
// detectSessionInUrl en false). Al no compartir storageKey con el
// cliente principal tampoco re-dispara el warning de multiple
// GoTrueClient instances.
//
// Esta indirección mantiene los imports antiguos funcionando
// (hooks/useAutoridades, useDependenciaPublica, useVecinoData,
// pages/portal/NoticiaDetalle, etc.) — todos se enchufan
// transparentemente al cliente público sin tocar el código.
//
// Imports nuevos en archivos del portal: preferir
// `import { supabasePublic } from '../lib/supabase'` para que el
// uso del cliente sin auth quede explícito en el call site.
export { supabasePublic as supabaseAnon } from './supabase'
