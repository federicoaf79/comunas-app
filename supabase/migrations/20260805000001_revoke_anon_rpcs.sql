/* ===========================================================================
   20260805000001 — Cerrar a anon las RPCs que exigen sesion
   Aplicado en prod: 2026-08-05. Verificado por proacl.

   POR QUE
   Supabase trae ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS
   TO anon, authenticated, service_role. Toda funcion nueva en public nace
   llamable sin login via /rest/v1/rpc/<nombre>.

   CLAUDE.md:945 documentaba expirar_vales como cerrada con
   "revoke execute a anon/authenticated". Ese revoke saco las dos entradas
   explicitas pero NO la de PUBLIC, que es independiente. La funcion quedo
   abierta desde el 2026-07-26. Un POST expiraba los vales de todos los
   municipios.

   fase0.sql:374/454 lo hacia bien (revoke from public) pero para
   canjear_vale(text), firma dropeada el 26/07 al pasar a (text, text).
   La firma nueva nacio abierta.

   REGLA: revocar a PUBLIC, anon y authenticated (son tres entradas
   independientes) y despues grantear solo a quien corresponde. Asi el estado
   final es determinista y no depende de que habia antes.
   =========================================================================== */

begin;

/* --- Solo el cron. postgres y service_role conservan su grant explicito,
       asi que el job de pg_cron sigue corriendo. ---------------------------- */

revoke all on function public.expirar_vales() from public, anon, authenticated;
revoke all on function public.revisar_vinculos_mayoria_edad() from public, anon, authenticated;

/* --- Exigen sesion por diseno: resuelven identidad server-side con
       current_vecino_id() y levantan excepcion si es null. El front las llama
       con la anon key PERO con sesion, asi que el rol efectivo es
       authenticated. ------------------------------------------------------- */

revoke all on function public.abrir_vale(text) from public, anon, authenticated;
grant execute on function public.abrir_vale(text) to authenticated;

revoke all on function public.canjear_vale(text, text) from public, anon, authenticated;
grant execute on function public.canjear_vale(text, text) to authenticated;

revoke all on function public.preview_vale(text, text) from public, anon, authenticated;
grant execute on function public.preview_vale(text, text) to authenticated;

revoke all on function public.anular_vale(text, text) from public, anon, authenticated;
grant execute on function public.anular_vale(text, text) to authenticated;

revoke all on function public.vincular_dispositivo(text, uuid, text) from public, anon, authenticated;
grant execute on function public.vincular_dispositivo(text, uuid, text) to authenticated;

revoke all on function public.desvincular_dispositivo(text) from public, anon, authenticated;
grant execute on function public.desvincular_dispositivo(text) to authenticated;

revoke all on function public.historial_canjes_proveedor(uuid) from public, anon, authenticated;
grant execute on function public.historial_canjes_proveedor(uuid) to authenticated;

revoke all on function public.aprobar_vinculo_familiar(uuid, boolean) from public, anon, authenticated;
grant execute on function public.aprobar_vinculo_familiar(uuid, boolean) to authenticated;

revoke all on function public.rechazar_vinculo_familiar(uuid, text) from public, anon, authenticated;
grant execute on function public.rechazar_vinculo_familiar(uuid, text) to authenticated;

revoke all on function public.revocar_vinculo_familiar(uuid) from public, anon, authenticated;
grant execute on function public.revocar_vinculo_familiar(uuid) to authenticated;

revoke all on function public.solicitar_vinculo_familiar(text, text, text, date, text) from public, anon, authenticated;
grant execute on function public.solicitar_vinculo_familiar(text, text, text, date, text) to authenticated;

revoke all on function public.mis_vinculos_familiares() from public, anon, authenticated;
grant execute on function public.mis_vinculos_familiares() to authenticated;

revoke all on function public.historia_clinica_familiar(uuid) from public, anon, authenticated;
grant execute on function public.historia_clinica_familiar(uuid) to authenticated;

revoke all on function public.historia_clinica_vecino() from public, anon, authenticated;
grant execute on function public.historia_clinica_vecino() to authenticated;

commit;

/* ===========================================================================
   VERIFICACION — corrida aparte. Las 16 con anon_puede=false y
   service_puede=true. Las dos de cron ademas con auth_puede=false.

   select p.proname,
          has_function_privilege('anon', p.oid, 'EXECUTE')          as anon_puede,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_puede,
          has_function_privilege('service_role', p.oid, 'EXECUTE')  as service_puede,
          p.proacl::text as acl
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in (
     'expirar_vales','revisar_vinculos_mayoria_edad','abrir_vale','canjear_vale',
     'preview_vale','anular_vale','vincular_dispositivo','desvincular_dispositivo',
     'historial_canjes_proveedor','aprobar_vinculo_familiar','rechazar_vinculo_familiar',
     'revocar_vinculo_familiar','solicitar_vinculo_familiar','mis_vinculos_familiares',
     'historia_clinica_familiar','historia_clinica_vecino')
   order by p.proname;

   Salida real del 2026-08-05: las 16 en
   {postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}
   y las dos de cron en {postgres=X/postgres,service_role=X/postgres}.

   PENDIENTE, NO INCLUIDO ACA
   - buscar_turnos_por_dni(text, uuid) y consultas_publicas_por_vecino(text, text):
     siguen abiertas a anon. Cero callers en el repo. La integracion de Plan-B
     entra por api/webhook-whatsapp.js con service_role, no por PostgREST.
   - get_medico_guardia(uuid, date): abierta a anon pero es SECURITY INVOKER,
     asi que la RLS le aplica y un anon no saca nada util.
   - is_staff, is_admin_comuna, is_superadmin, has_role, current_vecino_id,
     current_usuario_municipio: NO revocar. Postgres evalua las expresiones de
     las policies con los privilegios del rol que consulta; si authenticated
     pierde EXECUTE sobre is_staff(), toda policy que la use tira permission
     denied y se cae la app. Van movidas a un schema fuera de los db-schemas
     expuestos por PostgREST.
   =========================================================================== */
