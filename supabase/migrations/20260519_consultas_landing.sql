-- =============================================================
-- 20260519_consultas_landing
--
-- Tabla para almacenar consultas del formulario de contacto
-- de la landing page de ventas (comunas.lat).
--
-- RLS:
--   - INSERT: anon + authenticated (formulario público)
--   - SELECT: solo superadmin (para ver leads)
-- =============================================================

CREATE TABLE IF NOT EXISTS public.consultas_landing (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  municipio text NOT NULL,
  provincia text NOT NULL,
  email text NOT NULL,
  telefono text NOT NULL,
  mensaje text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consultas_landing_created
  ON public.consultas_landing (created_at DESC);

-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE public.consultas_landing ENABLE ROW LEVEL SECURITY;

-- Permitir INSERT anónimo (formulario público de la landing)
DROP POLICY IF EXISTS "consultas_insert_anon" ON public.consultas_landing;
CREATE POLICY "consultas_insert_anon" ON public.consultas_landing
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Solo superadmin puede leer las consultas (leads)
DROP POLICY IF EXISTS "consultas_select_super" ON public.consultas_landing;
CREATE POLICY "consultas_select_super" ON public.consultas_landing
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND 'superadmin' = ANY(roles)
    )
  );
