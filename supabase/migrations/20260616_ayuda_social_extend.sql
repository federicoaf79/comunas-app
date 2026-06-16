-- =============================================================
-- 20260616_ayuda_social_extend
--
-- Extensión del módulo de Ayuda Social:
-- - Campos adicionales en beneficiarios (programa, nivel, monto)
-- - Tabla de pagos/entregas
-- =============================================================

-- Agregar campos a beneficiarios
ALTER TABLE public.beneficiarios
  ADD COLUMN IF NOT EXISTS programa text,
  ADD COLUMN IF NOT EXISTS nivel text
    CHECK (nivel IN ('nacional','provincial','municipal')),
  ADD COLUMN IF NOT EXISTS monto_mensual numeric(12,2),
  ADD COLUMN IF NOT EXISTS fecha_fin date,
  ADD COLUMN IF NOT EXISTS observaciones text,
  ADD COLUMN IF NOT EXISTS registrado_por uuid REFERENCES public.usuarios(id);

-- Tabla de pagos/entregas a beneficiarios
CREATE TABLE IF NOT EXISTS public.ayuda_social_pagos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  municipio_id uuid REFERENCES public.municipios(id) ON DELETE CASCADE,
  beneficiario_id uuid REFERENCES public.beneficiarios(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  concepto text NOT NULL,
  monto numeric(12,2) NOT NULL,
  nivel text CHECK (nivel IN ('nacional','provincial','municipal')),
  programa text,
  comprobante_url text,
  registrado_por uuid REFERENCES public.usuarios(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ayuda_social_pagos_municipio
  ON public.ayuda_social_pagos (municipio_id);

CREATE INDEX IF NOT EXISTS idx_ayuda_social_pagos_beneficiario
  ON public.ayuda_social_pagos (beneficiario_id);

CREATE INDEX IF NOT EXISTS idx_ayuda_social_pagos_fecha
  ON public.ayuda_social_pagos (fecha DESC);

-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE public.ayuda_social_pagos ENABLE ROW LEVEL SECURITY;

-- SELECT/INSERT/UPDATE/DELETE: staff del municipio + superadmin
DROP POLICY IF EXISTS "pagos_municipio" ON public.ayuda_social_pagos;
CREATE POLICY "pagos_municipio" ON public.ayuda_social_pagos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND (
        municipio_id = ayuda_social_pagos.municipio_id
        OR 'superadmin' = ANY(roles)
      )
    )
  );
