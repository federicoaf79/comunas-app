# Setup de Recordatorios Automáticos 24hs Antes

## 📋 Variables de Entorno Requeridas en Vercel

Para que los recordatorios automáticos funcionen, deben configurarse las siguientes variables de entorno en **Vercel Dashboard → Settings → Environment Variables**:

### ✅ Obligatorias:

#### 1. **CRON_SECRET**
- **Propósito:** Token de seguridad para autenticar las llamadas del Vercel Cron
- **Valor:** Generar un string aleatorio (mínimo 32 caracteres)
- **Cómo generar:** 
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **Ejemplo:** `a8f3d9e1c2b4f6a7d8e9c0b1a2f3d4e5c6b7a8f9d0e1c2b3a4f5d6e7c8b9a0f1`
- **Nota:** Vercel inyecta automáticamente este valor en el header `Authorization: Bearer CRON_SECRET` cuando ejecuta el cron

#### 2. **TWILIO_ACCOUNT_SID**
- **Propósito:** ID de cuenta de Twilio para enviar SMS (fallback si WhatsApp falla)
- **Dónde obtenerlo:** [Twilio Console](https://console.twilio.com/) → Account Info
- **Formato:** `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

#### 3. **TWILIO_AUTH_TOKEN**
- **Propósito:** Token de autenticación para la API de Twilio
- **Dónde obtenerlo:** [Twilio Console](https://console.twilio.com/) → Account Info
- **Formato:** String de 32 caracteres

#### 4. **TWILIO_SMS_FROM**
- **Propósito:** Número de teléfono de origen para enviar SMS
- **Dónde obtenerlo:** [Twilio Console](https://console.twilio.com/) → Phone Numbers
- **Formato:** `+1234567890` (E.164 format)
- **Nota:** Debe ser un número verificado y activo en Twilio

---

## 🔄 Flujo de Envío de Recordatorios

```
1. Cron ejecuta cada hora (0 * * * *)
2. Busca turnos en ventana de 23-25hs desde ahora
3. Por cada turno:
   a) Intenta WhatsApp vía Plan-B
   b) Si falla → fallback a SMS vía Twilio
   c) Marca turno como recordatorio_enviado=true
4. Retorna estadísticas de envíos
```

---

## ⏰ Configuración del Schedule

**Actual:** `0 9 * * *` (una vez al día a las 9am UTC = 6am Argentina)

### Plan Vercel Hobby/Free:
Los planes Hobby y Free permiten **1 ejecución diaria** de cron jobs.

**Schedule configurado:** `0 9 * * *`
- 9am UTC = 6am Argentina (UTC-3)
- Horario de mañana para dar margen sobre turnos del día siguiente

**Ventana ampliada en `cron-recordatorios.js`:**
```javascript
const desde = new Date(ahora.getTime() + 20 * 60 * 60 * 1000) // 20hs
const hasta = new Date(ahora.getTime() + 28 * 60 * 60 * 1000) // 28hs
```

**Cobertura:** Ventana de 8 horas (20-28hs) para compensar la ejecución única diaria.
Cualquier turno programado entre +20hs y +28hs desde la ejecución del cron recibirá su recordatorio.

### Plan Pro (opcional):
Si se upgradea a Vercel Pro, se puede volver a ejecución horaria:
```json
"schedule": "0 * * * *"  // Cada hora
```
Y ajustar ventana:
```javascript
const desde = new Date(ahora.getTime() + 23 * 60 * 60 * 1000) // 23hs
const hasta = new Date(ahora.getTime() + 25 * 60 * 60 * 1000) // 25hs
```

---

## 🗄️ Cambios en la Base de Datos

El endpoint espera que la tabla `turnos_agenda` tenga estas columnas:

```sql
ALTER TABLE turnos_agenda ADD COLUMN IF NOT EXISTS recordatorio_enviado BOOLEAN DEFAULT false;
ALTER TABLE turnos_agenda ADD COLUMN IF NOT EXISTS recordatorio_enviado_at TIMESTAMPTZ;
ALTER TABLE turnos_agenda ADD COLUMN IF NOT EXISTS recordatorio_canal TEXT;
```

**Estado actual:** ⚠️ **VERIFICAR SI EXISTEN** — si no existen, el cron fallará.

---

## 🧪 Testing Manual

### 1. Test local del endpoint:
```bash
curl -X POST http://localhost:3000/api/cron-recordatorios \
  -H "Authorization: Bearer tu-cron-secret-local"
```

### 2. Test en producción:
```bash
curl -X POST https://realsayana.comunas.lat/api/cron-recordatorios \
  -H "Authorization: Bearer tu-cron-secret-de-vercel"
```

**Respuesta esperada:**
```json
{
  "ok": true,
  "enviados": 3,
  "detalle": [
    { "turno_id": "uuid-1", "canal": "whatsapp" },
    { "turno_id": "uuid-2", "canal": "whatsapp" },
    { "turno_id": "uuid-3", "canal": "sms" }
  ]
}
```

---

## 📊 Monitoreo

### Logs de Vercel:
1. Ir a **Vercel Dashboard → Deployments → [última versión] → Functions**
2. Click en `/api/cron-recordatorios`
3. Ver logs de ejecución

### Verificar en DB:
```sql
SELECT 
  id, fecha, hora_inicio, 
  recordatorio_enviado, recordatorio_enviado_at, recordatorio_canal
FROM turnos_agenda
WHERE recordatorio_enviado = true
ORDER BY recordatorio_enviado_at DESC
LIMIT 20;
```

---

## ⚠️ Troubleshooting

### Error: "Unauthorized"
- Verificar que `CRON_SECRET` está configurada en Vercel
- El cron de Vercel inyecta automáticamente el header — NO intentar setear el secret manualmente

### Error: "Cannot read property 'telefono' of null"
- El vecino no tiene teléfono cargado
- El endpoint lo skipea automáticamente

### Error: WhatsApp falla pero SMS también
- Verificar credenciales de Twilio
- Verificar que `TWILIO_SMS_FROM` es un número activo
- Ver logs de Twilio Console para detalles del error

### No se envían recordatorios
- Verificar que existen turnos en ventana 23-25hs
- Verificar que `recordatorio_enviado = false`
- Verificar que el cron se ejecuta (ver logs de Vercel)

---

## 🚀 Deployment Checklist

- [ ] Crear `CRON_SECRET` en Vercel (generar string random)
- [ ] Agregar `TWILIO_ACCOUNT_SID` en Vercel
- [ ] Agregar `TWILIO_AUTH_TOKEN` en Vercel
- [ ] Agregar `TWILIO_SMS_FROM` en Vercel (número E.164)
- [ ] Verificar columnas en tabla `turnos_agenda` (recordatorio_*)
- [ ] Verificar plan de Vercel (Free vs Pro) y ajustar schedule
- [ ] Deploy a producción
- [ ] Esperar 1 hora y verificar logs
- [ ] Verificar que se marcó `recordatorio_enviado=true` en DB

---

**Fecha de implementación:** 2026-07-13  
**Commit:** [pendiente]
