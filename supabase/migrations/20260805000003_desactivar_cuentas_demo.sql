/* ===========================================================================
   20260805000003 — Desactivar las dos cuentas de staff de prueba
   Aplicado en prod: 2026-08-05.

   POR QUE
   Dos cuentas de prueba estaban activas y aprobadas en produccion, con roles
   de staff reales:

   - dra.ramirez@realsayana.ar — rol subadmin, especialidad "Medicina general",
     dependencias_acceso con puede_gestionar=true y puede_administrar=true
     sobre la dependencia 737833a2-441f-4d6e-9a3f-5c2eb0c8f7f1. Cuenta demo que
     nunca inicio sesion, con contrasena probablemente inicial y acceso de
     gestion sobre una dependencia clinica.
   - comunas@tulkasmedia.com — rol admin_portal, creada el 2026-08-01 para
     probar el flujo de invitacion, aprobada el 2026-08-02.

   DESACTIVAR NO ES BORRAR. Los datos de prueba se limpian antes de la entrega
   (ver CLAUDE.md, seccion de datos de prueba en prod). Esto solo cierra la
   credencial: is_staff() exige activo = true, asi que las dos pierden todo
   acceso de RLS al instante sin perder la fila ni su historial.
   =========================================================================== */

/* Verificar el filtro ANTES del update: tienen que ser exactamente dos filas.
   Esta regla salio de dos incidentes reales en este proyecto.

   select id, nombre, email, roles, activo from usuarios
   where email in ('dra.ramirez@realsayana.ar','comunas@tulkasmedia.com');
*/

update usuarios set activo = false
where email in ('dra.ramirez@realsayana.ar','comunas@tulkasmedia.com');

/* ===========================================================================
   VERIFICACION

   select id, nombre, email, roles, activo from usuarios
   where email in ('dra.ramirez@realsayana.ar','comunas@tulkasmedia.com');

   Las dos en activo = false. Confirmado el 2026-08-05.

   PENDIENTE RELACIONADO
   - La cuenta de auth del vecino de prueba "Ramon Gomez" / "Comerciante, Demo"
     (DNI 88777666) sigue viva. Va en la limpieza previa a la entrega.
   - Los 8 vales de prueba que CLAUDE.md documenta como pendientes YA SE
     BORRARON. El doc quedo viejo.
   =========================================================================== */
