---
name: Negocio — Investigación y Evaluación de Tecnología
key: negocio-tecnologia
description: Cómo evaluar tecnologías, APIs y herramientas para proyectos Tulkas.
---

# Investigación y Evaluación de Tecnología

## Principio Tulkas
Tecnología gratuita primero. Pago solo cuando la escala lo justifica.
No contratar plataformas costosas antes de validar.

## Framework de evaluación

### 1. ¿Existe algo gratuito que lo resuelva?
- Open source primero
- Plan gratuito de SaaS con límites aceptables
- Construcción propia si es simple

### 2. Criterios de evaluación
| Criterio | Peso | Preguntas |
|---------|------|-----------|
| Costo free tier | Alto | ¿Cuánto da gratis? ¿Cuándo se paga? |
| Documentación | Alto | ¿Está actualizada? ¿Hay ejemplos reales? |
| Comunidad | Medio | ¿Hay Stack Overflow? ¿GitHub activo? |
| Vendor lock-in | Alto | ¿Puedo migrar si cambia el precio? |
| LATAM soporte | Medio | ¿Funciona en AR/CL/MX? ¿Acepta pagos locales? |
| Madurez | Alto | ¿Está en producción en empresas reales? |

### 3. Stack actual Tulkas (no reinventar)
- **Auth**: Supabase Auth (ya implementado en todos los proyectos)
- **DB**: Supabase Postgres (ya implementado)
- **Email**: Resend (ya implementado en `@federico/email`)
- **Mensajería WA**: Plan-B client (ya implementado)
- **Deploy**: Vercel (ya configurado)
- **IA**: Anthropic Claude API (ya integrado)
- **Pagos**: MercadoPago (en progreso en Tolrank) / Stripe (pendiente en Plan-B)

### 4. Evaluación de APIs de IA
Para nuevas integraciones de IA:
- **Claude (Anthropic)**: razonamiento complejo, análisis, generación de contenido
- **Haiku**: tareas simples, clasificación, routing → más barato
- **Sonnet**: outputs que el usuario ve → mejor calidad
- Costo estimado por 1000 requests: calcular antes de comprometer

### 5. Cuándo pagar por tecnología
- El free tier está al 80% de su límite
- Hay revenue real que lo justifica
- El costo es < 10% del MRR que genera esa funcionalidad
- No hay alternativa gratuita que haga lo mismo

### 6. Tecnologías a evitar
- Plataformas con lock-in agresivo sin export de datos
- APIs sin SLA para producción
- Herramientas sin documentación en español o inglés claro
- Precios en escala que no son predecibles
