import { useState } from 'react'
import { supabase } from '../lib/supabase'

export function useOrdenMedicaUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState(null)

  async function uploadOrden(file, turnoId, vecinoId) {
    setUploading(true)
    setUploadError(null)

    try {
      // Generar nombre único para el archivo
      const timestamp = Date.now()
      const ext = file.name.split('.').pop()
      const fileName = `orden-${vecinoId}-${timestamp}.${ext}`
      const filePath = `ordenes/${fileName}`

      // Subir a Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('documentos-hc')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documentos-hc')
        .getPublicUrl(filePath)

      // Crear registro en ordenes_derivacion — validada_por queda en su
      // default/null hasta que el staff la valide de verdad en
      // validarOrden() (CicSalud.jsx). No completar acá: quien sube el
      // archivo es el vecino, no quien la valida.
      const { error: insertError } = await supabase
        .from('ordenes_derivacion')
        .insert({
          turno_id: turnoId,
          vecino_id: vecinoId,
          origen: 'fisica',
          archivo_url: publicUrl,
          archivo_nombre: file.name,
          estado: 'pendiente',
        })

      if (insertError) throw insertError

      setUploading(false)
      return { success: true, url: publicUrl }
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
