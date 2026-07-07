# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera, portal web público y Bot IA por dependencia.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo — actualizá la sección correspondiente en el mismo commit.

---

## ⚠️ Riesgos abiertos

**CRÍTICO — Columna `activa` en tabla `dependencias`:** es `activa` (NO `activo`). Bug corregido en junio 2026.
**CRÍTICO — `useMunicipios.js:199`:** inserta deps con `activo: true` → cambiar a `activa: true`.
**CRÍTICO — Migraciones post-base:** 13 migraciones de mayo 2026 con estado desconocido en prod.
**MEDIO — CORS SuperAdmin:** APIs status externas pueden fallar → crear Vercel Function proxy.
**BAJO — Mensajería SMS:** consume mockData.js — no hay Twilio real.
**BAJO — Médico de guardia:** sigue siendo mockData en SalaPrimerosAuxilios.jsx — pendiente reemplazar con tabla `profesionales`.

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
