---
name: Negocio — Análisis Financiero
key: negocio-financiero
description: Cómo analizar costos, ROI e infraestructura financiera de proyectos Tulkas.
---

# Análisis Financiero — Proyectos Tulkas

## Costos base del ecosistema (estado actual)
| Servicio | Plan | Costo | Proyectos |
|---------|------|-------|-----------|
| Supabase | Free x6 | $0 | Todos |
| Vercel | Hobby | $0 | Todos |
| Railway | Starter | ~$5/mes | Plan-B backend |
| Resend | Free | $0 | OOH, Tolrank, Curex |
| Anthropic API | Pay-per-use | Variable | Todos con IA |
| Cloudflare | Free | $0 | DNS todos |
| GitHub | Free | $0 | Todos |

## Cuándo hacer upgrade (triggers financieros)

### Supabase Free → Pro ($25/mes por proyecto)
- DB supera 500MB
- Necesidad de Point-in-Time Recovery
- +100 usuarios activos en un proyecto
- Primer proyecto que justifica: Comunas (tiene cliente pagador)

### Vercel Hobby → Pro ($20/mes)
- Necesidad de analytics detallados
- Más de 1 custom domain por proyecto
- Team collaboration necesaria

### Railway Starter → Pro
- Plan-B con +5 clientes activos

### Resend Free → Pro ($20/mes)
- Superar 3.000 emails/mes
- Plan-B activado con clientes reales

## Cálculo de rentabilidad por proyecto

### Fórmula base
```
MRR = Precio × Clientes activos
Costos = Infraestructura + APIs + Tiempo mantenimiento
Margen = MRR - Costos
Payback inicial = Tiempo desarrollo ÷ Margen mensual
```

### Modelo de reseller
```
Precio Tulkas al reseller: $X/mes
Precio reseller al cliente final: $X * 1.5-2 = $Y/mes
Margen reseller: 50-100%
Volumen: reseller con 5+ clientes = mejor que 5 clientes directos
```

## ROI de infraestructura
Antes de hacer upgrade, calcular:
- ¿Cuántos clientes adicionales habilita este upgrade?
- ¿El upgrade cuesta menos del 20% de lo que genera?
- ¿Hay alternativa gratuita todavía viable?

## Métricas financieras clave por proyecto
- **MRR** (Monthly Recurring Revenue): ingresos mensuales recurrentes
- **Churn**: % de clientes que cancelan por mes (objetivo: < 5%)
- **LTV** (Lifetime Value): MRR ÷ Churn
- **CAC** (Customer Acquisition Cost): costo de conseguir un cliente
- **Payback period**: CAC ÷ margen mensual por cliente
