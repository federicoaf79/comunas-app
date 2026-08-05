/* ===========================================================================
   20260805000002 — profesionales_publico: sacar matricula, cerrar escritura
   Aplicado en prod: 2026-08-05. Verificado por pg_get_viewdef y relacl.

   POR QUE
   1. CLAUDE.md:521 dice que la vista "excluye telefono, email, matricula y
      frecuencia_nota (no solo los dos primeros)". Prod incluia matricula.
      Nadie la consumia: PUBLIC_COLS en useProfesionales.js:15 no la pide y
      DependenciaPublica.jsx:392 la renderiza como undefined (codigo muerto).

   2. CREATE OR REPLACE VIEW no puede eliminar columnas, solo agregarlas al
      final. Hay que dropear y recrear. Y dropear resetea el ACL: la vista
      nueva nacio con anon=arwdDxtm por el ALTER DEFAULT PRIVILEGES de
      Supabase. Es una vista auto-actualizable (select simple sobre una sola
      tabla), asi que escribir por ella propaga a profesionales salteando su
      RLS. Un DELETE con la anon key borraba los profesionales de todas las
      dependencias.

   NO CAMBIAR A security_invoker = true
   profesionales no tiene ninguna policy para anon (solo authenticated). Con
   invoker, un visitante sin sesion obtiene cero filas y se caen
   "Profesionales que atienden" en cada landing de dependencia mas el selector
   de especialidad de SacarTurnoFormPortal.jsx:285. El modo definer ES el
   mecanismo de column-scoping, mismo patron que preview_vale. El Advisor de
   Supabase marca esta vista como su unico ERROR (security_definer_view): es
   un falso positivo arquitectonico, aceptado a conciencia.
   =========================================================================== */

begin;

drop view public.profesionales_publico;

create view public.profesionales_publico as
  select id, municipio_id, dependencia_id, nombre, especialidad, activo,
         dias_atencion, hora_desde, hora_hasta, duracion_turno_min,
         max_turnos_por_slot, requiere_orden
  from public.profesionales
  where activo = true;

/* Sin cascade a proposito: si algo depende de la vista, el drop falla y el
   bloque revierte entero en vez de romperlo en silencio. */

revoke all on public.profesionales_publico from public, anon, authenticated;
grant select on public.profesionales_publico to anon, authenticated;

commit;

/* ===========================================================================
   VERIFICACION

   select pg_get_viewdef('public.profesionales_publico'::regclass, true);
   select relname, relacl::text from pg_class where relname = 'profesionales_publico';

   Salida real del 2026-08-05:
   {postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,
    anon=r/postgres,authenticated=r/postgres}

   Y en vivo, sin sesion: la landing de una dependencia con profesionales
   cargados tiene que seguir mostrando "Profesionales que atienden".
   =========================================================================== */
