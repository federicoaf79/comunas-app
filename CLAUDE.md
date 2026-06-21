# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera, portal web público y Bot IA por dependencia.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo listado abajo — actualizá la sección correspondiente en el mismo commit. No registres cambios de código rutinarios acá.

---

## ⚠️ Riesgos abiertos (resolver antes de deploy a prod real)

**CRÍTICO — RLS helpers pueden no existir en prod:**
Si las funciones `is_superadmin()`, `has_role()`, `current_usuario_municipio()`, `current_vecino_id()`, `is_admin_comuna()`, `is_staff()`, `in_dep()`, `current_vecino_municipio()` no están creadas en la DB, todas las queries timeout sin error explícito.
- `is_staff()` fue reparada en junio 2026 — estaba vacía (body solo con `SET search_path`). Ahora matchea roles `admin_comuna` y `operador`.
- `current_usuario_municipio()` retorna NULL cuando se ejecuta como superadmin en SQL Editor (sin sesión). Es correcto.
**Verificar:**
```sql
SELECT proname FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('is_superadmin','has_role','current_usuario_municipio',
                  'current_vecino_id','is_admin_comuna','is_staff','in_dep',
                  'current_vecino_municipio');
```

**CRÍTICO — Migraciones post-base sin verificar en prod:**
Las 13 migraciones de mayo 2026 tienen estado desconocido en prod. Las más críticas:
- `20260514_vecinos_hc_obligatorios.sql`
- `20260514_obras.sql` + `20260514_obras_historial.sql`
- `20260514_audit_log.sql`
- `20260517_dependencias_responsable.sql`

**MEDIO — Buckets de Storage sin verificar:**
Buckets `noticias-imagenes`, `recursos`, `avatares`, `documentos-hc` deben estar creados con policies configuradas.

**BAJO — Mensajería SMS: UI completa, backend pendiente:**
`/admin/mensajeria` consume `mockData.js` — no hay integración Twilio real.

---

## Stack y dónde vive

- **Frontend:** React 19 + Vite + Tailwind CSS (paleta custom)
- **Backend/DB:** Supabase (Postgres 15 + Auth + Storage + RLS) — proyecto `tuvfrnjnupfurzkepsod`
- **Repo:** `github.com/federicoaf79/comunas-app` (público)
- **Local:** `C:\Users\ffrey\comunas-app`
- **Hosting:** Vercel · **Producción:** `realsayana.comunas.lat` · **Admin:** `admin.comunas.lat` · **Landing ventas:** `comunas.lat`
- **Bot IA / WhatsApp:** Plan-B (`plan-b-backend-production.up.railway.app`) — org Real Sayana: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- **Integraciones activas:** Plan-B (WhatsApp + Bot IA) · Anthropic Claude (sync KB) · Google Maps embed

---

## Reglas LOCKEADAS (no romper)

### Paleta — CERO verde en ninguna forma
- **Primary:** `#0F1C35` (navy) · **Accent:** `#C9A84C` (gold) · **BG:** `#F5F4EF` (cream)
- **OK / activo / éxito:** `#1D4ED8` (azul) — **NUNCA verde**
- **Fuente:** Sora (Google Fonts)
- **PROHIBIDO:** `green-*`, `emerald-*`, `teal-*`, `lime-*` en cualquier archivo JSX/CSS
- Canal WhatsApp → violeta `#7C3AED` (excepción funcional en calendarios)
- Canal Online → gris azulado `#64748B`
- Canal Presencial → gold `#C9A84C`

### Roles y flujo de autenticación
Orden de prioridad para ruta home:
1. `superadmin` → `/superadmin`
2. `admin_comuna` → `/admin`
3. `operador` → `/admin`
4. `vecino` → `/portal`

**Dos clientes Supabase — NO mezclar:**
- `supabase` (con auth/persistencia) → admin panel + AuthContext + hooks que escriben
- `supabasePublic` (sin auth) → portal público `/portal/*`

**Portal vecino ≠ Auth staff:**
- Staff usa `AuthContext` (Supabase Auth) → `useAuth()`
- Vecinos sin cuenta usan `VecinoContext` (sessionStorage) → `useVecino()`

### Columnas críticas de DB
- **`dependencias.activa`** (no `activo`) — boolean. El hook `useDependenciaPublica.js` filtra por `activa`. Bug corregido en junio 2026.
- **`bienes_patrimonio`** — columnas reales: `fecha_alta`, `fecha_baja`, `seguro_poliza`, `seguro_vencimiento`, `responsable_id`, `fotos`, `activo` (en esta tabla SÍ es `activo`).
- **`patrimonio_mantenimiento`** — columnas: `proveedor` (no `responsable`), `gasto_id`.

### Datos intocables de prod
- Municipio piloto **Real Sayana** `654d0e86-255d-4498-b5c9-80d91793d318` — no eliminar.
- `audit_log` es **append-only**.
- `obras_historial` es **append-only**.

### Módulos gated por dependencia
Tabla `dependencias` tiene columnas booleanas: `modulo_turnos`, `modulo_erp`, `modulo_bot`, `landing_template`.
- El panel `/admin/dependencias` (GestionDependencias.jsx) permite al admin_comuna togglear estos módulos.
- `landing_template` values: `'estandar'` | `'espacio_fisico'` | `'administrativa'`
- `bot_descripcion`, `bot_faq`, `bot_restricciones` — campos de KB del bot por dependencia.

---

## Convenciones de código

- **Hooks de datos:** patrón `useXXX(municipioId, filters={})` con `useQuery` + `staleTime: 60_000`.
- **Timeout de queries:** hooks de Administración/Inventario/Patrimonio/Obras usan `AbortController` con timeout 8s.
- **Fechas:** siempre via `src/lib/datetime.js`. TZ Argentina UTC-3.
- **Estados CSS:** usar clases de `src/index.css` (`.estado-pendiente`, `.estado-confirmado`, etc.)
- **`lock: false` en Supabase auth:** no tocar sin probar con múltiples tabs.

---

## Integración Plan-B / WhatsApp

### Credenciales Real Sayana
- `org_id`: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- `api_key`: en `configuracion_portal` clave `plan_b_api_key`
- Número sandbox: `+14155238886` / Código: `join danger-most`
- Número producción: `+17868395271` (A2P pendiente aprobación Twilio)
- `PLANB_PARTNER_KEY`: `comunas-planb-2026` (en Vercel env vars)
- `INTERNAL_SYNC_KEY`: `comunas-sync-2026` (en Vercel env vars)

### Vercel Functions de WhatsApp
- `api/provision-whatsapp.js` → crea org en Plan-B
- `api/send-whatsapp.js` → envía mensajes (proxy seguro con `X-API-Key`)
- `api/webhook-whatsapp.js` → recibe mensajes, crea turnos con `canal='whatsapp'`
- `api/update-bot-config.js` → actualiza system prompt del bot
- `api/sync-planb.js` → sincroniza KB de todas las dependencias con Plan-B (POST con `x-internal-key`)
- `api/turnos-disponibles.js` → slots disponibles para el bot

### Bug corregido en Plan-B (junio 2026)
`PATCH /api/v1/orgs/{org_id}/bot-config` con campo `knowledge_base[]` guardaba en tabla `configuracion` en vez de `knowledge_base`. Fix aplicado en commit `e4268c2` de Plan-B. Ahora el Partner API funciona correctamente.

### Reset de sesión del bot (junio 2026)
`get_historial_para_claude()` en Plan-B ahora resetea el contexto si:
1. Pasaron >4 horas desde el último mensaje
2. El vecino escribe "hola", "inicio", "menu", "start" o "comenzar"

---

## Módulos implementados

### Portal ciudadano (`/portal/*`)
- `PortalPublico.jsx` — home con Hero Carousel, accesos rápidos, noticias, dependencias, autoridades
- `DependenciaPublica.jsx` — landing pública por dependencia (ruta `/portal/dependencia/:tipo`)
  - Matching flexible por slug/tipo/nombre normalizado
  - 3 templates: `estandar`, `espacio_fisico`, `administrativa`
  - Secciones: Hero, Galería (espacio_fisico), Servicios, Trámites (administrativa), Contacto, Mapa Google, Botón turno
- `NoticiasListado.jsx`, `NoticiaDetalle.jsx`, `SacarTurno.jsx`, `MiTurno.jsx`, `MiSalud.jsx`
- `VecinoAcceso.jsx`, `VecinoDashboard.jsx` — área personal del vecino
- Anclas del nav: `#servicios`, `#recursos` (fix junio 2026), `#autoridades`, `#contacto`

### Panel admin (`/admin/*`)
- **CIC:** Sala PA (HC + turnos + médicos rotativos + recetas), Juez de Paz, SUM, Ayuda Social
- **Tablero turnos** (`TablazoCross.jsx`) — vistas Día y Semana con `CalendarioSemanal.jsx`
  - Borde izquierdo por canal: WhatsApp `#7C3AED`, Online `#64748B`, Presencial `#C9A84C`
  - Leyenda de canales en el tablero
  - Notificación WA automática al confirmar turno (fire-and-forget)
- **CRM Vecinal** + detalle vecino
- **Mensajería** (UI completa, backend mock)
- **ERP:** Administración (gastos/ingresos/presupuesto), Auditoría, Rendición
- **Activos:** Inventario, Flota, Patrimonio (RLS fix junio 2026), Obras Públicas
- **Noticias**
- **Portal Web** (ConfigPortal.jsx) — gestión de noticias, dependencias, recursos, autoridades
- **Config General** (ConfigGeneral.jsx):
  - Identidad visual (logo), Redes sociales, Datos municipio
  - WhatsApp Business (Plan-B), WhatsApp & Bot
  - **Bot IA por dependencia** (BotDependenciasSection) — FAQ, descripción, restricciones por dep con sync a Plan-B
- **Gestión de dependencias** (`/admin/dependencias`) — panel con toggles `modulo_turnos`, `modulo_erp`, `modulo_bot`, `landing_template`
- **Importador de datos** (`/admin/importador`) — ImportadorVecinos.jsx adaptado de OOH Planner
  - Soporta xlsx/xls/csv/ods
  - AI mapping de columnas via Edge Function (fallback auto-map)
  - Fuzzy dedup por nombre (Levenshtein)
  - Multi-sheet selector
  - Upsert por `dni + municipio_id`
- **DependenciaGeneral.jsx** — tab Landing pública con CMS:
  - 3 templates con wireframe visual mini (muestra header/body/footer)
  - Badge "Activo" (gold) en template guardado en DB
  - Badge "Seleccionado" (azul) en template elegido sin guardar
  - Preview de layout con etiquetas descriptivas por sección
  - Campos: descripción hero/larga, horario, teléfono, email, dirección, responsable, servicios (uno por línea), trámites

### SuperAdmin (`/superadmin/*`)
- Dashboard, Municipios, Dominios, Panel Global
- **Pendiente:** panel de salud (Supabase/Vercel/GitHub status), branding por tenant (6 paletas + 4 templates home), dominio propio (CNAME)

---

## Rutas (`App.jsx`)

```
/ → Landing ventas (comunas.lat) o redirect portal (subdominio municipio)
/portal → PortalPublico
/portal/dependencia/:tipo → DependenciaPublica
/portal/noticias, /portal/noticias/:id, /portal/turno, /portal/mi-turno
/portal/mi-salud, /portal/videos, /portal/tramites, /portal/historia
/mi-cuenta/acceso → VecinoAcceso
/mi-cuenta → VecinoDashboard (VecinoGuard)
/admin → AdminDashboard (AuthGuard + RoleGuard admin_comuna/operador)
/admin/tablero, /admin/crm, /admin/crm/:id, /admin/mensajeria
/admin/sala, /admin/sala/atencion/:turnoId, /admin/juez, /admin/sum
/admin/dependencia/:tipo → DependenciaGeneral
/admin/dependencia-gestion/:dependenciaId → DependenciaGestion
/admin/inventario, /admin/flota, /admin/patrimonio, /admin/obras-publicas
/admin/noticias, /admin/administracion, /admin/auditoria, /admin/rendicion
/admin/ayuda-social, /admin/config, /admin/config-general
/admin/dependencias → GestionDependencias (toggles módulos)
/admin/importador → ImportadorVecinos
/superadmin, /superadmin/municipios, /superadmin/panel, /superadmin/dominios
```

---

## Sidebar (AdminLayout.jsx)

- `subitemsParaTipo(tipo, basePath)` — genera sub-items por dependencia
- Tipos con módulo propio: `caps/salud`, `juzgado`, `sum/salon`, `intendencia/admin/comuna`
- Tipos info-only: `policia`, `educacion`, `jardin`, etc.
- Sub-items genéricos: Gestión → **Landing pública** → Administración
- NAV_GESTION incluye: Portal Web, Administración, Auditoría, Config. General, **Dependencias**, **Importador**

---

## Zonas frágiles

- `AuthContext.jsx:55-102` — doble query secuencial, no cambiar orden ni agregar JOINs
- `supabase.js:24-30` — `lock: false`, no tocar sin prueba multi-tab
- `supabasePublic` / `supabaseAnon` — si se elimina, el portal público falla intermitentemente
- `useDependenciaPublica.js` — filtra por `activa` (no `activo`). No cambiar.
- `usePatrimonio.js` — BIEN_COLS alineado con columnas reales de prod (fecha_alta, no fecha_adquisicion)
- Hooks con fallback 42703 (`useObras`, `useInventario`, `usePatrimonio`) — no eliminar hasta verificar migraciones
- `CalendarioSemanal.jsx` — `borderDeCanal()` mapea canal a color de borde izquierdo
- `TablazoCross.jsx` — `handleConfirmar` dispara notificación WA fire-and-forget
- `api/sync-planb.js` — requiere `INTERNAL_SYNC_KEY` y `PLANB_PARTNER_KEY` en Vercel env vars

---

## Pendientes prioritarios (próxima sesión)

1. **SuperAdmin Fase 1** — panel de salud: status Supabase/Vercel/GitHub + métricas por tenant + alertas umbral
2. **SuperAdmin Fase 2** — branding por tenant: 6 paletas institucionales + 4 templates home portal ciudadano
3. **SuperAdmin Fase 3** — dominio propio: CNAME desde SuperAdmin UI → Vercel API + SSL automático
4. **CMS Home del tenant** — templates para `PortalPublico.jsx` (actualmente hardcodeado)
5. **Número producción WA** — `+17868395271` A2P pendiente Twilio. Cuando apruebe: cambiar `whatsapp_modo` de `sandbox` a `prod_twilio`
6. **Importador Fase 2** — sumar tabla `proveedores` al importador
