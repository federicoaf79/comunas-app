---
name: Dev — Checklist de Auditoría de Proyecto
key: dev-auditoria
description: Checklist completo para auditar el estado técnico de un proyecto Tulkas en producción.
---

# Auditoría Técnica — Checklist Tulkas

## Frecuencia recomendada
- **Proyectos en producción con clientes activos**: mensual
- **Proyectos en desarrollo**: antes de cada deploy a prod
- **Proyectos en pausa**: antes de reactivar

## 1. Base de datos (Supabase)

### Migraciones
- [ ] Todas las migraciones están en `supabase/migrations/` en el repo
- [ ] Las migraciones de prod coinciden con las del repo
- [ ] No hay tablas en prod que no existan en el repo (y viceversa)

Verificar:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

### RLS (Row Level Security)
- [ ] Los helpers de RLS existen en prod
```sql
SELECT proname FROM pg_proc
WHERE proname LIKE 'is_%' OR proname LIKE 'has_%' OR proname LIKE 'current_%';
```
- [ ] Las policies están activas en las tablas correctas
- [ ] El bypass de superadmin funciona

### Datos
- [ ] No hay datos de seed/mock en prod (buscar "mockData", "test", "demo" en el código)
- [ ] Los registros nulos o inconsistentes están bajo control

## 2. Seguridad

### Keys y secrets
- [ ] No hay API keys en el código (buscar en repo: `grep -r "sk-ant\|supabase\|twilio\|stripe" src/`)
- [ ] Las variables de entorno están en Vercel/Railway, no en `.env` commiteados
- [ ] `.env` está en `.gitignore`
- [ ] Los secrets de Edge Functions están en `supabase secrets`

### Auth
- [ ] Magic links expiran correctamente
- [ ] Los roles están bien asignados (no hay usuarios con más permisos de lo necesario)

## 3. Performance

### Queries
- [ ] Las queries sobre tablas grandes usan `fetchAllPaginated`
- [ ] No hay `SELECT *` sin límite en tablas con +1000 filas
- [ ] Los índices existen en columnas de búsqueda frecuente

### Frontend
- [ ] No hay console.log en producción
- [ ] Los errores tienen fallback visual (no pantalla en blanco)

## 4. Infraestructura

### Vercel
- [ ] El deploy está en la rama correcta (main/master)
- [ ] Las variables de entorno están configuradas
- [ ] El dominio custom está verificado

### Supabase
- [ ] El proyecto no está en pausa por inactividad (free tier pausa a los 7 días sin uso)
- [ ] El storage bucket tiene las políticas correctas

## 5. UX y producto
- [ ] El onboarding del primer usuario funciona de punta a punta
- [ ] Los estados vacíos tienen contenido útil (no pantallas en blanco)
- [ ] Los mensajes de error son entendibles por el usuario final

## Resultado de la auditoría
```
## 🟢 Saludable
## 🟡 Atención requerida
## 🔴 Crítico — acción inmediata
## 📋 Prompts Claude Code para resolver
```
