-- =============================================================
-- 20260515_avatares_bucket_public
--
-- CAUSA RAÍZ del "logo guardado en DB pero no se muestra":
-- ConfigGeneral sube el logo al bucket `avatares` y persiste la
-- URL que devuelve supabase.storage.getPublicUrl(). PERO
-- getPublicUrl() solo CONSTRUYE el string
--   .../storage/v1/object/public/avatares/<path>
-- — no verifica que el bucket sea realmente público. Si el
-- bucket `avatares` quedó con public=false (o sin policy de
-- lectura anon en storage.objects), el GET anon a esa URL
-- responde 400/404 y el <img> del header rompe en silencio.
-- La URL "se ve pública" pero no lo es.
--
-- Fix: mismo patrón que 20260509000001_noticias_storage_bucket.sql
-- aplicado al bucket `avatares` — público + SELECT anon abierto,
-- escritura solo staff autenticado.
--
-- Ejecutar en SQL Editor de Supabase (rol postgres / service role).
-- =============================================================

-- 1. Bucket — idempotente. Lo crea si no existe y fuerza public=true.
insert into storage.buckets (id, name, public)
values ('avatares', 'avatares', true)
on conflict (id) do update set public = excluded.public;

-- 2. Policies sobre storage.objects acotadas a bucket_id = 'avatares'
drop policy if exists "avatares_storage_public_read"  on storage.objects;
drop policy if exists "avatares_storage_staff_insert" on storage.objects;
drop policy if exists "avatares_storage_staff_update" on storage.objects;
drop policy if exists "avatares_storage_staff_delete" on storage.objects;

create policy "avatares_storage_public_read"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'avatares');

create policy "avatares_storage_staff_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'avatares' and public.is_staff());

create policy "avatares_storage_staff_update"
on storage.objects
for update
to authenticated
using      (bucket_id = 'avatares' and public.is_staff())
with check (bucket_id = 'avatares' and public.is_staff());

create policy "avatares_storage_staff_delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'avatares' and public.is_staff());

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- public DEBE ser true.
select id, name, public
from storage.buckets
where id = 'avatares';

select policyname, cmd
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'avatares_storage_%'
order by cmd, policyname;
