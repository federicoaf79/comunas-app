-- =============================================================
-- historia_clinica_vecino() — HC del vecino autenticado, para el portal
--
-- NOTA DE NOMBRE (2026-08-03): esta RPC se escribió originalmente
-- como `mi_historia_clinica()`, pero quedó aplicada en prod bajo el
-- nombre `historia_clinica_vecino()` — confirmado llamándola en vivo
-- (PGRST202 al pedir `mi_historia_clinica` sugirió el nombre real).
-- Este archivo y el código del frontend (useVecinoData.js) quedaron
-- alineados al nombre que ya existe en la base, no al revés. Si en
-- algún momento se corre este archivo desde cero en otro entorno, el
-- nombre que se crea es `historia_clinica_vecino` — mantenerlo así.
--
-- Reemplaza el SELECT directo a `atenciones` que usaba el portal
-- (fetchAtencionesVecino en useVecinoData.js). Motivos:
--
-- 1. La tabla `atenciones` tiene columnas de uso EXCLUSIVO del
--    profesional -- anamnesis y examen_fisico -- que son notas
--    internas, no siempre redactadas pensando en que el paciente las
--    lea. Un SELECT directo a la tabla (aunque esté bien filtrado por
--    RLS) siempre expone TODAS las columnas visibles de la fila; con
--    una RPC decidimos del lado del servidor, columna por columna,
--    qué sale -- mismo criterio que preview_vale/
--    historial_canjes_proveedor (Vales Electrónicos).
--
-- 2. Un SELECT bloqueado por RLS devuelve [] silenciosamente -- 200 OK,
--    cero filas -- indistinguible en pantalla de "este vecino no tiene
--    atenciones". Con la RPC, la ambigüedad desaparece: identidad nula
--    = excepción explícita, nunca [].
--
-- 3. Solo se muestran atenciones finalizadas -- whitelist de estado,
--    no blacklist. Confirmado contra prod (2026-08-03):
--      select estado, count(*) from public.atenciones group by estado;
--      borrador (7), derivada (6), atendido (4), cerrada (4)
--    'atendido' no aparece en ningún lado de AtencionDrawer.jsx/
--    useAtenciones.js como valor que la UI escriba explícitamente hoy,
--    pero es un estado real cargado en la tabla -- confirma por qué la
--    columna sin CHECK constraint no se puede inferir solo leyendo el
--    código de la app. Si aparece un estado nuevo el día de mañana,
--    por default NO se muestra al vecino en vez de filtrarse solo si
--    alguien se acuerda de agregarlo acá.
--
-- receta queda AFUERA -- es una indicación médica que el paciente
-- puede malinterpretar fuera del contexto de la consulta (dosis,
-- frecuencia). Si el cliente la quiere sumar, que sea decisión
-- explícita, no un default de este fix.
--
-- signos_vitales queda AFUERA a propósito -- no es una decisión de
-- privacidad, es que hoy es un jsonb sin ningún escritor en toda la
-- app (confirmado por grep: useHC.js lo selecciona pero
-- createConsulta() nunca lo puebla) y sin un shape definido.
--
-- Filtro por municipio_id además de vecino_id: con un solo tenant no
-- se nota, pero es la clase de bug que aparece recién con el segundo.
-- Mismo idiom que ya usa el módulo de Vales
-- (20260724_vales_electronicos_fase0.sql): subquery a vecinos por
-- current_vecino_id(), no confiar en que vecino_id "ya alcanza".
--
-- Identidad SIEMPRE por current_vecino_id() -- nunca se recibe
-- vecino_id como parámetro (mismo criterio que abrir_vale/
-- canjear_vale/historial_canjes_proveedor).
--
-- Array plano ordenado por fecha_hora -- el agrupado por dependencia
-- lo sigue haciendo el componente (SaludTab en VecinoDashboard.jsx),
-- no la RPC.
--
-- VERIFICADO EN VIVO 2026-08-03, llamando la RPC directo con la sesión
-- real de Ana Gutiérrez (vecino demo): 10 filas, estados derivada(6)+
-- cerrada(4) -- cero 'borrador', el whitelist funciona.
-- profesional_nombre resuelve en 7/10 (null en los 3 sin
-- profesional_id) -- para ESTOS 7 puntuales, el join simple contra
-- `usuarios` ya devolvía el nombre real, así que no son evidencia de
-- la confusión profesionales/usuarios. tratamiento/indicaciones vienen
-- como string vacío `''` (no null) en la mayoría de las filas de
-- prueba -- dato real disponible pero sin contenido, no un bug de la
-- RPC ni del componente.
--
-- COALESCE profesionales/usuarios en el join (agregado 2026-08-03):
-- `atenciones.profesional_id` tiene la FK declarada contra
-- usuarios(id) (ver 20260511_sala_pa.sql), pero en la práctica hay
-- filas cargadas con ids de la tabla `profesionales` -- la misma
-- confusión entre las dos tablas que ya causó un bug real de FK en
-- Sala de Primeros Auxilios en julio (turnos_agenda.profesional_id
-- recibiendo un id de `usuarios` en vez de `profesionales`, al revés
-- de este caso). Sin este coalesce, cualquier atención cuyo
-- profesional_id sea en realidad un id de `profesionales` mostraría
-- "Profesional no especificado" aunque el dato exista. Es DEUDA, no
-- una decisión de diseño: la FK declarada dice `usuarios` y así se
-- sigue escribiendo desde AtencionDrawer.jsx (perfil?.id, el staff
-- logueado) -- este coalesce es un parche de lectura mientras se
-- decide/corrige de dónde sale realmente ese id en cada flujo de
-- carga. Ver riesgo abierto en CLAUDE.md con la query para confirmar
-- si la FK está validada contra los datos existentes
-- (pg_constraint.convalidated) o si nunca se validó.
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres).
-- =============================================================

create or replace function public.historia_clinica_vecino()
returns table (
  id                        uuid,
  fecha_hora                timestamptz,
  motivo                    text,
  diagnostico               text,
  tratamiento               text,
  indicaciones              text,
  proxima_consulta          date,
  profesional_nombre        text,
  profesional_especialidad  text,
  dependencia_id            uuid,
  dependencia_nombre        text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vecino_id uuid := public.current_vecino_id();
begin
  if v_vecino_id is null then
    raise exception 'Sesión de vecino no encontrada';
  end if;

  return query
    select
      a.id,
      a.fecha_hora,
      a.motivo,
      a.diagnostico,
      a.tratamiento,
      a.indicaciones,
      a.proxima_consulta,
      -- coalesce: la FK declarada es contra usuarios(id), pero hay
      -- filas con ids de profesionales(id) -- ver nota de arriba.
      coalesce(u.nombre, p.nombre)             as profesional_nombre,
      coalesce(u.especialidad, p.especialidad) as profesional_especialidad,
      d.id            as dependencia_id,
      d.nombre        as dependencia_nombre
    from public.atenciones a
    left join public.usuarios      u on u.id = a.profesional_id
    left join public.profesionales p on p.id = a.profesional_id
    left join public.dependencias  d on d.id = a.dependencia_id
    where a.vecino_id = v_vecino_id
      and a.municipio_id = (select v.municipio_id from public.vecinos v where v.id = v_vecino_id)
      and a.estado in ('atendido', 'cerrada', 'derivada')
    order by a.fecha_hora desc
    limit 100;
end;
$$;

revoke all on function public.historia_clinica_vecino() from public;
grant execute on function public.historia_clinica_vecino() to authenticated;

-- ============================================================
-- VERIFICACIÓN
-- ============================================================

-- Función creada como SECURITY DEFINER, dueño postgres.
select proname, prosecdef as security_definer, pg_get_userbyid(proowner) as owner
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'historia_clinica_vecino';

-- Permisos: solo `authenticated` debería poder ejecutarla.
select grantee, privilege_type
from information_schema.routine_privileges
where routine_name = 'historia_clinica_vecino';
