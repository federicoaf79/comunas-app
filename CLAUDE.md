# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera, portal web público y Bot IA por dependencia.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo listado abajo — actualizá la sección correspondiente en el mismo commit. No registres cambios de código rutinarios acá.

---

## ⚠️ Riesgos abiertos (resolver antes de deploy a prod real)

**CRÍTICO — RLS helpers pueden no existir en prod:**
Si las funciones `is_superadmin()`, `has_role()`, `current_usuario_municipio()`, `current_vecino_id()`, `is_admin_comuna()`, `is_staff()`, `in_dep()`, `current_vecino_municipio()` no están creadas en la DB, todas las queries timeout sin error explícito.
- `is_staff()` fue reparada en junio 2026 — estaba vacía. Ahora matchea roles `admin_comuna` y `operador`.
**Verificar:**
```sql
SELECT proname FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('is_superadmin','has_role','current_usuario_municipio',
                  'current_vecino_id','is_admin_comuna','is_staff','in_dep',
                  'current_vecino_municipio');
```

**CRÍTICO — Migraciones post-base sin verificar en prod:**
Las 13 migraciones de mayo 2026 tienen estado desconocido en prod. Más críticas:
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
- **Repo:** `github.com/federicoaf79/comunas-app`
- **Local:** `C:\Users\ffrey\comunas-app`
- **Hosting:** Vercel · **Producción:** `realsayana.comunas.lat`
- **Bot IA / WhatsApp:** Plan-B (`plan-b-backend-production.up.railway.app`) — org Real Sayana: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- **Integraciones activas:** Plan-B (WhatsApp + Bot IA) · Anthropic Claude (sync KB) · Google Maps embed

---

## Reglas LOCKEADAS (no romper)

### Paleta — CERO verde en ninguna forma
- **Primary:** `#0F1C35` (navy) · **Accent:** `#C9A84C` (gold) · **BG:** `#F5F4EF` (cream)
- **OK / activo / éxito:** `#1D4ED8` (azul) — **NUNCA verde**
- **Fuente:** Sora (Google Fonts)
- **PROHIBIDO:** `green-*`, `emerald-*`, `teal-*`, `lime-*` en cualquier archivo JSX/CSS
- Canal WhatsApp → violeta `#7C3AED` · Canal Online → `#64748B` · Canal Presencial → `#C9A84C`

### Columnas críticas de DB — errores frecuentes
- **`dependencias.activa`** (NO `activo`) — boolean. Bug corregido en 9 archivos en junio 2026.
  Archivos corregidos: `AdminLayout.jsx`, `ConfigPortal.jsx`, `DependenciaGestion.jsx`, `useDependenciaPublica.js`
- **`bienes_patrimonio`** — columnas reales: `fecha_alta`, `seguro_poliza`, `proveedor` (NO `fecha_adquisicion`, `responsable`)
- **`useMunicipios.js:199`** — al insertar deps nuevas usa `activo: true` — pendiente cambiar a `activa: true`

### Roles y flujo de autenticación
- `superadmin` → `/superadmin` · `admin_comuna` → `/admin` · `operador` → `/admin` · `vecino` → `/portal`
- `supabase` (con auth) → admin panel · `supabaseAnon` (sin auth) → portal público
- Staff: `useAuth()` · Vecinos sin cuenta: `useVecino()` — NO mezclar

### Datos intocables de prod
- Municipio piloto **Real Sayana** `654d0e86-255d-4498-b5c9-80d91793d318` — no eliminar
- `audit_log` y `obras_historial` son **append-only**

### Módulos gated por dependencia
Tabla `dependencias` columnas: `modulo_turnos`, `modulo_erp`, `modulo_bot`, `landing_template`, `bot_descripcion`, `bot_faq`, `bot_restricciones`.
- Panel `/admin/dependencias` (GestionDependencias.jsx) — toggles + selector template
- `landing_template` values: `'estandar'` | `'espacio_fisico'` | `'administrativa'`

---

## Arquitectura de rutas y componentes

### Dos componentes de dependencia — NO confundir

**`DependenciaGestion.jsx`** → ruta `/admin/dependencia-gestion/:id` (por UUID)
- Es la vista principal de cada dependencia desde el sidebar
- Tabs: Información pública · Landing pública · Bot IA · Equipo · Turnos · Administración · Historial
- Carga la dep por UUID desde Supabase

**`DependenciaGeneral.jsx`** → ruta `/admin/dependencia/:tipo` (por tipo string)
- Vista legacy por tipo, usada por CIC (Sala PA, Juez, SUM, Ayuda Social) y deps especiales
- Tabs: info · landing · turnos · administracion · inventario · contacto · beneficiarios · reclamos · reservas · calendario
- Tiene el `LandingTab` completo con CMS de 3 templates

### Sidebar (AdminLayout.jsx)
- UN SOLO bloque "DEPENDENCIAS" — la duplicación fue eliminada en junio 2026
- `subitemsParaTipo(tipo, basePath)` genera sub-items
- Default genérico apunta a `/admin/dependencia-gestion/:id` con sub-items:
  - Información · Landing pública · Bot IA · Administración
- Tipos CIC (caps/juzgado/sum/social) → sus propias rutas (`/admin/sala`, `/admin/juez`, etc.)
- Tipos info-only (policia/educacion/jardin) → solo "Información"

---

## Convenciones de código

- **Hooks de datos:** `useXXX(municipioId, filters={})` con `useQuery` + `staleTime: 60_000`
- **Timeout de queries:** `AbortController` con 8s + fallback columnas 42703
- **Fechas:** siempre via `src/lib/datetime.js`. TZ Argentina UTC-3
- **Estados CSS:** clases de `src/index.css` (`.estado-pendiente`, `.estado-confirmado`, etc.)
- **`lock: false` en Supabase auth:** no tocar sin prueba multi-tab

---

## Integración Plan-B / WhatsApp

### Credenciales Real Sayana
- `org_id`: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- `api_key`: en `configuracion_portal` clave `plan_b_api_key`
- Número sandbox: `+14155238886` / Código: `join danger-most`
- Número producción: `+17868395271` (A2P pendiente aprobación Twilio)
- `PLANB_PARTNER_KEY`: `comunas-planb-2026` · `INTERNAL_SYNC_KEY`: `comunas-sync-2026`

### Vercel Functions de WhatsApp
- `api/send-whatsapp.js` → envía mensajes (proxy con `X-API-Key`)
- `api/webhook-whatsapp.js` → recibe mensajes, crea turnos con `canal='whatsapp'`
- `api/update-bot-config.js` → actualiza system prompt del bot
- `api/sync-planb.js` → sincroniza KB de todas las dependencias con Plan-B

### Comportamiento del bot (Plan-B)
- Reset de sesión si >4hs sin actividad o vecino escribe "hola/inicio/menu/start/comenzar"
- System prompt incluye `nombre_oficial` del municipio desde `datos_municipio`
- Config del bot por dependencia: `bot_descripcion`, `bot_faq`, `bot_restricciones` en tabla `dependencias`

---

## Módulos implementados

### Portal ciudadano (`/portal/*`)
- `PortalPublico.jsx` — home con Hero Carousel, accesos rápidos, noticias, dependencias
- `DependenciaPublica.jsx` — landing pública por dependencia (`/portal/dependencia/:tipo`)
  - Hook `useDependenciaPublica` filtra por `.eq('activa', true)` ✅
  - 3 templates: `estandar`, `espacio_fisico`, `administrativa`

### Panel admin — DependenciaGestion.jsx (vista principal de deps)
Tabs disponibles por dependencia:
1. **Información pública** — form editable: descripción, horario, teléfono, email, dirección, whatsapp, responsable
2. **Landing pública** — redirect a DependenciaGeneral con tab landing (CMS completo)
3. **Bot IA** — bot_descripcion, bot_faq, bot_restricciones + sync con Plan-B
4. **Equipo** — lista usuarios del municipio
5. **Turnos** — lista + modal nuevo turno
6. **Administración** — AdministracionTab (gastos/ingresos/solicitudes)
7. **Historial** — últimos 50 turnos

### Panel admin — DependenciaGeneral.jsx (LandingTab CMS)
- 3 templates con wireframe visual mini (muestra header/body/footer)
- Badge "Activo" (gold) en template guardado · Badge "Seleccionado" (azul) en elegido sin guardar
- Preview de layout con etiquetas descriptivas por sección (Siempre / Este template / Condicional)

### Panel admin — GestionDependencias.jsx (`/admin/dependencias`)
- Tabla con toggles: Activa, Turnos, ERP/Admin, Bot IA + selector Template landing
- Leyenda explicativa de los 3 templates
- Tooltips en cada columna explicando su función
- Título: "Configuración de dependencias"

### Panel admin — ImportadorVecinos.jsx (`/admin/importador`)
- Soporta xlsx/xls/csv/ods
- AI mapping de columnas via Edge Function (fallback auto-map)
- Fuzzy dedup por nombre (Levenshtein)
- Upsert por `dni + municipio_id`

### Panel admin — Tablero turnos (TablazoCross.jsx)
- Borde izquierdo por canal: WhatsApp `#7C3AED`, Online `#64748B`, Presencial `#C9A84C`
- Notificación WA automática al confirmar turno (fire-and-forget a `/api/send-whatsapp`)

### SuperAdmin (`/superadmin/*`)
- Dashboard, Municipios, Dominios, Panel Global básico
- **Pendiente:** panel de salud, branding por tenant, dominio propio (CNAME)

---

## Rutas (`App.jsx`)

```
/portal → PortalPublico
/portal/dependencia/:tipo → DependenciaPublica
/admin → AdminDashboard
/admin/tablero, /admin/crm, /admin/crm/:id, /admin/mensajeria
/admin/sala, /admin/juez, /admin/sum
/admin/dependencia/:tipo → DependenciaGeneral (por tipo — CIC + legacy)
/admin/dependencia-gestion/:dependenciaId → DependenciaGestion (por UUID — sidebar principal)
/admin/inventario, /admin/flota, /admin/patrimonio, /admin/obras-publicas
/admin/noticias, /admin/administracion, /admin/auditoria, /admin/rendicion
/admin/ayuda-social, /admin/config, /admin/config-general
/admin/dependencias → GestionDependencias (toggles módulos)
/admin/importador → ImportadorVecinos
/superadmin, /superadmin/municipios, /superadmin/panel, /superadmin/dominios
```

---

## Zonas frágiles

- `AuthContext.jsx:55-102` — doble query secuencial, no cambiar orden
- `supabase.js:24-30` — `lock: false`, no tocar sin prueba multi-tab
- `supabaseAnon` — si se elimina, el portal público falla intermitentemente
- `useDependenciaPublica.js` — filtra por `activa` (no `activo`). No cambiar.
- `AdminLayout.jsx` — UN SOLO bloque dependencias. No agregar DependenciasGestionNav de vuelta.
- `CalendarioSemanal.jsx` — `borderDeCanal()` mapea canal a color de borde
- `TablazoCross.jsx` — `handleConfirmar` dispara notificación WA fire-and-forget
- `api/sync-planb.js` — requiere `INTERNAL_SYNC_KEY` y `PLANB_PARTNER_KEY` en Vercel env vars

---

## Pendientes prioritarios (próxima sesión)

1. **SuperAdmin Fase 1** — panel de salud: status Supabase/Vercel/GitHub + métricas por tenant + alertas
2. **SuperAdmin Fase 2** — branding por tenant: 6 paletas + 4 templates home portal ciudadano
3. **SuperAdmin Fase 3** — dominio propio: CNAME desde SuperAdmin → Vercel API + SSL automático
4. **CMS Home del tenant** — templates para `PortalPublico.jsx`
5. **Fix `useMunicipios.js:199`** — cambiar `activo: true` a `activa: true` al insertar deps nuevas
6. **Número producción WA** — A2P pendiente Twilio. Cuando apruebe cambiar `whatsapp_modo` a `prod_twilio`
7. **Unificación Landing** — mover `LandingTab` de DependenciaGeneral a componente separado para usarlo también en DependenciaGestion directamente (en vez de redirect)
