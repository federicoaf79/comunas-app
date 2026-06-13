# CLAUDE.md — Comunas

CRM/ERP municipal SaaS para comisiones de Santiago del Estero, Argentina. Centraliza padrón de vecinos, Historia Clínica del CAPS, turnos online, mensajería SMS/WhatsApp, administración financiera y portal web público por municipio.

> **AUTO-MANTENIMIENTO:** Al completar un módulo, cambiar una regla de negocio, agregar una tabla, o resolver un riesgo listado abajo — actualizá la sección correspondiente en el mismo commit. No registres cambios de código rutinarios acá.

---

## ⚠️ Riesgos abiertos (resolver antes de deploy a prod real)

**CRÍTICO — RLS helpers pueden no existir en prod:**
Si las funciones `is_superadmin()`, `has_role()`, `current_usuario_municipio()`, `current_vecino_id()`, `is_admin_comuna()`, `is_staff()`, `in_dep()`, `current_vecino_municipio()` no están creadas en la DB, todas las queries timeout sin error explícito. Síntoma: queries que tardan >5s y corren en <1s al deshabilitar RLS.
**Verificar:**
```sql
SELECT proname FROM pg_proc
WHERE pronamespace='public'::regnamespace
  AND proname IN ('is_superadmin','has_role','current_usuario_municipio',
                  'current_vecino_id','is_admin_comuna','is_staff','in_dep',
                  'current_vecino_municipio');
```
Si devuelve vacío → ejecutar el bloque helpers de `20250505000001_comunas_schema.sql:263-358` manualmente en SQL Editor (rol postgres).

**CRÍTICO — Migraciones post-base sin verificar en prod:**
Hay 34 migraciones en `supabase/migrations/`. Las 13 agregadas en mayo 2026 tienen estado desconocido en prod. Las más críticas a verificar:
- `20260514_vecinos_hc_obligatorios.sql` — campos HC del vecino
- `20260514_obras.sql` + `20260514_obras_historial.sql`
- `20260514_audit_log.sql`
- `20260517_dependencias_responsable.sql` (última)

Los hooks tienen fallback por columna inexistente (error 42703) — el usuario ve datos parciales en vez de crash, pero es una señal de migración no aplicada. **No eliminar esos fallbacks hasta verificar todas las migraciones en prod.**

**MEDIO — Buckets de Storage sin verificar:**
Buckets `noticias-imagenes`, `recursos`, `avatares`, `documentos-hc` deben estar creados con policies configuradas (public o signed URLs). Si no existen, las imágenes de noticias y adjuntos de HC fallan silenciosamente.

**BAJO — Mensajería SMS: UI completa, backend pendiente:**
`/admin/mensajeria` consume `mockData.js` — no hay integración Twilio real. No rompe nada pero tampoco funciona en prod. Twilio declarado en `.env.example`, no implementado en código.

---

## Stack y dónde vive

- **Frontend:** React 19 + Vite + Tailwind CSS (paleta custom)
- **Backend/DB:** Supabase (Postgres 15 + Auth + Storage + RLS)
- **Repo:** `github.com/PlanB1205/comunas-app` (OJO: repo bajo PlanB1205, no federicoaf79)
- **Local:** `C:\Users\ffrey\comunas-app`
- **Hosting:** Vercel · **Sitio:** demo.comunas.lat
- **Serverless:** `api/rss.js` (proxy RSS) · `api/claude.js` (proxy Claude API para asistente IA)
- **Integraciones declaradas:** Twilio (SMS, pendiente) · Google OAuth · Anthropic Claude · Plan B API (uso desconocido — `[PENDIENTE CONFIRMAR]`)

---

## Reglas LOCKEADAS (no romper)

### Paleta — CERO verde en ninguna forma
- **Primary:** `#0F1C35` (navy) · **Accent:** `#C9A84C` (gold) · **BG:** `#F5F4EF` (cream)
- **OK / activo / éxito:** `#1D4ED8` (azul) — **NUNCA verde**
- **Fuente:** Sora (Google Fonts)
- **PROHIBIDO:** `green-*`, `emerald-*`, `teal-*`, `lime-*` en cualquier archivo JSX/CSS
- **Verificar antes de commit:** `grep -rE "green-|emerald-|teal-|lime-" src/ --include="*.jsx"`
- Estados positivos (aprobado, confirmado, completado) → `.estado-confirmado` / `.estado-completado` (azul). Nunca `.estado-success` con verde.

### Roles y flujo de autenticación
Orden de prioridad para ruta home:
1. `superadmin` → `/superadmin`
2. `admin_comuna` → `/admin`
3. `operador` → `/admin`
4. `vecino` → `/portal`

**Dos clientes Supabase — NO mezclar:**
- `supabase` (con auth/persistencia) → admin panel + AuthContext + hooks que escriben
- `supabasePublic` (sin auth) → portal público `/portal/*` — resuelve race condition de 7+ queries anon en paralelo. Si se elimina, el portal falla intermitentemente con `"Lock was released because another request stole it"`

**Portal vecino ≠ Auth staff:**
- Staff usa `AuthContext` (Supabase Auth) → `useAuth()`
- Vecinos sin cuenta usan `VecinoContext` (sessionStorage, no Supabase Auth) → `useVecino()`
- Vecinos con cuenta entran vía `/portal/acceso`, no `/auth/login`
- **NO mezclar `useAuth()` con `useVecino()`**

### Datos intocables de prod
- Municipio piloto **Real Sayana** (seed en migración base): no eliminar. Es el municipio demo para onboarding.
- `audit_log` es **append-only**: no hay policy de UPDATE ni DELETE. Una vez escrita, la fila es inmutable.
- `obras_historial` es **append-only**: no permitir DELETE — es auditoría de estados.

### Módulos gated
Cada municipio tiene filas en `modulos_config`. Si un municipio NO tiene filas (caso legacy/fresh), `useTieneModulo()` devuelve `true` por default — preferimos mostrar todo a romper la experiencia. No cambiar este default.

### HC obligatoria para turno presencial
Si un vecino no tiene `grupo_sanguineo`, `alergias`, `contacto_emergencia_*` → `TurnoPresencialModal` bloquea la creación con banner. Los campos son NULLABLE en DB — el enforcement es solo UI. No moverlo al backend sin migración.

### Historial de obras
Al cambiar estado o `porcentaje_avance` de una obra → insertar fila en `obras_historial` con `estado_anterior`, `estado_nuevo`, `avance_anterior`, `avance_nuevo`, `usuario_id`, `nota`. **No eliminar este comportamiento.**

---

## Convenciones de código

- **Hooks de datos:** patrón `useXXX(municipioId, filters={})` con `useQuery` + `staleTime: 60_000`. Mutations con `useMutation` + `invalidateQueries` en `onSuccess`.
- **Timeout de queries:** todos los hooks de Administración/Inventario/Patrimonio/Obras usan `AbortController` con timeout 8s + fallback a columnas "seguras" si error 42703.
- **Fechas:** siempre via `src/lib/datetime.js` (`timeOf`, `dateOf`, `shortDateOf`, `longDateOf`, `todayArgYMD`). TZ Argentina UTC-3.
- **Estados CSS:** usar clases de `src/index.css` (`.estado-pendiente`, `.estado-confirmado`, `.estado-cancelado`, etc.) — nunca clases de color directo para estados.
- **`lock: false` en Supabase auth:** no tocar sin probar con múltiples tabs. Razón documentada en `supabase.js:24-30` — previene `NavigatorLockAcquireTimeoutError`.
- **`AuthContext.jsx:55-102`:** no cambiar el orden de las 2 queries ni agregar JOINs — la secuencia evita lock de RLS.

---

## Conexión con FreyHub

**No consume paquetes `@federico/*`.** Es standalone. Tiene su propio `src/lib/datetime.js` con las mismas funciones que `@federico/utils/datetime` — candidato a unificar en el futuro, pero no es urgente.

---

## Estado actual

**✅ Terminado:**
Portal público (Hero Carousel, Historia con mapa, RSS feeds), Sala PA (agenda + turnos presenciales + HC obligatoria), Auditoría de accesos, Administración (gastos/ingresos/presupuesto + OC), Obras públicas con historial, Módulos gated por `modulos_config`.

**🚧 UI completa, backend pendiente:**
- Mensajería SMS/WhatsApp → consume `mockData.js`, falta Twilio real
- Google Calendar sync → stubs con `// TODO` en `src/lib/googleCalendar.js`

**❓ Verificar en prod:**
- 34 migraciones aplicadas (especialmente las 13 de mayo 2026)
- RLS helpers creados
- Buckets de Storage configurados

**⏳ Fuera de scope actual:**
Pagos online, notificaciones push, WhatsApp Business API, multi-idioma, export masivo.

---

## Zonas frágiles

- `AuthContext.jsx:55-102` — doble query secuencial, no cambiar orden ni agregar JOINs
- `supabase.js:24-30` — `lock: false`, no tocar sin prueba multi-tab
- `supabasePublic` — si se elimina, el portal público falla intermitentemente
- Hooks con fallback 42703 (`useObras`, `useInventario`, `usePatrimonio`) — no eliminar hasta verificar migraciones
- `portalDefaults.js` — defaults de onboarding, no cambiar sin avisar
- `TurnoPresencialModal.jsx:54` — enforcement UI de HC obligatoria
