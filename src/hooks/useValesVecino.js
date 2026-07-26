import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// =============================================================
// useValesVecino — Vales Electrónicos, Fase 2 (portal del vecino).
//
// current_vecino_id() (usado por la policy vales_vecino_select_propios
// y por las RPCs abrir_vale/canjear_vale) depende de auth.uid() -- por
// eso este hook usa siempre el cliente `supabase` autenticado, nunca
// supabaseAnon (a diferencia de useReclamosVecino, que sí acepta anon
// porque esa policy es más laxa a propósito). MisVales.jsx vive bajo
// VecinoGuard (cuenta completa, sesión Supabase Auth real).
//
// UPDATE/DELETE sobre `vales` están revocados a authenticated/anon --
// todo cambio de estado va por RPC. Este archivo nunca hace
// supabase.from('vales').update(...).
// =============================================================

const VALE_VECINO_COLS = `
  id, descripcion, monto, cantidad, unidad, codigo, estado,
  vigencia_horas, emitido_en, abierto_en, vence_apertura_en, canjeado_en,
  proveedor:proveedor_id(id, nombre, categoria)
`

async function fetchValesVecino(vecinoId) {
  if (!vecinoId) return []
  const { data, error } = await supabase
    .from('vales')
    .select(VALE_VECINO_COLS)
    .eq('vecino_id', vecinoId)
    .order('emitido_en', { ascending: false })
  if (error) throw error
  return data ?? []
}

export function useValesVecino(vecinoId, ready = true) {
  return useQuery({
    queryKey: ['vecino', 'vales', vecinoId ?? '__none__'],
    queryFn:  () => fetchValesVecino(vecinoId),
    enabled:  !!vecinoId && ready,
  })
}

// abrir_vale es idempotente (ver comentario en la migración): si el
// vale ya está 'abierto' y sigue dentro de la ventana de 30 min,
// devuelve la misma fila sin reiniciar el reloj -- por eso la UI
// puede volver a llamarla sin miedo al cerrar y reabrir el modal.
async function abrirVale(codigo) {
  const { data, error } = await supabase.rpc('abrir_vale', { p_codigo: codigo })
  if (error) throw error
  return data
}

export function useAbrirVale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: abrirVale,
    // Invalida por prefijo -- refresca la lista del vecino sin
    // necesitar su id acá (React Query matchea por prefijo de key).
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vecino', 'vales'] }),
  })
}
