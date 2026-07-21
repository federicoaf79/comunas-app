import { useState } from 'react'
import { supabasePublic } from '../lib/supabase'

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
      const { error: uploadError } = await supabasePublic.storage
        .from('documentos-hc')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) throw uploadError

      // Obtener URL pública
      const { data: { publicUrl } } = supabasePublic.storage
        .from('documentos-hc')
        .getPublicUrl(filePath)

      // Obtener usuario autenticado para validada_por
      const { data: { user } } = await supabasePublic.auth.getUser()

      // Crear registro en ordenes_derivacion
      const { error: insertError } = await supabasePublic
        .from('ordenes_derivacion')
        .insert({
          turno_id: turnoId,
          vecino_id: vecinoId,
          origen: 'fisica',
          archivo_url: publicUrl,
          archivo_nombre: file.name,
          estado: 'pendiente',
          validada_por: user?.id || null,
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
