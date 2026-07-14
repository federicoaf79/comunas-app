-- =============================================================
-- turnos_agenda y atenciones — SELECT anon para portal vecino
--
-- El área "Mi cuenta" del portal usa supabaseAnon (no hay auth
-- real, la sesión vive en sessionStorage). Para que las pestañas
-- "Mis turnos" y "Mi salud" puedan listar los datos del vecino,
-- abrimos SELECT a anon solo para filas con vecino_id distinto
-- de null. El filtro por id-del-vecino lo hace el frontend.
--
-- Trade-off de seguridad: cualquiera con la anon key del proyecto
-- puede enumerar turnos/atenciones vinculados a un vecino. Es
-- consistente con el resto de "Mi cuenta" (reclamos), donde la
-- "auth" es solo el match DNI+teléfono. Si en el futuro la
-- privacidad lo requiere, reemplazar por una RPC equivalente con
-- verificación de identidad.
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

-- Policy para turnos_agenda
DROP POLICY IF EXISTS "vecino ve sus turnos" ON public.turnos_agenda;

CREATE POLICY "vecino ve sus turnos"
ON public.turnos_agenda
FOR SELECT
TO anon
USING (vecino_id IS NOT NULL);

-- Policy para atenciones
DROP POLICY IF EXISTS "vecino ve sus atenciones" ON public.atenciones;

CREATE POLICY "vecino ve sus atenciones"
ON public.atenciones
FOR SELECT
TO anon
USING (vecino_id IS NOT NULL);

-- Verificación
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual
FROM pg_policies
WHERE tablename IN ('turnos_agenda', 'atenciones')
  AND policyname IN ('vecino ve sus turnos', 'vecino ve sus atenciones')
ORDER BY tablename, policyname;
