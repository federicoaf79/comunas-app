/* ===========================================================================
   20260805000004 — Cerrar la escritura anonima en todo el schema public
   Aplicado en prod: 2026-08-05. Verificado: 50 tablas -> 1.

   POR QUE
   La auditoria de permisos (docs/auditoria-permisos.sql) midio que anon tenia
   privilegio de INSERT, UPDATE y DELETE a nivel tabla en 50 tablas de public,
   incluidas atenciones, usuarios, hc_documentos, presupuesto y audit_log. La
   RLS lo negaba en casi todas, pero eso significa que la RLS era la UNICA
   linea de defensa: una policy mal escrita o un "disable row level security"
   en una migracion apurada y un anonimo escribe.

   Es el mismo ALTER DEFAULT PRIVILEGES de Supabase, ahora medido sobre tablas
   en vez de funciones.

   POR QUE ES SEGURO
   Toda la superficie anonima de la aplicacion son DOS operaciones, verificadas
   por grep sobre el repo completo:
     useProfesionales.js:111  -> lee profesionales_publico  (supabasePublic)
     Landing.jsx:605          -> inserta en consultas_landing (supabasePublic)
   Y las diez funciones de api/ usan SUPABASE_SERVICE_ROLE_KEY, las diez.
   Incluida webhook-whatsapp.js, que es por donde entra Plan-B: se autentica
   con x-partner-key y escribe turnos con service_role. La integracion del bot
   no pasa por PostgREST con la anon key.

   Consecuencia: la policy "vecinos anon insert" quedo muerta (ningun cliente
   anonimo inserta vecinos).

   OJO — NO dropear la policy "vecino puede insertar turno" de turnos_agenda:
   su rol es {public}, que incluye authenticated. Es la que permite al vecino
   logueado crear un turno. Lo mismo con las otras once policies que figuran
   con rol public en la auditoria: funcionan porque el qual las filtra.
   =========================================================================== */

/* --- 1. Que los objetos NUEVOS no nazcan abiertos ------------------------- */

/* Los defaults de public estan definidos dos veces, por postgres y por
   supabase_admin (ver pg_default_acl). Los objetos creados desde el SQL Editor
   se crean como postgres, asi que esto cubre ese camino. Los defaults de
   supabase_admin NO se pueden cambiar sin ser miembro de ese rol: si algun dia
   un objeto lo crea la tooling interna de Supabase, va a nacer abierto igual.
   Por eso la auditoria de permisos tiene que ser recurrente, no de una vez. */

alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon;

alter default privileges for role postgres in schema public
  revoke execute on functions from anon;

/* --- 2. Cerrar lo que ya existe ------------------------------------------- */

begin;

revoke insert, update, delete, truncate on all tables in schema public from anon, public;

/* Unica excepcion: el formulario de contacto de la landing. Solo INSERT; la
   lectura ya la cubre la policy consultas_select_super, que exige superadmin. */
grant insert on public.consultas_landing to anon;

commit;

/* --- 3. search_path en las dos funciones que lo tenian mutable ------------ */

alter function public.get_medico_guardia(uuid, date) set search_path = public, pg_temp;
alter function public.set_updated_at_ayuda_social() set search_path = public, pg_temp;

/* --- 4. consultas_landing: acotar el WITH CHECK true --------------------- */

/* Que el WITH CHECK sea true es semanticamente correcto para un formulario
   publico: cualquiera tiene que poder escribir. El riesgo real es que las
   columnas son text sin tope, asi que se pueden scriptear inserts de
   megabytes. El check pone SOLO topes de tamano: ningun minimo y ninguna
   validacion de formato. Un length(nombre) >= 2 o un email like '%@%.%'
   rechazaria en silencio cada lead mal tipeado, y eso cuesta un municipio
   interesado. La forma la valida el formulario; la RLS acota el recurso. */

begin;

drop policy consultas_insert_anon on public.consultas_landing;

create policy consultas_insert_anon on public.consultas_landing
  for insert to anon, authenticated
  with check (
    length(nombre) <= 200
    and length(municipio) <= 200
    and length(provincia) <= 200
    and length(email) <= 320
    and length(telefono) <= 50
    and (mensaje is null or length(mensaje) <= 5000)
  );

commit;

/* ===========================================================================
   VERIFICACION

   select count(*) as tablas_con_escritura_anonima
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v')
     and (has_table_privilege('anon', c.oid, 'INSERT')
       or has_table_privilege('anon', c.oid, 'UPDATE')
       or has_table_privilege('anon', c.oid, 'DELETE'));

   Tiene que dar 1: consultas_landing y nada mas. Antes daba 50.
   Confirmado el 2026-08-05.

   Y en vivo, sin ninguna sesion (ventana de incognito):
   - comunas.lat -> mandar el formulario de contacto. Tiene que guardar.
   - realsayana.comunas.lat -> landing de una dependencia con profesionales.
     La lista tiene que aparecer.
   Son las dos unicas cosas que un anonimo hace en todo el sistema.
   =========================================================================== */
