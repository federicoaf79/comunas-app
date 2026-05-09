-- =============================================================
-- Storage bucket 'noticias' — imágenes hero del CMS de noticias.
--
-- - Bucket público: las imágenes se sirven via URL pública para
--   que el portal anon pueda mostrarlas sin auth.
-- - SELECT abierto a anon + authenticated (cualquiera lee).
-- - INSERT / UPDATE / DELETE solo para staff autenticado
--   (admin_comuna / operador / superadmin) sobre objetos del
--   bucket 'noticias'.
--
-- Convención de paths que usa el upload del frontend:
--   <municipio_id>/<timestamp>_<filename-slug>
-- (Esto facilita auditar y limpiar imágenes por municipio si
-- alguna vez se necesita.)
--
-- Ejecutar en SQL Editor de Supabase (rol postgres / service role).
-- =============================================================

-- 1. Bucket — idempotente
insert into storage.buckets (id, name, public)
values ('noticias', 'noticias', true)
on conflict (id) do update set public = excluded.public;

-- 2. Policies sobre storage.objects (acotadas a bucket_id = 'noticias')
drop policy if exists "noticias_storage_public_read"   on storage.objects;
drop policy if exists "noticias_storage_staff_insert"  on storage.objects;
drop policy if exists "noticias_storage_staff_update"  on storage.objects;
drop policy if exists "noticias_storage_staff_delete"  on storage.objects;

create policy "noticias_storage_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'noticias');

create policy "noticias_storage_staff_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'noticias' and public.is_staff());

create policy "noticias_storage_staff_update"
on storage.objects
for update
to authenticated
using      (bucket_id = 'noticias' and public.is_staff())
with check (bucket_id = 'noticias' and public.is_staff());

create policy "noticias_storage_staff_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'noticias' and public.is_staff());

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select id, name, public
from storage.buckets
where id = 'noticias';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'noticias_storage_%'
order by cmd, policyname;
