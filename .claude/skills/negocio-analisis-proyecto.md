---
name: Negocio — Análisis de Proyecto
key: negocio-analisis-proyecto
description: Cómo evaluar la viabilidad completa de un proyecto desde el ángulo de negocio.
---

# Análisis de Proyecto — Viabilidad de Negocio

## Marco de análisis

### 1. Tipo de proyecto
- **Producto propio SaaS**: construir + comercializar
- **Solución para cliente**: scope acotado, pago directo
- **Infraestructura interna**: no genera revenue directo, habilita otros

### 2. Análisis de oportunidad
- ¿Existe el mercado? (no el producto, el mercado)
- ¿Cuánto vale ese mercado en LATAM?
- ¿Hay señales de demanda? (pedidos, búsquedas, competencia pagada)
- ¿Por qué ahora y no antes?

### 3. Modelo de ingresos
- **Directo**: cliente paga a Tulkas
- **Reseller**: agencia compra y revende con margen
- **White-label**: cliente usa con su marca
- **Híbrido**: directo + reseller

### 4. Análisis de costos
- Tiempo de Federico (costo oportunidad)
- Infraestructura inicial: Supabase free + Vercel Hobby = $0
- Infraestructura a escala: estimar cuándo upgrade (Supabase Pro $25/mes, Vercel Pro $20/mes)
- APIs externas: Resend, Twilio, Anthropic — calcular costo por usuario activo

### 5. Proyección financiera simplificada
```
MRR objetivo año 1: $[X]
Precio por cliente: $[Y]/mes
Clientes necesarios: [X/Y]
Tiempo para break-even: [Z meses]
```

### 6. Riesgos de negocio
- Dependencia de terceros (Meta, Stripe, Twilio)
- Competencia que copia el producto
- Mercado muy pequeño
- Canal de distribución inexistente

### 7. Decisión final
- **GO**: mercado claro + canal + precio validado
- **VALIDATE**: dudas sobre demanda o precio
- **NO GO**: mercado chico + sin canal + competencia fuerte
