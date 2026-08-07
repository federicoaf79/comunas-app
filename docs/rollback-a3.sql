/* ===========================================================================
   ROLLBACK A3 — volver las policies clínicas al estado del 2026-08-07 13:00

   QUÉ ES
   La red de seguridad del cambio A3 (aislamiento por dependencia en
   atenciones, hc_documentos y turnos_agenda). Reconstruye EXACTAMENTE las
   siete policies que existían antes, transcritas de pg_policies el
   2026-08-07, y elimina los dos helpers nuevos.

   CUÁNDO SE CORRE
   Solo si después de aplicar A3 algo que antes se veía deja de verse. El
   síntoma típico no es un error: es una pantalla vacía. Una policy mal
   escrita devuelve [] en silencio.

   Prueba rápida de que hace falta: entrar como Enrique (admin_comuna). Con
   A3 bien aplicado, Enrique tiene que ver exactamente lo mismo que antes,
   porque las policies nuevas dejan pasar a admin_comuna sobre todo su
   municipio. Si a Enrique le falta algo, correr esto.

   ESTE ARCHIVO NO ES UNA MIGRACION
   Vive en docs/ a proposito: si estuviera en supabase/migrations se
   aplicaria sobre una base nueva y desharia A3 en cada setup limpio.

   VIDA UTIL
   Se borra cuando A3 este verificado en vivo y tenga su propia migracion
   escrita. Mientras tanto, se queda.
   =========================================================================== */

begin;

/* --- 1. atenciones -------------------------------------------------------- */

drop policy if exists atenciones_select on public.atenciones;
drop policy if exists atenciones_insert on public.atenciones;
drop policy if exists atenciones_update on public.atenciones;
drop policy if exists atenciones_delete on public.atenciones;

create policy atenciones_staff_write on public.atenciones
  for all to authenticated
  using (
    is_superadmin()
    or (is_staff() and municipio_id = current_usuario_municipio())
  )
  with check (
    is_superadmin()
    or (is_staff() and municipio_id = current_usuario_municipio())
  );

create policy atenciones_vecino_autenticado_select on public.atenciones
  for select to authenticated
  using (
    vecino_id = current_vecino_id()
    or is_superadmin()
    or (is_staff() and municipio_id = current_usuario_municipio())
  );

/* --- 2. hc_documentos ----------------------------------------------------- */

drop policy if exists hc_documentos_select on public.hc_documentos;
drop policy if exists hc_documentos_insert on public.hc_documentos;
drop policy if exists hc_documentos_update on public.hc_documentos;
drop policy if exists hc_documentos_delete on public.hc_documentos;

create policy hc_documentos_staff_write on public.hc_documentos
  for all to authenticated
  using (
    is_superadmin()
    or (is_staff() and exists (
          select 1 from public.vecinos v
          where v.id = hc_documentos.vecino_id
            and v.municipio_id = current_usuario_municipio()))
  )
  with check (
    is_superadmin()
    or (is_staff() and exists (
          select 1 from public.vecinos v
          where v.id = hc_documentos.vecino_id
            and v.municipio_id = current_usuario_municipio()))
  );

create policy hc_documentos_vecino_select on public.hc_documentos
  for select to authenticated
  using (
    vecino_id = current_vecino_id()
    or is_superadmin()
    or (is_staff() and exists (
          select 1 from public.vecinos v
          where v.id = hc_documentos.vecino_id
            and v.municipio_id = current_usuario_municipio()))
  );

/* --- 3. turnos_agenda ----------------------------------------------------- */

/* Las tres originales. Ojo con "staff ve turnos de su municipio": resuelve
   superadmin con un EXISTS sobre usuarios en vez de llamar is_superadmin().
   Se transcribe tal cual estaba, no se "mejora" — un rollback restaura, no
   corrige. */

drop policy if exists turnos_select on public.turnos_agenda;
drop policy if exists turnos_update on public.turnos_agenda;

create policy "staff ve turnos de su municipio" on public.turnos_agenda
  for select to authenticated
  using (
    is_staff() and (
      municipio_id = current_usuario_municipio()
      or exists (
        select 1 from public.usuarios u
        where u.id = auth.uid() and 'superadmin' = any(u.roles))
    )
  );

create policy turnos_agenda_vecino_autenticado_select on public.turnos_agenda
  for select to authenticated
  using (
    vecino_id = current_vecino_id()
    or is_superadmin()
    or (is_staff() and municipio_id = current_usuario_municipio())
  );

create policy turnos_agenda_vecino_autenticado_update on public.turnos_agenda
  for update to authenticated
  using (
    vecino_id = current_vecino_id()
    or is_superadmin()
    or (is_staff() and municipio_id = current_usuario_municipio())
  )
  with check (
    vecino_id = current_vecino_id()
    or is_superadmin()
    or (is_staff() and municipio_id = current_usuario_municipio())
  );

/* --- 4. Los helpers nuevos ------------------------------------------------ */

/* Van al final: mientras alguna policy los referencie, el drop falla. Si
   falla aca, es que quedo una policy de A3 sin borrar y hay que revisar. */

drop function if exists public.current_usuario_dependencias();
drop function if exists public.puede_escribir_clinico();

commit;

/* ===========================================================================
   VERIFICACION DEL ROLLBACK

   select tablename, policyname, cmd
   from pg_policies
   where schemaname = 'public'
     and tablename in ('atenciones','hc_documentos','turnos_agenda')
   order by tablename, cmd, policyname;

   Tiene que quedar:
     atenciones      -> atenciones_staff_write (ALL)
                        atenciones_vecino_autenticado_select (SELECT)
     hc_documentos   -> hc_documentos_staff_write (ALL)
                        hc_documentos_vecino_select (SELECT)
     turnos_agenda   -> staff gestiona turnos de su municipio (ALL)
                        vecino puede insertar turno (INSERT)
                        staff ve turnos de su municipio (SELECT)
                        turnos_agenda_vecino_autenticado_select (SELECT)
                        vecino ve sus propios turnos (SELECT)
                        turnos_agenda_vecino_autenticado_update (UPDATE)

   Nueve policies. Las dos que A3 no toca en turnos_agenda —"staff gestiona
   turnos de su municipio" y "vecino puede insertar turno"— tienen que
   seguir ahi sin haberse movido.
   =========================================================================== */

/* ===========================================================================
   ROLLBACK — Ayuda Social (bloque aplicado el 2026-08-07)

   Cubre beneficiarios, ayuda_social_pagos, ayuda_social_entregas y la
   tabla huerfana entregas_ayuda_social.

   ADVERTENCIA — DOS COSAS NO SE CAPTURARON ANTES DE APLICAR
   1. El campo `roles` de las policies originales no quedo registrado.
      Este rollback las recrea con `to authenticated`. Si alguna era
      `{public}`, el rollback queda mas restrictivo que el original.
      Es el lado seguro del error, pero conviene saberlo.
   2. Los grants originales de entregas_ayuda_social tampoco. Se
      restauran solo para authenticated; anon quedo cerrado en toda
      la base el 2026-08-05 (migracion 20260805000004) y no se
      reabre.
   =========================================================================== */

begin;

/* --- 1. beneficiarios ----------------------------------------------------- */

drop policy if exists beneficiarios_select on public.beneficiarios;
drop policy if exists beneficiarios_insert on public.beneficiarios;
drop policy if exists beneficiarios_update on public.beneficiarios;
drop policy if exists beneficiarios_delete on public.beneficiarios;

create policy "beneficiarios staff" on public.beneficiarios
  for all to authenticated
  using (is_superadmin()
         or (is_staff() and municipio_id = current_usuario_municipio()));

/* --- 2. ayuda_social_pagos ------------------------------------------------ */

/* La original comparaba municipio contra usuarios SIN mirar activo.
   Se transcribe tal cual estaba: un rollback restaura, no corrige. */

drop policy if exists pagos_select on public.ayuda_social_pagos;
drop policy if exists pagos_insert on public.ayuda_social_pagos;
drop policy if exists pagos_update on public.ayuda_social_pagos;
drop policy if exists pagos_delete on public.ayuda_social_pagos;

create policy pagos_municipio on public.ayuda_social_pagos
  for all to authenticated
  using (exists (
    select 1 from public.usuarios
    where usuarios.id = auth.uid()
      and (usuarios.municipio_id = ayuda_social_pagos.municipio_id
           or 'superadmin' = any(usuarios.roles))));

/* --- 3. ayuda_social_entregas --------------------------------------------- */

drop policy if exists entregas_select on public.ayuda_social_entregas;
drop policy if exists entregas_insert on public.ayuda_social_entregas;
drop policy if exists entregas_update on public.ayuda_social_entregas;
drop policy if exists entregas_delete on public.ayuda_social_entregas;

create policy ayuda_social_entregas_staff on public.ayuda_social_entregas
  for all to authenticated
  using (is_superadmin()
         or (is_staff() and municipio_id = current_usuario_municipio()));

/* --- 4. entregas_ayuda_social (huerfana) ---------------------------------- */

grant select, insert, update, delete on public.entregas_ayuda_social to authenticated;

create policy entregas_ayuda_social_staff_all on public.entregas_ayuda_social
  for all to authenticated
  using (is_superadmin()
         or (is_staff() and municipio_id = current_usuario_municipio()));

/* --- 5. Helpers ----------------------------------------------------------- */

/* ORDEN IMPORTANTE: puede_escribir_clinico() hoy es un alias de
   puede_escribir_datos_sensibles(). Hay que devolverle su cuerpo
   propio ANTES de dropear la otra, o las policies clinicas que la
   referencian quedan apuntando a una funcion inexistente. */

create or replace function public.puede_escribir_clinico()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and activo = true
      and roles && array['superadmin','admin_comuna','operador',
                         'admin_portal','subadmin','usuario_admin','usuario_sub']
  );
$$;

drop function if exists public.puede_ver_ayuda_social();
drop function if exists public.puede_escribir_datos_sensibles();

commit;

/* ===========================================================================
   VERIFICACION DEL ROLLBACK

   select tablename, policyname, cmd
   from pg_policies
   where schemaname = 'public'
     and tablename in ('beneficiarios','ayuda_social_pagos',
                       'ayuda_social_entregas','entregas_ayuda_social')
   order by tablename, policyname;

   Cuatro filas, una por tabla, las cuatro con cmd = ALL.
   =========================================================================== */
