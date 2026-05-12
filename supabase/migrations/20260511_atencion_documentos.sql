-- =============================================================
-- 20260511_atencion_documentos
--
-- Suma `atencion_id` a hc_documentos para que cada archivo
-- adjunto (receta, estudio, derivación, etc.) quede vinculado
-- a la atención clínica en la que se cargó.
--
-- La tabla original (migration 20250505000001) ya trae:
--   id, municipio_id, vecino_id, consulta_id, tipo, descripcion,
--   storage_path, mime_type, uploaded_by, created_at
--
-- `consulta_id` (FK a hc_consultas) y `atencion_id` (FK a la
-- nueva atenciones) coexisten — el consulta_id queda para los
-- documentos legacy; los nuevos del flujo de Sala PA usan
-- atencion_id.
-- =============================================================

ALTER TABLE public.hc_documentos
  ADD COLUMN IF NOT EXISTS atencion_id uuid
    REFERENCES public.atenciones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_hc_docs_atencion
  ON public.hc_documentos(atencion_id);

-- Bucket de Storage 'documentos-hc' debe existir y tener policy
-- de upload para authenticated. Si todavía no está, crearlo desde
-- el dashboard de Supabase (Storage → New bucket → public OFF).
