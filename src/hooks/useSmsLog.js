import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useEffectiveMunicipioId } from './useEffectiveMunicipioId'

// =============================================================
// useSmsLog — historial real de envíos SMS/WhatsApp. Lo consumen
// Mensajeria.jsx (historial global del municipio) y VecinoMensajes.jsx
// (historial de UN vecino puntual, vía el parámetro vecinoId) — mismo
// hook para los dos, no un segundo hook paralelo.
//
// Schema real de `sms_log` (verificado en prod, tabla vacía): id,
// municipio_id (NOT NULL), vecino_id, telefono (NOT NULL), canal
// (NOT NULL), direccion (NOT NULL), mensaje, tipo, provider_id,
// estado, created_at.
//
// Solo lectura acá — el INSERT sigue siendo exclusivo de las Vercel
// Functions con service_role (no hay envío real desde el cliente
// todavía, ver EnvioMasivo() en Mensajeria.jsx). Gateado por la
// policy sms_log_staff_select: staff ve los de su municipio,
// superadmin todos.
// =============================================================

const COLS = `
  id, municipio_id, vecino_id, telefono, canal, direccion, mensaje,
  tipo, provider_id, estado, created_at,
  vecino:vecino_id ( apellido, nombre, nombre_completo )
`

// La tabla arranca vacía y crece con el volumen real de envíos de un
// municipio, no con un padrón completo — 200 alcanza de sobra para un
// historial reciente sin paginar. Para un vecino puntual (vecinoId)
// 200 es más que de sobra.
const LIMIT = 200

async function fetchSmsLog(municipioId, { vecinoId } = {}) {
  let q = supabase
    .from('sms_log')
    .select(COLS)
    .order('created_at', { ascending: false })
    .limit(LIMIT)
  if (municipioId != null) q = q.eq('municipio_id', municipioId)
  if (vecinoId)             q = q.eq('vecino_id', vecinoId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export function useSmsLog({ vecinoId } = {}) {
  const { perfil } = useAuth()
  const { municipioId } = useEffectiveMunicipioId()
  return useQuery({
    queryKey: ['sms-log', municipioId ?? '__ALL__', vecinoId ?? '__ALL__'],
    queryFn:  () => fetchSmsLog(municipioId, { vecinoId }),
    enabled:  !!perfil,
    staleTime: 30 * 1000,
  })
}

// sms_log real → shape que espera <MensajeItem> (direction/fecha/vecino
// embebido). Exportado acá (no en cada página) porque es el mismo
// mapeo para Mensajeria.jsx y VecinoMensajes.jsx — el contrato de
// MensajeItem es compartido, esta es la única función que lo arma.
export function toMensajeItemProps(row) {
  return {
    id:        row.id,
    vecino_id: row.vecino_id,
    vecino:    row.vecino,
    telefono:  row.telefono,
    canal:     row.canal,
    direction: row.direccion,
    mensaje:   row.mensaje,
    estado:    row.estado,
    fecha:     row.created_at,
  }
}
