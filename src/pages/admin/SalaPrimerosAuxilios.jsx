import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { medicoGuardia } from '../../lib/mockData'
import { useTurnos, useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useSalaPaConfigAdmin, DEFAULT_SALA_PA_CONFIG } from '../../hooks/useConfigPortal'
import { useAuth } from '../../context/AuthContext'
import { shortDateOf, todayArgYMD, timeOf } from '../../lib/datetime'
import Avatar from '../../components/ui/Avatar'
import StatCard from '../../components/ui/StatCard'
import Spinner from '../../components/ui/Spinner'
import RecetaUploader from '../../components/hc/RecetaUploader'
import AdministracionTab from '../../components/admin/AdministracionTab'
import TurnoPresencialModal from '../../components/admin/TurnoPresencialModal'
import PlanillaImprimir from '../../components/admin/PlanillaImprimir'
import CalendarioSemanal, {
  COLOR_BY_SPEC,
  SPEC_LABEL,
} from '../../components/turnos/CalendarioSemanal'

// Etiqueta de sección activa para el breadcrumb del header.
// No se renderiza una barra de tabs: el usuario navega entre
// sub-secciones desde el sidebar (AdminLayout NavGroup).
const SECCION_LABEL = {
  agenda:         'Agenda',
  administracion: 'Administración',
}

function vecinoLabel(t) {
  const v = t.vecino
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

// Clases en src/index.css — paleta unificada (cero verde).
const ESTADO_DIA = {
  pendiente:  'estado-pendiente',
  confirmado: 'estado-confirmado',
  en_curso:   'estado-en-curso',
  completado: 'estado-completado',
  cancelado:  'estado-cancelado',
  reservado:  'estado-pendiente',
  atendido:   'estado-atendido',
  ausente:    'estado-cancelado',
}

// Lunes 00:00 local de la semana que contiene `date`.
function startOfWeekMonday(date) {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0) // anchor a mediodía para evitar rollover
  const day = d.getDay()         // 0 = Domingo, 1 = Lunes, ...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function ymdLocal(d) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export default function SalaPrimerosAuxilios() {
  const navigate = useNavigate()
  const { perfil, hasRole } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  const esDirector  = hasRole(['admin_comuna', 'superadmin'])
  const canApprove  = esDirector
  const canCreate   = hasRole(['admin_comuna', 'superadmin', 'subadmin', 'usuario_sub'])

  // Lectura del ?tab= desde URL. Sin escritura: el cambio de
  // sub-sección viene exclusivamente desde el sidebar (AdminLayout).
  //   'admin' → 'administracion' (alias)
  //   resto / vacío → 'agenda'
  const [searchParams] = useSearchParams()
  const tabParamRaw = searchParams.get('tab') || ''
  const tabRequested = tabParamRaw === 'admin' || tabParamRaw === 'administracion'
                       ? 'administracion'
                       : 'agenda'
  const [vista, setVista] = useState('dia')
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()))
  const [turnoModalOpen, setTurnoModalOpen] = useState(false)
  // Fecha que se imprime — por default hoy. El usuario puede cambiarla
  // con el date picker chico junto al botón de impresión.
  const [printDate, setPrintDate] = useState(() => todayArgYMD())
  const qc = useQueryClient()
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])

  // Dependencia de salud para restringir las queries de turnos a
  // la Sala PA. Buscamos sobre varios `tipo` posibles porque las
  // bases viejas usan 'caps' / 'sala' / 'primeros_auxilios' y las
  // nuevas tienden a 'salud'. Resolver por listado evita falsos
  // negativos del filtro estricto `tipo='caps'`.
  const depsQ = useDependencias(municipioId)
  const depSalud = useMemo(() => {
    const tipos = ['salud', 'caps', 'sala', 'primeros_auxilios']
    return (depsQ.data ?? []).find(d => tipos.includes((d?.tipo ?? '').toLowerCase())) ?? null
  }, [depsQ.data])
  const dependenciaSaludId = depSalud?.id ?? null
  const depSaludNombre     = depSalud?.nombre ?? null

  // Gating por dependencias_acceso. Directores ven todo; otros roles
  // ven Agenda solo si tienen `puede_gestionar` y Administración solo
  // si tienen `puede_administrar` para esta dep.
  const miAcceso = useMemo(() => {
    if (!dependenciaSaludId) return null
    return (perfil?.dependencias_acceso ?? [])
      .find(d => d?.dependencia_id === dependenciaSaludId) ?? null
  }, [perfil, dependenciaSaludId])
  const puedeGestionar   = esDirector || !!miAcceso?.puede_gestionar
  const puedeAdministrar = esDirector || !!miAcceso?.puede_administrar
  // Si el usuario llega sin permiso para la sección pedida (o sin
  // ?tab y sin permiso de gestión), cae a la primera permitida.
  const seccionPermitida = (s) =>
    s === 'administracion' ? puedeAdministrar : puedeGestionar
  const primeraSeccion = puedeGestionar
    ? 'agenda'
    : puedeAdministrar ? 'administracion' : null
  const seccion = seccionPermitida(tabRequested) ? tabRequested : primeraSeccion

  // Vista día: turnos reales del día actual (Supabase). Si la
  // dependencia de salud está resuelta, filtramos por ella.
  const today = todayArgYMD()
  const { turnos: turnosDia, isLoading: diaLoading } = useTurnos({
    fecha:         vista === 'dia' && seccion === 'agenda' ? today : undefined,
    dependenciaId: dependenciaSaludId ?? undefined,
  })
  const atendidos = (turnosDia ?? []).filter(t => t.estado === 'atendido').length
  // Alergias requieren un hook real (TODO). Hasta entonces el KPI
  // queda en 0 — placeholder hasta que tengamos source of truth.
  const conAlergias = []

  // Vista semana: turnos del rango via Supabase real.
  const { turnos: turnosSemana, isLoading: weekLoading, error: weekError } = useTurnos({
    fechaFrom:     vista === 'semana' && seccion === 'agenda' ? ymdLocal(weekStart) : undefined,
    fechaTo:       vista === 'semana' && seccion === 'agenda' ? ymdLocal(weekEnd)   : undefined,
    dependenciaId: dependenciaSaludId ?? undefined,
  })

  // Configuración operativa de Sala PA — la duración estándar de
  // turno se imprime en el footer de la planilla. Si el hook todavía
  // no resolvió, usamos el default para no romper el render.
  const salaPaConfigQ = useSalaPaConfigAdmin({ municipioIdOverride: municipioId })
  const duracionTurnoMin = Number(
    salaPaConfigQ.data?.duracion_turno_min ?? DEFAULT_SALA_PA_CONFIG.duracion_turno_min,
  )

  function prevWeek() { setWeekStart(prev => addDays(prev, -7)) }
  function nextWeek() { setWeekStart(prev => addDays(prev,  7)) }
  function thisWeek() { setWeekStart(startOfWeekMonday(new Date())) }

  // Imprime la planilla del día seleccionado. La sub-vista
  // <PlanillaImprimir> queda montada en background y siempre
  // suscripta a `printDate`; acá nos aseguramos de que la query
  // esté fresca antes de abrir el diálogo del sistema.
  async function handleImprimir() {
    if (!dependenciaSaludId) return
    try {
      await qc.invalidateQueries({ queryKey: ['turnos'] })
    } catch { /* sin red, igual intentamos imprimir lo que haya en cache */ }
    // requestAnimationFrame para asegurar que el DOM con los datos
    // ya esté pintado cuando el navegador toma la captura.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => window.print())
    })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Sala de Primeros Auxilios</h1>
        <p className="mt-1 text-sm text-primary-500">
          <span className="text-primary-400">Sala PA</span>
          <span className="mx-1.5 text-primary-300">›</span>
          <span className="font-medium text-primary-700">{SECCION_LABEL[seccion] ?? '—'}</span>
          {depSaludNombre && (
            <span className="text-primary-400"> · {depSaludNombre}</span>
          )}
        </p>
      </header>

      {!seccion && (
        <div className="card border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
          No tenés permisos para ver esta sección.
        </div>
      )}

      {seccion === 'administracion' && (
        !depsQ.isLoading && !dependenciaSaludId ? (
          <div className="card border-accent-100 bg-accent-50 p-5 text-sm text-accent-700">
            <p className="font-semibold">No se encontró la dependencia de salud.</p>
            <p className="mt-1 text-xs">
              Verificá que exista una dependencia de tipo
              {' '}<code>salud</code>, <code>caps</code>, <code>sala</code> o{' '}
              <code>primeros_auxilios</code> en este municipio.
            </p>
          </div>
        ) : (
          <AdministracionTab
            dependenciaId={dependenciaSaludId}
            dependenciaNombre={depSaludNombre}
            municipioId={municipioId}
            canApprove={canApprove}
            canCreate={canCreate}
          />
        )
      )}

      {seccion === 'agenda' && <>
      {/* Header de Agenda — 2 columnas (médico compacto + controles).
          Mobile: columnas apiladas verticalmente. */}
      <div className="grid gap-3 lg:grid-cols-2 lg:items-stretch">
        {/* Columna IZQ — médico compacto */}
        <div className="card flex items-center gap-3 px-4 py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-700">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v6a4 4 0 0 1-4 4M12 2v6a4 4 0 0 0 4 4M8 12h8M12 12v8" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-400">
              Médico de guardia
            </p>
            <p className="truncate font-sora text-sm font-semibold text-primary">
              {medicoGuardia.nombre}
              <span className="ml-2 text-xs font-medium text-primary-500">
                · {medicoGuardia.especialidad} · {medicoGuardia.matricula}
              </span>
            </p>
            <p className="truncate text-xs text-primary-500">
              {medicoGuardia.desde} – {medicoGuardia.hasta} · {medicoGuardia.telefono}
            </p>
          </div>
        </div>

        {/* Columna DER — controles (toggle vista arriba, acciones abajo) */}
        <div className="card flex flex-col gap-2 p-3">
          {/* Fila superior — toggle día/semana */}
          <div className="inline-flex self-start rounded-md border border-border bg-white p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setVista('dia')}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${
                vista === 'dia' ? 'bg-primary text-white shadow-sm' : 'text-primary-500 hover:bg-primary-50'
              }`}
            >
              Vista día
            </button>
            <button
              type="button"
              onClick={() => setVista('semana')}
              className={`rounded px-3 py-1.5 font-medium transition-colors ${
                vista === 'semana' ? 'bg-primary text-white shadow-sm' : 'text-primary-500 hover:bg-primary-50'
              }`}
            >
              Vista semana
            </button>
          </div>

          {/* Fila inferior — turno presencial, imprimir, fecha */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTurnoModalOpen(true)}
              disabled={!dependenciaSaludId}
              className="inline-flex items-center justify-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-primary-900 shadow-sm transition-colors hover:bg-accent-600 disabled:cursor-not-allowed disabled:opacity-50"
              title={dependenciaSaludId ? '' : 'Configurá una dependencia de salud para crear turnos'}
            >
              + Turno presencial
            </button>
            <button
              type="button"
              onClick={handleImprimir}
              disabled={!dependenciaSaludId}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border-2 border-primary bg-white px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-primary hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              title={dependenciaSaludId ? `Imprimir turnos del ${printDate}` : 'Configurá una dependencia de salud'}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z" />
              </svg>
              Imprimir turnos
            </button>
            <input
              type="date"
              value={printDate}
              onChange={e => setPrintDate(e.target.value || todayArgYMD())}
              aria-label="Fecha a imprimir"
              className="w-[145px] rounded-md border border-border bg-white px-2 py-2 text-sm text-primary-700 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>
      </div>

      {vista === 'dia' && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard label="Turnos del día" value={turnosDia.length} />
            <StatCard label="Atendidos"      value={atendidos} accent="accent" />
            <StatCard
              label="Pacientes con alergia"
              value={conAlergias.length}
              accent="danger"
              hint="Verificar antes de medicar"
            />
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <div className="card overflow-hidden p-0 lg:col-span-2">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-primary-700">Agenda del día</h2>
              </header>
              {diaLoading ? (
                <div className="flex items-center justify-center px-5 py-10">
                  <Spinner />
                </div>
              ) : (turnosDia ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-sm text-primary-400">Sin turnos cargados.</div>
              ) : (
                <ul className="divide-y divide-border">
                  {(turnosDia ?? []).map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/sala/atencion/${t.id}`)}
                        className="flex w-full flex-wrap items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-primary-50/50"
                      >
                        <span className="w-14 shrink-0 text-sm font-semibold text-primary">
                          {timeOf(t.fecha_hora) || '—'}
                        </span>
                        <Avatar name={vecinoLabel(t)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-primary-700">
                            {vecinoLabel(t)}
                          </p>
                          <p className="truncate text-xs text-primary-400">
                            {t.motivo || 'Consulta clínica'}
                          </p>
                        </div>
                        <span className={ESTADO_DIA[t.estado] ?? 'estado-pendiente'}>{t.estado}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card p-0">
              <header className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold text-primary-700">Cargar receta por foto</h2>
                <p className="mt-0.5 text-xs text-primary-400">
                  Foto desde el celular o seleccionar archivo. Queda asociada al vecino.
                </p>
              </header>
              <div className="p-5">
                <RecetaUploader />
              </div>
            </div>
          </div>
        </>
      )}

      {vista === 'semana' && (
        <>
          {/* Navegación */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={prevWeek} className="btn-secondary">← Semana anterior</button>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={thisWeek} className="font-medium text-primary hover:underline">
                Esta semana
              </button>
              <span className="font-semibold text-primary">
                {shortDateOf(weekStart)} – {shortDateOf(weekEnd)}
              </span>
            </div>
            <button onClick={nextWeek} className="btn-secondary">Semana siguiente →</button>
          </div>

          {/* Leyenda */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-white px-4 py-2 text-xs text-primary-500">
            {Object.keys(COLOR_BY_SPEC).map(key => (
              <span key={key} className="inline-flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded ${COLOR_BY_SPEC[key].solid}`} />
                <span>{SPEC_LABEL[key]}</span>
              </span>
            ))}
            <span className="ml-auto inline-flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded bg-primary" />
                Confirmado
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-3 w-5 rounded border-2 border-dashed border-primary" />
                Pendiente
              </span>
              <span className="inline-flex items-center gap-1 line-through opacity-50">
                <span className="inline-block h-3 w-5 rounded bg-primary opacity-50" />
                Cancelado
              </span>
            </span>
          </div>

          {weekError && (
            <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
              No pudimos cargar los turnos de la semana: {weekError.message}
            </div>
          )}

          {weekLoading ? (
            <div className="card flex items-center justify-center p-10">
              <Spinner size="lg" />
            </div>
          ) : (
            <CalendarioSemanal weekStart={weekStart} turnos={turnosSemana} />
          )}
        </>
      )}
      </>}

      {/* Modal de turno presencial — vive fuera del flujo de tabs
          para que se pueda abrir desde cualquier estado de la página. */}
      <TurnoPresencialModal
        open={turnoModalOpen}
        onClose={() => setTurnoModalOpen(false)}
        dependencia={depSalud}
        profesionalId={perfil?.id ?? null}
        municipioId={municipioId}
        onCreated={() => qc.invalidateQueries({ queryKey: ['turnos'] })}
      />

      {/* Planilla imprimible — siempre montada (oculta en pantalla),
          se hace visible solo en @media print. Carga los turnos del
          día seleccionado vía el cache de react-query. */}
      <PlanillaImprimir
        fecha={printDate}
        dependenciaId={dependenciaSaludId}
        duracionTurnoMin={duracionTurnoMin}
      />

      {/* Estilos de impresión: oculta TODO el chrome del admin durante
          la impresión y deja visible solo la planilla. La planilla en
          pantalla queda con display:none — Tailwind no tiene un util
          mobile-first para esto, así que va por CSS plano. */}
      <style>{`
        .planilla-print { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body * { visibility: hidden !important; }
          .planilla-print, .planilla-print * { visibility: visible !important; }
          .planilla-print {
            display: block !important;
            position: absolute !important;
            left: 0; top: 0;
            width: 100%;
            color: #000;
            background: #fff;
            font-family: 'Sora', system-ui, sans-serif;
            font-size: 10pt;
          }

          /* === HEADER (~20% del área útil) ============================ */
          .planilla-header {
            border-bottom: 1.5pt solid #0F1C35;
            padding-bottom: 4mm;
            margin-bottom: 5mm;
          }
          .planilla-header-row {
            display: flex;
            align-items: center;
            gap: 6mm;
          }
          .planilla-logo {
            max-height: 20mm;
            max-width: 20mm;
            object-fit: contain;
            flex-shrink: 0;
          }
          .planilla-titles { flex: 1; text-align: center; }
          .planilla-title {
            margin: 0;
            font-size: 15pt;
            font-weight: 800;
            color: #0F1C35;
            letter-spacing: 0.02em;
          }
          .planilla-sub {
            margin: 1mm 0 0;
            font-size: 10pt;
            color: #555;
            font-weight: 500;
          }
          .planilla-meta {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 6mm;
            margin-top: 4mm;
            font-size: 9.5pt;
            line-height: 1.4;
          }
          .planilla-meta p { margin: 0; }
          .planilla-meta strong { color: #0F1C35; }

          /* === TABLA (~70% del área útil) ============================ */
          .planilla-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 2mm;
            table-layout: fixed;
          }
          .planilla-table col.col-hora      { width: 8%;  }
          .planilla-table col.col-paciente  { width: 25%; }
          .planilla-table col.col-dni       { width: 12%; }
          .planilla-table col.col-telefono  { width: 13%; }
          .planilla-table col.col-motivo    { width: 27%; }
          .planilla-table col.col-atendido  { width: 15%; }

          .planilla-table th, .planilla-table td {
            border: 0.5pt solid #333;
            padding: 2.5mm 2mm;
            text-align: left;
            vertical-align: top;
            font-size: 9.5pt;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
          .planilla-table th {
            background: #f0eee7;
            font-size: 9pt;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-weight: 700;
            color: #0F1C35;
            text-align: center;
          }
          .planilla-table tbody tr {
            height: 35px;
          }
          .planilla-table tbody tr.row-empty {
            color: transparent;
          }
          .planilla-table tbody tr:nth-child(even) td {
            background: #fafafa;
          }
          .planilla-table .col-atendido-cell {
            text-align: center;
            font-size: 12pt;
          }

          /* === FOOTER (~10% del área útil) =========================== */
          .planilla-footer {
            margin-top: 5mm;
            padding-top: 3mm;
            border-top: 0.5pt solid #888;
            font-size: 9pt;
            color: #444;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            gap: 6mm;
          }
          .planilla-footer-left { line-height: 1.5; }
          .planilla-footer-left p { margin: 0; }
          .planilla-footer-right { min-width: 70mm; text-align: right; }
          .planilla-footer-firma {
            margin-top: 6mm;
            border-top: 0.5pt solid #0F1C35;
            padding-top: 1mm;
            font-size: 9pt;
            color: #0F1C35;
          }
          .planilla-footer-meta { font-style: italic; color: #777; }
        }
      `}</style>
    </div>
  )
}
