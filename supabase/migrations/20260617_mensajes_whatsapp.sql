CREATE TABLE IF NOT EXISTS public.mensajes_whatsapp (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  municipio_id uuid REFERENCES municipios(id),
  from_numero text NOT NULL,
  mensaje text,
  intent text,
  org_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.mensajes_whatsapp
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mensajes_wa_staff"
  ON public.mensajes_whatsapp;
CREATE POLICY "mensajes_wa_staff"
  ON public.mensajes_whatsapp
  FOR ALL USING (
    municipio_id = current_usuario_municipio()
    OR is_superadmin()
  );
