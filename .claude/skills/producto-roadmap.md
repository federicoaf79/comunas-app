---
name: Producto — Roadmap de Sprints
key: producto-roadmap
description: Cómo armar un roadmap de sprints con el criterio Tulkas.
---

# Roadmap de Sprints — Criterio Tulkas

## Principios
- Sprints de 1-2 semanas máximo
- El primer sprint debe producir algo usable en producción
- Lo que desbloquea todo lo demás va primero
- Un sprint = un objetivo claro y verificable

## Estructura de sprint

### Sprint 0 — Setup (3-5 días)
- Crear repo GitHub
- Configurar Supabase (proyecto, tablas base, auth)
- Deploy en Vercel con dominio
- Variables de entorno configuradas
- CLAUDE.md inicial creado

### Sprint 1 — Core mínimo (1-2 semanas)
- La funcionalidad más importante del MVP
- Auth básico funcionando
- El flujo principal de punta a punta (aunque sea básico)
- Deploy en prod al final del sprint

### Sprints siguientes
- Cada sprint agrega una capa de valor
- Nunca más de 3-4 features por sprint
- Al final de cada sprint: demo real con usuario o cliente

## Criterio de priorización
1. ¿Esto desbloquea otras cosas? → Primero
2. ¿El cliente lo está esperando? → Urgente
3. ¿Es el diferencial del producto? → Alta prioridad
4. ¿Es "nice to have"? → Backlog
5. ¿No lo pidió nadie? → No va

## Formato de roadmap
```
SPRINT 0 (3d) — Setup
  □ Repo + Supabase + Vercel
  □ Auth base
  □ CLAUDE.md

SPRINT 1 (10d) — [Nombre del core]
  □ [Feature 1] — [quién la necesita]
  □ [Feature 2]
  □ Deploy prod

SPRINT 2 (10d) — [Siguiente capa]
  □ ...

BACKLOG (no fecha):
  - [Feature X]
  - [Feature Y]
```
