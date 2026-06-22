# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera, portal web público y Bot IA por dependencia.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo — actualizá la sección correspondiente en el mismo commit.

---

## ⚠️ Riesgos abiertos

**CRÍTICO — Columna `activa` en tabla `dependencias`:**
La columna es `activa` (NO `activo`). Bug corregido en junio 2026 en 9 archivos:
`AdminLayout.jsx`, `ConfigPortal.jsx`, `DependenciaGestion.jsx`, `useDependenciaPublica.js`
Si aparece error `column dependencias.activo does not exist` → buscar y reemplazar `.eq('activo'` por `.eq('activa'` en el archivo afectado.

**CRÍTICO — `useMunicipios.js:199`:** al insertar deps nuevas usa `activo: true` → pendiente cambiar a `activa: true`.

**CRÍTICO — RLS helpers:** si `is_staff()` está vacía → queries timeout. Fue reparada en junio 2026.

**CRÍTICO — Migraciones post-base:** 13 migraciones de mayo 2026 con estado desconocido en prod.

**BAJO — Mensajería SMS:** `/admin/mensajeria` consume `mockData.js` — no hay Twilio real.

---

## Stack y dónde vive

- **Frontend:** React 19 + Vite + Tailwind CSS (paleta custom)
- **Backend/DB:** Supabase (Postgres 15 + Auth + Storage + RLS) — proyecto `tuvfrnjnupfurzkepsod`
- **Repo:** `github.com/federicoaf79/comunas-app`
- **Local:** `C:\Users\ffrey\comunas-app`
- **Hosting:** Vercel · **Producción:** `realsayana.comunas.lat`
- **Bot IA / WhatsApp:** Plan-B (`plan-b-backend-production.up.railway.app`) — org Real Sayana: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`

---

## Reglas LOCKEADAS (no romper)

### Paleta — CERO verde
- **Primary:** `#0F1C35` (navy) · **Accent:** `#C9A84C` (gold) · **BG:** `#F5F4EF` (cream)
- **OK / activo / éxito:** `#1D4ED8` (azul) — **NUNCA verde**
- **Fuente:** Sora (Google Fonts)
- Canal WhatsApp → `#7C3AED` · Online → `#64748B` · Presencial → `#C9A84C`

### Columnas críticas de DB
- **`dependencias.activa`** (NO `activo`) — boolean
- **`bienes_patrimonio`** — columnas reales: `fecha_alta`, `seguro_poliza`, `proveedor`
- **`dependencias`** columnas de módulos: `modulo_turnos`, `modulo_erp`, `modulo_bot`, `landing_template`, `bot_descripcion`, `bot_faq`, `bot_restricciones`, `capa`

### Roles
- `superadmin` → `/superadmin` · `admin_comuna` → `/admin` · `operador` → `/admin` · `vecino` → `/portal`
- `supabase` (con auth) → admin · `supabaseAnon` (sin auth) → portal público — NO mezclar

### Datos intocables
- Municipio piloto **Real Sayana** `654d0e86-255d-4498-b5c9-80d91793d318`
- `audit_log` y `obras_historial` son **append-only**

---

## Arquitectura de componentes — dos vistas de dependencia

### `DependenciaGestion.jsx` → `/admin/dependencia-gestion/:id` (por UUID) ← VISTA PRINCIPAL
Tabs navegados via `useSearchParams` (`?tab=`):
- `info` (default) → Información pública / Equipo / Turnos / Historial (tabs internos)
- `?tab=landing` → DepLandingTab
- `?tab=bot_ia` → DepBotIATab
- `?tab=administracion` → AdministracionTab
- `?tab=historial` → TabHistorial

### `DependenciaGeneral.jsx` → `/admin/dependencia/:tipo` (por tipo string)
Para CIC (Sala PA, Juez, SUM, Ayuda Social) y deps con módulos especiales.
Usa `useSearchParams` para `?tab=landing`, `?tab=bot_ia`, `?tab=admin`, etc.

### Componentes compartidos (reutilizables en ambas vistas)
- `src/components/admin/DepLandingTab.jsx` — CMS Landing pública (3 templates)
- `src/components/admin/DepBotIATab.jsx` — Config Bot IA por dependencia
- `src/components/admin/AdministracionTab.jsx` — ERP gastos/ingresos

---

## Sidebar (AdminLayout.jsx)

**UN SOLO bloque "DEPENDENCIAS"** — la duplicación fue eliminada en junio 2026.

`subitemsParaTipo(tipo, basePath)` genera sub-items via URL params:
- **Default genérico** (deps dinámicas → `/admin/dependencia-gestion/:id`):
  - Información · `?tab=landing` Landing pública · `?tab=bot_ia` Bot IA · `?tab=administracion` Administración
- **caps/salud/sala** (Sala PA → `/admin/sala`):
  - Agenda · `?tab=landing` Landing · `?tab=bot_ia` Bot IA · `?tab=admin` Administración
- **juzgado** (→ `/admin/juez`):
  - Información · Expedientes · Landing · Bot IA · Administración
- **sum** (→ `/admin/sum`):
  - Reservas · Landing · Bot IA · Administración
- **social/ayuda_social** (→ `/admin/dependencia/social`):
  - Beneficiarios · Landing · Bot IA · Administración
- **Info-only** (policial/educación): solo "Información"

---

## Onboarding flotante

`src/hooks/useOnboardingProgress.js` — detecta automáticamente el progreso:
- 10 items en 5 grupos: Identidad / Dependencias / Portal / Usuarios / WhatsApp
- Queries paralelas a Supabase
- Se oculta cuando `pct === 100`

`src/components/admin/OnboardingChecklist.jsx` — pill flotante bottom-right:
- Anillo SVG animado con % de progreso (gold `#C9A84C`)
- Click → expande panel con checklist agrupada
- Items completados: checkmark azul + tachado
- Items pendientes: botón "→" que navega directo a la sección
- Paleta: navy `#0F1C35` + gold `#C9A84C`
- Integrado en `AdminLayout.jsx`

---

## Integración Plan-B / WhatsApp

### Credenciales Real Sayana
- `org_id`: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- Número sandbox: `+14155238886` / Código: `join danger-most`
- Número producción: `+17868395271` (A2P pendiente Twilio)
- `PLANB_PARTNER_KEY`: `comunas-planb-2026` · `INTERNAL_SYNC_KEY`: `comunas-sync-2026`

### Vercel Functions
- `api/send-whatsapp.js` → envía mensajes
- `api/webhook-whatsapp.js` → recibe mensajes, crea turnos `canal='whatsapp'`
- `api/sync-planb.js` → sincroniza KB deps con Plan-B
- `api/update-bot-config.js` → actualiza system prompt

### Plan-B comportamiento
- Reset sesión si >4hs o vecino escribe "hola/inicio/menu/start/comenzar"
- System prompt incluye `nombre_oficial` del municipio
- Config bot por dep: `bot_descripcion`, `bot_faq`, `bot_restricciones`

---

## Módulos implementados

### Portal ciudadano
- `PortalPublico.jsx` — home pública del tenant
- `DependenciaPublica.jsx` — landing por dep (`/portal/dependencia/:tipo`)
  - Hook filtra `.eq('activa', true)` ✅

### Panel admin — DependenciaGestion.jsx
Tabs: Información pública · Landing · Bot IA · Equipo · Turnos · Administración · Historial
Sub-tabs en "Información": Información pública / Equipo / Turnos / Historial

### Panel admin — GestionDependencias.jsx (`/admin/dependencias`)
- Toggles: Activa, Turnos, ERP/Admin, Bot IA + selector Template landing
- Leyenda explicativa de los 3 templates
- Tooltips en columnas

### Panel admin — ImportadorVecinos.jsx (`/admin/importador`)
- xlsx/xls/csv/ods · AI mapping · fuzzy dedup (Levenshtein) · upsert `dni+municipio_id`

### Panel admin — Tablero turnos
- Borde por canal: WA `#7C3AED`, Online `#64748B`, Presencial `#C9A84C`
- Notificación WA al confirmar turno (fire-and-forget)

### CIC (módulos propios con funcionalidad específica)
- `SalaPrimerosAuxilios.jsx` → `/admin/sala` — médicos, HC, recetas, planilla
- `JuezDePaz.jsx` → `/admin/juez` — expedientes
- `SUM.jsx` → `/admin/sum` — reservas
- `AyudaSocial.jsx` → `/admin/dependencia/social` — beneficiarios
- **Todos pendientes:** integrar `DepLandingTab` y `DepBotIATab` (componentes ya creados)

---

## Rutas (`App.jsx`)

```
/portal → PortalPublico
/portal/dependencia/:tipo → DependenciaPublica
/admin → AdminDashboard
/admin/tablero, /admin/crm, /admin/crm/:id, /admin/mensajeria
/admin/sala, /admin/juez, /admin/sum
/admin/dependencia/:tipo → DependenciaGeneral (CIC + legacy)
/admin/dependencia-gestion/:dependenciaId → DependenciaGestion (sidebar principal)
/admin/inventario, /admin/flota, /admin/patrimonio, /admin/obras-publicas
/admin/noticias, /admin/administracion, /admin/auditoria, /admin/rendicion
/admin/ayuda-social, /admin/config, /admin/config-general
/admin/dependencias → GestionDependencias
/admin/importador → ImportadorVecinos
/superadmin, /superadmin/municipios, /superadmin/panel, /superadmin/dominios
```

---

## Zonas frágiles

- `AuthContext.jsx:55-102` — doble query secuencial, no cambiar orden
- `supabase.js:24-30` — `lock: false`, no tocar sin prueba multi-tab
- `supabaseAnon` — si se elimina, el portal público falla
- `useDependenciaPublica.js` — filtra `activa` (no `activo`)
- `AdminLayout.jsx` — UN SOLO bloque dependencias, no agregar DependenciasGestionNav
- `TablazoCross.jsx` — `handleConfirmar` dispara WA fire-and-forget
- `api/sync-planb.js` — requiere `INTERNAL_SYNC_KEY` y `PLANB_PARTNER_KEY`

---

## Pendientes prioritarios (próxima sesión)

1. **Integrar DepLandingTab y DepBotIATab** en los 4 módulos CIC (SalaPrimerosAuxilios, JuezDePaz, SUM, AyudaSocial)
2. **SuperAdmin Fase 1** — panel de salud: status Supabase/Vercel/GitHub + alertas
3. **SuperAdmin Fase 2** — branding por tenant: 6 paletas + 4 templates home
4. **SuperAdmin Fase 3** — dominio propio: CNAME → Vercel API + SSL
5. **CMS Home del tenant** — templates para `PortalPublico.jsx`
6. **Fix `useMunicipios.js:199`** — `activo: true` → `activa: true`
7. **Número producción WA** — A2P pendiente. Cuando apruebe: `whatsapp_modo` → `prod_twilio`
8. **Onboarding:** verificar que las queries del hook coincidan con tablas reales en prod
