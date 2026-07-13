# Setup de Notificaciones Automáticas al Confirmar/Cancelar Turno

## 📋 Endpoint Implementado

**Ruta:** `/api/notificar-turno`

**Propósito:** Recibe webhooks de Supabase cuando un turno cambia a estado `confirmado` o `cancelado`, y envía notificación automática por WhatsApp al vecino.

---

## 🔧 Configuración en Supabase

### 1. Crear Database Webhook

1. Ir a **Supabase Dashboard → Database → Webhooks**
2. Click en **"Create a new hook"**
3. Configurar:

```
Name: Notificar Turno Confirmado/Cancelado
Table: turnos_agenda
Events: UPDATE
Type: HTTP Request
Method: POST
URL: https://realsayana.comunas.lat/api/notificar-turno
HTTP Headers:
  x-webhook-secret: [tu-valor-secreto-aquí]
```

**⚠️ Importante:** El valor de `x-webhook-secret` debe coincidir con la variable de entorno `SUPABASE_WEBHOOK_SECRET` en Vercel.

### 2. Filtro de Webhook (opcional pero recomendado)

Para evitar llamadas innecesarias, agregar este filtro en Supabase:

```sql
-- Solo disparar si el estado cambió a 'confirmado' o 'cancelado'
(NEW.estado = 'confirmado' OR NEW.estado = 'cancelado') 
AND OLD.estado != NEW.estado
```

Esto reduce el tráfico del webhook — solo se dispara cuando hay cambio relevante.

---

## ⚙️ Variables de Entorno Requeridas

Agregar en **Vercel Dashboard → Settings → Environment Variables:**

### **SUPABASE_WEBHOOK_SECRET**
- **Propósito:** Token de seguridad para autenticar webhooks de Supabase
- **Valor:** Generar un string aleatorio (mínimo 32 caracteres)
- **Cómo generar:**
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Ejemplo:** `b8f3d9e1c2b4f6a7d8e9c0b1a2f3d4e5c6b7a8f9d0e1c2b3a4f5d6e7c8b9a0f1`

**Nota:** Este valor debe ser el **mismo** que se configura en el header `x-webhook-secret` del webhook de Supabase.

---

## 🔄 Flujo de Notificación

```
1. Operador confirma/cancela turno en admin
   ↓
2. UPDATE en tabla turnos_agenda
   ↓
3. Supabase dispara webhook → POST /api/notificar-turno
   ↓
4. Endpoint verifica:
   - ¿Es un UPDATE?
   - ¿Estado cambió?
   - ¿Nuevo estado es 'confirmado' o 'cancelado'?
   ↓
5. Si SÍ:
   - Consulta vecino (nombre + teléfono)
   - Consulta dependencia (nombre)
   - Genera mensaje personalizado
   - Envía WhatsApp vía Plan-B
   ↓
6. Retorna resultado
```

---

## 📱 Mensajes Enviados

### Estado: **confirmado**
```
Hola {nombre}, tu turno en {dependencia} para el {fecha} a 
las {hora} fue CONFIRMADO. Ante cualquier consulta, comunicate 
con la Comisión Municipal.
```

### Estado: **cancelado**
```
Hola {nombre}, tu turno en {dependencia} para el {fecha} a 
las {hora} fue CANCELADO. Si necesitás reprogramarlo, 
comunicate con la Comisión Municipal.
```

---

## ⚠️ Diferencias con Recordatorios

| Característica | Recordatorios (cron) | Notificaciones (webhook) |
|---------------|---------------------|------------------------|
| **Trigger** | Cada hora automático | Update en DB |
| **Timing** | 24hs antes | Inmediato |
| **Fallback SMS** | ✅ Sí (crítico) | ❌ No (informativo) |
| **Marca en DB** | `recordatorio_enviado` | No marca nada |
| **Criticidad** | Alta | Media |

**Razón:** Las notificaciones de confirmación/cancelación son **informativas**, no críticas. Si WhatsApp falla, se loguea el error pero no se intenta SMS fallback.

---

## 🧪 Testing Manual

### 1. Test directo del endpoint (simulando webhook):

```bash
curl -X POST https://realsayana.comunas.lat/api/notificar-turno \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: tu-secret-aqui" \
  -d '{
    "type": "UPDATE",
    "record": {
      "id": "uuid-del-turno",
      "vecino_id": "uuid-del-vecino",
      "dependencia_id": "uuid-de-dependencia",
      "municipio_id": "uuid-del-municipio",
      "fecha": "2026-07-15",
      "hora_inicio": "09:00",
      "estado": "confirmado"
    },
    "old_record": {
      "estado": "pendiente"
    }
  }'
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "canal": "whatsapp"
}
```

### 2. Test en producción (cambiar estado real):

1. Ir a **Admin → Tablero de Turnos**
2. Seleccionar un turno en estado `pendiente`
3. Cambiar a `confirmado`
4. Verificar que el vecino recibe WhatsApp
5. Ver logs en Vercel Functions

---

## 📊 Monitoreo

### Logs de Vercel:
1. Ir a **Vercel Dashboard → Deployments → Functions**
2. Click en `/api/notificar-turno`
3. Ver logs de cada ejecución

### Logs de Supabase:
1. Ir a **Supabase Dashboard → Database → Webhooks**
2. Click en el webhook creado
3. Ver historial de invocaciones (success/fail)

---

## ⚠️ Troubleshooting

### Error: "Unauthorized"
- Verificar que `SUPABASE_WEBHOOK_SECRET` en Vercel coincide con el header en Supabase
- El header debe ser exactamente `x-webhook-secret` (minúsculas, con guión)

### Error: "sin-telefono"
- El vecino no tiene teléfono cargado en la DB
- Respuesta: `{ ok: true, skip: 'sin-telefono' }`
- No es un error — simplemente se skipea

### Error: "whatsapp-no-configurado"
- El municipio no tiene `plan_b_api_key` en `configuracion_portal`
- Ejecutar provisioning: `/api/provision-whatsapp`

### Webhook no se dispara
- Verificar que el webhook está **activo** en Supabase
- Verificar que la URL es correcta (https, sin typos)
- Ver logs de webhook en Supabase Dashboard
- Verificar que realmente cambió el estado (OLD.estado != NEW.estado)

### WhatsApp no llega
- Ver logs de `/api/notificar-turno` en Vercel
- Verificar que Plan-B API key es válida
- Ver logs de Plan-B (si tienen acceso)
- Verificar formato de teléfono del vecino

---

## 🚀 Deployment Checklist

- [ ] Crear `SUPABASE_WEBHOOK_SECRET` en Vercel (generar random)
- [ ] Crear webhook en Supabase Dashboard
- [ ] Configurar header `x-webhook-secret` en webhook (mismo valor)
- [ ] Configurar filtro SQL (opcional) para reducir tráfico
- [ ] Activar webhook en Supabase
- [ ] Deploy a producción (ya hecho con este commit)
- [ ] Test: cambiar un turno a 'confirmado' y verificar WhatsApp
- [ ] Test: cambiar un turno a 'cancelado' y verificar WhatsApp
- [ ] Monitorear logs las primeras horas

---

## 🔗 Webhooks de Supabase - Documentación Oficial

- [Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Webhook Filters](https://supabase.com/docs/guides/database/webhooks#payload-filters)

---

**Fecha de implementación:** 2026-07-13  
**Commit:** [pendiente]
