-- =============================================================
-- 20260519_dominios_municipio
--
-- Tabla de dominios/subdominios vinculados a municipios para
-- arquitectura multi-tenant por hostname.
--
-- Cada municipio puede tener N dominios (subdominio comunas.lat,
-- dominio propio, alias). La app usa window.location.hostname
-- para determinar qué municipio mostrar.
--
-- Tipos:
--   - subdominio:     realsayana.comunas.lat (gestionado por COMUNAS)
--   - dominio_propio: app.realsayana.gob.ar (CNAME del municipio)
--   - alias:          demo.comunas.lat (alternativa al subdominio oficial)
--
-- Flujo:
--   1. SuperAdmin crea fila con tipo='subdominio' o 'alias' → activo=true
--   2. SuperAdmin crea fila con tipo='dominio_propio' → activo=false, verificado=false
--   3. Municipio configura CNAME en su DNS apuntando a comunas.lat
--   4. SuperAdmin verifica propagación y actualiza verificado=true, activo=true
-- =============================================================

CREATE TABLE IF NOT EXISTS public.dominios_municipio (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  municipio_id uuid REFERENCES public.municipios(id) ON DELETE CASCADE,
  dominio text NOT NULL UNIQUE,
  tipo text NOT NULL DEFAULT 'subdominio'
    CHECK (tipo IN ('subdominio','dominio_propio','alias')),
  activo boolean NOT NULL DEFAULT true,
  verificado boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dominio_municipio_check
    CHECK (
      -- admin.comunas.lat puede tener municipio_id NULL
      -- (es el panel de superadmin, no pertenece a ningún municipio)
      (dominio = 'admin.comunas.lat' AND municipio_id IS NULL)
      OR
      -- el resto de dominios DEBE tener municipio_id
      (dominio != 'admin.comunas.lat' AND municipio_id IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_dominios_municipio_dominio
  ON public.dominios_municipio(dominio);

CREATE INDEX IF NOT EXISTS idx_dominios_municipio_municipio
  ON public.dominios_municipio(municipio_id);

-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE public.dominios_municipio ENABLE ROW LEVEL SECURITY;

-- Superadmin: gestión completa de dominios
DROP POLICY IF EXISTS "dominios_superadmin" ON public.dominios_municipio;
CREATE POLICY "dominios_superadmin" ON public.dominios_municipio
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND 'superadmin' = ANY(roles)
    )
  );

-- Lectura pública (anon + authenticated) para dominios activos.
-- Esto permite que el portal público resuelva hostname → municipio_id
-- sin requerir auth.
DROP POLICY IF EXISTS "dominios_public_read" ON public.dominios_municipio;
CREATE POLICY "dominios_public_read" ON public.dominios_municipio
  FOR SELECT TO anon, authenticated
  USING (activo = true);

-- =============================================================
-- Seed: dominios del municipio piloto Real Sayana
--
-- IMPORTANTE: admin.comunas.lat NO tiene municipio_id (es el
-- panel de superadmin, no pertenece a ningún municipio).
-- Se inserta solo para registrarlo en la tabla, pero NO se usa
-- para resolución de tenant (AdminDomainGuard lo filtra antes).
-- =============================================================

INSERT INTO public.dominios_municipio
  (municipio_id, dominio, tipo, activo, verificado)
VALUES
  (
    (SELECT id FROM municipios WHERE slug = 'real-sayana'),
    'realsayana.comunas.lat',
    'subdominio',
    true,
    true
  ),
  (
    (SELECT id FROM municipios WHERE slug = 'real-sayana'),
    'demo.comunas.lat',
    'alias',
    true,
    true
  ),
  (
    NULL, -- admin.comunas.lat NO pertenece a ningún municipio
    'admin.comunas.lat',
    'alias',
    true,
    true
  )
ON CONFLICT (dominio) DO NOTHING;
