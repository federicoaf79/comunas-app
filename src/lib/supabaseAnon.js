// Re-exporta el cliente principal de Supabase como `supabaseAnon`.
//
// Anteriormente este archivo creaba un segundo `createClient`
// dedicado para flujos públicos del Portal Ciudadano. El problema:
// Supabase v2 usa una instancia singleton de GoTrueClient por
// localStorage key, así que crear dos clientes contra el mismo
// proyecto dispara el warning "Multiple GoTrueClient instances
// detected in the same browser context".
//
// La distinción anon vs autenticado la maneja el cliente principal
// según haya o no sesión activa. Las policies RLS de tipo `to anon`
// aplican cuando el JWT está ausente o cuando se está usando
// directamente la anon key. Con un único cliente alcanza para
// cubrir tanto el flujo público como el autenticado.
export { supabase as supabaseAnon } from './supabase'
