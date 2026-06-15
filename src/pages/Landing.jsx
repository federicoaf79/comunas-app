import { useState } from 'react'
import { supabasePublic } from '../lib/supabase'

// =============================================================
// Landing — página de ventas de COMUNAS en comunas.lat
//
// Componente standalone sin AppShell ni AdminLayout.
// Paleta navy/gold/cream, fuente Sora, cero verde.
// Mobile-first, scroll suave, transiciones simples.
// =============================================================

export default function Landing() {
  return (
    <div className="min-h-screen bg-background font-sora">
      <style>{`
        html {
          scroll-behavior: smooth;
        }
        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }
        }
      `}</style>
      <Nav />
      <Hero />
      <Problema />
      <Modulos />
      <ParaQuien />
      <Proceso />
      <Contacto />
      <Footer />
    </div>
  )
}

// =============================================================
// NAV — sticky navy con logo, links y CTA
// =============================================================

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-primary-700/30 bg-primary backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="h-8 w-8" fill="none">
            <path
              d="M20 4L8 12v16l12 8 12-8V12L20 4z"
              stroke="#C9A84C"
              strokeWidth="2"
              fill="none"
            />
            <circle cx="20" cy="20" r="4" fill="#C9A84C" />
          </svg>
          <div>
            <div className="font-sora text-xl font-bold text-accent">COMUNAS</div>
            <div className="text-[10px] text-white/50">Gestión Municipal Digital</div>
          </div>
        </div>

        {/* Links desktop */}
        <div className="hidden items-center gap-8 md:flex">
          <a href="#producto" className="text-sm text-white/70 transition-colors hover:text-white">
            Producto
          </a>
          <a href="#modulos" className="text-sm text-white/70 transition-colors hover:text-white">
            Módulos
          </a>
          <a href="#para-quien" className="text-sm text-white/70 transition-colors hover:text-white">
            Para quién
          </a>
          <a href="#contacto" className="text-sm text-white/70 transition-colors hover:text-white">
            Contacto
          </a>
        </div>

        {/* CTA desktop */}
        <a
          href="https://realsayana.comunas.lat"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden items-center gap-1.5 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-primary md:inline-flex"
        >
          Ver demo →
        </a>

        {/* Hamburger mobile */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="md:hidden"
          aria-label="Menu"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
            {menuOpen ? (
              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Menu mobile */}
      {menuOpen && (
        <div className="border-t border-primary-700/30 bg-primary px-4 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            <a href="#producto" className="text-sm text-white/70" onClick={() => setMenuOpen(false)}>
              Producto
            </a>
            <a href="#modulos" className="text-sm text-white/70" onClick={() => setMenuOpen(false)}>
              Módulos
            </a>
            <a href="#para-quien" className="text-sm text-white/70" onClick={() => setMenuOpen(false)}>
              Para quién
            </a>
            <a href="#contacto" className="text-sm text-white/70" onClick={() => setMenuOpen(false)}>
              Contacto
            </a>
            <a
              href="https://realsayana.comunas.lat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-accent"
            >
              Ver demo →
            </a>
          </div>
        </div>
      )}
    </nav>
  )
}

// =============================================================
// HERO — fondo navy, layout 2 cols, mockup del sistema
// =============================================================

function Hero() {
  return (
    <section className="bg-primary py-16 sm:py-24 lg:min-h-[90vh]">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[60%_40%] lg:gap-16 lg:px-8">
        {/* Columna izquierda */}
        <div className="flex flex-col justify-center">
          {/* Eyebrow */}
          <div className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent"></span>
            </span>
            <span className="text-xs text-accent">
              Plataforma SaaS para comisiones municipales · Argentina
            </span>
          </div>

          {/* H1 */}
          <h1 className="mb-6 font-sora text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
            La gestión municipal del interior argentino, por fin digital.
          </h1>

          {/* Descripción */}
          <p className="mb-8 text-base text-white/65 sm:text-lg">
            COMUNAS integra portal ciudadano, salud, obras, ERP y mensajería en un sistema
            pensado para comisiones de 1.000 a 15.000 habitantes. Activo en 72 horas.
          </p>

          {/* CTAs */}
          <div className="mb-8 flex flex-col gap-3 sm:flex-row">
            <a
              href="#contacto"
              className="inline-flex items-center justify-center rounded-md bg-accent px-6 py-3 font-bold text-primary transition-transform hover:scale-105"
            >
              Solicitar demo
            </a>
            <a
              href="https://realsayana.comunas.lat"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-accent px-6 py-3 font-medium text-accent transition-colors hover:bg-accent hover:text-primary"
            >
              Ver el sistema en vivo →
            </a>
          </div>

          {/* Trust bar */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-white/50">
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-accent" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Sin instalación
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-accent" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Activo en 72hs
            </div>
            <span>·</span>
            <div className="flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" className="h-4 w-4 text-accent" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Soporte incluido
            </div>
          </div>
        </div>

        {/* Columna derecha — Mockup */}
        <div className="flex items-center justify-center">
          <Mockup />
        </div>
      </div>
    </section>
  )
}

// Mockup del dashboard (componente separado para claridad)
function Mockup() {
  return (
    <div className="w-full max-w-md rounded-2xl border border-accent/20 bg-[#1a2d4a] p-1 shadow-2xl">
      {/* Browser bar */}
      <div className="mb-3 flex items-center gap-1.5 rounded-t-xl bg-primary/50 px-3 py-2">
        <div className="h-2.5 w-2.5 rounded-full bg-danger"></div>
        <div className="h-2.5 w-2.5 rounded-full bg-accent"></div>
        <div className="h-2.5 w-2.5 rounded-full bg-[#4a5e3a]"></div>
        <div className="ml-2 flex-1 rounded bg-primary/30 px-2 py-1 text-[10px] text-white/40">
          panel.comunas.lat
        </div>
      </div>

      {/* Dashboard content */}
      <div className="space-y-3 p-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <div className="text-xs text-white/50">Comisión Municipal</div>
            <div className="text-sm font-bold text-white">Dashboard</div>
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-xs font-bold text-accent">
            SD
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-primary/40 p-3">
            <div className="text-[10px] text-white/50">Turnos hoy</div>
            <div className="flex items-end justify-between">
              <div className="text-xl font-bold text-white">24</div>
              <svg viewBox="0 0 12 12" className="h-3 w-3 text-accent" fill="currentColor">
                <path d="M6 2v8M2 6l4-4 4 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="rounded-lg bg-primary/40 p-3">
            <div className="text-[10px] text-white/50">Vecinos</div>
            <div className="text-xl font-bold text-white">1.247</div>
          </div>
          <div className="rounded-lg bg-primary/40 p-3">
            <div className="text-[10px] text-white/50">Obras activas</div>
            <div className="text-xl font-bold text-white">3</div>
          </div>
          <div className="rounded-lg bg-primary/40 p-3">
            <div className="text-[10px] text-white/50">Mensajes</div>
            <div className="text-xl font-bold text-white">89</div>
          </div>
        </div>

        {/* Últimas atenciones */}
        <div>
          <div className="mb-2 text-[10px] font-medium text-white/50">Últimas atenciones</div>
          <div className="space-y-1.5">
            {[
              { nombre: 'García, Juan', hora: '09:15', estado: 'Atendido', color: 'ok-600' },
              { nombre: 'Romero, Ana', hora: '10:30', estado: 'En espera', color: 'accent' },
              { nombre: 'López, Carlos', hora: '11:00', estado: 'Pendiente', color: 'primary-300' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 rounded bg-primary/30 px-2 py-1.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-[10px] font-bold text-accent">
                  {item.nombre.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="flex-1 text-[11px] text-white">{item.nombre}</div>
                <div className="text-[10px] text-white/40">{item.hora}</div>
                <div className={`rounded bg-${item.color}/20 px-1.5 py-0.5 text-[9px] font-medium text-${item.color}`}>
                  {item.estado}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Obra progress */}
        <div className="rounded-lg bg-primary/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-medium text-white">Red de agua - Barrio Norte</div>
            <div className="text-[11px] font-bold text-accent">65%</div>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-primary/50">
            <div className="h-full w-[65%] bg-accent"></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================================
// PROBLEMA — qué resuelve COMUNAS
// =============================================================

function Problema() {
  const problemas = [
    {
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
      titulo: 'Sin historial clínico digital',
      texto: 'Los médicos rotativos atienden sin saber el historial del paciente. COMUNAS genera la HC en la primera consulta y la mantiene para siempre.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
      titulo: 'Sin canal oficial al vecino',
      texto: 'El empleado usa su WhatsApp personal. Con COMUNAS, el municipio tiene mensajería oficial segmentada por barrio, zona o dependencia.',
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      titulo: 'Rendición sin trazabilidad',
      texto: 'Gastos en Excel, errores en el SARC, observaciones del Tribunal de Cuentas. El ERP de COMUNAS genera la rendición automáticamente.',
    },
  ]

  return (
    <section id="producto" className="bg-background py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <h2 className="mb-4 font-sora text-3xl font-bold text-primary sm:text-4xl">
            ¿Cómo gestiona hoy tu comisión?
          </h2>
          <p className="mx-auto max-w-2xl text-base text-primary-500 sm:text-lg">
            La mayoría de las comisiones municipales del interior trabajan con papeles, planillas
            Excel y WhatsApp personal. COMUNAS lo cambia todo.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {problemas.map((p, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              style={{ borderLeftWidth: '4px', borderLeftColor: '#0F1C35' }}
            >
              <div className="mb-4 text-primary">{p.icon}</div>
              <h3 className="mb-2 font-sora text-lg font-bold text-primary">{p.titulo}</h3>
              <p className="text-sm text-primary-600">{p.texto}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 flex justify-center">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 animate-bounce text-accent"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  )
}

// =============================================================
// MÓDULOS — grid de 9 módulos del sistema
// =============================================================

function Modulos() {
  const modulos = [
    {
      icon: '🏥',
      titulo: 'Sala de Primeros Auxilios',
      desc: 'Historia clínica digital, turnos médicos, médicos rotativos y registro de atenciones.',
    },
    {
      icon: '🌐',
      titulo: 'Portal Ciudadano',
      desc: 'Noticias, trámites, historia del municipio, videos educativos y recursos descargables.',
    },
    {
      icon: '📅',
      titulo: 'Turnos & Agenda',
      desc: 'Turnos online y presenciales para todas las dependencias. Alta liviana de vecinos.',
    },
    {
      icon: '💰',
      titulo: 'ERP Municipal',
      desc: 'Gastos, ingresos, presupuesto por partida y rendición compatible con SARC.',
    },
    {
      icon: '🏗️',
      titulo: 'Obras Públicas',
      desc: 'Seguimiento de obras con avance, presupuesto ejecutado e historial de cambios.',
    },
    {
      icon: '⚖️',
      titulo: 'Juez de Paz & SUM',
      desc: 'Expedientes del juzgado y reservas del salón de usos múltiples.',
    },
    {
      icon: '📦',
      titulo: 'Inventario & Flota',
      desc: 'Stock de insumos con alertas de mínimo y gestión de vehículos municipales.',
    },
    {
      icon: '💬',
      titulo: 'Mensajería',
      desc: 'SMS y WhatsApp segmentados por zona, barrio o dependencia municipal.',
    },
    {
      icon: '🔒',
      titulo: 'Auditoría & Roles',
      desc: 'Log de accesos y cambios. 8 niveles de roles para todo el equipo municipal.',
    },
  ]

  return (
    <section id="modulos" className="bg-primary py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <div className="mb-3 text-xs font-bold uppercase tracking-wider text-accent">
            TODO INCLUIDO
          </div>
          <h2 className="mb-4 font-sora text-3xl font-bold text-white sm:text-4xl">
            Una plataforma, nueve módulos
          </h2>
          <p className="mx-auto max-w-2xl text-base text-white/60 sm:text-lg">
            Sin costos por módulo adicional. Sin sorpresas.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {modulos.map((m, i) => (
            <div
              key={i}
              className="group rounded-xl border border-accent/20 bg-[#1a2d4a] p-5 transition-all hover:-translate-y-0.5 hover:border-accent/40"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-2xl">
                {m.icon}
              </div>
              <h3 className="mb-2 text-[15px] font-bold text-white">{m.titulo}</h3>
              <p className="text-[13px] leading-relaxed text-white/60">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// (Continuar con resto de secciones...)
