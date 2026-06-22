# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera, portal web público y Bot IA por dependencia.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo — actualizá la sección correspondiente en el mismo commit.

---

## ⚠️ Riesgos abiertos

**CRÍTICO — Columna `activa` en tabla `dependencias`:**
La columna es `activa` (NO `activo`). Bug corregido en junio 2026 en 9 archivos.
Si aparece error `column dependencias.activo does not exist` → reemplazar `.eq('activo'` por `.eq('activa'`.

**CRÍTICO — `useMunicipios.js:199`:** inserta deps nuevas con `activo: true` → pendiente cambiar a `activa: true`.

**CRÍTICO — RLS helpers:** si `is_staff()` está vacía → queries timeout. Fue reparada en junio 2026.

**CRÍTICO — Migraciones post-base:** 13 migraciones de mayo 2026 con estado desconocido en prod.

**MEDIO — CORS en SuperAdmin:** las APIs de status de Vercel/GitHub pueden fallar desde browser → crear Vercel Function proxy si dan "Desconocido".

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
- **`bienes_patrimonio`** — columnas: `fecha_alta`, `seguro_poliza`, `proveedor`
- **`profesionales`** — tabla nueva (junio 2026): `nombre`, `especialidad`, `matricula`, `telefono`, `email`, `dias_atencion` (text[]), `hora_desde`, `hora_hasta`, `frecuencia_nota`, `activo`, `municipio_id`, `dependencia_id`
- **`dependencias`** — módulos: `modulo_turnos`, `modulo_erp`, `modulo_bot`, `landing_template`, `bot_descripcion`, `bot_faq`, `bot_restricciones`, `capa`

### Roles
- `superadmin` → `/superadmin` · `admin_comuna` → `/admin` · `operador` → `/admin` · `vecino` → `/portal`
- `supabase` (con auth) → admin · `supabaseAnon` (sin auth) → portal público — NO mezclar

### Datos intocables
- Municipio piloto **Real Sayana** `654d0e86-255d-4498-b5c9-80d91793d318`
- `audit_log` y `obras_historial` son **append-only**

---

## Arquitectura de componentes

### Dos vistas de dependencia — NO confundir

**`DependenciaGestion.jsx`** → `/admin/dependencia-gestion/:id` (por UUID) ← VISTA PRINCIPAL sidebar
- Tabs via `useSearchParams` (`?tab=`):
  - `info` (default) → tabs internos: Información pública / Equipo / Turnos / Historial
  - `?tab=landing` → DepLandingTab
  - `?tab=bot_ia` → DepBotIATab
  - `?tab=administracion` → AdministracionTab

**`DependenciaGeneral.jsx`** → `/admin/dependencia/:tipo` (por tipo string)
- Para CIC y deps con módulos especiales

### Componentes compartidos reutilizables
- `src/components/admin/DepLandingTab.jsx` — CMS Landing pública (3 templates)
- `src/components/admin/DepBotIATab.jsx` — Config Bot IA por dependencia
- `src/components/admin/AdministracionTab.jsx` — ERP gastos/ingresos
- `src/components/admin/ProfesionalesTab.jsx` — ABM profesionales con días/horarios

### Hooks de datos
- `src/hooks/useProfesionales.js` — query + upsert + delete de tabla `profesionales`

---

## Sidebar (AdminLayout.jsx)

**UN SOLO bloque "DEPENDENCIAS"** — duplicación eliminada en junio 2026.

`subitemsParaTipo(tipo, basePath)` — sub-items por tipo:
- **caps/salud/sala** (→ `/admin/sala`): Agenda · Profesionales · Landing · Bot IA · Administración
- **juzgado** (→ `/admin/juez`): Información · Expedientes · Landing · Bot IA · Administración
- **sum** (→ `/admin/sum`): Reservas · Landing · Bot IA · Administración
- **social/ayuda_social** (→ `/admin/dependencia/social`): Beneficiarios · Landing · Bot IA · Administración
- **Default genérico** (→ `/admin/dependencia-gestion/:id`): Información · Landing · Bot IA · Administración
- **Info-only** (policial/educación): solo "Información"

---

## Módulos CIC — rutas y tabs

### SalaPrimerosAuxilios.jsx → `/admin/sala`
- Early returns para: `?tab=landing` → DepLandingTab, `?tab=bot_ia` → DepBotIATab, `?tab=profesionales` → ProfesionalesTab
- `tabRequested`: solo evalúa `admin/administracion` vs `agenda` — NO incluir landing/bot_ia/profesionales
- Variable dep: `depSalud`

### JuezDePaz.jsx → `/admin/juez`
- Early returns: `?tab=landing`, `?tab=bot_ia`
- Variable dep: `depJuez`

### SUM.jsx → `/admin/sum`
- Early returns: `?tab=landing`, `?tab=bot_ia`
- Variable dep: `depSum`

### AyudaSocial.jsx → `/admin/dependencia/social`
- Early returns: `?tab=landing`, `?tab=bot_ia`
- Variable dep: `depSocial` (resuelta via useDependencias con tipos `['social','ayuda_social']`)

---

## Profesionales (Sala PA)

### Tabla `profesionales`
Creada en junio 2026. RLS: staff ve su municipio, admin_comuna gestiona.

### ProfesionalesTab.jsx
- ABM completo: nombre, especialidad, matrícula, teléfono, email
- Días de atención (pills: lunes–domingo, array text[])
- Horario desde/hasta (time inputs)
- Frecuencia nota (texto libre, visible en portal)
- Activos/inactivos separados

### Portal ciudadano
`DependenciaPublica.jsx` — sección "Profesionales que atienden" entre Servicios y Contacto:
- Solo para tipos: `caps`, `salud`, `sala`
- Muestra: avatar iniciales, nombre, especialidad, días, horario, frecuencia nota, teléfono clickeable

---

## Onboarding flotante

`src/hooks/useOnboardingProgress.js` — 10 items en 5 grupos detectados automáticamente.
`src/components/admin/OnboardingChecklist.jsx` — pill navy bottom-right con:
- Anillo SVG animado + barra progreso gold
- Panel blanco desplegable con checklist agrupada
- Items completados: fondo azul sutil + tachado
- Se oculta cuando pct === 100
- Integrado en `AdminLayout.jsx`

---

## SuperAdmin

`src/pages/superadmin/SuperadminDashboard.jsx`:
- 4 métricas globales (municipios/usuarios/turnos/mensajes WA) via queries paralelas Supabase
- Status servicios externos: `status.supabase.com/api/v2/summary.json`, `vercel-status.com`, `githubstatus.com`
  - Indicadores: none=Operacional(azul) · minor=Degradado(gold) · major/critical=Falla(danger)
- Tabla métricas por tenant (vecinos/turnos/mensajes/usuarios por municipio_id)
- Botón Actualizar con timestamp
- **Riesgo CORS:** si APIs externas fallan → crear Vercel Function proxy

---

## Integración Plan-B / WhatsApp

### Credenciales Real Sayana
- `org_id`: `bebe0b78-0cd9-4c5d-9ba0-956559ae2a34`
- Sandbox: `+14155238886` / `join danger-most`
- Producción: `+17868395271` (A2P pendiente Twilio)
- `PLANB_PARTNER_KEY`: `comunas-planb-2026` · `INTERNAL_SYNC_KEY`: `comunas-sync-2026`

### Vercel Functions
- `api/send-whatsapp.js` · `api/webhook-whatsapp.js` · `api/sync-planb.js` · `api/update-bot-config.js`

### Plan-B comportamiento
- Reset sesión si >4hs o "hola/inicio/menu/start/comenzar"
- System prompt incluye `nombre_oficial` del municipio
- Config bot por dep: `bot_descripcion`, `bot_faq`, `bot_restricciones`

---

## Rutas (`App.jsx`)

```
/portal → PortalPublico
/portal/dependencia/:tipo → DependenciaPublica (con sección profesionales para caps/salud/sala)
/admin → AdminDashboard
/admin/tablero, /admin/crm, /admin/mensajeria
/admin/sala → SalaPrimerosAuxilios (?tab=profesionales|landing|bot_ia|admin)
/admin/juez → JuezDePaz (?tab=landing|bot_ia|admin)
/admin/sum → SUM (?tab=landing|bot_ia|admin)
/admin/dependencia/:tipo → DependenciaGeneral
/admin/dependencia-gestion/:id → DependenciaGestion (?tab=landing|bot_ia|administracion)
/admin/inventario, /admin/flota, /admin/patrimonio, /admin/obras-publicas
/admin/noticias, /admin/administracion, /admin/auditoria, /admin/rendicion
/admin/ayuda-social, /admin/config, /admin/config-general
/admin/dependencias → GestionDependencias
/admin/importador → ImportadorVecinos
/superadmin → SuperadminDashboard (panel salud)
/superadmin/municipios, /superadmin/panel, /superadmin/dominios
```

---

## Zonas frágiles

- `AuthContext.jsx:55-102` — doble query secuencial, no cambiar orden
- `supabase.js:24-30` — `lock: false`, no tocar sin prueba multi-tab
- `supabaseAnon` — si se elimina, portal público falla
- `useDependenciaPublica.js` — filtra `activa` (no `activo`)
- `AdminLayout.jsx` — UN SOLO bloque dependencias
- `SalaPrimerosAuxilios.jsx` — tabRequested solo evalúa agenda/administracion; landing/bot/profesionales van por early return ANTES
- `TablazoCross.jsx` — handleConfirmar dispara WA fire-and-forget
- `api/sync-planb.js` — requiere `INTERNAL_SYNC_KEY` y `PLANB_PARTNER_KEY`

---

## Pendientes prioritarios (próxima sesión)

1. **SuperAdmin Fase 2** — branding por tenant: 6 paletas institucionales + 4 templates home portal
2. **SuperAdmin Fase 3** — dominio propio: CNAME desde SuperAdmin → Vercel API + SSL automático
3. **CMS Home del tenant** — templates para `PortalPublico.jsx`
4. **Fix CORS SuperAdmin** — Vercel Function proxy para APIs status externas si fallan
5. **Fix `useMunicipios.js:199`** — `activo: true` → `activa: true` al insertar deps nuevas
6. **Número producción WA** — A2P pendiente Twilio → cambiar `whatsapp_modo` a `prod_twilio`
7. **Médico de guardia mockData** — reemplazar `medicoGuardia` de mockData.js con datos reales de tabla `profesionales`
8. **Onboarding:** verificar queries del hook coincidan con tablas reales en prod
