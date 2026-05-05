# COMUNAS

CRM/ERP municipal para comisiones de **Santiago del Estero, Argentina**.

Plataforma única para administrar vecinos (CRM), historia clínica del CAPS (HC), turnos y notificaciones por SMS.

## Stack

- React 19 + Vite
- Supabase (Postgres, Auth, Storage)
- Tailwind CSS (paleta COMUNAS — navy / gold / cream, fuente Sora)
- React Router v7
- TanStack Query
- Despliegue en Vercel

## Paleta

- Primary: `#0F1C35` (navy)
- Accent: `#C9A84C` (gold)
- Background: `#F5F4EF` (cream)
- Border: `#DDE0EC`
- OK / activo: `#1D4ED8` (azul, **NUNCA verde**)

> Regla: cero verde en toda la aplicación. Estados de éxito o "activo" usan azul.

## Estructura

```
src/
  pages/
    admin/        # Panel de la comuna (admin_comuna, operador)
    portal/       # Portal del vecino (vecino)
    superadmin/   # Gestión global (superadmin)
    auth/         # Login, Register
  components/
    crm/          # Vecinos, contactos, etiquetas
    hc/           # Historia clínica del CAPS
    turnos/       # Agenda y reservas
    sms/          # Notificaciones Twilio
    layout/       # AppShell, Sidebar, Topbar
    guards/       # AuthGuard, RoleGuard
    ui/           # Button, Card, Input, Spinner, Badge
  context/        # AuthContext (Supabase)
  lib/            # supabase client, utils
```

## Roles

- `superadmin` — gestión global de comisiones
- `admin_comuna` — admin de una comisión municipal
- `operador` — usuario operativo de la comisión
- `vecino` — usuario final del portal

## Setup local

```bash
npm install
cp .env.example .env.local   # completá las variables
npm run dev
```

## Variables de entorno

Ver `.env.example`. Incluye Supabase, Twilio (SMS), Google OAuth, Plan B y Anthropic Claude.
