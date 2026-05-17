-- =============================================================
-- 20260517_dependencias_responsable
--
-- Agrega `responsable text` a public.dependencias. Lo necesita la
-- tab "Información" del módulo genérico de gestión de dependencias
-- (DependenciaGestion.jsx) — un campo de texto libre con el nombre
-- del responsable/encargado de la dependencia.
--
-- Idempotente. El frontend igual hace retry defensivo (FULL → sin
-- `responsable`) por si este migration todavía no se aplicó en
-- algún environment, mismo patrón que useObras / useInventario.
-- =============================================================

alter table public.dependencias
  add column if not exists responsable text;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'dependencias'
  and column_name = 'responsable';
