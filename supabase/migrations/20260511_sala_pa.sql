-- =============================================================
-- 20260511_sala_pa
--
-- Sprint 2 — Bloque 2: Sala PA con asiento de atención clínica
-- e insumos utilizados por consulta.
--
-- DOS tablas nuevas:
--   atenciones        → un registro por consulta médica (anamnesis,
--                       examen físico, diagnóstico, tratamiento,
--                       indicaciones, próxima consulta, estado).
--   atencion_insumos  → ítems del inventario consumidos en cada
--                       atención. Al cerrar la atención, el módulo
--                       descuenta automáticamente del stock vía
--                       movimientos_inventario.
--
-- El archivo está en el repo a modo de REFERENCIA. La instancia
-- de Supabase lo ejecuta a mano (Editor SQL) y verifica que las
-- tablas/policies estén creadas antes de habilitar el módulo.
-- =============================================================

-- Asiento de atención clínica
CREATE TABLE IF NOT EXISTS public.atenciones (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id    uuid NOT NULL REFERENCES public.municipios(id),
  turno_id        uuid REFERENCES public.turnos(id),
  vecino_id       uuid NOT NULL REFERENCES public.vecinos(id),
  profesional_id  uuid REFERENCES public.usuarios(id),
  fecha_hora      timestamptz NOT NULL DEFAULT now(),
  motivo          text,
  anamnesis       text,          -- síntomas referidos por el paciente
  examen_fisico   text,          -- hallazgos del examen
  diagnostico     text,
  tratamiento     text,
  indicaciones    text,          -- instrucciones al paciente
  proxima_consulta date,
  estado          text DEFAULT 'borrador',
  -- estados: borrador | cerrada | derivada
  derivacion_destino text,       -- requerido si estado = derivada
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atenciones_vecino_idx    ON public.atenciones(vecino_id, fecha_hora DESC);
CREATE INDEX IF NOT EXISTS atenciones_turno_idx     ON public.atenciones(turno_id);
CREATE INDEX IF NOT EXISTS atenciones_municipio_idx ON public.atenciones(municipio_id, fecha_hora DESC);

-- Insumos utilizados en cada atención
CREATE TABLE IF NOT EXISTS public.atencion_insumos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atencion_id   uuid NOT NULL REFERENCES public.atenciones(id) ON DELETE CASCADE,
  inventario_id uuid NOT NULL REFERENCES public.inventario(id),
  cantidad      numeric(10,2) NOT NULL CHECK (cantidad > 0),
  unidad        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS atencion_insumos_atencion_idx ON public.atencion_insumos(atencion_id);

-- RLS
ALTER TABLE public.atenciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.atencion_insumos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "atenciones staff lee y escribe" ON public.atenciones;
CREATE POLICY "atenciones staff lee y escribe"
ON public.atenciones FOR ALL TO authenticated
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "atencion_insumos staff lee y escribe" ON public.atencion_insumos;
CREATE POLICY "atencion_insumos staff lee y escribe"
ON public.atencion_insumos FOR ALL TO authenticated
USING (true) WITH CHECK (true);
