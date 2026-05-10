-- =============================================================
-- reclamos — SELECT anon para que el vecino vea sus reclamos
--
-- El área "Mi cuenta" del portal usa supabaseAnon (no hay auth
-- real, la sesión vive en sessionStorage). Para que la pestaña
-- "Mis reclamos" pueda listar los del vecino, abrimos SELECT a
-- anon solo para filas con vecino_id distinto de null. El filtro
-- por id-del-vecino lo hace el frontend.
--
-- Trade-off de seguridad: cualquiera con la anon key del proyecto
-- puede enumerar todos los reclamos vinculados a un vecino. Es
-- consistente con el resto de "Mi cuenta" (turnos, datos del
-- vecino), donde la "auth" es solo el match DNI+teléfono. Si en
-- el futuro la privacidad lo requiere, reemplazar por una RPC
-- equivalente con verificación de identidad.
--
-- Ejecutar en SQL Editor de Supabase (rol postgres).
-- =============================================================

drop policy if exists "vecino ve sus reclamos" on public.reclamos;

create policy "vecino ve sus reclamos"
on public.reclamos
for select
to anon
using (vecino_id is not null);

-- Verificación
select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'reclamos'
  and policyname = 'vecino ve sus reclamos';
