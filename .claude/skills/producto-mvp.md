---
name: Producto — Definición de MVP
key: producto-mvp
description: Cómo definir el MVP mínimo viable con el criterio de Tulkas.
---

# Definición de MVP — Criterio Tulkas

## Principio
El MVP es lo mínimo que resuelve el problema core y puede usarse en producción.
No es un prototipo. No es una demo. Es un producto real, reducido.

## Proceso de definición

### 1. Identificar el problema core
Una sola frase: "El usuario no puede [X] sin nuestro producto."
Todo lo que no resuelve ese problema → fuera del MVP.

### 2. Cruzar con el ecosistema Tulkas (44 módulos)
Antes de definir scope, verificar qué ya existe:
- Auth multi-tenant → ya existe en OOH/Comunas
- CRM / Padrón → ya existe en Comunas
- Scoring 0-100 → ya existe en Tolrank
- PDF propuestas → ya existe en OOH
- Onboarding guiado → ya existe en OOH/Tolrank
- Emails white-label → ya existe en Tolrank
- Magic links → ya existe en Comunas/Tolrank

### 3. Definir qué SÍ va en v1
Solo las funcionalidades que:
- El usuario no puede prescindir de ellas
- Son el diferencial del producto
- No pueden ser workeado con otra herramienta

### 4. Definir qué NO va en v1 (explícito)
Listar lo que queda afuera y por qué. Esto es tan importante como lo que entra.

### 5. Estimación de tiempo
- Módulos reutilizados del ecosistema: esfuerzo bajo (días)
- Módulos adaptados: esfuerzo medio (1 semana)
- Construcción desde cero: esfuerzo alto (semanas)
- Estimación total: sumar + 30% de buffer

## Formato de salida
```
MVP de [Producto]:
✅ Incluye: [lista]
❌ No incluye en v1: [lista]
🔧 Módulos Tulkas reutilizados: [lista con esfuerzo]
🆕 Construir desde cero: [lista con esfuerzo]
⏱ Estimación: [X semanas]
```
