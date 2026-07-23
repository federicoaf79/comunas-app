# Auditoría de UX — Panel Admin Comunas
**Fecha:** 23-jul-2026 · **Tenant:** Real Sayana · **Sesión:** staff (Enrique, cuenta dual) · **Alcance:** panel admin completo, todas las pestañas internas de cada módulo.

Nota: por instrucción explícita, **no se tocó código** — este es 100% un informe. Se excluyó del alcance la falta de integrador real de WhatsApp/Twilio (ya conocida, se aborda después de Vales Electrónicos).

---

## Resumen ejecutivo

Dos problemas transversales concentran la mayoría de los hallazgos de ALTO impacto:

1. **Bug sistémico "hora de turno faltante"**: `turnos_agenda` no tiene columna `fecha_hora` (solo `fecha` + `hora_inicio` + `hora_fin`). Hoy antes de esta auditoría ya se había corregido este bug en 3 lugares puntuales (Vista Semana de Sala PA, Odontología y Juez de Paz). Esta auditoría encontró 6 pantallas más con el mismo síntoma. **Actualización 2026-07-23 (sesión de fixes posterior):** investigado punto por punto — 5 de los 6 eran el mismo bug de fondo y ya están **RESUELTOS**: Dashboard (2 widgets), CRM Vecinal (ficha → tab Turnos), CIC Salud (Vista Día), Sala de Primeros Auxilios ("Agenda del día") y SUM (tabla de reservas — causa distinta: `sum_reservas` no tiene `hora_inicio`/`hora_fin`, la franja vive en la columna `horario`). El 6° punto (Agencia de Desarrollo) **no era el bug** — ver detalle en su sección, sección "Agencia de Desarrollo" más abajo.
2. **Datos duplicados/divergentes entre pantallas que muestran "lo mismo"**: Patrimonio mostraba los mismos 4 KPIs sea cual sea la pestaña (Inmuebles o Muebles); el módulo "Seguros" parece desconectado de las pólizas que aparecen en Patrimonio; el stock crítico difiere entre Dashboard e Inventario (6 vs 5). **Actualización 2026-07-23:** ✅ **RESUELTO** el KPI de Patrimonio (ahora filtra por tipo de bien). Seguros vs Patrimonio se investigó a fondo: **no es un bug de query, son dos conceptos de datos genuinamente distintos** (ver sección "Seguros") — no se forzó una unificación, se documentó la diferencia y se propuso el camino de producto para el futuro.

Además, dos hallazgos puntuales de alto impacto no relacionados con lo anterior:
- **Odontología mostraba en pantalla completa (no solo al imprimir) una planilla con nombre, DNI y teléfono de pacientes de OTRA dependencia** (Sala de Primeros Auxilios) — era una fuga de datos entre dependencias, no solo un glitch visual. ✅ **RESUELTO** (ver CLAUDE.md, sesión previa).
- **La Agenda pública (admin y portal) está vacía ahora mismo** — todos los eventos de ejemplo vencieron el 30/06/2026 y nadie cargó nada para julio. 🟠 **Investigado, SQL lista** — pendiente de que el usuario la corra (ver sección "Agenda pública (admin)").

También se cerró la ficha de vecino en CRM Vecinal: botón Editar, alergias/contacto de emergencia/grupo sanguíneo visibles, y label de turno real en vez de "Turno" genérico — ✅ **RESUELTO 2026-07-23**.

---

## Índice
1. [Dashboard](#dashboard)
2. [CRM Vecinal](#crm-vecinal)
3. [Tablero de turnos](#tablero-de-turnos)
4. [Administración](#administración)
5. [Inventario](#inventario)
6. [Auditoría](#auditoría)
7. [Patrimonio](#patrimonio)
8. [Rendición](#rendición)
9. [Usuarios](#usuarios)
10. [Configuración del portal](#configuración-del-portal)
11. [Portal Web — Noticias](#portal-web--noticias)
12. [Flota](#flota)
13. [Seguros](#seguros)
14. [CIC — Servicios de Salud](#cic--servicios-de-salud)
15. [Sala de Primeros Auxilios](#sala-de-primeros-auxilios)
16. [Odontología](#odontología)
17. [Polideportivo](#polideportivo)
18. [Agencia de Desarrollo](#agencia-de-desarrollo)
19. [Juez de Paz](#juez-de-paz)
20. [SUM](#sum)
21. [Obras públicas](#obras-públicas)
22. [Agenda pública (admin)](#agenda-pública-admin)

---

## Dashboard

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ✅ RESUELTO (2026-07-23) | ~~"Turnos de hoy" y "Actividad reciente" muestran la hora del turno como "—" en todas las filas (bug sistémico de fecha/hora, ver resumen ejecutivo).~~ Fix: se combina `fecha`+`hora_inicio`+`ARG_OFFSET` en un `useMemo` sobre `turnosHoy` y `proximosTurnos` en `AdminDashboard.jsx`. Verificado en vivo. | — |
| 🟡 MEDIO | Las 4 KPI cards (Turnos hoy, Vecinos registrados, Mensajes del mes, Denuncias abiertas) tienen todas una barra de progreso, pero solo "Turnos hoy" tiene un máximo con sentido — en las otras la barra es decorativa y puede leerse como dato real. | Sacar la barra donde no aplica, o reemplazar por el dato de variación ("+6 vs mes anterior") sin barra. |
| 🟡 MEDIO | El banner superior dice "2 turnos pendientes para hoy" pero la card "Turnos hoy" dice "6, 3 atendidos" (quedarían 3, no 2) — terminología de estados no coincide entre banner y card. | Unificar terminología o aclarar qué cuenta cada número. |
| 🟢 BAJO | "Actividad reciente" mezcla turnos/gastos/otros eventos sin filtro; incluye un registro de prueba "TEST auditoría — borrar" mezclado con actividad real. | Filtro por tipo de evento; limpiar datos de prueba del entorno. |

## CRM Vecinal

### Listado
| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | Columna "EMAIL" vacía en el 100% de las filas visibles — ocupa espacio sin aportar. | Sacarla de la tabla si casi nunca se carga; mostrar solo en la ficha. |
| 🟡 MEDIO | Columna "ACCIONES" en el header pero ninguna fila tiene botón/ícono — la fila entera ya es clickeable. | Sacar la columna o agregar accesos rápidos reales (WhatsApp, ver turnos). |
| 🟢 BAJO | 66 vecinos renderizados en una sola página larga (scroll de página, sin paginación) — no escala con el padrón real. | Paginación o virtualización. |

### Ficha de vecino (Datos / HC / Turnos / SMS)
| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ✅ RESUELTO (2026-07-23) | ~~Tab "Datos" no tiene botón de "Editar".~~ Fix: nuevo botón "Editar" que reusa `VecinoFormModal.jsx` (ahora acepta un prop `vecino` opcional para modo edición, precargado con los datos actuales). Verificado en vivo: el modal abre con Apellido/Nombre/DNI/Teléfono/Dirección precargados y título "Editar vecino". | — |
| ✅ RESUELTO (2026-07-23) | ~~Tab "Datos" no muestra alergias, contacto de emergencia ni grupo sanguíneo.~~ Fix: `DETAIL_COLS` de `fetchVecino()` ahora selecciona esos campos; `VecinoDatos.jsx` los muestra (alergias con el mismo estilo de alerta que `AtencionDrawer.jsx`). Verificado en vivo con el vecino de prueba (grupo sanguíneo O+, contacto de emergencia y "Sin alergias conocidas" visibles en la ficha). | — |
| ✅ RESUELTO (2026-07-23) | ~~Tab "Turnos": sin fecha/hora visible (bug sistémico de hora) y cada fila decía literalmente "Turno" repetido.~~ Fix: `VecinoTurnos.jsx` combina `fecha`+`hora_inicio`+`ARG_OFFSET`, y el título de cada fila ahora muestra la dependencia (o especialidad, o N° de turno) real en vez de "Turno". Verificado en vivo: "Sala de Primeros Auxilios", "Juez de Paz", etc. | — |
| 🟢 BAJO | Tab "HC" solo muestra consultas/derivaciones — la separación con "Datos" (que no muestra lo clínico) no es clara para quien no conoce el modelo de datos. | — |

## Tablero de turnos
**Buen ejemplo — casi sin hallazgos.** Es la única pantalla, junto con Juez de Paz e Inventario/Administración, donde la hora del turno se ve siempre correctamente ("09:00 · Vecino, Demo") tanto en Vista Semana como en Vista Día. Vale usarla de referencia para corregir el resto del panel.

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟢 BAJO | El date picker nativo convive con los botones "← Anterior / Hoy / Siguiente →" — dos formas de cambiar de fecha en la misma barra. | Agrupar visualmente ambos controles. |

## Administración

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | El Dashboard de Administración (tab por defecto) duplica los mismos 3 números financieros que ya se ven en el Dashboard principal, solo con formato distinto. | El widget financiero del Dashboard principal podría linkear a este dashboard en vez de duplicar los números. |
| 🟢 BAJO | En el sidebar, "Gastos e ingresos" queda resaltado como activo aunque se esté viendo el "Dashboard" (sección por defecto) — el resaltado no sigue la sección real. | Dar su propio ítem de sidebar al Dashboard, o corregir el resaltado. |

**Gastos / Ingresos** — sin hallazgos de impacto: tabla clara, fechas correctas, export CSV visible, estados vacíos bien resueltos.

## Inventario

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | El KPI "En estado crítico" en Inventario muestra 6, pero el mismo dato en el Dashboard principal ("Stock crítico") muestra 5 — mismo momento, mismo entorno. | Confirmar que ambos widgets usan el mismo criterio/query, o aclarar la diferencia si es intencional. |

Resto de Inventario (Stock general, Solicitudes y órdenes) — sin hallazgos nuevos más allá del ya resuelto hoy (N° de orden obligatorio).

## Auditoría

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟠 MEDIO/ALTO | Tab "Cambios": la descripción de un DELETE sobre `autoridades`/`profesionales` muestra un UUID crudo ("Autoridad eliminada (127f3b5a-...)") en vez de un nombre, a diferencia de ALTA/MODIFICACIÓN que sí muestran el nombre real — el log de auditoría pierde su propósito justo en la acción más irreversible. | Capturar el nombre/label del registro ANTES de borrarlo e incluirlo en la descripción del DELETE. |
| 🟡 MEDIO | Tab "Cambios": columna "ENTIDAD" muestra el nombre crudo de la tabla (`sum_reservas`, `turnos_agenda`, etc.) en vez de una etiqueta legible. | Diccionario simple entidad→label humano. |
| 🟢 BAJO | Tab "Resumen": "Top 5 usuarios más activos" incluye una fila "Desconocido" sin explicación (son acciones de vecinos sin cuenta de staff). | Renombrar a "Acciones de vecinos (sin staff)". |
| 🟢 BAJO | Tab "Resumen": no queda clara la relación entre "Cambios registrados" (44) y "Total eventos" (79). | Aclarar con subtítulo o tooltip qué compone el total. |

Tab "Accesos" — sin hallazgos, tabla clara.

## Patrimonio

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ✅ RESUELTO (2026-07-23) | ~~Las pestañas "Bienes Inmuebles" y "Bienes muebles de capital" mostraban exactamente los mismos 4 KPIs (Valor fiscal total, Con seguro activo, Requieren atención) sin filtrar por tipo de bien.~~ Causa: `useResumenPatrimonio()` solo desglosaba el CONTEO por tipo (`porTipo`), no esas 3 métricas — usaban el total global sin importar la pestaña. Fix: `fetchResumen()` ahora calcula también `porTipoDetalle[tipo]` con valor fiscal/seguros/requieren atención por tipo de bien; ambas pestañas leen su propio detalle. Verificado en vivo: Inmuebles $126.300.000/3/3, Muebles $137.600.000/2/3 — ya no coinciden. **Nota:** la pestaña "Seguros y valuación" no se tocó — a propósito calcula sus propios KPIs sobre TODO el patrimonio con datos de seguro cargados (concepto de producto distinto, no el mismo bug), así que puede seguir mostrando un número que coincida por coincidencia de datos, no por error. | — |
| 🟡 MEDIO | Posible duplicación de datos: "Cementerio Municipal" aparece dos veces (una con N° de inventario y observaciones, otra sin N° y sin observaciones, valores fiscales distintos); mismo patrón con "Edificio Municipal Principal" vs "Edificio Comisión Municipal". 4 de 11 inmuebles no tienen N° de inventario. | Confirmar si son bienes distintos o carga duplicada; completar N° de inventario faltante. |
| 🟢 BAJO | Columna "COMPAÑÍA" vacía en todas las filas de "Seguros y valuación". | Evaluar si vale la pena mostrarla sin datos cargados. |

## Rendición

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | "Resumen" (acumulado anual, $6.647.000 ejecutado) y "Gastos por partida" (mes actual, $420.000) muestran magnitudes muy distintas del "mismo" concepto sin aclarar que difieren en el período — puede leerse como "faltan datos" en vez de "es solo julio". | Subtítulo tipo "Mostrando: julio 2026" en Gastos por partida. |
| 🟢 BAJO | El badge "ESTADO: En término" es redundante con la barra de % de al lado. | — |
| 🟢 BAJO | "Ejecución · 7% — En término" a mitad de año (58% del año transcurrido) — no se pudo confirmar la lógica real detrás de "En término". | Confirmar con el cliente qué regla define ese estado. |

## Usuarios

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🔴 ALTO | Inconsistencia de rol para el mismo usuario entre pestañas: "Lista de usuarios" muestra a Dra. Laura Ramírez con el rol vacío ("Asignar rol..."), pero "Permisos por persona" muestra "SUB_ADMIN" para la misma persona. | Unificar la fuente del dato de rol entre ambas pestañas. |
| 🟡 MEDIO | El rol se muestra como enum crudo "SUB_ADMIN" en "Permisos por persona", inconsistente con "ADMIN COMUNA"/"ADMIN PORTAL". | Mapear todos los roles a labels humanos. |
| 🟢 BAJO | Columna "ACCIONES" en "Lista de usuarios" muestra "—" para Admin Comuna sin explicación (probablemente por diseño, para no permitir desactivar administradores). | Tooltip explicando la restricción. |
| 🟢 BAJO | Abreviatura "G+A" en las tarjetas de "Permisos por persona" no se explica hasta abrir el detalle. | Texto completo o tooltip. |

## Configuración del portal

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | Tab "Fuentes RSS": cada fuente se identifica solo por su URL larga y técnica de Google News. | Agregar campo "Nombre" corto y mostrarlo en vez de la URL. |
| 🟡 MEDIO | Tab "Trámites del portal": cada checkbox no tiene etiqueta ("Visible en portal") — solo se entiende leyendo el párrafo de ayuda de arriba. Los turnos de Sala PA y Juez de Paz aparecen destildados (coherente con la decisión de producto documentada, pero no se puede confirmar solo mirando la UI). | Agregar el label "Visible en portal" junto a cada checkbox. |
| 🟢 BAJO | Tab "Historia": textareas bajos (4-5 líneas) para contenido largo — requiere doble scroll (página + textarea). | Textarea más alto o auto-resize. |
| 🟢 BAJO | Tab "Slides del Hero": el campo "URL de la imagen" expone y permite editar la URL cruda de Supabase Storage como texto libre, sin necesidad real de tocarlo. | Solo lectura, editable solo re-subiendo archivo. |

Tabs "Autoridades" y "Dependencias" — sin hallazgos de impacto.

## Portal Web — Noticias

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | El listado NO está ordenado cronológicamente (fechas saltan: 05-08, 05-01, 05-08, 05-04, 05-07...) — no se puede confiar en el orden visual para encontrar la última noticia. | Ordenar por fecha de publicación descendente. |

## Flota

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | El badge de estado usa dos palabras distintas para la misma situación aparente ("operativo" vs "activo" en vehículos distintos) sin criterio claro. | Confirmar si hay diferencia real de significado; unificar si no la hay. |

Tabs "Combustible", "Service" y "Alertas" — sin hallazgos (vacíos hoy, layout claro).

## Seguros

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🔵 INVESTIGADO (2026-07-23) — no es un bug de query, son datos genuinamente distintos | El módulo dedicado "Seguros" dice "0 pólizas / No hay pólizas cargadas", pero Patrimonio → "Seguros y valuación" muestra bienes con pólizas reales (POL-2026-001 a 005). Se investigó si era la misma tabla consultada distinto: **no lo es**. `bienes_patrimonio` (Patrimonio) tiene campos simples embebidos por bien (`seguro_compania`, `seguro_poliza`, `seguro_vencimiento`) — un dato liviano cargado a mano junto con el bien. `seguros`/`seguros_items` (módulo Seguros, `useSeguros.js`) es una entidad separada y más completa: compañía, tipo, tipo de cobertura, costo, vigencia desde/hasta, upload de PDF de la póliza, vinculada de forma polimórfica (`seguros_items.tipo_entidad`+`entidad_id`) a vehículos/bienes/lo que sea — pensada para gestionar pólizas reales, no solo anotarlas. Son dos conceptos de producto legítimamente distintos (uno es "¿este bien tiene un dato de seguro anotado?", el otro es "gestión real de pólizas"), no una query rota. | **No se fuerza una unificación.** Si el objetivo de producto es tener un solo lugar para pólizas, la migración natural sería cargar las pólizas reales en el módulo "Seguros" (con upload de PDF, etc.) y que `bienes_patrimonio` referencie esas pólizas via `seguros_items` en vez de repetir los datos a mano — pero eso es una decisión de producto/alcance mayor, no un fix de bug; queda pendiente de decidir con el cliente. |

## CIC — Servicios de Salud

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ✅ RESUELTO (2026-07-23) | ~~Vista Día (tab por defecto): ninguna fila muestra la hora del turno (bug sistémico).~~ Fix: se combina `fecha`+`hora_inicio`+`ARG_OFFSET` inline en el render de la lista de Vista Día de `CicSalud.jsx` (la Vista Semana ya lo hacía). Verificado en vivo. | — |
| 🟡 MEDIO | Vista Semana sí muestra hora, pero aparece un turno con hora "00:59" el jueves 23-jul dibujado dentro de la franja de las 07:00 — no se pudo confirmar si es un dato real mal cargado o un problema de posicionamiento en el grid. | Confirmar el dato real en `turnos_agenda`. |
| 🟢 BAJO | Datos de prueba visibles en producción ("TEST auditoría — atención de prueba/derivación") mezclados con turnos reales. | Limpiar antes de mostrar al cliente. |
| 🟢 BAJO | Vista de atención abierta: panel del paciente muestra "TURNO: —" y "MOTIVO: —" (mismo patrón de hora faltante). Positivo: sí muestra "⚠ Alergias no registradas" — sería el lugar correcto para reforzar también el hallazgo de alergias/contacto de emergencia de CRM Vecinal. | — |

## Sala de Primeros Auxilios

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ✅ RESUELTO (2026-07-23) | ~~"Agenda del día" (tab por defecto) muestra "—" en el lugar de la hora.~~ Fix: se combina `fecha`+`hora_inicio`+`ARG_OFFSET` inline en `SalaPrimerosAuxilios.jsx` para este widget (la Vista Semana ya lo hacía). Verificado en vivo: el turno de ABAN ahora muestra 12:48 también acá. | — |
| 🟠 MEDIO/ALTO | Tab "Profesionales": el subtítulo dice "Los vecinos ven su horario en el portal ciudadano", pero los 3 profesionales tienen el badge "Sin publicar" — contradicción directa entre subtítulo y badge. | Confirmar cuál de los dos refleja la realidad y corregir el otro. |

## Odontología

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🔴 ALTO (eleva un hallazgo ya anotado en CLAUDE.md como "BAJO, no investigado") | Al entrar a la pantalla, ANTES de la grilla real, se ve en pantalla completa (no solo al imprimir) una planilla imprimible de OTRA dependencia: "SALA DE PRIMEROS AUXILIOS", con su tabla de turnos incluyendo **nombre, DNI y teléfono de pacientes reales** que no tienen nada que ver con Odontología. No es solo un glitch visual — es exposición de datos de pacientes entre dependencias. Además el logo institucional se renderiza gigante empujando la agenda real hacia abajo, y la columna "Hora" de esa planilla también muestra "—" en todas las filas. | Priorizar el fix de por qué el bloque de impresión no está contenido en `@media print` y por qué trae datos de Sala PA en vez de Odontología. |

Agenda semanal real — sin turnos cargados hoy, grilla vacía, sin más hallazgos evaluables.

## Polideportivo

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟢 BAJO | El sidebar muestra "Polideportivo" con submenú completo, pero no está configurado como dependencia en Real Sayana — cualquier pantalla dice "Dependencia no configurada". | Ocultar el ítem del sidebar cuando el tipo de dependencia no está configurado para el municipio. |

## Agencia de Desarrollo

Buen ejemplo de diseño: banner "Esta dependencia tiene información incompleta..." con link directo "Completar ahora →", badges "Visible en portal ciudadano"/"ACTIVA" bien visibles.

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ⚪ DESCARTADO — no era el bug (investigado 2026-07-23) | Sub-tab "Turnos → Solicitudes": columna "HORA" vacía en todas las filas, incluso en una solicitud ya "confirmada" con fecha real. Se investigó junto con los otros 5 puntos del bug sistémico de hora — **es un falso positivo**: `turnoFechaHora()` en `DependenciaGestion.jsx` ya lee `hora_inicio` correctamente (código sin bug, con comentario explícito: "Si hora_inicio es null (Polideportivo/Agencia) → muestra solo fecha"). El formulario de solicitud del vecino (`SolicitarServicioDesarrollo.jsx`, portal) nunca pide una hora — son pedidos de servicio rural ("Romeo del campo", "Limpieza de represa") sin horario fijo, por diseño. El "—" en HORA es el comportamiento esperado, no un dato faltante. | No requiere fix. |

Sub-tabs "Hoja de ruta" e "Historial de atendidos" — sin hallazgos.

## Juez de Paz

Buen ejemplo (junto con Tablero de turnos): la hora se muestra correctamente tanto en "Turnos para hoy" como en la grilla semanal — confirma que el fix aplicado hoy sigue funcionando.

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟡 MEDIO | Tab "Expedientes" (documentado en CLAUDE.md) no tiene ningún punto de entrada real en la navegación — ni desde el sidebar ni desde tabs visibles en `/admin/dependencia/juzgado`. | Confirmar si es una funcionalidad real y accesible hoy; si lo es, exponerla en la navegación. |
| 🟢 BAJO | La columna "HORA" muestra segundos ("09:00:00") en vez de "09:00". | Recortar a HH:MM. |

## SUM

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| ✅ RESUELTO (2026-07-23) | ~~La tabla de reservas muestra "—" en "HORARIO", pero la Vista semanal de abajo sí muestra correctamente el horario para el mismo bloque.~~ Causa distinta a los otros 4 puntos: `sum_reservas` no usa `turnos_agenda` y nunca tuvo columnas `hora_inicio`/`hora_fin` — la franja horaria vive en la columna `horario` (manana/tarde/noche/dia_completo). Fix: `horarioLabel()` ahora deriva el rango desde `r.horario`, con los mismos rangos que `HORARIO_OPTS` del modal de alta. Verificado en vivo. | — |
| 🟢 BAJO | Dato de prueba visible en producción ("TEST PRUEBA final"). | Limpiar antes de mostrar al cliente. |

## Obras públicas

Buen ejemplo de diseño: tarjetas con barra de progreso, %, presupuesto vs gastado, badges de estado con color, acciones claras.

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟢 BAJO | Las 4 obras cargadas muestran "Sin dependencia" pese a existir un filtro por dependencia. | Confirmar si el campo se usa en la práctica. |

## Agenda pública (admin)

| Impacto | Hallazgo | Sugerencia |
|---|---|---|
| 🟠 INVESTIGADO (2026-07-23) — SQL lista, pendiente de ejecución por el usuario | La Vista Semana de la semana actual está completamente vacía — la vigencia de todos los eventos de ejemplo venció y nadie cargó nada para julio en adelante. Investigado el detalle: de los 10 eventos en `agenda_publica`, **6 son recurrentes** (`recurrente=true`) con `fecha_inicio=2026-06-01`/`fecha_fin=2026-06-30` — solo necesitan que se extienda `fecha_fin`, no contenido nuevo. Los otros **4 son puntuales** (Charla 19/6, Festival 21/6, Vacunación 25/6, Taller 28/6) — eventos de una fecha específica ya pasada; moverlos a una fecha futura sería inventar contenido, no "extender vigencia", así que se dejaron como están (correctamente ya no aparecen como próximos). No es un bug de código — es data de seed que expiró. Por ser una escritura directa a producción, se le pidió al usuario el UPDATE de SQL en vez de ejecutarlo directamente (ver CLAUDE.md). | Correr el UPDATE que extiende `fecha_fin` de los 6 eventos recurrentes a `2026-12-31` (SQL entregado al usuario). |
| 🟢 BAJO | Formato de hora con segundos ("08:00:00 – 14:00:00"), mismo detalle que en Juez de Paz. | Recortar a HH:MM. |

---

## Priorización sugerida para la próxima sesión de fixes

1. ~~**Fix único de mayor apalancamiento**: el patrón de combinación fecha+hora_inicio, aplicado a los ~6 puntos restantes.~~ ✅ **RESUELTO 2026-07-23** — investigados y arreglados los 5 puntos reales (Dashboard x2, CRM Vecinal ficha, CIC Salud Vista Día, Sala PA "Agenda del día", SUM); Agencia de Desarrollo resultó ser un falso positivo (ver su sección). Commits individuales por pantalla, build + verificación en vivo en cada uno.
2. ~~**Odontología — bloque de impresión con datos de otra dependencia**~~ ✅ **RESUELTO 2026-07-23** (ver CLAUDE.md).
3. **Agenda pública — extender vigencia de eventos**: 🟠 investigado, SQL entregada al usuario para correr manualmente (6 eventos recurrentes, `fecha_fin` 2026-06-30 → 2026-12-31). Pendiente de ejecución.
4. ~~**Unificar Seguros con Patrimonio** y **unificar los 4 KPIs de Patrimonio por pestaña**.~~ ✅ **RESUELTO 2026-07-23** — los 4 KPIs ya filtran por tipo de bien en Inmuebles/Muebles; Seguros vs Patrimonio investigado y documentado como conceptos de datos genuinamente distintos (no se fuerza unificación, ver su sección para la propuesta de a futuro).
5. ~~**CRM Vecinal — ficha de vecino**: agregar botón Editar, mostrar alergias/contacto de emergencia, y reemplazar el label genérico "Turno" por la dependencia/especialidad.~~ ✅ **RESUELTO 2026-07-23**.
6. Resto de hallazgos MEDIO/BAJO — cosmético/legibilidad, sin apuro. *(pendiente, sin prioridad para Vales Electrónicos)*
