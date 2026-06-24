---
name: Tulkas — Stack Técnico y Convenciones
key: tulkas-stack
description: Reglas técnicas no negociables del ecosistema Tulkas.
---

# Stack Técnico Tulkas

## Stack base (siempre)
- **Frontend**: React 19 + Vite + Tailwind CSS
- **Backend/DB**: Supabase (Postgres + Auth + Storage + Edge Functions)
- **Deploy**: Vercel (Hobby hasta revenue real, luego Pro)
- **Repo**: GitHub (federicoaf79 para proyectos propios, PlanB1205 para Plan-B)
- **Email**: Resend
- **Mensajería**: Plan-B client (`@federico/planb-client`)
- **Dev local**: Windows + PowerShell

## Convenciones PowerShell
```powershell
# CORRECTO — punto y coma para encadenar
cd C:\proyecto ; git add . ; git commit -m "feat: ..."

# INCORRECTO — nunca usar &&
cd C:\proyecto && git add .
```

## Reglas Supabase (no negociables)

### fetchAllPaginated — SIEMPRE para queries grandes
```javascript
// Para cualquier query que pueda superar 1000 filas
// PostgREST tiene límite de 1000 por defecto
const data = await fetchAllPaginated('tabla', filtros);
// NUNCA: supabase.from('tabla').select('*') sin paginación en tablas grandes
```

### Dos clientes Supabase en portales públicos
```javascript
// Cliente con auth (usuarios logueados)
const supabase = createClient(url, anonKey);

// Cliente público sin auth (portal público, magic links)
const supabasePublic = createClient(url, anonKey, { auth: { persistSession: false } });
// NUNCA eliminar el cliente público — rompe el portal
```

### RLS (Row Level Security)
- Los helpers RLS deben existir en la DB ANTES de activar policies
- Verificar en SQL Editor: `SELECT * FROM pg_proc WHERE proname LIKE 'is_%' OR proname LIKE 'has_%'`
- Sin helpers → timeout silencioso en prod

### Migraciones SQL
- SIEMPRE versionadas: `supabase/migrations/YYYYMMDD_descripcion.sql`
- NUNCA crear tablas en prod sin migración en el repo
- Verificar que corrieron: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`

### Edge Functions
- Deno + TypeScript
- Secrets con `supabase secrets set NOMBRE=valor`
- NUNCA hardcodear secrets en el código

## Errores comunes y soluciones
- **Error 42703** → columna no existe. Usar try/catch con fallback a columnas seguras.
- **Timeout silencioso** → RLS helpers faltantes. Verificar antes de activar policies.
- **CORS en Edge Functions** → agregar headers `Access-Control-Allow-Origin`
- **Date shift Argentina** → usar `YYYY-MM-DD` sin timezone, nunca `new Date()` directo

## Workflow con Claude Code
```powershell
cd C:\[proyecto] ; claude
```
El CLAUDE.md del proyecto es la fuente de verdad. Leerlo primero siempre.
