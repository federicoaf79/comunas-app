-- =============================================================
-- FIX CRÍTICO: RLS policies seguras para turnos_agenda, atenciones y reclamos
--
-- REVIERTE el approach inseguro de policies 'anon' con USING (vecino_id IS NOT NULL)
-- que exponía datos de TODOS los vecinos a cualquiera con la anon key.
--
-- SOLUCIÓN CORRECTA:
-- - Policies SELECT para rol 'authenticated' usando current_vecino_id()
-- - El vecino solo ve SUS PROPIOS datos (via auth.uid() → vecinos.user_id)
-- - El acceso rápido (sin sesión) NO accede a estas tablas — esas vistas
--   usan RPCs específicas o queries sin auth que no tocan datos sensibles
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. REVERTIR policies inseguras si existen
-- ─────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "vecino ve sus turnos" ON public.turnos_agenda;
DROP POLICY IF EXISTS "vecino ve sus atenciones" ON public.atenciones;
DROP POLICY IF EXISTS "vecino ve sus reclamos" ON public.reclamos;

-- ─────────────────────────────────────────────────────────────────
-- 2. TURNOS_AGENDA — vecino autenticado ve solo sus propios turnos
-- ─────────────────────────────────────────────────────────────────

-- SELECT: vecino autenticado + staff de su municipio + superadmin
CREATE POLICY "turnos_agenda_vecino_autenticado_select"
ON public.turnos_agenda
FOR SELECT
TO authenticated
USING (
  -- Vecino autenticado ve solo sus propios turnos
  vecino_id = public.current_vecino_id()
  -- Staff y superadmin también tienen acceso (para gestión)
  OR public.is_superadmin()
  OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
);

-- UPDATE: vecino autenticado puede actualizar sus propios turnos
CREATE POLICY "turnos_agenda_vecino_autenticado_update"
ON public.turnos_agenda
FOR UPDATE
TO authenticated
USING (
  vecino_id = public.current_vecino_id()
  OR public.is_superadmin()
  OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
)
WITH CHECK (
  vecino_id = public.current_vecino_id()
  OR public.is_superadmin()
  OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
);

-- ─────────────────────────────────────────────────────────────────
-- 3. ATENCIONES — Historia Clínica solo accesible por vecino autenticado
-- ─────────────────────────────────────────────────────────────────

-- IMPORTANTE: Esto reemplaza la policy insegura "atenciones staff lee y escribe"
-- que tenía USING (true) y exponía HC de todos los vecinos

DROP POLICY IF EXISTS "atenciones staff lee y escribe" ON public.atenciones;

-- SELECT: vecino autenticado ve solo su propia HC + staff
CREATE POLICY "atenciones_vecino_autenticado_select"
ON public.atenciones
FOR SELECT
TO authenticated
USING (
  -- Vecino autenticado ve solo su propia Historia Clínica
  vecino_id = public.current_vecino_id()
  -- Staff y superadmin tienen acceso para gestión médica
  OR public.is_superadmin()
  OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
);

-- INSERT/UPDATE: solo staff (los vecinos no crean sus propias atenciones)
CREATE POLICY "atenciones_staff_write"
ON public.atenciones
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

-- ─────────────────────────────────────────────────────────────────
-- 4. RECLAMOS — vecino autenticado ve solo sus propios reclamos
-- ─────────────────────────────────────────────────────────────────

-- Buscar si existe la tabla 'reclamos' (podría no estar en todas las DBs)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'reclamos'
  ) THEN
    -- SELECT: vecino autenticado + staff
    EXECUTE 'CREATE POLICY "reclamos_vecino_autenticado_select"
    ON public.reclamos
    FOR SELECT
    TO authenticated
    USING (
      vecino_id = public.current_vecino_id()
      OR public.is_superadmin()
      OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
    )';

    -- INSERT: vecino autenticado puede crear sus propios reclamos
    EXECUTE 'CREATE POLICY "reclamos_vecino_autenticado_insert"
    ON public.reclamos
    FOR INSERT
    TO authenticated
    WITH CHECK (
      vecino_id = public.current_vecino_id()
      OR public.is_superadmin()
      OR (public.is_staff() AND municipio_id = public.current_usuario_municipio())
    )';

    RAISE NOTICE 'Policies de reclamos creadas correctamente';
  ELSE
    RAISE NOTICE 'Tabla reclamos no existe — policies omitidas';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5. VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────

SELECT
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('turnos_agenda', 'atenciones', 'reclamos')
  AND roles::text LIKE '%authenticated%'
ORDER BY tablename, policyname;

-- Resultado esperado:
-- - turnos_agenda: 2-3 policies con 'authenticated' usando current_vecino_id()
-- - atenciones: 2 policies con 'authenticated' usando current_vecino_id()
-- - reclamos: 2 policies con 'authenticated' usando current_vecino_id()
--
-- NO debe haber policies con:
-- - roles = '{anon}'
-- - USING (vecino_id IS NOT NULL)
-- - USING (true)
