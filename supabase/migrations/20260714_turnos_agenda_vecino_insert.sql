-- ====================================================================
-- RLS Policy: Permitir INSERT en turnos_agenda para vecinos autenticados
-- Fecha: 2026-07-14
-- ====================================================================
-- Contexto: Los vecinos autenticados necesitan poder crear sus propias
-- reservas deportivas (y turnos médicos desde el portal).
-- Esta policy permite que un vecino cree un turno donde vecino_id = su ID.
-- ====================================================================

-- Nota: Se asume que la tabla turnos_agenda ya tiene RLS habilitado.
-- Si no lo tiene, descomentar la siguiente línea:
-- ALTER TABLE turnos_agenda ENABLE ROW LEVEL SECURITY;

-- Drop policy si existe (idempotencia)
DROP POLICY IF EXISTS "turnos_agenda_vecino_insert" ON turnos_agenda;

-- Policy: Vecinos autenticados pueden insertar sus propios turnos
-- Condición: vecino_id en el INSERT debe coincidir con el vecino logueado
CREATE POLICY "turnos_agenda_vecino_insert"
ON turnos_agenda
FOR INSERT
TO authenticated
WITH CHECK (
  -- El vecino_id del nuevo turno debe ser el del vecino autenticado
  vecino_id = (
    SELECT id FROM vecinos
    WHERE auth_user_id = auth.uid()
    LIMIT 1
  )
);

-- Verificación: listar policies de turnos_agenda
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'turnos_agenda'
ORDER BY policyname;
