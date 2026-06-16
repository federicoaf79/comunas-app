import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useDependenciaByTipo } from '../../hooks/useTurnos'
import {
  useAtencionPorTurno, edadDesdeFechaNac,
} from '../../hooks/useAtenciones'
import {
  AtencionForm, InsumosTab, HCTab,
} from '../../components/admin/AtencionDrawer'
import DocumentosAtencion from '../../components/admin/DocumentosAtencion'
import Spinner from '../../components/ui/Spinner'
import { dateTimeOf } from '../../lib/datetime'

// =============================================================
// AtencionDetalle — versión página full del flujo clínico que
// vivía en el AtencionDrawer. Se accede vía
// /admin/sala/atencion/:turnoId — cada turno abre su atención en
// una ruta dedicada para que el médico pueda usar la pantalla
// completa, dejar abierta una pestaña por paciente, etc.
//
// Layout:
//   - mobile  → todo apilado verticalmente.
//   - desktop → sidebar izquierdo con datos del paciente (sticky)
//               + main a la derecha con los 3 tabs.
//
// Reusa los componentes del drawer (AtencionForm, InsumosTab,
// HCTab) — la única adición específica de esta página es la
// sección "Documentos adjuntos", que se inyecta en el form via
// el slot `extraSlot`.
// =============================================================

const TURNO_SELECT = `
  id, fecha_hora, motivo, especialidad, estado, vecino_id, dependencia_id,
  municipio_id, canal, numero_turno, metadata,
  vecino:vecino_id ( id, dni, nombre, apellido, nombre_completo, fecha_nac, telefono ),
  dependencia:dependencia_id ( id, nombre, tipo )
`

// Paleta y labels de especialidades — alineadas con SalaPrimerosAuxilios
// para que el badge del sidebar coincida con el color del bloque en el
// calendario semanal.
const ESPECIALIDAD_LABEL = {
  general:     'Medicina General',
  obstetra:    'Obstetra',
  ecografia:   'Ecografía',
  posta_rural: 'Posta Sanitaria Rural',
}
const COLOR_POR_ESPECIALIDAD = {
  general:     '#1D4ED8',
  obstetra:    '#7C3AED',
  ecografia:   '#0891B2',
  posta_rural: '#B45309',
}

const ESTADO_TURNO_BADGE = {
  pendiente:  'bg-primary-50 text-primary-700 ring-primary-200',
  confirmado: 'bg-ok-50 text-ok-700 ring-ok-100',
  en_curso:   'bg-accent-50 text-accent-700 ring-accent-100',
  completado: 'bg-primary-100 text-primary-700 ring-primary-200',
  atendido:   'bg-ok-50 text-ok-700 ring-ok-100',
  cancelado:  'bg-gray-100 text-gray-700 ring-gray-200',
  ausente:    'bg-red-50 text-danger ring-red-100',
}

function nombreVecino(v) {
  if (!v) return 'Vecino'
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

const TABS = [
  { value: 'atencion', label: 'Atención' },
  { value: 'insumos',  label: 'Insumos utilizados' },
  { value: 'hc',       label: 'Historia clínica' },
]

export default function AtencionDetalle() {
  const { turnoId } = useParams()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const municipioId = useEffectiveMunicipioId()
  const [tab, setTab] = useState('atencion')

  // Dependencia salud para filtrar el catálogo de insumos.
  const depSaludQ = useDependenciaByTipo('caps')
  const dependenciaSaludId = depSaludQ.data?.id ?? null

  // Turno con vecino + dependencia para el header.
  const turnoQ = useQuery({
    queryKey: ['turno', 'detalle', turnoId ?? '__none__'],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('turnos').select(TURNO_SELECT).eq('id', turnoId).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!turnoId,
  })
  const turno   = turnoQ.data ?? null
  const vecino  = turno?.vecino ?? null

  // Atención existente para este turno (puede ser null si todavía
  // no se abrió). La compartimos con el form vía el cache de
  // react-query — todos los lugares que llamen useAtencionPorTurno
  // ven la misma data.
  const atencionQ = useAtencionPorTurno(turnoId)
  const atencion  = atencionQ.data ?? null

  if (turnoQ.isLoading || atencionQ.isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Spinner size="lg" />
      </div>
    )
  }
  if (turnoQ.error || !turno) {
    return (
      <div className="space-y-5">
        <BackHeader />
        <div className="card p-10 text-center">
          <p className="font-sora text-lg font-semibold text-primary">Turno no encontrado</p>
          <p className="mt-2 text-sm text-primary-500">
            {turnoQ.error?.message ?? 'No pudimos cargar este turno.'}
          </p>
        </div>
      </div>
    )
  }

  const edad = edadDesdeFechaNac(vecino?.fecha_nac)
  const estadoBadge = ESTADO_TURNO_BADGE[turno.estado] ?? ESTADO_TURNO_BADGE.pendiente

  return (
    <div className="space-y-5">
      <BackHeader
        nombre={nombreVecino(vecino)}
        dni={vecino?.dni}
        estadoTurno={turno.estado}
        estadoBadge={estadoBadge}
        onBack={() => navigate('/admin/sala')}
      />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        {/* Sidebar paciente (sticky en desktop). Paleta COMUNAS:
            fondo navy/5 suave + ring navy/10; etiquetas en gold
            (#C9A84C) y valores en navy oscuro (#0F1C35). */}
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <div className="space-y-3 rounded-xl border border-[#0F1C35]/10 bg-[#0F1C35]/5 p-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                Paciente
              </p>
              <p className="mt-0.5 font-sora text-base font-bold text-[#0F1C35]">
                {nombreVecino(vecino)}
              </p>
            </div>
            <SidebarRow label="DNI"           value={vecino?.dni} mono />
            {edad != null && <SidebarRow label="Edad" value={`${edad} años`} />}
            <SidebarRow label="Teléfono"      value={vecino?.telefono} />
            <SidebarRow label="Turno"         value={dateTimeOf(turno.fecha_hora)} />
            <SidebarRow label="Motivo"        value={turno.motivo || '—'} />
            {turno.especialidad && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                  Especialidad
                </p>
                <span
                  className="mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
                  style={{ backgroundColor: COLOR_POR_ESPECIALIDAD[turno.especialidad] ?? '#475A7C' }}
                >
                  {ESPECIALIDAD_LABEL[turno.especialidad] ?? turno.especialidad}
                </span>
              </div>
            )}
            <SidebarRow label="Dependencia"   value={turno.dependencia?.nombre || '—'} />
            {atencion?.estado && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                  Atención
                </p>
                <p className="mt-0.5 text-sm font-semibold capitalize text-[#0F1C35]">
                  {atencion.estado}
                </p>
              </div>
            )}

            {/* Alergias — alerta visual prominente en contexto médico */}
            {vecino?.alergias?.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-3 py-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 shrink-0 text-danger">
                  <circle cx="12" cy="12" r="10" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4M12 16h.01" />
                </svg>
                <span className="text-sm font-semibold text-danger">
                  ALERGIAS: {vecino.alergias.join(', ')}
                </span>
              </div>
            )}

            {vecino?.sin_alergias_conocidas && !vecino?.alergias?.length && (
              <div className="text-xs text-primary-400">
                Sin alergias conocidas (confirmado)
              </div>
            )}

            {!vecino?.alergias?.length && !vecino?.sin_alergias_conocidas && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600">
                <span>⚠️</span>
                <span>Alergias no registradas</span>
              </div>
            )}
          </div>
        </aside>

        {/* Tabs + contenido */}
        <main className="min-w-0">
          <nav role="tablist" className="mb-4 flex overflow-x-auto border-b border-border">
            {TABS.map(t => {
              const active = tab === t.value
              return (
                <button
                  key={t.value}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(t.value)}
                  className={
                    'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-semibold transition-colors ' +
                    (active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-primary-400 hover:border-primary-200 hover:text-primary-700')
                  }
                >
                  {t.label}
                </button>
              )
            })}
          </nav>

          <div key={tab} className="animate-fade-in">
            {tab === 'atencion' && (
              <AtencionForm
                turno={turno}
                atencion={atencion}
                municipioId={municipioId}
                profesionalId={perfil?.id ?? null}
                extraSlot={
                  <DocumentosAtencion
                    atencionId={atencion?.id ?? null}
                    vecinoId={vecino?.id ?? null}
                    municipioId={municipioId}
                    disabled={atencion?.estado === 'cerrada' || atencion?.estado === 'derivada'}
                  />
                }
              />
            )}
            {tab === 'insumos' && (
              <InsumosTab
                atencion={atencion}
                municipioId={municipioId}
                dependenciaSaludId={dependenciaSaludId}
                onSwitchToAtencion={() => setTab('atencion')}
              />
            )}
            {tab === 'hc' && (
              <HCTab
                vecinoId={vecino?.id}
                atencionActualId={atencion?.id}
              />
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function BackHeader({ nombre, dni, estadoTurno, estadoBadge, onBack }) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
        >
          ← Volver a Sala PA
        </button>
      ) : (
        <Link to="/admin/sala" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
          ← Volver a Sala PA
        </Link>
      )}
      {nombre && (
        <>
          <span className="text-primary-300">·</span>
          <span className="font-sora text-base font-bold text-primary sm:text-lg">{nombre}</span>
        </>
      )}
      {dni && (
        <>
          <span className="text-primary-300">·</span>
          <span className="font-mono text-xs text-primary-500">DNI {dni}</span>
        </>
      )}
      {estadoTurno && (
        <span
          className={
            'ml-auto inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ' +
            estadoBadge
          }
        >
          {estadoTurno}
        </span>
      )}
    </header>
  )
}

function SidebarRow({ label, value, mono = false }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold text-[#0F1C35] ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}
