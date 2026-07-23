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

**CRÍTICO — Columna `activa` en tabla `dependencias`:** es `activa` (NO `activo`). Bug corregido en junio 2026. `useMunicipios.js:199` (alta de dependencias en el wizard de municipio) ya usa `activa: true` — resuelto, no reabrir.
**CRÍTICO — Migraciones post-base:** 13 migraciones de mayo 2026 con estado desconocido en prod. Patrón confirmado 2026-07-23: varios archivos en `supabase/migrations/` documentan un schema (columnas, triggers) que NO coincide con el schema real en prod — el archivo se edita localmente después de correrlo una vez y nunca se vuelve a ejecutar. Antes de asumir que una columna/trigger de una migración existe en prod, confirmar con el spec de PostgREST (`GET /rest/v1/` → `definitions.<tabla>.properties`) o pedir el SQL de `information_schema`/`pg_constraint` al usuario.
**MEDIO — `beneficiarios`/`reclamos` sin columna `updated_at`:** ambas tablas confirmadas sin esa columna en prod (vía spec de PostgREST) aunque la migración base (`20260509000003_beneficiarios_reclamos.sql`) la define con trigger `set_updated_at()`. `useReclamos.js` ya no la referencia (fix `3b30d06`). `useBeneficiarios.js` tampoco la selecciona en ningún lado (solo queda en un comentario de schema desactualizado) — sin bug funcional confirmado hoy, pero si `updateBeneficiarioEstado` empieza a fallar con "column updated_at does not exist", es porque el trigger de la migración sí llegó a crearse en prod sin la columna.
**ALTO — `hc_documentos` mismatch total de schema:** la tabla real en prod es `id, vecino_id, subido_por_rol, tipo, nombre, storage_path, fecha, created_at, atencion_id`. El código (`useHC.js`, `useAtenciones.js`, `useVecinoData.js`) asume `municipio_id, consulta_id, descripcion, mime_type, uploaded_by` — ninguna existe en prod — y nunca usa `subido_por_rol`/`nombre`/`fecha`, que sí existen. Rompe el 100% de las queries a `hc_documentos` (subir/ver adjuntos de una atención). Pendiente decidir: ¿migrar schema al que asume el código, o reescribir el código al schema real? No tocado todavía — decisión de diseño, no un fix mecánico.
**RESUELTO — `partidas_tipo` sin policy de SELECT:** tabla catálogo (sin `municipio_id`, `codigo` como PK) usada por el selector de partida en "Nueva solicitud" de Inventario. Tenía 4 filas de categoría (`02`-`05`) invisibles para staff por falta de policy de SELECT — agregada el 2026-07-23. Se sumaron 12 partidas granulares más (combustibles, insumos médicos, alimentos, etc.) vía service_role. Selector ya funcional.
**MEDIO — `ordenes_compra.numero` es NOT NULL pero la UI lo marca "opcional":** el campo "N° de orden (opcional)" en `OrdenFormModal` (`Inventario.jsx`) puede quedar vacío, pero la columna `numero` en prod no acepta null — el submit falla con `null value in column "numero" ... violates not-null constraint` sin que el form lo prevenga antes. Confirmado en vivo 2026-07-23. Pendiente: o sacar el "(opcional)" del label y validar en el form, o hacer la columna nullable en prod — no arreglado todavía.
**MEDIO — CORS SuperAdmin:** APIs status externas pueden fallar → crear Vercel Function proxy.
**BAJO — Mensajería SMS:** consume mockData.js — no hay Twilio real.
**BAJO — Médico de guardia:** sigue siendo mockData en SalaPrimerosAuxilios.jsx — pendiente reemplazar con tabla `profesionales`.
**MEDIO — "Vista semana" puede omitir turnos reales en silencio (Sala Primeros Auxilios, posiblemente Juez de Paz/SUM/TablazoCross):** `CalendarioSemanal.jsx` solo sabe leer `evento.fecha_hora` (ISO) o el par `evento.fecha`+`evento.hora` — pero `turnos_agenda` NO tiene columna `fecha_hora`, solo `fecha` + `hora_inicio` + `hora_fin` por separado. Si el mapeo a `eventos` no combina esos campos, `isoDeEvento()` devuelve `null` y el turno se descarta sin error visible (grilla vacía, no crashea). Confirmado en vivo en 2026-07-22: Sala Primeros Auxilios tenía turnos reales esa semana y su Vista semana los mostraba vacíos — mismo bug que tenía CIC Salud, arreglado ese día en `CicSalud.jsx`. Fix ya probado, aplicar igual en cada módulo que use `CalendarioSemanal`:
```js
fecha_hora: t.fecha && t.hora_inicio ? `${t.fecha}T${t.hora_inicio}${ARG_OFFSET}` : undefined,
```
(`ARG_OFFSET` de `lib/datetime.js`). No tocar `CalendarioSemanal.jsx` — el problema está en cómo cada página arma su array `eventos`, no en el componente compartido.

---

## Auditoría — Log de operaciones (`audit_log`)

Especificación original (mayo 2026): registrar login/alta/modificación/aprobación/rechazo/eliminación/exportación. `useAuditLog.js` (`createAuditLog()` / `useCreateAuditLog()`) existe desde entonces pero **no se llamaba desde ningún lado** hasta el sprint del 2026-07-23 — ni siquiera `AuthContext.signIn()`, que hace un `insert` directo a `audit_log` bypaseando el helper (accion `'LOGIN'` en mayúscula, inconsistente con el resto que usa minúscula — cabo suelto pre-existente, no tocado).

**Límite de diseño confirmado:** `audit_log.usuario_id` tiene FK a `usuarios.id` → `createAuditLog()` solo es seguro para acciones de **staff**. Un vecino autenticado (sesión Supabase Auth del portal) no tiene fila en `usuarios`, así que llamarlo desde una acción vecino-driven (crear su propio turno, cargar un reclamo desde el portal) rompe con violación de FK. Pendiente de resolver cuando se audite `turnos_agenda`/`reclamos` (Fase 3) — no aplicado a ciegas.

**Patrón de wiring usado (repetir en las próximas fases):** función `logAudit(args)` local a cada hook/página que envuelve `createAuditLog(args).catch(...)` — nunca bloquea la mutación real si el log falla. Se llama DESPUÉS de que la mutación principal tuvo éxito, con `entidadId` de la fila real y `descripcion` legible; `metadata` opcional solo cuando aporta algo (ej. el array completo de `dependencias_acceso`).

**Fase 1 — completa y verificada en vivo (2026-07-23):**
- `gastos` (`useAdministracion.js`): create/approve/reject
- `ordenes_compra` (`useInventario.js`): create/approve/reject
- `usuarios` (`Usuarios.jsx`, `useUsuariosAdmin.js`): alta (`invitarUsuario`, código revisado sin probar en vivo porque dispara email real), cambio de rol, activar/desactivar, permisos por dependencia

**Fases pendientes** (mismo orden acordado): 2 — `vecinos`/`atenciones`/`ordenes_derivacion`; 3 — `turnos_agenda`/`beneficiarios`/`reclamos` (resolver la FK de vecino antes de tocar `turnos_agenda`); 4 — exportaciones CSV (6 puntos: Administración, Rendición, Inventario, Importador Vecinos, Auditoría, Patrimonio); 5 — resto administrativo (dependencias, profesionales, expedientes, inventario, flota, seguros, patrimonio, obras, SUM, agenda pública, autoridades, dominios, historia municipio).

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

- `AuthContext.jsx:55-102` — no cambiar orden queries
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
