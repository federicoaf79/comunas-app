-- =============================================================
-- 20260514_noticias_index
--
-- Índice parcial para acelerar el listado público de noticias
-- del portal:
--
--   SELECT ... FROM noticias
--   WHERE municipio_id = $1
--     AND estado = 'publicada'
--   ORDER BY publicado_at DESC
--   LIMIT 20;
--
-- (la query que vive en hooks/useNoticiasPublicas.js y que también
-- usa el HeroCarousel para tomar las últimas 10 con imagen).
--
-- Nota: el spec original mencionaba columnas `fecha` y `activa`,
-- pero en el schema real (ver 20250507000001_noticias_public_read.sql)
-- la fecha vive en `publicado_at timestamptz` y el flag de
-- publicación es `estado text` con valor 'publicada'. El índice
-- se crea con esos nombres reales — si llegan a renombrarse,
-- esta migration hay que actualizarla acá.
-- =============================================================

create index if not exists idx_noticias_municipio_publicado
  on public.noticias (municipio_id, publicado_at desc)
  where estado = 'publicada';

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename  = 'noticias'
  and indexname  = 'idx_noticias_municipio_publicado';
