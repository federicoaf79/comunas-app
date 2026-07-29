import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function useOrdenMedicaUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  async function uploadOrden(file, turnoId, vecinoId, municipioId) {
    setUploading(true)
    setUploadError(null)

    try {
      // Path scopeado municipioId/vecinoId — las policies de storage
      // de documentos-hc leen la carpeta 1 como municipio y la carpeta
      // 2 como vecino. Con `ordenes/<archivo>` plano no matchean nada
      // y el archivo queda ilegible para todos, staff y vecino.
      const filePath = `${municipioId}/${vecinoId}/ordenes/${Date.now()}_${file.name}`

      // Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documentos-hc')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // documentos-hc es privado — no hay URL pública. Se guarda el
      // path; la URL firmada se genera al mostrar el archivo (ver
      // "Ver orden" en CicSalud.jsx y DerivacionCard.jsx).
      //
      // Crear registro en ordenes_derivacion — validada_por queda en su
      // default/null hasta que el staff la valide de verdad en
      // validarOrden() (CicSalud.jsx). No completar acá: quien sube el
      // archivo es el vecino, no quien la valida.
      const { error: insertError } = await supabase
        .from('ordenes_derivacion')
        .insert({
          turno_id: turnoId,
          vecino_id: vecinoId,
          municipio_id: municipioId,
          origen: 'fisica',
          archivo_url: filePath,
          archivo_nombre: file.name,
          estado: 'pendiente',
        })

      if (insertError) throw insertError

      setUploading(false)
      return { success: true, path: filePath }
    } catch (error) {
      console.error('[useOrdenMedicaUpload] Error:', error)
      setUploadError(error.message || 'Error al subir orden médica')
      setUploading(false)
      return { success: false, error: error.message }
    }
  }

  return {
    uploadOrden,
    uploading,
    uploadError,
  }
}
