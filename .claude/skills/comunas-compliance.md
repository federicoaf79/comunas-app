---
name: Comunas — Compliance y Datos Públicos
key: comunas-compliance
description: Normativas de privacidad y datos para sistemas municipales en LATAM.
---

# Compliance — Datos Municipales LATAM

## Marco legal relevante

### Argentina (cliente principal)
- **Ley 25.326**: Protección de Datos Personales
  - Los datos de vecinos son datos personales protegidos
  - El municipio es el "responsable" de los datos
  - Tulkas es el "encargado" de tratamiento (procesa por encargo del municipio)
  - Los datos de salud son "datos sensibles" → protección especial

### Chile
- **Ley 19.628**: Protección de la Vida Privada
- **Ley 21.096**: reforma en proceso (similar a GDPR)

## Implicancias para el código
- Los datos de salud (historia clínica) deben estar cifrados
- Los accesos deben quedar en audit log
- El vecino tiene derecho a ver sus propios datos (portal público)
- No compartir datos entre municipios sin consentimiento explícito
- Los backups deben estar en servidores seguros

## RLS (Row Level Security) en Comunas
Las policies de RLS aseguran que:
- Un admin de municipio A NO puede ver datos del municipio B
- Un operador solo ve lo que le corresponde según su rol
- El portal público solo ve los datos del vecino autenticado

```sql
-- Ejemplo de policy correcta
CREATE POLICY "vecinos_por_municipio" ON vecinos
FOR ALL USING (
  municipio_id = current_municipio_id()
  AND has_role('admin', 'operador')
);
```

## Datos sensibles — manejo especial
- Historia clínica: solo visible para profesionales de salud y el propio vecino
- Datos de asistencia social: acceso restringido
- Menores de edad: requieren datos del tutor legal

## Audit log obligatorio
Registrar siempre:
- Quién accedió a datos de salud
- Quién modificó datos de un vecino
- Quién exportó listas de vecinos
