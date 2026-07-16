-- ====================================================================
-- Migración: Sistema de Entregas de Ayuda Social (Bolsines + otros)
-- Fecha: 2026-07-16
-- ====================================================================
-- Diseño GENÉRICO para soportar entregas de productos/servicios
-- variados: bolsones alimentarios, gasoil, otros insumos, etc.
-- ====================================================================

-- 1. Crear tabla ayuda_social_entregas
CREATE TABLE IF NOT EXISTS public.ayuda_social_entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id UUID NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  vecino_id UUID NOT NULL REFERENCES public.vecinos(id) ON DELETE CASCADE,
  programa TEXT NOT NULL, -- Ej: "Bolsón Alimentario", "Gasoil", "Plan Alimentar"
  variante TEXT,          -- Ej: "Grande", "Mediano", "Chico" (opcional)
  cantidad NUMERIC(10,2), -- Cantidad entregada (opcional, ej: 1, 2.5)
  unidad TEXT,            -- Unidad de medida (ej: "integrantes", "litros", "kg")
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,             -- Observaciones adicionales
  registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índices para optimizar queries
CREATE INDEX IF NOT EXISTS idx_ayuda_social_entregas_municipio ON public.ayuda_social_entregas(municipio_id);
CREATE INDEX IF NOT EXISTS idx_ayuda_social_entregas_vecino ON public.ayuda_social_entregas(vecino_id);
CREATE INDEX IF NOT EXISTS idx_ayuda_social_entregas_fecha ON public.ayuda_social_entregas(municipio_id, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ayuda_social_entregas_programa ON public.ayuda_social_entregas(municipio_id, programa, fecha DESC);

-- 3. Trigger updated_at
CREATE TRIGGER trg_ayuda_social_entregas_updated_at
  BEFORE UPDATE ON public.ayuda_social_entregas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS policies
ALTER TABLE public.ayuda_social_entregas ENABLE ROW LEVEL SECURITY;

-- Staff puede ver/editar entregas de su municipio
CREATE POLICY "ayuda_social_entregas_staff"
ON public.ayuda_social_entregas
FOR ALL
TO authenticated
USING (
  public.is_superadmin()
  OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
)
WITH CHECK (
  public.is_superadmin()
  OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
);

-- 5. Configuración: período anti-duplicado (default 30 días)
-- Insertar en configuracion_portal con clave 'ayuda_social_config'
INSERT INTO public.configuracion_portal (municipio_id, clave, valor, tipo, descripcion)
SELECT
  m.id,
  'ayuda_social_config',
  '{"periodo_antiduplicado_dias": 30}',
  'json',
  'Configuración de Ayuda Social: período anti-duplicado de entregas por vecino+programa'
FROM public.municipios m
WHERE NOT EXISTS (
  SELECT 1 FROM public.configuracion_portal
  WHERE municipio_id = m.id AND clave = 'ayuda_social_config'
);

-- 6. Comentarios para documentación
COMMENT ON TABLE public.ayuda_social_entregas IS 'Registro de entregas de programas de Ayuda Social (bolsones, gasoil, insumos, etc). Diseño genérico para múltiples tipos de distribución.';
COMMENT ON COLUMN public.ayuda_social_entregas.programa IS 'Nombre del programa de ayuda (ej: "Bolsón Alimentario", "Gasoil", "Plan Alimentar")';
COMMENT ON COLUMN public.ayuda_social_entregas.variante IS 'Variante del producto/servicio (ej: "Grande", "Mediano", "Chico") - opcional';
COMMENT ON COLUMN public.ayuda_social_entregas.cantidad IS 'Cantidad entregada (opcional) - ej: número de integrantes, litros, kg';
COMMENT ON COLUMN public.ayuda_social_entregas.unidad IS 'Unidad de medida de la cantidad (ej: "integrantes", "litros", "kg") - opcional';

-- 7. Seed de ejemplo para Real Sayana (solo si existe el municipio)
DO $$
DECLARE
  v_municipio_id UUID := '654d0e86-255d-4498-b5c9-80d91793d318'; -- Real Sayana
  v_vecino_id UUID;
  v_user_id UUID;
BEGIN
  -- Buscar un vecino de ejemplo
  SELECT id INTO v_vecino_id FROM public.vecinos WHERE municipio_id = v_municipio_id LIMIT 1;
  -- Buscar el primer usuario staff del municipio para registrado_por
  SELECT id INTO v_user_id FROM public.usuarios WHERE municipio_id = v_municipio_id LIMIT 1;

  IF v_vecino_id IS NOT NULL AND v_user_id IS NOT NULL THEN
    -- Insertar 2 entregas de ejemplo
    INSERT INTO public.ayuda_social_entregas (municipio_id, vecino_id, programa, variante, cantidad, unidad, fecha, registrado_por, notas)
    VALUES
      (v_municipio_id, v_vecino_id, 'Bolsón Alimentario', 'Grande', 4, 'integrantes', CURRENT_DATE - INTERVAL '15 days', v_user_id, 'Entrega mensual'),
      (v_municipio_id, v_vecino_id, 'Bolsón Alimentario', 'Mediano', 2, 'integrantes', CURRENT_DATE - INTERVAL '5 days', v_user_id, 'Entrega extra por situación especial')
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Entregas de ejemplo creadas para Real Sayana';
  ELSE
    RAISE NOTICE 'No se encontró vecino o usuario en Real Sayana — seed omitido';
  END IF;
END $$;
