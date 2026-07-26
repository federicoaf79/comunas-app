-- =============================================================
-- Fix — public.is_staff() no reconocía la mayoría de los roles
-- de staff reales del producto.
--
-- Definido en 20250506000001_vecinos_rls_and_barrio.sql (mayo 2026)
-- y nunca redefinido: solo reconocía roles
-- ['superadmin','admin_comuna','operador']. 'operador' no es ni
-- siquiera un rol asignable hoy (catálogo real en Usuarios.jsx:
-- superadmin, admin_comuna, admin_portal, usuario_admin, subadmin,
-- usuario_sub, reporting, vecino) -- así que en la práctica
-- is_staff() solo era true para superadmin/admin_comuna.
--
-- Encontrado 2026-07-24 al intentar crear un proveedor de prueba
-- como Luis Nicolás Álvarez (admin_portal): "new row violates
-- row-level security policy for table proveedores". is_staff() se
-- usa en 17 archivos de migración (reclamos, beneficiarios, vales,
-- proveedores, turnos, HC, noticias, configuracion_portal,
-- sum_reservas, ayuda_social, etc.) -- para SELECT esto no tira
-- error, devuelve [] en silencio, así que pasó desapercibido hasta
-- que un INSERT lo expuso con un error real.
--
-- Fix: agrega los 5 roles de staff no-director que faltaban.
-- 'vecino' y 'operador' (rol legacy sin uso real) quedan afuera a
-- propósito -- vecino tiene sus propios helpers/policies separados
-- (current_vecino_id()), no debe colarse acá.
-- =============================================================
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.usuarios
    where id = auth.uid() and activo = true
      and roles && array[
        'superadmin', 'admin_comuna', 'operador',
        'admin_portal', 'usuario_admin', 'subadmin', 'usuario_sub', 'reporting'
      ]
  );
$$;
