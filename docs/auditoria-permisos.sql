-- ============================================================================
-- COMUNAS — Auditoria de permisos y RLS contra produccion
-- ============================================================================
--
-- Hermana de scripts/audit-schema.mjs. Esa compara codigo contra schema.
-- Esta compara los PRIVILEGIOS Y POLICIES REALES de produccion contra lo que
-- se decidio. Los privilegios eran la mitad sin herramienta.
--
-- POR QUE EXISTE
-- Supabase viene con:
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL
--     TO anon, authenticated, service_role;
-- Consecuencia: todo objeto nuevo en public nace abierto a anon. Toda funcion
-- nueva es llamable sin login. Toda tabla o vista nueva es escribible sin
-- login. Cambiar la firma de una funcion crea un objeto nuevo -> nace abierto.
-- DROP + CREATE de una vista -> nace abierta (CREATE OR REPLACE conserva ACL).
-- Y ningun REVOKE fallido da error: la salida es identica a la de uno efectivo.
-- Por eso esto no se arregla una vez. Se audita.
--
-- COMO SE USA
--   1. Pegar entero en el SQL Editor de Supabase (rol postgres) y correr.
--   2. Cero filas = sin hallazgos.
--   3. Cada fila es un hallazgo. Ordenadas por severidad.
--   4. Correr DESPUES de cada migracion y de cada sesion de SQL.
--   5. La salida va a docs/estado-prod.md y se commitea. Ese es el unico modo
--      de que Claude Code y Tulkas vean el estado real de produccion.
--
-- MANTENIMIENTO
--   Las dos whitelists de abajo son lo unico que se edita. Todo lo que este
--   ahi es una decision consciente de exponer algo, y deberia tener una linea
--   en CLAUDE.md que la justifique.
--
-- TRAMPAS QUE ESTE SCRIPT NO PUEDE CHEQUEAR, no las olvides:
--   - Los helpers de RLS (is_staff, is_admin_comuna, is_superadmin, has_role,
--     current_vecino_id, current_usuario_municipio) NO se arreglan con REVOKE.
--     Postgres evalua las expresiones de las policies con los privilegios del
--     rol que consulta: si authenticated pierde EXECUTE sobre is_staff(), toda
--     policy que la use tira permission denied y se cae la app. Van movidos a
--     un schema fuera de los db-schemas expuestos por PostgREST.
--   - profesionales_publico DEBE seguir siendo SECURITY DEFINER. Es el
--     mecanismo de column-scoping del portal publico, mismo patron que
--     preview_vale. Con security_invoker=true, profesionales no tiene policy
--     para anon y el visitante sin sesion obtiene cero filas.
-- ============================================================================

with

-- Funciones que SI deben ser llamables sin login. Editar con criterio.
whitelist_funciones(nombre) as (
  values
    ('modulo_vales_activo'),        -- gate de modulo, lectura de config
    ('horarios_ocupados_espacio')   -- disponibilidad publica del polideportivo
),

-- Vistas que SI deben ser legibles sin login (solo lectura).
whitelist_vistas(nombre) as (
  values
    ('profesionales_publico')       -- superficie publica acotada del portal
),

hallazgos as (

  -- ==========================================================================
  -- 1. Funciones ejecutables sin login
  -- ==========================================================================
  select
    '1-CRITICA'                                                as severidad,
    'funcion_ejecutable_sin_login'                             as chequeo,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as objeto,
    'anon puede ejecutarla via /rest/v1/rpc/' || p.proname ||
    '. ACL: ' || coalesce(p.proacl::text, '(vacio: todo por PUBLIC)')   as detalle
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname not in (select nombre from whitelist_funciones)

  union all

  -- ==========================================================================
  -- 2. Vistas escribibles sin login
  -- Una vista simple sobre una sola tabla es auto-actualizable: Postgres
  -- propaga el INSERT/UPDATE/DELETE a la tabla de abajo. Y como la vista corre
  -- con los permisos de su owner, la RLS de esa tabla no la frena.
  -- ==========================================================================
  select
    '1-CRITICA',
    'vista_escribible_sin_login',
    c.relname,
    'anon puede ' || array_to_string(array(
      select pr from unnest(array['INSERT','UPDATE','DELETE']) pr
      where has_table_privilege('anon', c.oid, pr)
    ), '/') || ' y la vista ' ||
    case when v.is_updatable = 'YES'
         then 'ES auto-actualizable: escribe en la tabla de abajo salteando su RLS'
         else 'no es auto-actualizable, pero el grant no deberia estar' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join information_schema.views v
    on v.table_schema = 'public' and v.table_name = c.relname
  where n.nspname = 'public'
    and c.relkind = 'v'
    and (has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE'))

  union all

  -- ==========================================================================
  -- 3. Tablas sin RLS en un schema expuesto por la API
  -- ==========================================================================
  select
    '1-CRITICA',
    'tabla_sin_rls',
    c.relname,
    'RLS DESACTIVADO. Cualquier rol con privilegio de tabla lee y escribe todo, ' ||
    'sin filtro de municipio. anon: ' ||
    case when has_table_privilege('anon', c.oid, 'SELECT') then 'lee' else 'no lee' end
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and not c.relrowsecurity

  union all

  -- ==========================================================================
  -- 4. Policies permisivas de escritura
  -- Un USING(true) en SELECT suele ser deliberado (lectura publica). En
  -- INSERT/UPDATE/DELETE/ALL es otra cosa.
  -- ==========================================================================
  select
    '2-ALTA',
    'policy_permisiva_escritura',
    pol.tablename || '.' || pol.policyname || ' [' || pol.cmd || ']',
    'roles=' || pol.roles::text ||
    ' qual=' || coalesce(pol.qual, '(sin USING)') ||
    ' with_check=' || coalesce(pol.with_check, '(sin WITH CHECK)')
  from pg_policies pol
  where pol.schemaname in ('public','storage')
    and pol.cmd <> 'SELECT'
    and pol.roles && array['anon','authenticated','public']::name[]
    and (pol.qual = 'true' or pol.with_check = 'true'
      or (pol.cmd = 'ALL' and pol.qual is null))

  union all

  -- ==========================================================================
  -- 5. Policies sin filtro de tenant
  -- Latente con un tenant. Explotable el dia del segundo.
  -- ==========================================================================
  select
    '2-ALTA',
    'policy_sin_filtro_municipio',
    pol.tablename || '.' || pol.policyname || ' [' || pol.cmd || ']',
    'ninguna condicion referencia municipio_id. qual=' ||
    coalesce(pol.qual, '(sin USING)')
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.roles && array['anon','authenticated','public']::name[]
    and coalesce(pol.qual, '') !~* 'municipio_id'
    and coalesce(pol.with_check, '') !~* 'municipio_id'
    and (coalesce(pol.qual, '') ~* 'is_staff|is_admin_comuna'
      or coalesce(pol.with_check, '') ~* 'is_staff|is_admin_comuna')

  union all

  -- ==========================================================================
  -- 6. El nombre de la policy miente
  -- Caso real: "hc consultas staff lee municipio" sin filtro de municipio.
  -- Sobrevivio varias revisiones porque el nombre decia lo contrario.
  -- ==========================================================================
  select
    '2-ALTA',
    'policy_nombre_enganoso',
    pol.tablename || '.' || pol.policyname || ' [' || pol.cmd || ']',
    'el nombre menciona municipio/comuna/tenant pero ninguna condicion ' ||
    'referencia municipio_id'
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.policyname ~* 'municipio|comuna|tenant'
    and coalesce(pol.qual, '') !~* 'municipio_id'
    and coalesce(pol.with_check, '') !~* 'municipio_id'

  union all

  -- ==========================================================================
  -- 7. Tablas con escritura anonima
  -- Puede ser legitimo (formulario publico) si la policy acota de verdad.
  -- ==========================================================================
  select
    '3-MEDIA',
    'tabla_con_escritura_anonima',
    c.relname,
    'anon puede ' || array_to_string(array(
      select pr from unnest(array['INSERT','UPDATE','DELETE']) pr
      where has_table_privilege('anon', c.oid, pr)
    ), '/') || '. Policies de escritura para anon: ' ||
    coalesce((
      select string_agg(pol.policyname || ' [' || pol.cmd || ']', ', ')
      from pg_policies pol
      where pol.schemaname = 'public' and pol.tablename = c.relname
        and pol.cmd <> 'SELECT'
        and pol.roles && array['anon','public']::name[]
    ), 'NINGUNA (el privilegio existe pero RLS lo niega)')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and (has_table_privilege('anon', c.oid, 'INSERT')
      or has_table_privilege('anon', c.oid, 'UPDATE')
      or has_table_privilege('anon', c.oid, 'DELETE'))

  union all

  -- ==========================================================================
  -- 8. SECURITY DEFINER sin search_path fijado
  -- ==========================================================================
  select
    '3-MEDIA',
    'definer_sin_search_path',
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
    'SECURITY DEFINER sin SET search_path. Corre con privilegios del owner y ' ||
    'resuelve nombres por el search_path del que llama'
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and coalesce(array_to_string(p.proconfig, ','), '') !~* 'search_path'

  union all

  -- ==========================================================================
  -- 9. Vistas definer legibles sin login
  -- No es un defecto en si: es el patron de column-scoping. Pero cada una
  -- tiene que ser una decision consciente, y la whitelist es donde consta.
  -- ==========================================================================
  select
    '4-BAJA',
    'vista_definer_publica_fuera_de_whitelist',
    c.relname,
    'anon la lee y la vista saltea la RLS de la tabla de abajo. Columnas: ' ||
    coalesce((
      select string_agg(a.attname, ', ' order by a.attnum)
      from pg_attribute a
      where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    ), '?')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and has_table_privilege('anon', c.oid, 'SELECT')
    and coalesce(array_to_string(c.reloptions, ','), '') !~* 'security_invoker=(on|true)'
    and c.relname not in (select nombre from whitelist_vistas)

  union all

  -- ==========================================================================
  -- 10. Buckets publicos
  -- Un bucket public=true sirve el objeto por URL sin pasar por RLS.
  -- ==========================================================================
  select
    '3-MEDIA',
    'bucket_publico',
    b.id,
    'public=true: los objetos se sirven por URL directa sin auth. ' ||
    'Policies de SELECT amplias en storage.objects permiten ademas LISTAR: ' ||
    coalesce((
      select string_agg(pol.policyname, ', ')
      from pg_policies pol
      where pol.schemaname = 'storage' and pol.tablename = 'objects'
        and pol.qual like '%' || b.id || '%'
        and pol.cmd = 'SELECT'
    ), 'ninguna')
  from storage.buckets b
  where b.public

  union all

  -- ==========================================================================
  -- 11. Policies duplicadas
  -- Dos policies identicas se OR-ean: gana la mas permisiva y la segunda
  -- sobrevive a un DROP dirigido a la primera. Paso dos veces en este proyecto.
  -- ==========================================================================
  select
    '4-BAJA',
    'policies_duplicadas',
    pol.tablename || ' [' || pol.cmd || ']',
    'mismas condiciones y mismos roles: ' || string_agg(pol.policyname, ', ')
  from pg_policies pol
  where pol.schemaname in ('public','storage')
  group by pol.tablename, pol.cmd, pol.roles::text,
           coalesce(pol.qual, ''), coalesce(pol.with_check, '')
  having count(*) > 1

  union all

  -- ==========================================================================
  -- 12. RLS activo y cero policies
  -- No es un hueco: es una tabla inaccesible via API. Suele ser tabla muerta.
  -- ==========================================================================
  select
    '5-INFO',
    'rls_sin_policies',
    c.relname,
    'RLS activo y cero policies: inaccesible via API para todo rol que no ' ||
    'sea service_role. Probable tabla muerta, candidata a DROP'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r','p')
    and c.relrowsecurity
    and not exists (
      select 1 from pg_policies pol
      where pol.schemaname = 'public' and pol.tablename = c.relname
    )
)

select severidad, chequeo, objeto, detalle
from hallazgos
order by severidad, chequeo, objeto;
