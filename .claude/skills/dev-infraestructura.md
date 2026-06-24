---
name: Dev — Análisis de Infraestructura y Upgrades
key: dev-infraestructura
description: Cuándo y cómo hacer upgrades de infraestructura en el ecosistema Tulkas.
---

# Análisis de Infraestructura Tulkas

## Estado actual (junio 2026)
| Servicio | Plan | Costo | Límite actual |
|---------|------|-------|---------------|
| Supabase OOH | Free | $0 | 500MB DB, 50k req/mes |
| Supabase Tolrank | Free | $0 | 500MB DB, 50k req/mes |
| Supabase Comunas | Free | $0 | 500MB DB, 50k req/mes |
| Supabase Curex | Free | $0 | 500MB DB, 50k req/mes |
| Supabase Plan-B | Free | $0 | 500MB DB, 50k req/mes |
| Supabase FreyHub | Free | $0 | 500MB DB, 50k req/mes |
| Vercel (todos) | Hobby | $0 | 100GB bandwidth |
| Railway Plan-B | Starter | ~$5/mes | 512MB RAM |
| Resend | Free | $0 | 3.000 emails/mes |

## Triggers de upgrade

### Supabase Free → Pro ($25/mes)
**Cuándo:**
- DB supera 400MB (alerta preventiva antes del límite de 500MB)
- Necesidad de Point-in-Time Recovery (datos críticos de clientes)
- +100 usuarios activos diarios
- Pausa automática es un problema (free pausa a los 7 días sin requests)
- Proyecto genera MRR > $200/mes

**Primer proyecto a migrar:** Comunas (tiene cliente activo Real Sayana)

### Vercel Hobby → Pro ($20/mes)
**Cuándo:**
- Necesidad de Web Analytics detallados
- Más de 1 custom domain por proyecto
- Team collaboration necesaria
- Bandwidth supera 80GB/mes

### Railway Starter → Pro (~$20/mes)
**Cuándo:**
- Plan-B supera 5 clientes activos
- El bot necesita 99.9% uptime garantizado
- RAM supera 400MB consistentemente

### Resend Free → Pro ($20/mes)
**Cuándo:**
- Emails enviados superan 2.500/mes (alerta antes del límite de 3.000)
- Plan-B activo con clientes que usan notificaciones por email

### Anthropic API
**Modelo de costo:**
- Haiku: ~$0.25/1M tokens input, $1.25/1M tokens output
- Sonnet: ~$3/1M tokens input, $15/1M tokens output
- Monitorear: si el costo de IA supera 20% del MRR de un proyecto

## Checklist antes de hacer upgrade
1. ¿El proyecto tiene MRR que lo justifica?
2. ¿El costo del upgrade es < 20% del MRR del proyecto?
3. ¿Hay alternativa gratuita todavía viable?
4. ¿El upgrade resuelve un problema real o es preventivo?

## Monitoreo de infraestructura
- Revisar uso de Supabase mensualmente en cada proyecto
- Alertas de Vercel cuando bandwidth supere 80%
- Railway: monitorear RAM y CPU de Plan-B backend
