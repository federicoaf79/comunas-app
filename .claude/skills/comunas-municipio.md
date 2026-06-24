---
name: Comunas — Contexto Municipal LATAM
key: comunas-municipio
description: Cómo funciona un municipio en LATAM y cómo Comunas lo digitaliza.
---

# Municipios LATAM — Contexto para Comunas

## Estructura típica de un municipio
- **Intendente/Alcalde**: máxima autoridad ejecutiva
- **Secretarías**: áreas de gobierno (salud, obras, hacienda, social)
- **Dependencias**: unidades operativas dentro de cada secretaría
- **Empleados municipales**: personal administrativo y de campo
- **Vecinos**: ciudadanos que acceden a servicios

## Servicios que digitaliza Comunas
- **Gestión de vecinos**: padrón, datos, historial de interacciones
- **Salud**: historia clínica, turnos médicos, sala de primeros auxilios
- **Turnos online**: agenda para cualquier servicio municipal
- **Portal público**: vecinos pueden ver su información sin ir al municipio
- **Mensajería**: SMS/WhatsApp para comunicar novedades a vecinos
- **Patrimonio**: inventario de bienes del municipio
- **Flota**: gestión de vehículos municipales

## El cliente típico de Comunas
- Municipio de 5.000 a 100.000 habitantes
- Provincia argentina (Santiago del Estero es el cliente piloto: Real Sayana)
- Personal administrativo sin formación técnica avanzada
- Necesitan que el sistema sea simple y rápido

## Modelo de tenancy en Comunas
```
Super admin (Tulkas): acceso a todos los municipios
Admin municipio: acceso a su municipio + configuración
Operador: acceso a funciones asignadas (ej: solo turnos)
Portal público: vecinos sin login (magic links)
```

## Flujo de onboarding de un municipio nuevo
1. Crear el tenant en el sistema (nombre, logo, datos)
2. Crear las dependencias (secretarías, áreas)
3. Cargar el padrón de vecinos (CSV o manual)
4. Configurar los servicios activos
5. Crear usuarios del personal
6. Capacitar al admin del municipio
7. Activar el portal público con el dominio del municipio

## Terminología en el código
```
municipio / tenant: la instancia de cada gobierno local
vecino: ciudadano registrado en el padrón
dependencia: área del municipio (Secretaría de Salud, etc.)
profesional: médico u otro especialista que da turnos
turno: cita agendada entre vecino y profesional
historia_clinica: registro médico del vecino
```
