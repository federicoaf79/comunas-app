-- ====================================================================
-- Migración: Sistema de Reservas del Polideportivo Municipal
-- Fecha: 2026-07-14
-- ====================================================================

-- 1. Crear tabla espacios_deportivos
CREATE TABLE IF NOT EXISTS espacios_deportivos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id UUID NOT NULL REFERENCES municipios(id) ON DELETE CASCADE,
  dependencia_id UUID REFERENCES dependencias(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'cancha_futsal', 'cancha_basquet', 'cancha_voley', 'gimnasio', 'multiuso'
  capacidad_max INTEGER DEFAULT 1,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agregar columna espacio_id a turnos_agenda
ALTER TABLE turnos_agenda ADD COLUMN IF NOT EXISTS espacio_id UUID REFERENCES espacios_deportivos(id) ON DELETE SET NULL;

-- 3. Agregar índice para optimizar queries de disponibilidad
CREATE INDEX IF NOT EXISTS idx_turnos_agenda_espacio_fecha ON turnos_agenda(espacio_id, fecha) WHERE estado IN ('pendiente', 'confirmado');

-- 4. Seed: Crear espacio inicial (cancha multiuso del Polideportivo)
-- Primero buscar la dependencia polideportivo del municipio Real Sayana
DO $$
DECLARE
  v_municipio_id UUID := '654d0e86-255d-4498-b5c9-80d91793d318'; -- Real Sayana
  v_dep_id UUID;
BEGIN
  -- Buscar dependencia tipo 'polideportivo' o 'deporte'
  SELECT id INTO v_dep_id
  FROM dependencias
  WHERE municipio_id = v_municipio_id
    AND (tipo = 'polideportivo' OR tipo = 'deporte')
    AND activa = true
  LIMIT 1;

  IF v_dep_id IS NOT NULL THEN
    -- Crear espacio inicial
    INSERT INTO espacios_deportivos (municipio_id, dependencia_id, nombre, tipo, capacidad_max, activo)
    VALUES (v_municipio_id, v_dep_id, 'Cancha Multiuso Principal', 'multiuso', 1, true)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'Espacio deportivo creado para dependencia %', v_dep_id;
  ELSE
    RAISE WARNING 'No se encontró dependencia de Polideportivo en Real Sayana. Crear manualmente.';
  END IF;
END $$;

-- 5. Configuración de horario del Polideportivo
-- Insertar config de apertura/cierre (formato JSON: {"apertura": "08:00", "cierre": "22:00"})
INSERT INTO configuracion_portal (municipio_id, clave, valor, tipo)
VALUES (
  '654d0e86-255d-4498-b5c9-80d91793d318',
  'polideportivo_horario',
  '{"apertura": "08:00", "cierre": "22:00"}',
  'json'
)
ON CONFLICT (municipio_id, clave) DO UPDATE SET valor = EXCLUDED.valor;

-- 6. RLS policies para espacios_deportivos
ALTER TABLE espacios_deportivos ENABLE ROW LEVEL SECURITY;

-- Política: admins pueden ver todos los espacios de su municipio
CREATE POLICY "espacios_admin_select" ON espacios_deportivos
  FOR SELECT
  USING (
    municipio_id IN (
      SELECT m.id FROM municipios m
      INNER JOIN usuarios u ON u.municipio_id = m.id
      WHERE u.id = auth.uid()
    )
  );

-- Política: admins pueden crear/modificar espacios
CREATE POLICY "espacios_admin_all" ON espacios_deportivos
  FOR ALL
  USING (
    municipio_id IN (
      SELECT m.id FROM municipios m
      INNER JOIN usuarios u ON u.municipio_id = m.id
      WHERE u.id = auth.uid() AND u.rol IN ('superadmin', 'admin_comuna')
    )
  );

-- Política pública: vecinos pueden ver espacios activos (para mostrar disponibilidad)
CREATE POLICY "espacios_public_select" ON espacios_deportivos
  FOR SELECT
  USING (activo = true);

-- 7. Comentarios para documentación
COMMENT ON TABLE espacios_deportivos IS 'Espacios deportivos del Polideportivo (canchas, gimnasio, etc). Preparado para escalar a múltiples espacios.';
COMMENT ON COLUMN turnos_agenda.espacio_id IS 'Espacio deportivo reservado (null para turnos médicos/legales que no usan espacios).';
COMMENT ON COLUMN configuracion_portal.valor IS 'Para polideportivo_horario: JSON con keys "apertura" y "cierre" en formato HH:MM';
