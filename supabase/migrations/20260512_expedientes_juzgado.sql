-- =============================================================
-- 20260512_expedientes_juzgado
--
-- Sprint 2 — Reestructuración sidebar: nuevo tab "Expedientes"
-- en /admin/juzgado.
--
-- Una sola tabla:
--   expedientes_juzgado → expedientes administrados por el Juez
--                          de Paz (actas, certificados, conciliaciones,
--                          notificaciones, contravenciones, auxilios).
--
-- El archivo está en el repo a modo de REFERENCIA. La instancia
-- de Supabase lo ejecuta a mano (Editor SQL) y verifica que las
-- tablas/policies estén creadas antes de habilitar el módulo.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.expedientes_juzgado (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id        uuid NOT NULL REFERENCES public.municipios(id),
  dependencia_id      uuid NOT NULL REFERENCES public.dependencias(id),
  numero              text NOT NULL,         -- número de expediente (formato libre por juzgado)
  tipo                text NOT NULL,
  -- tipos sugeridos:
  --   acta_matrimonio   | certificado_domicilio  | certificado_convivencia
  --   notificacion      | conciliacion           | contravencion
  --   auxilio_judicial  | otro
  caratula            text NOT NULL,         -- "Pérez, Juan s/ Certificado de Domicilio"
  estado              text NOT NULL DEFAULT 'abierto',
  -- estados: abierto | en_proceso | cerrado | derivado
  prioridad           text DEFAULT 'normal', -- baja | normal | alta | urgente
  vecino_id           uuid REFERENCES public.vecinos(id),
  contraparte         text,                  -- texto libre si no es vecino registrado
  responsable_id      uuid REFERENCES public.usuarios(id),
  fecha_apertura      date NOT NULL DEFAULT current_date,
  fecha_cierre        date,
  proxima_audiencia   timestamptz,
  observaciones       text,
  metadatos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expedientes_juz_dep_idx       ON public.expedientes_juzgado(dependencia_id, fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS expedientes_juz_municipio_idx ON public.expedientes_juzgado(municipio_id, fecha_apertura DESC);
CREATE INDEX IF NOT EXISTS expedientes_juz_estado_idx    ON public.expedientes_juzgado(dependencia_id, estado);
CREATE INDEX IF NOT EXISTS expedientes_juz_vecino_idx    ON public.expedientes_juzgado(vecino_id);
CREATE UNIQUE INDEX IF NOT EXISTS expedientes_juz_numero_uq ON public.expedientes_juzgado(dependencia_id, numero);

-- RLS
ALTER TABLE public.expedientes_juzgado ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expedientes staff lee y escribe" ON public.expedientes_juzgado;
CREATE POLICY "expedientes staff lee y escribe"
ON public.expedientes_juzgado FOR ALL TO authenticated
USING (true) WITH CHECK (true);
