# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera, portal web público y Bot IA por dependencia.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo — actualizá la sección correspondiente en el mismo commit.

---

## 🛑 Regla de seguridad operativa — acciones destructivas en producción

**Antes de ejecutar cualquier acción que escriba, sobreescriba o borre datos reales en producción** (uploads con `upsert`, updates, deletes) — **confirmar con el usuario ANTES de ejecutar**, nunca tratarlo como un paso pasivo de verificación/diagnóstico, aunque la tarea se plantee como "probar" o "testear".

**Aprendido de un incidente real:** al diagnosticar el bug de upload del logo institucional (bucket `avatares`), se subió un archivo de prueba con `upsert=true` sin pedir confirmación previa — esto sobrescribió el logo real de Real Sayana en producción (portal, header del panel y página de login) hasta que el usuario lo volvió a subir manualmente.

---

## 📌 Decisión de producto — `modulo_turnos=false` en Sala Primeros Auxilios y Juez de Paz

**NO es un bug.** Decisión del cliente (2026-07-21): estas dos dependencias se gestionan por turno asignado directamente por el staff desde el panel admin — **no** por autogestión del vecino. Por eso `dependencias.modulo_turnos = false` para ambas, a propósito.

`modulo_turnos` solo controla si la dependencia aparece en el selector **público** de `/portal/turno` (filtro en `SacarTurnoFormPortal.jsx`). No afecta en nada la creación manual de turnos desde `/admin/dependencia-gestion/:id?tab=turnos` (botón "+ Nuevo turno" → `NuevoTurnoModal.jsx`) — ese flujo no lee `modulo_turnos` en absoluto.

**Antes de "corregir" este valor a `true` de nuevo, confirmar con el cliente** — ya pasó una vez que se interpretó como error y se revirtió sin necesidad.

---

## ⚠️ Riesgos abiertos

**MEDIO — Datos de prueba de Vales Electrónicos en prod, pendientes de borrar antes de la entrega a Real Sayana:** generados durante la verificación en vivo de Fase 1-3 (julio 2026), viven mezclados con datos reales del tenant. Incluye: los proveedores `"TEST Vales — Almacén Don Ramón"` (`9a269153-d689-4122-8ba6-f099379f35a7`) y `"TEST Vales — Panadería La Esquina"` (`2fe8b40b-e4d3-4641-bf3f-90bc9d7c982b`); sus filas en `proveedor_accesos` y `proveedor_dispositivos`; el vecino `"Comerciante, Demo"` (DNI 88777666, `comerciante.demo@realsayana.gob.ar`) creado para separar los roles dueño/beneficiario en la verificación final de Fase 3; y los vales de prueba emitidos al vecino demo (DNI 99888777) — `DUS4-ANUG`, `QSSR-GDUU`, `4DF2-WUWU`, `NF7H-N3S9`, más `HJZG-DMNE` de Fase 2 y, de la verificación en vivo de Fase 4 parte 1 (2026-07-27), `SK9N-W5BP` (cancelado, para probar la anulación), `X5GQ-MDX7` y `4ZSE-6WKC` (cantidad+unidad, canjeados para probar el agrupamiento por unidad en Conciliación). Borrar los 2 proveedores hace caer solos los `proveedor_accesos` por `ON DELETE CASCADE` — pero **decirlo explícito acá para que nadie borre a medias**: `proveedor_dispositivos` no está confirmado que cascadee igual, hay que revisarlo/borrarlo aparte antes de dar la limpieza por completa. Todo esto es un paso manual antes de que el cliente vea el módulo — no se hizo automáticamente porque implica deletes reales en prod y quedó fuera del alcance de la verificación funcional. Pendiente: confirmar con el cliente el momento de la limpieza (antes de la demo/entrega) y correr los deletes a mano.

**MEDIO — Toggles fantasma en `dependencias`: `modulo_erp` y `modulo_bot` no controlan nada:** confirmado 2026-07-24 (auditoría en vivo de los 2 sistemas de permisos/configuración, antes de construir nada nuevo encima) vía grep de todo el repo + agente Explore independiente: ambos campos solo se leen/escriben dentro de `GestionDependencias.jsx` (1 `select` + el toggle de cada uno) — ningún otro componente los consulta. `AdministracionTab.jsx` no chequea `modulo_erp` y `DepBotIATab.jsx` no chequea `modulo_bot`. Los tooltips de la UI mienten: "Habilita el módulo de administración: gastos, ingresos, solicitudes de compra" (ERP) y "El bot de WhatsApp responderá preguntas sobre esta dependencia con su información específica" (Bot IA) — ninguna de las dos cosas pasa, tildar o destildar estos toggles no tiene ningún efecto real hoy. **No corregido a propósito** (pendiente decidir con el cliente): la opción más simple sería sacar directamente esos 2 controles de la UI de `GestionDependencias.jsx` ya que hoy solo confunden al staff haciéndoles creer que controlan algo. `activa` y `modulo_turnos` (los otros 2 toggles de la misma pantalla) sí están confirmados conectados — no es un problema de la pantalla en general, solo de estos 2 campos puntuales.
**RESUELTO — sidebar bypaseaba `dependencias_acceso` por completo para dependencias con `solo_informativo:true` (Sala Primeros Auxilios, Juez de Paz):** confirmado en vivo 2026-07-24 durante la misma auditoría, probando con un empleado real (Luis Nicolás Álvarez, `ADMIN_PORTAL`, 0 accesos asignados) logueado de verdad. `entryParaDep()` en `AdminLayout.jsx` resolvía `soloInformativo` (leído de `modulos_config.config`, confirmado `true` para `sala_pa` y `juez_paz` en Real Sayana — **intencional**, decisión del cliente del 2026-07-23, no tocar ese valor) y devolvía el link plano a `?tab=landing` ANTES de llegar al chequeo de `accesoByDepId`/`esDirector` — así que cualquier staff, sin importar su `dependencias_acceso`, veía igual "Sala de Primeros Auxilios" y "Juez de Paz" en el sidebar. No era una brecha real de datos (la página destino, ej. `JuezDePaz.jsx` línea ~641-653, revalida `puede_gestionar`/`puede_administrar` por su cuenta y bloquea igual la sección no autorizada), pero el sidebar mentía sobre qué tenía asignado cada empleado. Fix 2026-07-24: se movió el chequeo de `puedeGestionar`/`puedeAdministrar` (misma lógica de `accesoByDepId` que ya usaba el resto de la función, reusada sin duplicar) ANTES del branch de `soloInformativo` — si no tiene ninguno de los dos, devuelve `null` (ni el link plano) igual que el resto de dependencias. Verificado en vivo con Luis: sin acceso a Sala PA → ya no aparece en el sidebar; con acceso de prueba asignado → vuelve a aparecer.

**RESUELTO — Agenda pública vacía para julio 2026 en adelante (data, no código):** confirmado 2026-07-23 (auditoría de UX) que los 10 eventos de `agenda_publica` para Real Sayana tenían vigencia vencida — 6 recurrentes (`recurrente=true`) con `fecha_fin=2026-06-30`, los otros 4 puntuales de fechas ya pasadas (19/6, 21/6, 25/6, 28/6, dejados como están a propósito). El `UPDATE agenda_publica SET fecha_fin = '2026-12-31' WHERE municipio_id = '654d0e86-255d-4498-b5c9-80d91793d318' AND recurrente = true AND fecha_fin = '2026-06-30'` entregado al usuario ese mismo día lo corrió Federico el 2026-07-23. Confirmado en vivo que los 6 eventos recurrentes quedaron con `fecha_fin=2026-12-31` y que `/admin/agenda-publica` y el portal público (`/portal/agenda`) ya muestran eventos en la semana actual.
**CRÍTICO — Columna `activa` en tabla `dependencias`:** es `activa` (NO `activo`). Bug corregido en junio 2026. `useMunicipios.js:199` (alta de dependencias en el wizard de municipio) ya usa `activa: true` — resuelto, no reabrir.
**CRÍTICO — Migraciones post-base:** 13 migraciones de mayo 2026 con estado desconocido en prod. Patrón confirmado 2026-07-23: varios archivos en `supabase/migrations/` documentan un schema (columnas, triggers) que NO coincide con el schema real en prod — el archivo se edita localmente después de correrlo una vez y nunca se vuelve a ejecutar. Antes de asumir que una columna/trigger de una migración existe en prod, confirmar con el spec de PostgREST (`GET /rest/v1/` → `definitions.<tabla>.properties`) o pedir el SQL de `information_schema`/`pg_constraint` al usuario. Otro caso confirmado 2026-07-23: `supabase/migrations/20260714_turnos_agenda_vecino_insert.sql` define la policy `turnos_agenda_vecino_insert` con `WITH CHECK (vecino_id = (SELECT id FROM vecinos WHERE auth_user_id = auth.uid() ...))` — pero la columna real es `vecinos.user_id`, no `auth_user_id` (confirmado contra la función base `current_vecino_id()` y contra una fila real de `vecinos`). Si el archivo se corrió tal cual, la policy nunca se creó (error de columna inexistente); si funciona en prod hoy es porque alguien la corrigió a mano antes de ejecutarla y el archivo local quedó desactualizado.
**MEDIO — `beneficiarios`/`reclamos` sin columna `updated_at`:** ambas tablas confirmadas sin esa columna en prod (vía spec de PostgREST) aunque la migración base (`20260509000003_beneficiarios_reclamos.sql`) la define con trigger `set_updated_at()`. `useReclamos.js` ya no la referencia (fix `3b30d06`). `useBeneficiarios.js` tampoco la selecciona en ningún lado (solo queda en un comentario de schema desactualizado) — sin bug funcional confirmado hoy, pero si `updateBeneficiarioEstado` empieza a fallar con "column updated_at does not exist", es porque el trigger de la migración sí llegó a crearse en prod sin la columna.
**RESUELTO — `hc_documentos` mismatch total de schema:** reescrito el código al
schema real 2026-07-28, no el schema (la tabla tenía 0 filas en prod, nada que
migrar). Columnas reales: `id, vecino_id, subido_por_rol, tipo, nombre,
storage_path, fecha, created_at, atencion_id` — sin `municipio_id`, `consulta_id`,
`descripcion`, `mime_type` ni `uploaded_by`, que el código venía asumiendo. Sin
CHECK constraint: `tipo` es texto libre — convención de UI
`orden_medica|estudio|receta|otro` (reemplaza al viejo `informe`), no una
restricción de la DB. `useAtenciones.js` (flujo admin, `DocumentosAtencion.jsx`)
reescrito completo. `useHC.js` tenía `fetchDocumentos`/`createDocumento`/
`documentosQuery` con el mismo mismatch de schema, pero **código muerto** —
`VecinoHC.jsx`, su único caller, nunca los usaba (confirmado con grep); se
eliminaron en vez de arreglarlos. `useVecinoData.js` **NO estaba roto** — esta
misma nota lo listaba como parte del mismatch, pero su `fetchDocumentosAtencion()`
ya seleccionaba las columnas reales; la nota vieja era incorrecta. Verificado en
vivo 2026-07-28 con sesión real de Luis (staff): subida, listado con nombre real, y
borrado confirmados contra un reload completo de la página (no solo cache de React
Query).

**RESUELTO — bucket `documentos-hc` es PRIVADO, `getPublicUrl()` no sirve:**
confirmado en vivo 2026-07-28 — el link que devuelve siempre da 400. Reemplazado
por `createSignedUrl(path, 3600)` en `useAtenciones.js` (admin) y `useVecinoData.js`
(portal), generado al hacer clic en "Ver" — nunca al listar (firmar ahí dispararía
N requests por render y la firma vencería con la pantalla abierta). De paso se
reescribieron las policies de storage: la de lectura era `USING (bucket_id =
'documentos-hc')` a secas — cualquier `authenticated` leía la historia clínica de
cualquier vecino de cualquier municipio. Reescrita para scopear por carpeta: staff
lee la carpeta 1 (su `municipio_id`), vecino lee la carpeta 2 (su `vecino_id`). Se
agregó también policy de DELETE para staff, que no existía (borrar la fila de
`hc_documentos` dejaba el archivo huérfano en el bucket). **El path DEBE seguir
siendo `municipioId/vecinoId/atencionId/archivo`** — si cambia el orden de las
carpetas, las policies dejan de matchear y todo el mundo (staff y vecino por igual)
pierde acceso de lectura al bucket entero.

**PENDIENTE DE VERIFICACIÓN — la rama del VECINO de esta policy de storage nunca se
ejecutó:** toda la verificación en vivo del 2026-07-28 se hizo con sesión de staff
(Luis). Confirmado que `is_staff()` resuelve bien dentro del contexto de
`storage.objects`, pero `current_vecino_id()` ahí **no se probó** — si no resuelve
igual (mismo tipo de problema que ya mordió antes con RLS de tablas normales), el
vecino ve cero documentos en silencio al entrar a su portal. Probar con sesión real
de vecino antes de dar el módulo por cerrado del todo.

**PATRÓN — `window.open()` después de un `await` lo bloquea Chrome como popup, EN
SILENCIO:** encontrado en vivo 2026-07-28 al implementar las URLs firmadas de
arriba — la request de firma volvía 200, cero errores en consola, y no pasaba nada.
Causa: `window.open()` llamado después de esperar una promesa pierde el "user
activation" del click original: Chrome lo trata como popup no solicitado y lo
descarta sin avisar. Solución: abrir la pestaña en blanco (`window.open('',
'_blank')`) DENTRO del handler del click, ANTES de esperar nada async, y navegarla
(`tab.location.href = url`) recién cuando llega la URL. **Sin `noopener`** en ese
`open` — con `noopener`, `window.open()` devuelve `null` y no queda ninguna
referencia para navegar después. Aplica a cualquier flujo futuro que abra una
pestaña con datos que hay que buscar async primero (URLs firmadas, exports
generados server-side, etc.).

**ALTO — `ordenes_derivacion.archivo_url` guarda una URL PÚBLICA PERMANENTE de un
bucket PRIVADO:** mismo bug de fondo que se acaba de cerrar en `hc_documentos`
(`getPublicUrl()` sobre `documentos-hc`, que es privado) pero en otro flujo,
todavía sin arreglar: `useOrdenMedicaUpload.js` (upload de orden médica física) y
`AgendaPublica.jsx` (`handleUploadOrden`, portal) arman la URL con `getPublicUrl()`
y la guardan tal cual en `ordenes_derivacion.archivo_url` /
`turnos_agenda.orden_medica_url`. Es **peor** que el caso de `hc_documentos`: ahí la
URL se derivaba al renderizar (bug visible pero acotado a la sesión); acá queda
**persistida rota en la base** — cualquier orden médica subida por un vecino desde
que se privatizó el bucket es un link muerto para siempre, no autocorregible sin
re-firmar o re-derivar. Real Sayana va a usar este flujo (subida de orden médica)
desde el día uno. Pendiente: mismo tratamiento que `hc_documentos` — signed URL
generada al mostrar el archivo (`validarOrden()` en `CicSalud.jsx`, y donde sea que
el vecino vea su propia orden en el portal), no una URL guardada.
**RESUELTO — `partidas_tipo` sin policy de SELECT:** tabla catálogo (sin `municipio_id`, `codigo` como PK) usada por el selector de partida en "Nueva solicitud" de Inventario. Tenía 4 filas de categoría (`02`-`05`) invisibles para staff por falta de policy de SELECT — agregada el 2026-07-23. Se sumaron 12 partidas granulares más (combustibles, insumos médicos, alimentos, etc.) vía service_role. Selector ya funcional.
**RESUELTO — `ordenes_compra.numero` es NOT NULL pero la UI lo marcaba "opcional":** el campo "N° de orden (opcional)" en `OrdenFormModal` (`Inventario.jsx`) podía quedar vacío, pero la columna `numero` en prod no acepta null. Confirmado en vivo 2026-07-23. Fix 2026-07-23: se sacó el "(opcional)" del label y se agregó `numero` a la validación `canSubmit` — los botones "Guardar borrador"/"Enviar a aprobación" quedan deshabilitados sin número. Verificado en vivo: sin número los botones están disabled, con número se habilitan y la orden se crea con el número guardado.
**RESUELTO — UPDATE en `vecinos` bloqueado por RLS para todo el staff:** confirmado en vivo 2026-07-23 al intentar completar la HC de un vecino desde `AtencionDrawer.jsx` (alergias, contacto de emergencia) — el guardado fallaba con `Cannot coerce the result to a single JSON object` / `200 []` (0 filas) para cualquier campo, cualquier usuario. Causa real: **cero policies de UPDATE en `vecinos`** (ni para staff ni para el propio vecino). Agregadas dos policies (staff por municipio, vecino por su propia fila) — verificado en vivo que el UPDATE ya funciona (HC de vecino de prueba completada + registrada en `audit_log` con shape correcto).
**RESUELTO — `pendiente_validacion` no existía en el CHECK constraint de `turnos_agenda.estado`:** confirmado en vivo 2026-07-23 (`23514 turnos_agenda_estado_check`) que los únicos estados aceptados eran `confirmado | pendiente | atendido | cancelado`. Reproducido en vivo el 2026-07-23 vía `SacarTurnoFormPortal.jsx` (CIC — Servicios de Salud, especialidad Ecografías, `requiere_orden=true`, vecino de prueba sin derivación digital validada) → mismo `23514` real (POST a `turnos_agenda` → 400). Fix aplicado por el usuario: `ALTER TABLE turnos_agenda DROP/ADD CONSTRAINT turnos_agenda_estado_check` sumando `'pendiente_validacion'` a la lista de valores. Reverificado en vivo el mismo día: el turno de prueba quedó creado con `estado: pendiente_validacion` (visible en `/portal/mi-cuenta` → Mis turnos). Como consecuencia, `validarOrden()`/el botón "Validar orden" en `CicSalud.jsx` (gateado por `turno.estado === 'pendiente_validacion'`) dejó de ser código inalcanzable — ya puede renderizarse y ejecutarse para turnos reales en ese estado.
**DESCARTADO — no era un bug de RLS en `ordenes_derivacion`, era contaminación de sesión en el navegador de prueba:** el 2026-07-23 el upload de orden médica física (`useOrdenMedicaUpload.js` → `uploadOrden()`) falló en vivo con `new row violates row-level security policy for table "ordenes_derivacion"`. Diagnóstico con el payload real (fetch interceptado, sin editar código): `origen:'fisica'` exacto ✓, pero `vecino_id` del payload (`20fe144d...`) NO coincidía con `current_vecino_id()` de la sesión real — porque la pestaña del navegador usada para probar traía arrastrada la sesión de Supabase Auth de un **admin_comuna** (de las pruebas de Fase 1-3 del mismo día), mientras `VecinoContext` seguía mostrando en la UI un vecino cacheado en `localStorage` (`comunas_vecino_session`) de un login anterior — dos identidades distintas en la misma pestaña. `VecinoContext.jsx` no revalida ni limpia esa sesión cacheada cuando no encuentra un vecino ligado al `auth.uid()` actual, así que el desfase pasa desapercibido en la UI. Al hacer logout completo (limpiar `localStorage` de `comunas-auth` y `comunas_vecino_session`) y loguear de nuevo como el vecino demo real, la policy `origen='fisica' AND vecino_id=current_vecino_id()` funcionó exactamente como está escrita — **no hace falta tocar la policy.**
**RESUELTO — `ordenes_derivacion.validada_por` violaba su FK en cualquier subida real de un vecino:** con la sesión de vecino ya consistente (ver hallazgo DESCARTADO arriba), el INSERT a `ordenes_derivacion` pasaba la RLS pero fallaba con `insert or update on table "ordenes_derivacion" violates foreign key constraint "ordenes_derivacion_validada_por_fkey"`. Causa: `useOrdenMedicaUpload.js` mandaba `validada_por: user?.id` — el `auth.uid()` de quien SUBE el archivo (el vecino) — pero esa columna es FK a `usuarios.id` (solo staff); un vecino real nunca tiene fila ahí, así que fallaba siempre, para cualquier vecino autenticado de verdad, no solo en pruebas. Fix aplicado 2026-07-23: se sacó `validada_por` del payload de `uploadOrden()` — la columna queda en su default/null hasta que el staff la valide de verdad desde `validarOrden()` en `CicSalud.jsx` (que ya la completaba bien). Verificado en vivo con sesión de vecino limpia (Ecografías, sin derivación digital, archivo subido): el INSERT pasó sin error y la fila quedó consultada directamente con `validada_por: null, estado: "pendiente", origen: "fisica"`, correctamente linkeada al turno y al vecino.
**RESUELTO — `VecinoFormModal.jsx` ("+ Nuevo vecino" en CRM) no calculaba `nombre_completo`:** el modal de alta rápida en `/admin/crm` nunca armaba `nombre_completo` a partir de apellido+nombre antes de insertar, y la columna es NOT NULL en prod. Confirmado en vivo 2026-07-23. `HistoriaClinicaForm.jsx` ya lo calculaba bien (mismo patrón "Apellido, Nombre"). Fix 2026-07-23: `handleSave()` arma `nombre_completo` antes de llamar a `onSubmit`. Verificado en vivo: alta de vecino de prueba sin error, `nombre_completo` guardado como "PRUEBATEST, Fase Final".
**MEDIO — CORS SuperAdmin:** APIs status externas pueden fallar → crear Vercel Function proxy.
**BAJO — Mensajería SMS:** consume mockData.js — no hay Twilio real.
**RESUELTO — Médico de guardia + FK de especialidad "general":** `SalaPrimerosAuxilios.jsx` ya no usa mockData — `useMedicoGuardia.js` hace un query real a `profesionales` filtrado por día/horario (muestra "Sin guardia programada" cuando no hay match, en vez de un dato fijo). El bug de `turnos_agenda_profesional_id_fkey` al crear un turno con especialidad "general" NO era del selector de especialidad (ya era data-driven desde `profesionales` real) — la causa real era que `SalaPrimerosAuxilios.jsx` pasaba `profesionalId={perfil?.id}` (el id del **usuario staff**, tabla `usuarios`) como `profesional_id` del turno, un id que no existe en `profesionales`. `CicSalud.jsx`/`Odontologia.jsx` nunca pasaban ese prop (quedaba `null`, válido). Fix 2026-07-23: se sacó esa prop de `SalaPrimerosAuxilios.jsx`. Verificado en vivo: turno con especialidad "general" creado sin error de FK.
**RESUELTO — "Vista semana" omitía turnos reales en silencio (Sala Primeros Auxilios, Odontología, Juez de Paz):** `CalendarioSemanal.jsx` solo sabe leer `evento.fecha_hora` (ISO) o el par `evento.fecha`+`evento.hora` — pero `turnos_agenda` NO tiene columna `fecha_hora`, solo `fecha` + `hora_inicio` + `hora_fin` por separado. Si el mapeo a `eventos` no combina esos campos, `isoDeEvento()` devuelve `null` y el turno se descarta sin error visible. Mismo bug que tenía CIC Salud (arreglado antes). Fix 2026-07-23 aplicado en los 3 módulos que sí lo tenían:
```js
fecha_hora: t.fecha && t.hora_inicio ? `${t.fecha}T${t.hora_inicio}${ARG_OFFSET}` : undefined,
```
(`ARG_OFFSET` de `lib/datetime.js`). Confirmado que **SUM y TablazoCross NO tenían este bug** — ya usaban el fallback `fecha`+`hora` que `CalendarioSemanal.jsx` soporta nativamente, no se tocaron. Verificado en vivo: turno de prueba creado en Sala Primeros Auxilios y en Juez de Paz, visible correctamente en la grilla semanal de ambos.
**RESUELTO (era un crash, no solo un bug de datos) — `CalendarioSemanal.jsx` podía crashear la pantalla entera con `RangeError: Invalid time value`:** al aplicar el fix de arriba en `Odontologia.jsx`, `/admin/dependencia/odontologia` empezó a crashear con "Unexpected Application Error". Causa: `ymdArg()` en `CalendarioSemanal.jsx` llamaba `Intl.DateTimeFormat.format()` sin chequear `isNaN()` antes — a diferencia de `timeOf()`/`dateOf()` en `lib/datetime.js`, que sí lo hacen. Un iso inválido (truthy pero no parseable) tira RangeError en vez de degradar. Causa raíz relacionada: `Odontologia.jsx` llamaba `useTurnos(municipioId, depOdonto?.id, fechaDesde, fechaHasta)` con **argumentos posicionales** contra una firma que espera objetos (`useTurnos({dependenciaId, fecha, fechaFrom, fechaTo} = {}, {municipioIdOverride} = {})`) — destructurar un string da todo `undefined`, así que la query nunca filtraba por dependencia ni por fecha y traía turnos de **todo el municipio sin límite**, la superficie perfecta para toparse con un dato raro. Fix 2026-07-23: `ymdArg()` devuelve `null` en vez de tirar si la fecha es inválida (el evento simplemente no matchea ninguna columna, igual que un iso `null`); `Odontologia.jsx` corregido para pasar el objeto real. Verificado en vivo: sin crash, filtro por dependencia funcionando.
**RESUELTO — Odontología mostraba un bloque de "planilla imprimible" con datos de pacientes de Sala de Primeros Auxilios fuera de `@media print`:** confirmado en vivo 2026-07-23 (durante la auditoría de UX) que `/admin/dependencia/odontologia` mostraba visible en pantalla completa (no solo al imprimir) el bloque `<PlanillaImprimir>` con título hardcodeado "SALA DE PRIMEROS AUXILIOS" y su tabla de turnos — incluyendo nombre, DNI y teléfono de pacientes reales de esa otra dependencia (ABAN Mariana Victoria, Vecino Demo). No era solo cosmético: exponía datos de pacientes de una dependencia distinta a la que se estaba viendo. Causa raíz (contradice el hallazgo anterior — `Odontologia.jsx` SÍ importa `PlanillaImprimir`, el grep previo fue incorrecto/desactualizado): (1) la regla `.planilla-print { display: none }` vivía solo en el `<style>` local de `SalaPrimerosAuxilios.jsx`, nunca en `Odontologia.jsx` ni en el componente — el nodo se renderizaba visible por default en cualquier página que no declarara ese CSS; (2) `Odontologia.jsx` llamaba a `<PlanillaImprimir turnos={turnosHoy} ... />` — `turnos` no es un prop que el componente use (trae sus propios turnos vía `useTurnos()` interno) y nunca pasaba `dependenciaId`, así que el hook traía turnos de **todo el municipio sin filtrar** por dependencia; (3) el título "SALA DE PRIMEROS AUXILIOS" y el subtítulo "CAPS —" estaban hardcodeados en el componente, ignorando cualquier contexto de quién lo llama. Fix 2026-07-23: `PlanillaImprimir.jsx` ahora declara su propia regla `display:none` co-localizada (no depende de la página que lo monta) y acepta `dependenciaNombre`/`subtitulo` con defaults que preservan exactamente el comportamiento actual de Sala PA (`'Sala de Primeros Auxilios'`/`'CAPS'`, cero cambios necesarios en `SalaPrimerosAuxilios.jsx`); `Odontologia.jsx` ahora pasa `dependenciaId={depOdonto.id}`, `dependenciaNombre="Consultorio Odontológico"` y `subtitulo={null}`. Verificado en vivo: `/admin/dependencia/odontologia` ya no muestra el bloque en pantalla (va directo a la agenda semanal real); `/admin/sala` sigue mostrando su botón "Imprimir turnos" y comportamiento sin cambios.
**RESUELTO — bug sistémico de "hora de turno faltante" en 5 pantallas más (hallazgo de mayor impacto de la auditoría de UX 2026-07-23):** además de los 3 puntos ya corregidos el mismo día (Vista Semana de Sala PA, Odontología y Juez de Paz), la auditoría encontró el mismo síntoma ("—" en el lugar de la hora) en 6 pantallas más. Investigado cada uno por separado (no se asumió la misma causa solo por el síntoma) — 5 eran el mismo bug de fondo (`turnos_agenda` no tiene `fecha_hora`, solo `fecha`+`hora_inicio` por separado) y ya están **RESUELTOS**, con commit individual + verificación en vivo por pantalla: (1) **Dashboard** — "Turnos de hoy" y "Actividad reciente" en `AdminDashboard.jsx`, combinando `fecha_hora` en un `useMemo` sobre `turnosHoy` y `proximosTurnos`; (2) **CRM Vecinal** — tab "Turnos" de la ficha de vecino en `VecinoTurnos.jsx`; (3) **CIC Salud** — Vista Día en `CicSalud.jsx` (la Vista Semana del mismo archivo ya lo hacía bien, ahí estaba el patrón a copiar); (4) **Sala de Primeros Auxilios** — widget "Agenda del día" en `SalaPrimerosAuxilios.jsx`, distinto del widget de Vista Semana ya arreglado antes; (5) **SUM** — tabla de reservas en `SUM.jsx`, con una causa **distinta** a los otros 4: `sum_reservas` no usa `turnos_agenda` y nunca tuvo columnas `hora_inicio`/`hora_fin` — la franja horaria vive entera en la columna `horario` (manana/tarde/noche/dia_completo); `horarioLabel()` ahora deriva el rango desde `r.horario` con los mismos rangos que `HORARIO_OPTS` de `SumReservaFormModal.jsx`, no desde columnas inexistentes. El 6° punto encontrado por la auditoría, **Agencia de Desarrollo** (sub-tab "Turnos → Solicitudes"), se investigó y **NO era el mismo bug — descartado como falso positivo**: `turnoFechaHora()` en `DependenciaGestion.jsx` ya lee `hora_inicio` correctamente (comentario explícito en el código: "Si hora_inicio es null (Polideportivo/Agencia) → muestra solo fecha"), y el formulario de solicitud del vecino (`SolicitarServicioDesarrollo.jsx`, portal) nunca pide una hora — son pedidos de servicio rural ("Romeo del campo", "Limpieza de represa") sin horario fijo, por diseño. El "—" en HORA ahí es el comportamiento esperado, no código roto. Build + verificación en vivo confirmados para los 5 fixes (incluyendo confirmar contra la data real vía REST que `hora_inicio` existía en la DB antes de asumir bug de UI).
**RESUELTO — los 4 KPIs de Patrimonio mostraban lo mismo en Inmuebles y Muebles:** `useResumenPatrimonio()` solo desglosaba el conteo (`porTipo`) por tipo de bien — las otras 3 métricas (valor fiscal total, con seguro activo, requieren atención) eran globales sin importar la pestaña activa. Fix 2026-07-23: `fetchResumen()` (`usePatrimonio.js`) ahora también calcula `porTipoDetalle[tipo]` con esas 3 métricas por tipo; `KpisInmuebles` (`Patrimonio.jsx`) recibe un prop `tipo` y se reusa en ambas pestañas. Verificado en vivo: Inmuebles pasó de $263.900.000 (global, igual que Muebles) a $126.300.000; Muebles a $137.600.000 — ya no coinciden. La pestaña "Seguros y valuación" no se tocó — sigue calculando sus propios KPIs localmente sobre TODO el patrimonio con datos de seguro cargados, que es intencional (ver siguiente entrada).
**INVESTIGADO (no es un bug) — "Seguros" (`useSeguros.js`) y las pólizas visibles en Patrimonio son conceptos de datos genuinamente distintos, no la misma fuente consultada distinto:** investigado 2026-07-23 a raíz del hallazgo de la auditoría de UX ("Seguros" mostraba 0 pólizas mientras Patrimonio mostraba pólizas reales). `bienes_patrimonio` (Patrimonio) tiene 3 campos simples embebidos por bien (`seguro_compania`, `seguro_poliza`, `seguro_vencimiento`) — texto libre cargado a mano junto con el bien, sin más estructura. `seguros`/`seguros_items` (módulo Seguros) es una entidad separada y más completa: compañía, tipo, tipo de cobertura, costo, vigencia desde/hasta, upload de PDF de la póliza a un bucket privado, vinculada de forma polimórfica (`tipo_entidad`+`entidad_id`) a vehículos/bienes/lo que sea. No hay ningún query rota ni columna mal apuntada — son dos modelos de datos distintos que coexisten hoy sin conectarse. **No se forzó una unificación** (documentado en el informe de auditoría con la propuesta: si el objetivo de producto es un solo lugar para pólizas, la migración natural sería que `bienes_patrimonio` referencie pólizas reales de `seguros` via `seguros_items` en vez de repetir los datos a mano en 3 campos sueltos — pero es una decisión de alcance de producto, pendiente de decidir con el cliente, no un fix mecánico).
**RESUELTO — ficha de vecino en CRM Vecinal, 3 hallazgos de la auditoría de UX cerrados:** (1) tab "Datos" no tenía botón "Editar" — se agregó, reusando `VecinoFormModal.jsx` (ahora acepta un prop opcional `vecino` para modo edición: precarga el form, cambia título/botón, sin romper el modo alta existente en `CrmVecinos.jsx`). (2) tab "Datos" no mostraba alergias/contacto de emergencia/grupo sanguíneo aunque existen en `vecinos` y se cargan desde `AtencionDrawer.jsx` — `DETAIL_COLS` de `fetchVecino()` (`useVecinos.js`) ahora los selecciona, y `VecinoDatos.jsx` los muestra (alergias con el mismo estilo de alerta que `AtencionDrawer.jsx`). (3) tab "Turnos": cada fila decía literalmente "Turno" repetido — `VecinoTurnos.jsx` ahora muestra la dependencia (o especialidad, o N° de turno) real como título. Verificado en vivo con el vecino de prueba ABAN Mariana Victoria: modal de edición precargado, grupo sanguíneo O+ y contacto de emergencia visibles, turnos con título "Sala de Primeros Auxilios"/"Juez de Paz" en vez de "Turno".
**RESUELTO — modal "Nueva reserva" de SUM no disparaba el INSERT real:** el botón "Guardar reserva" en `SumReservaFormModal.jsx` no generaba ningún POST. Causa: el modal armaba el payload con `hora_inicio`/`hora_fin`/`vecino_id`/`cant_personas` — columnas que **no existen** en `sum_reservas` (el schema real usa `solicitante` como texto plano, sin FK a vecinos, y `horario` como franja tipo `'manana'`). `pickInsertable()` en `useSumReservas.js` (whitelist de columnas reales) descartaba esos campos fantasma silenciosamente, y el INSERT quedaba sin `horario` — fallaba en consola (`createSumReserva error`) sin llegar nunca a hacer el POST real. Confirmado que `createSumReserva()` en sí funcionaba bien (insert manual directo contra la REST API con las columnas correctas funcionó). Fix 2026-07-23: se sacó el lookup/alta de vecino (innecesario, la tabla no tiene FK) y se armó el payload con `solicitante`/`horario` reales; se sacó también el campo "Cantidad de personas" del formulario (no existe como columna, quedaba silenciosamente descartado). Verificado en vivo con consulta directa a la fila creada: `solicitante`, `horario`, `fecha`, `estado` todos correctos.
**RESUELTO — 404/400 en consola al cargar cualquier pantalla del panel admin (no solo Autoridades):** `useOnboardingProgress.js` (el hook detrás del widget flotante de Onboarding, montado en `AdminLayout.jsx` y por lo tanto presente en **toda** `/admin/*`) consultaba una tabla inexistente `noticias_municipio` (404 — la real es `noticias`) y filtraba `usuarios` por `.eq('rol', 'operador')` (400 — la columna real es `roles`, un array, no `rol` singular). Fix 2026-07-23: `noticias_municipio` → `noticias`; `.eq('rol', 'operador')` → `.contains('roles', ['operador'])`. Verificado en vivo (con evidencia adicional vía `curl` directo confirmando que la query corregida devuelve 200 con datos reales) que ya no aparecen ni el 404 ni el 400.
**RESUELTO — regresión de cuenta dual (staff + vecino) en `AuthContext.jsx`, introducida el 2026-07-23 al arreglar un 406 cosmético:** `isVecinoAuthSession(userId)` cortaba la consulta a `usuarios` ANTES de correrla si detectaba una sesión de vecino cacheada en `localStorage` para ese `user_id` — asumiendo que vecino y staff son excluyentes. El diseño del producto es lo contrario: una cuenta que es staff Y vecino registrado a la vez es el caso normal, no la excepción (ej. la cuenta de Enrique). El atajo dejaba `perfil` en `null` para esas cuentas, y `RoleGuard` las mandaba a `/portal` aunque tuvieran rol de staff real — bloqueo total del panel admin para cualquier cuenta dual. Fix 2026-07-23: se sacó `isVecinoAuthSession()` por completo; la query a `usuarios` corre siempre, y `noPerfilCache` (ya existente) sigue cacheando el resultado negativo, pero solo **después** de una consulta real que confirmó "no rows" (`PGRST116`) — nunca adivinando de antemano. Verificado en vivo con sesión 100% limpia: la cuenta dual de Enrique entra a `/admin` directo (sin redirect a `/portal`) y también a `/portal/mi-cuenta` como vecino, sin que una bloquee a la otra; el vecino demo puro (sin fila en `usuarios`) sigue entrando a `/portal/mi-cuenta` normalmente, con un único 406 real por carga de página (cacheado, no repetido).

**ALTO — policies `ALL` con `is_staff()` dan escritura a los 5 roles que se sumaron
el 2026-07-24:** unas 15 policies (`atenciones`, `inventario`, `movimientos_inventario`,
`presupuesto_partidas`, `vehiculos`, `combustible_log`, `service_vehiculos`,
`ayuda_social_entregas`, `entregas_ayuda_social`, `beneficiarios`,
`patrimonio_mantenimiento`, `autoridades`, `espacios_deportivos`, `proveedores`,
`hc_documentos`) piden solo `is_staff() + municipio`. Escritas cuando `is_staff()`
significaba en la práctica "admin". Hoy un rol `reporting` puede insertar y borrar
historia clínica y partidas presupuestarias de su comuna; `usuario_sub` igual, sin
quedar acotado a su dependencia. No es un parche de una línea — requiere definir qué
puede hacer cada uno de los 8 roles. **Sprint propio, pendiente.**

**ALTO — la matriz "Permisos por persona" (`dependencias_acceso` /
`modulos_acceso`) no se aplica en RLS:** verificado 2026-07-28 — ninguna
policy la consulta. Controla el sidebar y el gating de pantallas, nada más.
Un staff con sesión válida puede leer y escribir tablas de dependencias que
no tiene asignadas llamando directo a la API. **Pendiente: sprint de RLS por
dependencia, post-entrega.**

**CORRECCIÓN — la matriz "Permisos por persona" NO guarda solo:** verificado en
vivo 2026-07-28 con la sesión de Enrique (admin_comuna): tildar un permiso muestra
"1 cambio sin guardar" con botones "Cancelar"/"Guardar cambios" — sin apretar
"Guardar cambios" el cambio no se persiste. Una nota anterior decía que el cambio
era inmediato (toast, sin botón) — era incorrecta, corregida acá. Sí se confirmó
que lo que se guarda queda reflejado en la base (verificado con reload completo de
`/admin/usuarios`, no solo re-render en cliente).

**MEDIO — tres policies sin filtro de municipio (cross-tenant):** `espacios_deportivos`
(`espacios_staff_all`, `USING is_staff()` a secas), `autoridades`
(`autoridades staff escribe`, `is_staff() OR is_superadmin()`) y `hc_consultas`
(INSERT `is_superadmin() OR is_staff()`, SELECT `is_superadmin() OR is_staff() OR vecino`).
La de `hc_consultas` es la peor: **se llama "hc consultas staff lee municipio" y no
filtra por municipio** — el nombre miente, por eso sobrevivió varias revisiones.
Misma clase de bug que el `USING(true)` de `atenciones` ya cerrado. Latente mientras
haya un solo tenant vivo, explotable apenas entre el segundo. Pendiente además
confirmar si `hc_consultas` quedó muerta tras unificar la HC en `atenciones`
(si tiene 0 filas → dropear; si tiene filas → arreglar la policy).

**RESUELTO — `vales_proveedor_select_ventana` filtraba el padrón de beneficiarios:**
la policy original aceptaba `estado IN ('emitido','abierto')` con
`vence_apertura_en IS NULL OR now() <= vence_apertura_en`. Los vales en `emitido`
tienen `vence_apertura_en` en null, así que pasaban siempre: el comerciante podía
listar todos los vales emitidos a su nombre que nadie había abierto todavía — con
`vecino_id`, `monto` y `descripcion`. Es decir, ver quién recibe ayuda municipal y
por cuánto antes de que esa persona pise el local. El mismo filtro fallaba al revés:
al pasar a `canjeado` el vale dejaba de matchear, así que el proveedor no podía ver
lo que él mismo había canjeado (sin eso no hay conciliación posible para cobrarle a
la comuna). Reescrita 2026-07-26: ve el vale solo mientras está `abierto` y dentro
de ventana, o ya `canjeado`.

**BAJO — índices redundantes en `vales`:** `idx_vales_estado` (btree sobre `estado`)
y `vales_estado_activos_idx` (parcial sobre `estado` where `emitido`/`abierto`) se
pisan. El parcial alcanza. Para el sprint de limpieza.

**BAJO — las RPCs de vales no chequean `modulo_vales_activo()`:** todas las policies
del módulo sí lo hacen, pero `abrir_vale`/`canjear_vale` no. Apagar el módulo para un
tenant no frena canjes de vales ya emitidos. Discutible si importa.

**TRAMPA para Fase 4 — vistas y RLS:** cuando haga falta filtrar por estado efectivo
en SQL (no en JS), una vista sobre `vales` corre con los permisos del owner y
**saltea la RLS de la tabla de abajo**. Necesita `with (security_invoker = true)` o
expone todos los vales de todos los tenants.

---

## Auditoría — Log de operaciones (`audit_log`)

Especificación original (mayo 2026): registrar login/alta/modificación/aprobación/rechazo/eliminación/exportación. `useAuditLog.js` (`createAuditLog()` / `useCreateAuditLog()`) existe desde entonces pero **no se llamaba desde ningún lado** hasta el sprint del 2026-07-23 — ni siquiera `AuthContext.signIn()`, que hace un `insert` directo a `audit_log` bypaseando el helper (accion `'LOGIN'` en mayúscula, inconsistente con el resto que usa minúscula — cabo suelto pre-existente, no tocado).

**Límite de diseño — RESUELTO en Fase 3:** `audit_log.usuario_id` tiene FK a `usuarios.id` → `createAuditLog()` solo es seguro para acciones de **staff**. Un vecino (autenticado por Supabase Auth o "acceso rápido") no tiene fila en `usuarios`. Solución: `createAuditLogVecino()` inserta siempre `usuario_id: null` y guarda `{actor:'vecino', vecino_id}` en `datos_despues` — ver detalle de Fase 3 abajo.

**Patrón de wiring usado (repetir en las próximas fases):** función `logAudit(args)` local a cada hook/página que envuelve `createAuditLog(args).catch(...)` — nunca bloquea la mutación real si el log falla. Se llama DESPUÉS de que la mutación principal tuvo éxito, con `entidadId` de la fila real y `descripcion` legible; `metadata` opcional solo cuando aporta algo (ej. el array completo de `dependencias_acceso`).

**Fase 1 — completa y verificada en vivo (2026-07-23):**
- `gastos` (`useAdministracion.js`): create/approve/reject
- `ordenes_compra` (`useInventario.js`): create/approve/reject
- `usuarios` (`Usuarios.jsx`, `useUsuariosAdmin.js`): alta (`invitarUsuario`, código revisado sin probar en vivo porque dispara email real), cambio de rol, activar/desactivar, permisos por dependencia

**Fase 2 — completa (2026-07-23):**
- `atenciones` (`useAtenciones.js`): create/update/cerrar — ✅ verificado en vivo end-to-end.
- `vecinos` (`useVecinos.js`): update — ✅ verificado en vivo (HC completada para vecino de prueba: alergias, contacto de emergencia) una vez agregadas las policies de UPDATE que faltaban (ver RESUELTO arriba). `create` sigue solo revisado en código (mismo patrón, bloqueado por el bug de `VecinoFormModal.jsx` de arriba — no relacionado a RLS).
- `ordenes_derivacion`: `crearDerivacionInterna` (`AtencionDrawer.jsx`) — ✅ verificado en vivo (turno de prueba en CIC Salud con Dr. Carlos Gimenez, único profesional con `es_medico_general=true`; derivación a Obstetricia creada y registrada en `audit_log`). `validarOrden` (`CicSalud.jsx`) — código revisado, **no verificable**: es código inalcanzable (ver hallazgo arriba).

**Fase 3 — completa (2026-07-23):** diseño para acciones de vecino confirmado: `audit_log.usuario_id` acepta NULL — para acciones vecino-driven se inserta `usuario_id: null` y quién fue queda en `datos_despues: {actor:'vecino', vecino_id}`. Nuevo helper `createAuditLogVecino()` en `useAuditLog.js`, usa `supabasePublic` (nunca `supabase`) porque estas acciones no tienen por qué depender de una sesión de staff. Requirió una policy nueva de INSERT en `audit_log` para `anon`/`authenticated` con `WITH CHECK (usuario_id IS NULL)` — agregada 2026-07-23.
- `turnos_agenda`: staff (`createTurno`/`updateTurnoEstado`/`cancelarTurno` en `useTurnos.js`, `useUpdateEstadoTurnoAgenda` en `useTurnosAgenda.js`, alta presencial en `TurnoPresencialModal.jsx`) — código revisado, mismo patrón ya probado. Vecino: `useCrearTurnoAgenda` (`useTurnosAgenda.js`, usado por `AgendaPublica.jsx`) — código revisado, no se encontró un evento agendable en vivo para probarlo hoy. **`SacarTurnoFormPortal.jsx` — ✅ verificado en vivo** después de un hallazgo importante (ver abajo).
- `beneficiarios` (`useBeneficiarios.js`): create/update — ✅ verificado en vivo.
- `reclamos` (`useReclamos.js`): `createReclamo` resultó NO ser exclusivamente vecino — lo llama también `DependenciaGeneral.jsx` (staff, reclamo presencial). `logReclamoCreate()` detecta en runtime si hay sesión de staff real (fila en `usuarios`) antes de elegir `createAuditLog` o `createAuditLogVecino`. Ambos caminos ✅ verificados en vivo (staff con canal presencial, y el helper vecino/anónimo revisado en código). `updateReclamoEstado`/`updateReclamoAdmin` (solo staff) — ✅ verificado en vivo.

**Hallazgo del día — `SacarTurnoFormPortal.jsx` bypaseaba `useCrearTurnoAgenda()`:** la primera prueba en vivo del lado vecino de `turnos_agenda` no generó ningún registro en `audit_log`, y parecía un problema de RLS (401 en un insert manual de prueba a `audit_log`). Usando el Network tab del navegador DURANTE la reserva real se vio que la request real a `turnos_agenda` no coincidía con las columnas de `useCrearTurnoAgenda()` (`COLS` incluye embeds de vecino/profesional; la request real solo pedía `id, numero_turno, fecha, hora_inicio, estado`) — `SacarTurnoFormPortal.jsx` tiene su **propio insert inline** con el cliente `supabase` (autenticado), nunca llamó al hook compartido, así que mi wiring original nunca se ejecutaba (no fallaba silenciosamente — directamente no corría). Fix: se agregó el `createAuditLogVecino()` directo en ese archivo. Lección: cuando un componente "debería" usar un hook compartido según el código que lo rodea, confirmar con el Network tab en vivo antes de asumir — no alcanza con leer el hook y el nombre del archivo que lo importa en otro lugar similar.

**Hallazgo de seguridad pendiente (no arreglado — para el sprint de compliance/hardening):** además de la policy nueva de hoy, ya existía una policy previa `"audit insertar authenticated"` en `audit_log` con `with_check: true` — sin ninguna restricción. Cualquier usuario `authenticated` (cualquier staff logueado) puede insertar una fila de `audit_log` con **cualquier `usuario_id`**, incluso suplantando a otra persona, porque no hay ningún `WITH CHECK` que ate el valor insertado al `auth.uid()` real de quien hace la request. Es de la migración original de mayo 2026, no introducida en este sprint. Pendiente: agregar `WITH CHECK (usuario_id = auth.uid())` a esa policy (o a una que la reemplace) para que el log de auditoría no pueda falsificarse.

**Fase 4 — completa (2026-07-23):** `accion:'export'` wireado en los 5 puntos reales de exportación CSV — `Administracion.jsx` (gastos, ingresos), `Rendicion.jsx` (mensual, anual), `Inventario.jsx` (movimientos), `Auditoria.jsx` (accesos, cambios) y `Patrimonio.jsx` (bienes) — mismo patrón `logAudit()` local best-effort de siempre. Cada archivo tenía su propia copia local de la función de export (`exportarCSV`/`csvDownload`/`exportCSV`/`descargarCsv`, todas independientes pese al comentario "copia local del patrón de Auditoria.jsx" en `Patrimonio.jsx` — no hay una función central real). `ImportadorVecinos.jsx` **no tiene ningún export CSV** (es 100% una herramienta de import) — hallazgo confirmado leyendo el archivo completo, no solo grep. En su lugar se logueó la importación masiva en sí (`handleImport()`) como `accion:'create'` (o `'update'` si no hubo altas), con un resumen agregado en `descripcion` y los contadores completos (`inserted/updated/skipped/errors/needsReview`) en `metadata` — loguear fila por fila sería impráctico para importaciones de cientos de vecinos. Verificado en vivo: export de gastos (`Administracion.jsx`), export de cambios (`Auditoria.jsx`) e importación masiva de 1 vecino de prueba (`ImportadorVecinos.jsx`) — los 3 generaron la fila esperada en `audit_log` con el payload correcto. Los otros 3 puntos (Rendición, Inventario, Patrimonio) comparten el mismo código exacto y no se probaron en vivo individualmente.
**Fase 5 — completa (2026-07-23), CIERRA EL SPRINT DE AUDITORÍA:** `logAudit()` wireado en el resto administrativo — create/update/delete según exista cada uno: `dependencias` (`GestionDependencias.jsx`, solo update — no hay alta/baja individual de dependencias fuera del wizard de municipio), `profesionales` (create/update/delete, `useUpsertProfesional` maneja ambos con un solo mutationFn), `expedientes_juzgado` (create/update), `inventario` (items create/update + `movimientos_inventario` create — gastos/órdenes de compra ya venían de Fase 1), `vehiculos`/`combustible_log`/`service_vehiculos` (flota: create/update), `seguros` (create/update/delete), `bienes_patrimonio`/`patrimonio_mantenimiento` (create/update), `obras` (create/update, en paralelo a `obras_historial` que ya existía como historial contextual propio — son complementarios, no redundantes), `sum_reservas` (create/update), `agenda_publica` (create/update/delete), `autoridades` (create/update/delete), `dominios_municipio` (create/update/delete, superadmin-only), `configuracion_portal` clave `historia_municipio` (update). Verificado en vivo (3 de 13, priorizando velocidad como se acordó): `profesionales` (update + delete, vía el modal de edición y el botón eliminar en `/admin/sala?tab=profesionales`), `autoridades` (create, vía `/admin/config?tab=autoridades`), `obras` (create, vía `/admin/obras-publicas`) — las 3 generaron la fila esperada en `audit_log` con `usuario_id`, `entidad`, `entidad_id` y `descripcion` correctos.
---

## Stack y dónde vive

- **Frontend:** React 19 + Vite + Tailwind CSS
- **Backend/DB:** Supabase `tuvfrnjnupfurzkepsod`
- **Repo:** `github.com/federicoaf79/comunas-app` · **Local:** `C:\Users\ffrey\comunas-app`
- **Hosting:** Vercel · **Prod:** `realsayana.comunas.lat`
- **Bot IA / WhatsApp:** Plan-B — org Real Sayana: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- **Tenant piloto:** Real Sayana `654d0e86-255d-4498-b5c9-80d91793d318`
- **Dep Sala Primeros Auxilios:** `737833a2-441f-4d6e-9a3f-5c2eb0c8f7f1` (tipo: `salud`)

---

## Reglas LOCKEADAS

### Paleta — CERO verde
- **Primary:** `#0F1C35` (navy) · **Accent:** `#C9A84C` (gold) · **BG:** `#F5F4EF` (cream)
- **OK/activo:** `#1D4ED8` (azul) — **NUNCA verde** (excepción: eventos comunitarios en agenda pública)
- **Fuente:** Sora

### Naming — NO abreviar
- Siempre **"Sala Primeros Auxilios"** — nunca "Sala PA" ni "PA" en el frontend
- Columna DB: `dependencias.activa` (NO `activo`)

### Roles
- `superadmin` → `/superadmin` · `admin_comuna`/`operador` → `/admin` · `vecino` → `/portal`
- `supabase` (con auth) → admin · `supabaseAnon` = `supabasePublic` (sin auth) → portal

---

## Tablas DB nuevas (junio 2026)

### `profesionales`
`id, municipio_id, dependencia_id, nombre, especialidad, matricula, telefono, email, dias_atencion text[], hora_desde, hora_hasta, frecuencia_nota, duracion_turno_min int DEFAULT 30, max_turnos_por_slot int DEFAULT 1, requiere_orden bool DEFAULT false, activo`

### `profesionales_publico` (vista, julio 2026)
Vista de solo lectura sobre `profesionales` para consultas de vecino sin sesión — usar SIEMPRE esta vista (nunca la tabla real) desde código que corre en el portal público.
Columnas: `id, municipio_id, dependencia_id, nombre, especialidad, activo, dias_atencion, hora_desde, hora_hasta, duracion_turno_min, max_turnos_por_slot, requiere_orden` — **excluye `telefono`, `email`, `matricula` y `frecuencia_nota`** (no solo los dos primeros).
Hook dedicado: `usePublicProfesionales(municipioId, dependenciaId)` en `useProfesionales.js`, cliente `supabasePublic`. La tabla real `profesionales` ya no tiene policy pública amplia — solo accesible autenticado (admin/staff) vía `useProfesionales()`.
Consumido por: `DependenciaPublica.jsx` (sección "Profesionales que atienden") y `CicSaludPortal.jsx`. El selector de especialidad en `SacarTurnoFormPortal.jsx` hace fetch directo a esta vista con `select=especialidad` únicamente.

### `turnos_agenda`
`id, municipio_id, dependencia_id, profesional_id, vecino_id, fecha, hora_inicio, hora_fin, estado (pendiente/confirmado/cancelado/atendido), orden_medica_url, orden_medica_nombre, motivo, notas_admin`

### `agenda_publica`
`id, municipio_id, dependencia_id, profesional_id, titulo, tipo (medico/taller/asesoria/evento/otro), descripcion, recurrente bool, dias_semana text[], fecha_inicio, fecha_fin, hora_inicio, hora_fin, color, activo`

**Datos de ejemplo cargados en prod (junio 2026):**
- 3 profesionales: Dra. Ramírez (general, LMaMiJV 8-12), Dr. Soria (pediatría, LMiV 14-18), Lic. Flores (obstetra, MaJ 8-12, requiere_orden)
- 10 eventos agenda pública: consultas médicas recurrentes LMaMiJV, pediatría LMiV, control prenatal MaJ, taller huerta sábados, asesoría legal viernes, taller digital miércoles, vacunación 25/6, festival 21/6, charla 19/6, taller primeros auxilios 28/6

---

## Arquitectura de componentes

### Dos vistas de dependencia
**`DependenciaGestion.jsx`** → `/admin/dependencia-gestion/:id` — tabs via `?tab=`: info/landing/bot_ia/administracion
**`DependenciaGeneral.jsx`** → `/admin/dependencia/:tipo` — CIC y deps especiales

### Componentes compartidos
- `DepLandingTab.jsx` — CMS Landing (3 templates)
- `DepBotIATab.jsx` — Config Bot IA
- `AdministracionTab.jsx` — ERP
- `ProfesionalesTab.jsx` — ABM profesionales con días/horarios
- `AgendaPublicaAdmin.jsx` — calendario semanal admin por profesional (usado en Sala Primeros Auxilios)

### Hooks de datos
- `useProfesionales.js` — CRUD tabla profesionales, staleTime: 5min
- `useTurnosAgenda.js` — slots, disponibilidad, crear/actualizar turno, staleTime: 1min
- `useAgendaPublica.js` — CRUD agenda_publica + expandirEventos() para recurrentes, staleTime: 5min

---

## Sidebar (AdminLayout.jsx)

**NAV_TOP:** Dashboard · Usuarios · CRM Vecinal · Tablero turnos · Mensajería · **Agenda pública**
**CIC:** Sala Primeros Auxilios · Juez de Paz · SUM · Ayuda Social
**DEPENDENCIAS:** deps dinámicas del municipio
**SOLO INFORMACIÓN:** policial, educación
**GESTIÓN MUNICIPAL:** Portal Web · Administración · Auditoría · Config. General · Dependencias · Importador

### subitemsParaTipo — Sala Primeros Auxilios (caps/salud/sala)
Agenda · Profesionales · Landing pública · Bot IA · Administración
(Agenda pública ya NO está aquí — es una sección comunal separada en NAV_TOP)

### subitemsParaTipo — CIC
- juzgado: Información · Expedientes · Landing · Bot IA · Administración
- sum: Reservas · Landing · Bot IA · Administración
- social/ayuda_social: Beneficiarios · Landing · Bot IA · Administración

### subitemsParaTipo — Consultorio Odontológico (odontologia)
Agenda · Profesionales · Landing pública · Bot IA · Administración
(NO requiere orden médica para turnos — turno directo)

---

## Módulos CIC — early returns

Todos usan `useSearchParams`. Early returns ANTES del chequeo de permisos:
- `?tab=landing` → DepLandingTab
- `?tab=bot_ia` → DepBotIATab

### SalaPrimerosAuxilios.jsx → `/admin/sala`
Early returns: landing, bot_ia, profesionales
`tabRequested` solo evalúa `admin/administracion` vs `agenda` — NO incluir otros tabs
Variable dep: `depSalud`

---

## Agenda pública comunal

### Admin `/admin/agenda-publica`
- Vista Lista / Vista Semana (toggle en header)
- 5 tipos: médico 🩺 / taller 📚 / asesoría ⚖️ / evento 🎯 / otro 📌
- Puntual o recurrente semanal
- Profesional asignable (médicos) → habilita turnos
- Vista semana: grilla 7-20hs igual que el portal

### Portal `/portal/agenda`
- Vista día (default 7-20hs) o semana (lun-vie)
- Leyenda lateral vertical en desktop, pills en mobile
- Filtros por tipo con colores
- Click en evento médico con profesional → modal con turno + upload orden médica
- Validación disponibilidad antes de confirmar
- Acceso desde home del portal (card "Agenda de servicios", grid-cols-5)

### Colores por tipo
- médico `#1D4ED8` · taller `#7C3AED` · asesoría `#C9A84C` · evento `#059669` · otro `#64748B`

### expandirEventos() — CRÍTICO
Regex de normalización: `.normalize('NFD').replace(/[\u0300-\u036f]/g, '')` — usar exactamente así.
Query trae todo el mes y filtra en JS (no filtrar por fecha exacta en Supabase).

---

## Portal ciudadano — DependenciaPublica.jsx

Sección "Profesionales que atienden" entre Servicios y Contacto:
- Solo para tipos: `caps`, `salud`, `sala`
- Muestra: avatar iniciales, nombre, especialidad, días, horario, frecuencia nota, teléfono

---

## Onboarding flotante

`src/hooks/useOnboardingProgress.js` — 10 items en 5 grupos detectados automáticamente.
`src/components/admin/OnboardingChecklist.jsx` — pill navy bottom-right:
- Anillo SVG animado + barra progreso gold
- Panel blanco sólido (#FFFFFF, sombra 0 20px 60px rgba(0,0,0,0.18))
- Badge gold "{X} pendientes" en header
- Items pendientes: navy `#0F1C35` fontWeight 500 · Completados: gris `#94A3B8` fontWeight 400
- Se oculta cuando pct === 100

---

## SuperAdmin `/superadmin`

`SuperadminDashboard.jsx`:
- 4 métricas globales via queries paralelas Supabase
- Status externos: `status.supabase.com`, `vercel-status.com`, `githubstatus.com` (formato statuspage.io)
- Tabla métricas por tenant
- **Riesgo CORS:** si fallan → crear Vercel Function proxy

---

## Zonas frágiles

- `AuthContext.jsx` (`fetchPerfil` + `init`) — no cambiar el orden de queries; y no reintroducir un atajo que corte la consulta a `usuarios` ANTES de correrla en base a heurísticas (ej. "hay sesión de vecino cacheada") — las cuentas duales staff+vecino son el caso normal, no la excepción (ver hallazgo RESUELTO 2026-07-23 en Riesgos abiertos)
- `supabaseAnon` — re-exporta `supabasePublic` — no eliminar
- `SalaPrimerosAuxilios.jsx` — `tabRequested` solo evalúa agenda/administracion
- `useDependenciaPublica.js` — filtra `.eq('activa', true)`
- `AdminLayout.jsx` — UN SOLO bloque dependencias
- `expandirEventos()` — regex `[\u0300-\u036f]` NO corromper

---

## Rutas App.jsx

```
/portal/agenda → AgendaPublica (pública, sin auth)
/portal/dependencia/:tipo → DependenciaPublica (con profesionales para caps/salud/sala/odontologia)
/admin/agenda-publica → AgendaPublicaPage (lista + semana)
/admin/sala → SalaPrimerosAuxilios (?tab=profesionales|landing|bot_ia|admin)
/admin/dependencia/odontologia → Odontologia (?tab=profesionales|landing|bot_ia|admin)
/admin/juez → JuezDePaz · /admin/sum → SUM · /admin/dependencia/social → AyudaSocial
/admin/dependencia-gestion/:id → DependenciaGestion
/superadmin → SuperadminDashboard
```

---

## Pendientes próxima sesión

1. **SuperAdmin Fase 2** — branding por tenant: 6 paletas + 4 templates home portal
2. **SuperAdmin Fase 3** — dominio propio CNAME → Vercel API + SSL
3. **CMS Home del tenant** — templates para `PortalPublico.jsx`
4. **Fix CORS SuperAdmin** — Vercel Function proxy para APIs status externas
5. **Fix `useMunicipios.js:199`** — `activo` → `activa`
6. **Médico de guardia** — reemplazar mockData con tabla `profesionales`
7. **Número producción WA** — A2P pendiente Twilio
8. **Onboarding** — verificar queries hook coincidan con tablas reales en prod

---

## Actualizaciones sesión junio 23 2026

### Timezone — AUDITADO Y CORREGIDO
Todos los puntos de inserción de `fecha_hora` en turnos usan `-03:00`:
- `api/webhook-whatsapp.js` — fixeado commit `ae3f846`
- `api/turnos-disponibles.js` — fixeado commit `004b516`
- `src/components/admin/NuevoTurnoModal.jsx` — ya tenía `${ARG_OFFSET}`
- `src/components/admin/TurnoPresencialModal.jsx` — ya tenía `${ARG_OFFSET}`
- `src/components/portal/SacarTurnoFormPortal.jsx` — ya tenía `-03:00` hardcoded
- Hooks: no hay inserciones directas de fecha_hora

### Agenda pública — query simplificada
`useAgendaPublica` ahora trae TODOS los eventos activos del municipio sin filtrar en Supabase.
El filtro de fechas lo hace `expandirEventos()` en JS. Commit `876e39f`.
CRÍTICO: regex normalización días → `/[\u0300-\u036f]/g` (NO corromper este regex).

### Datos de ejemplo en prod (Real Sayana)
- 7 turnos del día 23/6/2026 con vecinos variados (González, Herrera, Dib Campiteli, Aban, Abendaño, López, Paz)
- 10 eventos agenda pública junio 2026
- 3 profesionales: Dra. Ramírez, Dr. Soria, Lic. Flores

## Vales Electrónicos (módulo completo)

Módulo activable por tenant vía `modulos_config` (`activo` bool + `config` jsonb),
mismo patrón que `sala_pa`/`juez_paz`. La función SQL `modulo_vales_activo(municipio_id)`
gatea todas las policies del módulo.

### Mecánica del producto

El staff emite un vale a un vecino beneficiario. El beneficiario puede ser un vecino
común o un empleado municipal — el staff también son vecinos, cuenta dual es el caso
normal, no la excepción.

El vale referencia un proveedor del catálogo (categoría libre: Ferretería, Combustible,
Almacén, etc.). Lleva descripción libre y **monto($) O cantidad+unidad, nunca ambos**
(constraint `chk_vales_monto_o_cantidad`), código único, y vigencia de 24/48/72hs
desde la emisión (constraint `vales_vigencia_horas_check`, default 48).

**El VECINO** presiona "Ver QR" en su portal. Ahí arranca un countdown de 30 minutos
fijo desde la primera apertura. Reabrir dentro de la ventana NO reinicia el reloj.
Antes de abrir hay un popup de advertencia que el vecino tiene que confirmar.

**El PROVEEDOR** canjea desde su propia cuenta de vecino, con acceso habilitado vía
`proveedor_accesos`. No hay portal público sin login.

**Si pasan los 30 minutos sin canjear, el vale SE QUEMA.** No se reabre. El vecino
tiene que ir a pedir uno nuevo a la comuna. Decisión de producto confirmada por
Federico el 2026-07-25 — no "corregir" esto a un comportamiento más permisivo.

### Máquina de estados

```
emitido ──abrir_vale()──> abierto ──canjear_vale()──> canjeado
   │                          │
   │ vigencia (24/48/72h)     │ 30 min sin canje
   ▼                          ▼
vencido                    quemado
```

`cancelado` existe en el CHECK pero todavía no tiene RPC ni UI (ver pendientes).

CHECK real (ampliado 2026-07-26 para sumar `quemado`):
`estado = any(array['emitido','abierto','canjeado','vencido','quemado','cancelado'])`

### Tablas

- `proveedores` — catálogo por municipio, categoría libre, `activo` bool
- `proveedor_accesos` — qué vecinos pueden canjear en nombre de qué proveedor
  (responsable + secundarios), `activo` bool
- `vales` — columnas reales: `id, municipio_id, vecino_id, proveedor_id, descripcion,
  monto, cantidad, unidad, codigo, estado, vigencia_horas, emitido_en, emitido_por,
  abierto_en, vence_apertura_en, canjeado_en, canjeado_por`

`codigo` tiene índice **único global** (`vales_codigo_key`, sobre `codigo` solo, sin
municipio). Por eso las RPCs pueden buscar por código sin filtrar por tenant.
No cambiar a `unique(municipio_id, codigo)` sin arreglar las RPCs primero.

### REGLA CRÍTICA — nunca UPDATE directo sobre `vales`

`UPDATE` y `DELETE` sobre `public.vales` están **revocados** a `authenticated` y `anon`
(2026-07-26). Todo cambio de estado pasa obligatoriamente por las RPCs.

Si un hook nuevo intenta `supabase.from('vales').update(...)` va a fallar con
`42501 permission denied for table vales`. **Eso es intencional — no revertir el
revoke.** Si hace falta una transición nueva, se escribe una RPC nueva.

Motivo: RLS filtra filas, no columnas. Un UPDATE directo podía marcar
`estado='canjeado'` salteándose la ventana de 30 min, la validación de
`proveedor_accesos` y el registro de `canjeado_por`.

### RPCs (las dos `SECURITY DEFINER`, `search_path` fijado)

`abrir_vale(p_codigo text) RETURNS vales`
- Identidad interna vía `current_vecino_id()`, **nunca por parámetro**
- `FOR UPDATE` sobre la fila
- Valida que el vale sea del que lo abre (`vecino_id <> v_exec_id` → excepción)
- **Idempotente**: si ya está `abierto` y dentro de ventana, devuelve la misma fila
  sin tocar `abierto_en`/`vence_apertura_en`. No reinicia el reloj.
- `vence_apertura_en = least(now() + 30 min, emitido_en + vigencia_horas)` — la
  ventana nunca puede exceder la vigencia general del vale

`canjear_vale(p_codigo text, p_device_id text) RETURNS vales` — **firma cambiada en
Fase 3 (2026-07-26)**, la vieja de un solo parámetro fue DROPEADA en prod. Si algún
código viejo la llama con un solo argumento, va a fallar con "function does not
exist" (Postgres resuelve por firma completa, no hay fallback).
- Identidad interna vía `current_vecino_id()`
- `FOR UPDATE` para evitar doble canje en carrera entre dos terminales
- Valida `proveedor_accesos` activo para el ejecutor **Y** que `p_device_id` esté
  vinculado (`proveedor_dispositivos`, activo) al MISMO comercio del vale — dos
  candados independientes, no alcanza con uno solo
- Exige `estado='abierto'` y `now() <= vence_apertura_en`

**Ojo al consumir la respuesta:** ambas devuelven la fila CRUDA de `vales`, sin el
embed `proveedor:proveedor_id(...)` que sí trae el SELECT del hook. Para mostrar el
nombre del comercio en la UI hay que tomarlo del vale del listado y mezclar de la RPC
solo `codigo`, `estado`, `abierto_en`, `vence_apertura_en`.

### Fase 3 — sección Proveedor (canjear vales)

Un vale se canjea SOLO en el comercio para el que fue emitido. Un teléfono
(`device_id`, `crypto.randomUUID()` persistido en `localStorage`) opera en UN SOLO
comercio a la vez — el dueño de varios comercios puede VER todos, pero canjear solo
en el que su teléfono actual tiene vinculado. Sin esto se pierde trazabilidad de
qué empleado/teléfono canjeó qué.

- `proveedor_dispositivos` — `device_id` único global, `proveedor_id`, `municipio_id`,
  `alias`, `activo`, `vinculado_por`, `ultimo_uso_en`. INSERT/UPDATE/DELETE
  revocados al cliente — todo pasa por RPC.
- `vincular_dispositivo(p_device_id, p_proveedor_id, p_alias)` — valida
  `proveedor_accesos` y **rechaza** si el teléfono ya está vinculado a otro comercio
  activo (no lo reemplaza — para eso hay que desvincular primero). **Desde
  2026-07-27, exige además rol `'responsable'`** — un secundario recibe
  `'Solo el responsable del comercio puede vincular teléfonos'`.
- `desvincular_dispositivo(p_device_id) RETURNS boolean` — marca `activo=false`, no
  borra la fila (el rastro de qué teléfono operó en qué comercio se conserva).
  **Desde 2026-07-27, exige `'responsable'` o staff de la comuna** — reemplaza la
  regla anterior ("quien vinculó ese teléfono, o staff"), que dejaba a un
  secundario dar de baja su propio teléfono sin que el dueño se enterara.
  `vincular_dispositivo` reactiva con `on conflict do update`, así que revincular
  después de desvincular funciona sin nada extra.

  **Por qué el cambio — el agujero real era vincular, no desvincular:**
  cualquier secundario con acceso a un comercio podía sumar su celular
  *personal* a `proveedor_dispositivos` y canjear vales sin que el responsable
  se enterara nunca de que ese teléfono existía. Restringir solo desvincular
  (como estaba antes) no cerraba nada — el problema era el alta, no la baja.
  Con `vincular_dispositivo` exigiendo `'responsable'`, el alta de cualquier
  teléfono pasa siempre por el dueño del comercio; un secundario puede operar
  (canjear) en un teléfono ya vinculado por el responsable, pero nunca decide
  qué teléfonos entran o salen del circuito.

  **UI (`Proveedor.jsx`, `/portal/proveedor`) — la restricción del server se
  refleja en qué se OFRECE, nunca al revés:**
  - `VincularView` filtra `accesos` a `rol === 'responsable'` antes de mostrar
    el selector de comercios. Si el vecino no es responsable de ninguno, no
    hay selector — solo el mensaje "Este teléfono todavía no está habilitado
    para canjear vales. Pedile al responsable del comercio que lo vincule
    desde acá con su cuenta." (antes, un secundario en un teléfono sin
    vincular veía el selector igual, elegía comercio, confirmaba, y chocaba
    con el error crudo del server — parecía la app rota).
  - `DispositivoView` (tab "Este dispositivo") oculta el botón "Desvincular"
    para quien no es responsable del comercio activo, con el texto "Solo el
    responsable del comercio o el personal de la comuna puede desvincular
    este teléfono."
  - Para decidir esto, `PROVEEDOR_ACCESO_COLS` (`useProveedorVecino.js`)
    volvió a traer `rol` — se había sacado en la limpieza de Fase 4 parte 2
    por no tener uso, con buen criterio en ese momento; acá sí hace falta,
    pero **solo para elegir qué mostrar**, nunca como control de acceso real:
    el server sigue rechazando a un secundario aunque el cliente mienta.
  - Verificado en vivo 2026-07-27: secundario en teléfono nuevo (sin
    vincular) → mensaje correcto, sin selector. Secundario en teléfono ya
    vinculado → puede canjear, sin botón de desvincular. Responsable → botón
    de desvincular visible. **No se pudo ejercitar el rechazo end-to-end de
    `desvincular_dispositivo` con sesión de secundario** (bloqueo de
    entorno: el token de sesión persistido en localStorage aparecía vencido
    y el refresh_token ya rotado, sin cliente Supabase expuesto en `window`
    para operar con la sesión real) — el chequeo de rol en el cuerpo de la
    función SÍ está confirmado desplegado en prod (`pg_get_functiondef`),
    pero falta la prueba en vivo del rechazo real vía RPC.

Flujo del canje: escanear (`@yudiel/react-qr-scanner`, peer deps declaran React 19
explícito) o tipear el código al mismo nivel visual (el navegador embebido de
WhatsApp puede negar `getUserMedia`, el tipeo es el único camino ahí) → **preview**
del vale (comercio, descripción, monto/cantidad, vecino, minutos restantes) → recién
con "Confirmar canje" se llama la RPC. Nunca canjear automáticamente al leer el
código.

- `src/lib/deviceId.js` — `getDeviceId()`
- `src/hooks/useProveedorVecino.js` — accesos, dispositivo vinculado,
  vincular/desvincular, preview por código (`fetchValePorCodigo`, vía RPC
  `preview_vale`), `canjear_vale`, vales canjeados de un comercio (solo lectura)
- `src/pages/portal/Proveedor.jsx` — ruta `/portal/proveedor`, entrada condicional
  en el tab "Mis vales" de `VecinoDashboard.jsx` (solo si el vecino tiene al menos
  un `proveedor_accesos` activo — `TABS`/`DashboardHeader` de ese archivo son
  compartidos con otras páginas del portal, así que la entrada NO se agregó ahí para
  no tener que tocar esos otros usos)

#### `preview_vale` — por qué es una RPC y no un SELECT directo

Primera versión de `fetchValePorCodigo()` hacía un `SELECT` directo sobre `vales`
con embed `vecino:vecino_id(id, nombre_completo)`. Funcionaba en toda la verificación
en vivo porque el vecino de prueba era dueño Y beneficiario a la vez (veía su propia
fila de `vecinos` vía `vales_vecino_select_propios`, sin pasar por el permiso de
proveedor). Al separar los roles en dos cuentas reales (`comerciante.demo@...` sin
ninguna fila propia entre los vales probados) el embed volvió `null` — el comerciante
no tiene, ni debe tener, permiso de `SELECT` sobre la fila de OTRO vecino. El síntoma
en pantalla era "Vecino: —" en el preview de canje.

**No se resolvió con una policy nueva en `vecinos`.** Esa tabla concentra la PII
del sistema (nombre, DNI, contacto, alergias, historia clínica) — abrirla a
comerciantes, aunque sea acotada a un campo, es desproporcionado para el problema
real: un comerciante solo necesita saber a quién le entrega un vale puntual, nunca
tuvo motivo para tener acceso de lectura a `vecinos` en general.

Se resolvió con `preview_vale(p_codigo text, p_device_id text) RETURNS jsonb`,
`SECURITY DEFINER` — arma el jsonb del lado del server (sí tiene permiso ahí) y
devuelve solo lo estrictamente necesario para cada caso:

- **Normal** (vale del comercio vinculado en este dispositivo): `es_otro_comercio:
  false` + `codigo, estado, descripcion, monto, cantidad, unidad, vence_apertura_en,
  canjeado_en, proveedor_nombre, vecino_nombre, vecino_dni`
- **Vale de OTRO comercio del MISMO dueño** (el dueño tiene `proveedor_accesos` a
  varios comercios, pero este dispositivo opera en uno solo): `es_otro_comercio:
  true` + `proveedor_nombre` únicamente — **sin** descripción, monto, ni datos del
  vecino. El dueño puede saber que el código es de su otro local, no puede espiar
  el detalle de una operación ajena a este dispositivo.
- **Vale de un comercio ajeno**, código mal escrito, o vale que el beneficiario
  todavía no abrió (`estado='emitido'`, no visible por RLS): la RPC tira `'Vale no
  encontrado'` en los tres casos por igual — no confirma ni que el código exista.
  Mensaje al comerciante: *"Puede que el vecino todavía no lo haya abierto en su
  celular, que el código esté mal escrito, o que se haya vencido el plazo."* (las
  tres causas son indistinguibles desde acá a propósito, no hay forma honesta de
  decir más sin filtrar de más).
- El chequeo de estado (`quemado`, `vencido`, `canjeado`) corre en el server desde
  el preview mismo, no solo al confirmar — un vale muerto nunca llega a mostrar el
  botón "Confirmar canje" habilitado, tira directo `'Vale no canjeable (estado
  actual: X)'` (mismo fallback de `traducirErrorCanje()` sin match → se muestra el
  mensaje del server tal cual).

`fetchValePorCodigo(codigo, deviceId)` en `useProveedorVecino.js` ahora requiere
`deviceId` — antes solo tomaba `codigo`. `Proveedor.jsx` ya no compara
`vale.proveedor_id !== dispositivo.proveedor_id` en cliente (código muerto,
eliminado): `esOtroComercio` lee directo `vale.es_otro_comercio` del jsonb, el
server es la única fuente de verdad para esa comparación.

### Barrido automático — pg_cron

Extensión `pg_cron` habilitada 2026-07-26. Job `expirar-vales`, cada 5 minutos:

```sql
select cron.schedule('expirar-vales', '*/5 * * * *', $$select public.expirar_vales();$$);
```

`expirar_vales()` marca `quemado` (si estaba `abierto` y venció la ventana) o
`vencido` (si estaba `emitido` y venció la vigencia). `SECURITY DEFINER` con
`revoke execute` a `anon`/`authenticated` — solo el cron lo dispara.

No se usa Vercel Cron: el plan es Hobby, 1 ejecución/día, inútil para una ventana
de 30 minutos. Además la única corrida diaria ya la usan los recordatorios de turnos.

Verificar con `select * from cron.job` y `cron.job_run_details`. Nunca dar por
funcionando un cron solo porque `cron.schedule` devolvió un id.

**No se loguea en `audit_log`:** son eventos del sistema sin autor. Miles de filas
de "pasó el tiempo" diluyen el rastro de acciones humanas, que es lo que un director
va a querer mirar. La fila del vale ya guarda `abierto_en`/`vence_apertura_en`/`estado`.

### Dos candados de permiso INDEPENDIENTES

1. Matriz general de "Permisos por persona" (Gestión/Administración) → controla ver
   la sección y gestionar proveedores
2. `usuarios.puede_emitir_vales` → candado aparte y más exclusivo, **solo para la
   acción de EMITIR** (mueve plata o mercadería real)

**Nunca mezclar los dos.** `puede_emitir_vales` aplica solo al INSERT en la policy
`vales_staff_insert`, deliberadamente no a UPDATE/DELETE.

### Archivos

- `src/hooks/useVales.js` — admin: listado + emisión (Fase 1)
- `src/hooks/useValesVecino.js` — portal: listado propio + `abrir_vale` (Fase 2)
- `src/lib/valeEstado.js` — `estadoEfectivo()`, `msRestantes()`,
  `formatearCountdown()`, `VALE_ESTADOS` (lista canónica de estados), `VALE_UI`
  (estilo pill del portal del vecino)
- `src/pages/portal/MisVales.jsx` — listado + modal QR con countdown
- Ruta `/portal/mis-vales`, tab "Mis vales" en `VecinoDashboard.jsx`
- QR: `qrcode.react@4.2.0` (`<QRCodeSVG>`), peer deps declaran React 19 explícito

`estadoEfectivo()` deriva el estado en lectura y **sigue haciendo falta** aunque
exista el cron: cubre la ventana de hasta 5 minutos entre que el vale se quema y
que el barrido lo persiste. No es la fuente de verdad — la autoridad es el server.

El QR contiene **solo el string del código** (ej. `HJZG-DMNE`), nunca una URL.

Label para el vecino: `quemado` se muestra como **"Perdido"** (palabra que entiende).
En el panel del staff conviene "Quemado", para distinguirlo de "Vencido" de un vistazo.

El código se genera en el cliente (`generarCodigoVale()`, charset sin caracteres
ambiguos, `crypto.getRandomValues`) con reintento ante `23505`. Funciona, pero lo
natural sería moverlo a un default/trigger del server en algún momento.

`ESTADO_BADGES` (`ValesEmitidos.jsx`, listado admin) tenía un fallback silencioso a
`emitido` para cualquier estado sin mapear en el badge — así fue como `quemado`
(agregado al CHECK después de escribir Fase 1) se mostró como "Emitido" durante
semanas sin que nadie lo notara (confirmado en vivo 2026-07-26 con `HJZG-DMNE`,
`quemado` real en DB, "Emitido" en pantalla). Fix 2026-07-26: `ESTADO_BADGES` ya
tiene las 6 entradas de `VALE_ESTADOS` (sumó `quemado`, mismo estilo sólido gris que
`vencido`); el fallback pasó a mostrar el estado crudo en gris neutro si algún día
aparece uno sin mapear — tiene que verse raro, no disfrazarse del más inocuo. Ambos
mapas de presentación (`ESTADO_BADGES` acá, `VALE_UI` en `valeEstado.js`) corren una
validación en dev (`console.warn`) contra `VALE_ESTADOS` si falta algún estado. La
lista de estados es una sola (`VALE_ESTADOS`); los estilos son dos a propósito
(badge sólido en el admin, pill suave en el portal del vecino — contextos distintos,
`cancelado` incluso difiere en color entre ambos porque el admin ya lo tenía en rojo
antes de esta lista y no había motivo para tocarlo).

### Estado del módulo

- **Fase 0** (schema, RLS, módulo activable, CRUD proveedores) — CERRADA
- **Fase 1** (emisión desde el admin) — CERRADA
- **Fase 2** (portal del vecino, "Mis vales", QR + countdown) — CERRADA y verificada
  en vivo 2026-07-26 con vale real `HJZG-DMNE`
- **Fase 3** (sección Proveedor para canjear) — CERRADA. Verificada en vivo
  2026-07-26 en dos rondas: la primera con el vecino demo como dueño Y beneficiario
  a la vez (ocultaba el camino real de un comerciante externo); la segunda —
  la que cuenta — con dos cuentas separadas (`comerciante.demo@realsayana.gob.ar`
  dueño de los 2 comercios de prueba, vecino demo solo beneficiario, todos los
  `proveedor_dispositivos` reseteados a desvinculado). Cubrió los dos caminos que
  la primera ronda no pudo probar: código de un vale ajeno todavía `emitido` (cae en
  "no encontrado", sin fuga de datos) y el preview con un vecino real que el
  comerciante no tiene permiso de ver directo en `vecinos` (resuelto con la RPC
  `preview_vale`, ver arriba). Vales de prueba usados: `4DF2-WUWU`, `NF7H-N3S9`,
  más los de la ronda anterior.
- **Fase 4 parte 1** (reporte de conciliación + anulación desde el admin) —
  CERRADA y verificada en vivo 2026-07-27 (ver detalle en
  "Actualizaciones sesión 27 julio 2026" más abajo).
- **Fase 4 parte 2** (gestión de proveedores para el staff — alta/baja/rol de
  `proveedor_accesos`, listado y desvinculación de `proveedor_dispositivos`) —
  CERRADA y verificada en vivo 2026-07-27 (ver detalle abajo). Resto de Fase 4
  (auditoría/reportes adicionales) sigue pendiente.
- **Fase 5** (`logAudit()` en emisión/anulación/canje/vincular/desvincular) —
  CERRADA y verificada en vivo 2026-07-28 (ver detalle abajo).

## Actualizaciones sesión 25-26 julio 2026

### `is_staff()` — CORREGIDO, releer si tocás RLS

Definida en mayo 2026 y usada en 17+ migraciones, solo reconocía `superadmin`,
`admin_comuna` y `operador`. **Ignoraba 5 de los 8 roles reales de staff**
(`admin_portal`, `usuario_admin`, `subadmin`, `usuario_sub`, `reporting`).

Como un SELECT bloqueado por RLS devuelve `[]` en silencio (no error), esto pasó
desapercibido en varias verificaciones "en vivo" del mismo día hasta que un INSERT
lo expuso con error real. Redefinida 2026-07-24 para incluir los 8 roles de staff
(`vecino` queda afuera a propósito).

**LECCIÓN:** un SELECT vacío por RLS es indistinguible de una lista genuinamente
vacía. Verificar permisos nuevos con datos que se SEPA que existen (contar filas),
no solo confirmar que "la pantalla cargó sin error".

**CONSECUENCIA a tener presente:** `is_staff()` se AMPLIÓ, no se corrigió puntualmente.
Toda policy que la use hoy le da acceso a los 5 roles que antes negaba en silencio.
Ver la entrada de Riesgos abiertos sobre policies `ALL`.

### Sistema de permisos unificado

La matriz "Permisos por persona" (antes solo `dependencias_acceso`, para dependencias
físicas) se extendió con `usuarios.modulos_acceso` — mismo shape jsonb, clave por
`'modulo'` en vez de `dependencia_id` — para cubrir Vales, Administración y Reclamos.

Un solo lugar para asignar Gestión/Administración, sea dependencia física o módulo
de gestión. Cuando no hay distinción operativa real, "cualquiera de los dos flags
alcanza" (igual que dependencias).

Vales no es una dependencia, opera a nivel municipio completo — por eso no se forzó
dentro de `dependencias_acceso`.

### Sidebar reorganizado

- "Gestión Municipal" → renombrada **"Gestión de la Comuna"** (Portal Web, Vales,
  Administración, Reclamos — accesible a staff con permiso puntual)
- Nueva sección **"Tu Comuna"** al final de todo (Config. General, Usuarios,
  Auditoría, Importador, Dependencias, Reportes e informes) — lo más sensible

### Timezone en Vales — por qué no aplica el patrón de bugs anterior

Todas las columnas de tiempo de `vales` son `timestamptz` y se comparan contra
`now()`, que también es absoluto. No hay conversión de zona en el medio que pueda
salir mal.

Los 14 bugs de timezone de julio eran de columnas `date`, donde
`toISOString().split('T')[0]` devolvía el día anterior. **Es una clase de problema
distinta — no aplicar el patrón `ARG_OFFSET` acá.**

El SQL Editor de Supabase muestra en UTC. Argentina es UTC-3. Para ver en hora local:
`set timezone = 'America/Argentina/Buenos_Aires';`

**Excepción confirmada en Fase 4 parte 1 — el filtro de fechas del reporte de
conciliación SÍ necesita `ARG_OFFSET`.** Lo de arriba aplica a comparaciones
*internas* del sistema (RPC vs. `now()`, ambos timestamptz/instantes absolutos,
sin días de calendario de por medio). El reporte de conciliación es distinto: el
staff elige un rango de **días** ("Desde"/"Hasta", inputs `type="date"`,
`YYYY-MM-DD`) pensando en días de Argentina, no en instantes. Convertir esos días
a límites de comparación contra `canjeado_en` (timestamptz) sin el offset explícito
— tal como venía advertido en la sección "RANGO DE FECHAS — la trampa" del ticket
original — correría los canjes de las últimas horas de cada día al día siguiente
para Postgres, igual que los 14 bugs de columnas `date`, aunque acá la columna
subyacente sea timestamptz. `useValesConciliacion()` (`useVales.js`) arma
`${fechaDesde}T00:00:00${ARG_OFFSET}` / `${fechaHasta}T23:59:59.999${ARG_OFFSET}`
— mismo patrón que `useAuditLog.js`. Verificado en vivo 2026-07-27 con vales
canjeados dentro del mes actual (Desde `01/07/2026`, Hasta `31/07/2026`,
default calculado con `todayArgYMD()`).

### Verificación en vivo de Fase 2 (2026-07-26)

Vale real `HJZG-DMNE`, $5.000, vigencia 24hs, emitido por Luis Nicolás Álvarez al
vecino demo (DNI 99888777). Ciclo completo verificado contra la base, no solo en
pantalla: `emitido` → `abierto` (ventana exacta de 30 min) → `quemado` por el cron.

Confirmado además que el cron corrió dos veces con el vale abierto **sin tocarlo**
— valida la rama negativa de `expirar_vales()`.

Colores medidos en `rgb()`, no "se ve azul": `rgb(29,78,216)` = `#1D4ED8` para
Disponible, `rgb(201,168,76)` = `#C9A84C` para En uso. Cero verde.

### Nota de proceso — sesiones de navegador

Volvió a aparecer el síntoma de sesión arrastrada: entrar a `/login` (puerta de
STAFF) con una sesión de vecino viva en `localStorage` produce el mensaje
"Tu cuenta aún no fue habilitada en el sistema", que es la respuesta correcta a la
pregunta equivocada — la app buscó el `user_id` del vecino en `usuarios` y no lo
encontró.

Antes de diagnosticar cualquier problema de login: limpiar las claves `sb-*` del
Local Storage + hard refresh, y confirmar por qué puerta se está entrando
(`/login` = staff, portal = vecino).

## Actualizaciones sesión 27 julio 2026

### Vales Electrónicos — Fase 4 parte 1: reporte de conciliación + anulación (CERRADA)

Reporte de conciliación (`ValesConciliacionTab.jsx`, tab "Conciliación" dentro de
`/admin/vales`) y anulación desde el admin (`AnularValeModal.jsx` +
`ValeDetalleModal.jsx`). Verificado en vivo 2026-07-27 con sesión real de Luis
(staff), no service role — importante porque un embed que vuelve `null` bajo RLS
es indistinguible de un embed vacío hasta que se prueba con la sesión real (mismo
tipo de bug que el "Vecino: —" de `preview_vale` en Fase 3).

**RPC `anular_vale(p_codigo text, p_motivo text) RETURNS vales`** (ya vivía en
prod, no escrita en esta sesión) — contrato:
- Solo staff/superadmin puede ejecutarla (chequeo de permiso corre ANTES que la
  búsqueda del vale — confirmado en vivo: un código inexistente devuelve "Sin
  permiso para anular vales", no "vale no encontrado", si quien llama no es staff).
- `p_motivo` obligatorio, rechaza vacío.
- **Solo transiciona `emitido` → `cancelado`.** Un vale ya `abierto` NO se puede
  anular — el vecino puede estar parado en el mostrador con el QR abierto en ese
  momento; permitir la anulación ahí le pisaría el canje a mitad de operación. Por
  eso el botón "Anular" en `ValesEmitidos.jsx` se muestra únicamente cuando
  `estado === 'emitido'` (además del chequeo real que hace la RPC del lado del
  server — la UI no es la única defensa).
- Si la RPC rechaza (ej. el vale pasó a `abierto` entre que se cargó la lista y se
  apretó "Confirmar anulación"), el mensaje se propaga tal cual — a diferencia de
  `canjear_vale`/`Proveedor.jsx`, acá no hay `traducirErrorCanje()` que traduzca
  errores conocidos.
- Deja `estado='cancelado'` + `anulado_en`, `anulado_por` (FK a `usuarios`),
  `motivo_anulacion`. `ValeDetalleModal.jsx` muestra los 3 solo cuando
  `estado === 'cancelado'`.

**Decisión de diseño — el CSV es detalle transaccional, sin filas de subtotal.**
Los totales (un total en $ + una línea por cada unidad distinta, nunca fusionados
porque `monto` y `cantidad`+`unidad` son mutuamente excluyentes por
`chk_vales_monto_o_cantidad`) se calculan y muestran **solo en pantalla**
(`totalesComercio()` en `ValesConciliacionTab.jsx`). El CSV exportado es una fila
por vale canjeado, sin agregados. Motivo: si el total viviera calculado en dos
lugares (pantalla + archivo exportado), un cambio futuro en la lógica de un solo
lado los haría divergir sin que nadie lo note hasta que alguien concilie mal un
pago — mismo criterio que ya rige `VALE_ESTADOS` como lista única de estados
(nunca mantener la misma matemática/enumeración en dos sitios que puedan
desincronizarse). Separado de esto, pero relacionado: `monto`, `cantidad` y
`unidad` son **3 columnas separadas** en el CSV (nunca una columna "Importe"
fusionada) — así nadie puede seleccionar una sola columna en Excel, hacer
autosuma, y sumar pesos con kilos sin darse cuenta. Confirmado con archivo real
exportado en vivo: fila con `Monto=""` y `Cantidad`/`Unidad` pobladas
(`"","5","lt"` para `X5GQ-MDX7`), BOM UTF-8 presente (`ef bb bf`, confirmado con
`xxd`) para que Excel muestre bien los acentos ("Código", "Descripción").
Decidido explícitamente con el cliente 2026-07-27 — no agregar filas de subtotal
al CSV sin volver a discutirlo.

**`useValesConciliacion()` y `ARG_OFFSET`** — ver el nuevo apartado en
"Timezone en Vales" más arriba: el filtro de fechas del reporte SÍ necesita el
offset explícito de Argentina, a diferencia del resto del módulo Vales (que son
todas comparaciones timestamptz-contra-timestamptz sin días de calendario
involucrados).

**Verificado en vivo 2026-07-27** (sesión de Luis + vecino demo + Comerciante
Demo, producción): emitidos 3 vales de prueba nuevos — `4ZSE-6WKC` (12 kg),
`X5GQ-MDX7` (5 lt), `SK9N-W5BP` ($999, para anular). El caso que más importaba
probar — dos unidades distintas canjeadas en el mismo comercio — dio bien:
Almacén Don Ramón mostró `Total: $7.000` / `Total: 12 kg` / `Total: 5 lt` en
tres líneas separadas, nunca "17" ni kg+lt fusionados. `canjeado_por` resolvió a
nombres reales ("Vecino, Demo", "Comerciante, Demo") en las 5 filas, cero blancos.
`SK9N-W5BP` anulado con motivo real, verificado que "Anular" desaparece del
listado y que el detalle muestra motivo + fecha + anulador real ("Luis Nicolás
Álvarez"). Los 3 vales de prueba quedaron en prod — sumados a la entrada de
limpieza pendiente en "Riesgos abiertos".

### Vales Electrónicos — Fase 4 parte 2: gestión de proveedores para el staff (CERRADA)

Hasta esta fase, `proveedor_accesos` (quién puede canjear/vincular en nombre de
un comercio) y `proveedor_dispositivos` se administraban por SQL a mano — un
comercio nuevo no podía operar hasta que alguien corriera un insert. Nueva
pantalla en `/admin/vales/proveedores/:id` (`ProveedorDetalle.jsx`, botón
"Gestionar" en el listado de `Proveedores.jsx`), dos secciones:

- **Personas autorizadas** — CRUD directo con el cliente (`proveedor_accesos_staff_all`
  es `FOR ALL`, sin RPC): alta reusando el mismo buscador de vecino de
  `EmitirValeModal` (extraído a `VecinoBuscador.jsx`, componente compartido),
  cambio de rol inline, activar/desactivar. Si el comercio queda con cero
  `responsable` activos, banner visible (no bloqueante): "Este comercio no
  tiene ningún responsable. Nadie va a poder vincular un teléfono, así que no
  va a poder canjear vales."
- **Teléfonos** — solo lectura + desvincular (`rpc('desvincular_dispositivo')`,
  tiene bypass de staff). Sin botón de vincular a propósito: la RPC exige
  `proveedor_accesos` de quien llama (un staff nunca tiene uno) y el
  `device_id` vive en el localStorage del celular del comerciante — vincular
  es siempre acción del responsable desde su propio teléfono.

**`VecinoBuscador.jsx`** (`src/components/admin/`) — buscador de vecino por
DNI/nombre con debounce (250ms), extraído tal cual de `EmitirValeModal.jsx`
(Fase 1) porque Fase 4 parte 2 necesitaba el mismo buscador en "Agregar
persona autorizada". Controlado desde afuera solo por `vecino` (el
seleccionado) + `onSeleccionar` — la búsqueda en sí es estado interno.
`TurnoPresencialModal.jsx`/`SumReservaFormModal.jsx` tienen su propia copia
del mismo patrón y **no se tocaron** — no hay pedido de unificar esos dos,
este componente es el único punto de verdad para los dos lugares que sí lo
comparten (emitir vale, agregar acceso). Busca con `.or()` — un `ilike` por
columna (`dni`, `apellido`, `nombre`, `nombre_completo`), nunca una
concatenación de las dos palabras — por eso encuentra por DNI exacto o por
una sola palabra del nombre, pero no por "Apellido Nombre" con espacio
(comportamiento heredado, no una regresión de esta fase).

**Constraint no documentado hasta ahora, encontrado en la verificación en
vivo:** `uq_proveedor_accesos_proveedor_vecino` — una persona tiene **un solo**
acceso por comercio. "Agregar de nuevo" a alguien que ya tiene un acceso
(activo o inactivo) es la misma fila: hay que reactivarla/cambiarle el rol
desde el listado, no crear una nueva. El primer intento de agregar dos veces
al mismo vecino mostraba el error crudo de Postgres
(`duplicate key value violates unique constraint...`) directo en la pantalla
del empleado — `createProveedorAcceso()` (`useProveedores.js`) ahora atrapa
`error.code === '23505'` y muestra: "Esta persona ya tiene un acceso a este
comercio. Buscala en la lista de abajo para reactivarla o cambiarle el rol."
De paso se encontró que `handleCambiarRol`/reactivar en `ProveedorDetalle.jsx`
no tenían `onError` — una falla ahí no mostraba nada (ni crudo ni amigable,
directamente nada) — se agregó un banner de error de página con el mismo
patrón que el resto del admin.

**Desactivar acceso usa modal propio (`DesactivarAccesoModal.jsx`), no
`confirm()` nativo**, con dos textos distintos según el caso:
- Secundario (o responsable que no es el último activo): "{nombre} no va a
  poder canjear más vales de {comercio}."
- Último responsable activo: "{nombre} es el único responsable de {comercio}.
  Si lo desactivás, nadie va a poder vincular teléfonos y el comercio no va a
  poder canjear vales." — el caso que importa, porque es el estado inválido
  que el banner de la ficha ya avisa DESPUÉS; conviene avisarlo ANTES de
  crearlo. El cálculo excluye el propio acceso a desactivar del conteo de
  "otros responsables activos" (si no, siempre daría "no sos el último").

Desvincular un teléfono también tiene modal propio
(`DesvincularDispositivoModal.jsx`) con `logAudit()` — es sensible, corta la
operatoria de canje de un comercio desde la comuna.

**Verificado en vivo 2026-07-27**, sesión real de Luis (staff), con los 2
proveedores de prueba (Almacén Don Ramón, Panadería La Esquina). El estado de
partida no coincidió con lo que se esperaba en varios puntos del checklist
(Comerciante Demo ya estaba activo/responsable en Almacén en vez de inactivo,
el acceso en `secundario` de una prueba anterior era el de Vecino Demo y no el
de Comerciante Demo) — se readaptó el orden de la prueba en vivo con el
cliente en vez de asumir el checklist original:
- Desactivar al único responsable activo (Comerciante Demo en Almacén) mostró
  el texto de "único responsable" correcto, y el banner de "sin responsables"
  apareció después de confirmar.
- Reactivar a Vecino Demo (secundario) no hizo desaparecer el banner;
  cambiarle el rol a responsable sí.
- El embed `vinculado_por` en Teléfonos mostró "Comerciante, Demo" con sesión
  real de staff (no service role) — mismo tipo de bug que ya mordió dos veces
  antes (embed que vuelve `null` en silencio bajo RLS).
- El buscador de `VecinoBuscador` encuentra por DNI exacto y por una sola
  palabra del nombre («Demo» encontró a los dos Demo); no encuentra por
  nombre completo con espacio («Vecino Demo» → sin resultados) — comportamiento
  heredado tal cual de `EmitirValeModal`, no una regresión de esta fase.
- El toggle "Ver también los desvinculados" en Teléfonos funciona (confirmado
  por network: sin tildar manda `...&activo=eq.true`, tildado lo saca) — no
  había ningún dispositivo desvinculado real para verificar visualmente
  porque ninguna prueba anterior en esta sesión llegó a completar un
  `desvincular_dispositivo` real contra ese proveedor.
- El estado final de prueba en Almacén Don Ramón quedó con Vecino Demo Y
  Comerciante Demo activos como `responsable` (cambio deliberado de la
  verificación en vivo, no accidental).

### Vales Electrónicos — historial diferenciado por rol (Fase 4 parte 2)

Un secundario opera con su propio celular en el mostrador — sin filtrar esto,
ese teléfono terminaría acumulando un padrón de quién recibe ayuda social en
el pueblo y por cuánto. El dato tiene que pasarle por las manos para operar
el canje, pero no puede quedársele después.

**RPC `historial_canjes_proveedor(p_proveedor_id)`** (`SECURITY DEFINER`) —
decide QUÉ COLUMNAS devolver según el rol real de quien llama para ESE
comercio, nunca preguntado al cliente:
- **Responsable** ve el detalle completo: `codigo, canjeado_en, estado,
  descripcion, monto, cantidad, unidad, vecino_nombre, vecino_dni,
  canjeado_por`.
- **Secundario** ve solo `codigo, canjeado_en, estado` — filtrado además por
  `canjeado_por = quien llama` (sus propios canjes, no los del comercio
  entero).

**Por qué RPC y no un SELECT directo:** la policy `vales_proveedor_select_ventana`
ya no deja a un secundario ver vales `canjeado` por consulta directa (RLS
filtra filas, no columnas) — un SELECT acá le devolvería `[]` en silencio a
cualquier secundario, sin error (mismo modo de falla ya visto con el
"Vecino: —" de `preview_vale` en Fase 3).

**Cliente nunca pregunta ni infiere el rol** — `ComercioCanjeadosCard`
(`Proveedor.jsx`) detecta la vista reducida mirando si la fila trae
`vecino_nombre` (si vino, es un dato real de un canje real, no algo que se
pueda simular con la ausencia de otro campo). Si es la vista reducida,
muestra: "Ves los vales que canjeaste vos. El detalle completo está en la
cuenta del responsable del comercio." Sin filas no hay forma de saber qué
vería este vecino si hubiera canjes — no se muestra la nota en ese caso, no
hace falta explicar una restricción sobre una lista vacía.

Se agregó también el historial para el comercio **activo** (el que el
dispositivo tiene vinculado ahora) — antes de esta fase `ComercioCanjeadosCard`
solo se montaba para "otros comercios" del mismo dueño, así que el caso más
común (un solo comercio) nunca mostraba ningún historial.

Encontrado y corregido en la verificación en vivo: `canjeado_por` ya venía en
la respuesta de la RPC pero `ComercioCanjeadosCard` nunca lo renderizaba —
agregado (`{'canjeado_por' in v && <p>Canjeado por: {v.canjeado_por}</p>}`).

Archivo: `useProveedorVecino.js` → `fetchHistorialCanjesProveedor()` /
`useHistorialCanjesProveedor(proveedorId)`.

### Vales Electrónicos — Fase 5: logAudit() en canje, vincular y desvincular (CERRADA)

Emisión y anulación ya logueaban (`useVales.js`, ver Fase 4 parte 1). Faltaba
el canje, y vincular/desvincular desde el portal del comerciante (antes solo
logueaba la desvinculación hecha por staff, en `useProveedores.js`).

`useProveedorVecino.js` ahora tiene su propio `logAuditVecino()` (mismo patrón
`.catch()` best-effort que el resto del repo) sobre `createAuditLogVecino()`
— `usuario_id` siempre `null`, quien ejecuta es un vecino (comerciante), no
staff. Los tres logs corren DESPUÉS de que la RPC correspondiente tuvo éxito,
nunca antes ni envueltos en el mismo try/catch de la mutación — un fallo del
log no puede hacerle creer al comerciante que el canje no se hizo.

- `canjear_vale` → `entidad:'vales'`, `accion:'update'`, `entidadId` el id
  del vale; `metadata` con código, proveedor (id+nombre), y monto o
  cantidad+unidad.
- `vincular_dispositivo`/`desvincular_dispositivo` → `entidad:
  'proveedor_dispositivos'`, `entidadId` el `device_id` (ninguna de las dos
  RPCs devuelve una fila con `id` predecible — `desvincular_dispositivo`
  devuelve `boolean` — así que el device_id es el identificador estable).

**Verificado en vivo 2026-07-28** con el ciclo completo real: Luis emitió
`5D88-YREE` ($1.500, Almacén Don Ramón) → Vecino Demo abrió el QR → Comerciante
Demo lo canjeó desde `/portal/proveedor` → confirmado por SQL directo (no
service role para el chequeo de permisos de pantalla, ver hallazgo abajo) que
la fila quedó con `entidad:'vales'`, `accion:'update'`, `usuario_id:null`,
código y monto correctos, y el `vecino_id` del comerciante ejecutor en
`datos_despues`.

**Dos hallazgos de esta verificación, anotados pero sin arreglar todavía:**
- La fila de **emisión** de vale guarda `datos_despues: {}` (vacío) — a
  diferencia del canje (Fase 5) y la anulación (Fase 4 parte 1), que sí
  llevan `metadata`. `createVale()` (`useVales.js`) nunca le pasó `metadata`
  a `logAudit()` desde que se escribió en Fase 1 — inconsistencia entre
  fases, no una regresión de esta sesión.
- **Luis (rol `admin_portal`) no tiene acceso a `/admin/auditoria`** — la
  pantalla está gateada a `admin_comuna`/`superadmin` únicamente. No es un
  bug (es el gate de esa pantalla, no de esta fase), pero vale tenerlo
  presente: si el director real de una dependencia no tiene rol
  `admin_comuna`, no puede revisar el log de auditoría aunque tenga todos
  los demás permisos de gestión.
