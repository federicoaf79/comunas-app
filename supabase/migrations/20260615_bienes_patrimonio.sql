-- =============================================================
-- 20260615_bienes_patrimonio
--
-- Tablas de patrimonio municipal: bienes inmuebles, muebles
-- de capital, equipamiento y seguros.
--
-- Migración creada para formalizar schema que estaba en DB
-- sin migración (creado "a mano" según comentario en hook).
-- =============================================================

-- Tabla principal de bienes patrimoniales
CREATE TABLE IF NOT EXISTS public.bienes_patrimonio (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  municipio_id uuid REFERENCES public.municipios(id) ON DELETE CASCADE,
  dependencia_id uuid REFERENCES public.dependencias(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK (tipo IN ('inmueble', 'equipamiento', 'vehiculo')),
  numero_inventario text,
  nombre text NOT NULL,
  descripcion text,
  estado text CHECK (estado IN ('bueno', 'regular', 'malo', 'baja')),
  valor_fiscal numeric DEFAULT 0,
  fecha_adquisicion date,
  seguro_compania text,
  seguro_poliza text,
  seguro_vencimiento date,
  ubicacion text,
  observaciones text,
  activo boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bienes_patrimonio_municipio
  ON public.bienes_patrimonio (municipio_id);

CREATE INDEX IF NOT EXISTS idx_bienes_patrimonio_dependencia
  ON public.bienes_patrimonio (dependencia_id);

CREATE INDEX IF NOT EXISTS idx_bienes_patrimonio_tipo
  ON public.bienes_patrimonio (tipo);

-- Tabla de historial de mantenimiento y reparaciones
CREATE TABLE IF NOT EXISTS public.patrimonio_mantenimiento (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  bien_id uuid REFERENCES public.bienes_patrimonio(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  tipo text CHECK (tipo IN ('mantenimiento', 'reparacion', 'inspeccion', 'otro')),
  descripcion text,
  costo numeric DEFAULT 0,
  responsable text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patrimonio_mantenimiento_bien
  ON public.patrimonio_mantenimiento (bien_id);

CREATE INDEX IF NOT EXISTS idx_patrimonio_mantenimiento_fecha
  ON public.patrimonio_mantenimiento (fecha DESC);

-- =============================================================
-- RLS
-- =============================================================

ALTER TABLE public.bienes_patrimonio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patrimonio_mantenimiento ENABLE ROW LEVEL SECURITY;

-- Bienes patrimonio: SELECT para staff del municipio
DROP POLICY IF EXISTS "bienes_patrimonio_select_staff" ON public.bienes_patrimonio;
CREATE POLICY "bienes_patrimonio_select_staff" ON public.bienes_patrimonio
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND (
        municipio_id = bienes_patrimonio.municipio_id
        OR 'superadmin' = ANY(roles)
      )
    )
  );

-- INSERT/UPDATE/DELETE: solo admin_comuna y superadmin
DROP POLICY IF EXISTS "bienes_patrimonio_write_admin" ON public.bienes_patrimonio;
CREATE POLICY "bienes_patrimonio_write_admin" ON public.bienes_patrimonio
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios
      WHERE id = auth.uid()
      AND (
        (municipio_id = bienes_patrimonio.municipio_id AND has_role(id, 'admin_comuna'))
        OR 'superadmin' = ANY(roles)
      )
    )
  );

-- Mantenimiento: SELECT para staff del municipio (via bien_id → bienes_patrimonio → municipio_id)
DROP POLICY IF EXISTS "patrimonio_mant_select_staff" ON public.patrimonio_mantenimiento;
CREATE POLICY "patrimonio_mant_select_staff" ON public.patrimonio_mantenimiento
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bienes_patrimonio b
      JOIN public.usuarios u ON (u.municipio_id = b.municipio_id OR 'superadmin' = ANY(u.roles))
      WHERE b.id = patrimonio_mantenimiento.bien_id
      AND u.id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: solo admin_comuna y superadmin
DROP POLICY IF EXISTS "patrimonio_mant_write_admin" ON public.patrimonio_mantenimiento;
CREATE POLICY "patrimonio_mant_write_admin" ON public.patrimonio_mantenimiento
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bienes_patrimonio b
      JOIN public.usuarios u ON (
        (u.municipio_id = b.municipio_id AND has_role(u.id, 'admin_comuna'))
        OR 'superadmin' = ANY(u.roles)
      )
      WHERE b.id = patrimonio_mantenimiento.bien_id
      AND u.id = auth.uid()
    )
  );
