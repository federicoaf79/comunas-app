---
name: Producto — Estructura de PRD Tulkas
key: producto-prd
description: Estructura estándar de un Product Requirements Document para proyectos Tulkas.
---

# PRD — Product Requirements Document Tulkas

## Estructura obligatoria

### 1. Problema que resuelve
- Descripción del dolor actual
- A quién afecta y con qué frecuencia
- Costo del problema (tiempo, dinero, fricción)

### 2. Usuario principal
- Rol y contexto (ej: "Admin de municipio, 45 años, no técnico")
- Nivel técnico (bajo/medio/alto)
- Flujo de trabajo actual
- Qué espera del producto

### 3. MVP mínimo
- Funcionalidades que SÍ entran (lista priorizada)
- Funcionalidades que NO entran en v1 (explícito)
- Criterio de "done" para cada funcionalidad

### 4. Módulos Tulkas que aplican
| Módulo | Origen | Portable | Esfuerzo |
|--------|--------|----------|----------|
| [nombre] | [proyecto] | ✅/🔧 | [tiempo] |

### 5. Lo que hay que construir desde cero
- Componente / módulo
- Por qué no existe en el ecosistema
- Estimación de tiempo

### 6. Stack recomendado
- Frontend: React 19 + Vite + Tailwind
- DB: Supabase (proyecto: [nombre])
- Deploy: Vercel
- APIs externas: [lista]

### 7. Estimación por fase
- **Fase 1 — Setup**: [X días] — repo, Supabase, deploy base
- **Fase 2 — Core**: [X días] — funcionalidades principales
- **Fase 3 — Polish**: [X días] — UX, edge cases, testing
- **Fase 4 — Launch**: [X días] — onboarding, docs, primer cliente

### 8. Modelo de monetización
- Precio base: $[X]/mes
- Planes: básico / profesional / enterprise
- Trial: 15 días máximo
- Target: [directo / reseller / agencia]
- Margen para reseller: [X]%

### 9. Riesgos principales
- [Riesgo] → [Mitigación]

### 10. Métricas de éxito
- Métrica principal: [qué dice que funcionó]
- Métrica secundaria: [qué dice que escala]
