import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePublicProfesionales } from '../../hooks/useProfesionales'
import { usePortalMunicipioId } from '../../hooks/useConfigPortal'
import Spinner from '../../components/ui/Spinner'
import Button from '../../components/ui/Button'

export default function CicSaludPortal() {
  const navigate = useNavigate()
  const portalMunicipioQ = usePortalMunicipioId()
  const municipioId = portalMunicipioQ.data ?? null

  const [deps, setDeps] = useState([])
  const [loadingDeps, setLoadingDeps] = useState(true)

  // Fetch dependencias con anon key para portal público
  useEffect(() => {
    let cancelled = false
    if (!municipioId) return

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

    fetch(
      `${SUPABASE_URL}/rest/v1/dependencias?municipio_id=eq.${municipioId}&tipo=eq.cic_salud&activa=eq.true&select=id,nombre,tipo,municipio_id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        }
      }
    )
      .then(res => res.json())
      .then(data => {
        if (!cancelled) {
          setDeps(data ?? [])
          setLoadingDeps(false)
        }
      })
      .catch(err => {
        console.warn('[CicSaludPortal] fetch deps:', err)
        if (!cancelled) setLoadingDeps(false)
      })

    return () => { cancelled = true }
  }, [municipioId])

  const depCicSalud = useMemo(
    () => deps.find(d => d.tipo === 'cic_salud' && d.activa !== false),
    [deps]
  )

  const { data: profesionales = [], isLoading } = usePublicProfesionales(
    municipioId,
    depCicSalud?.id ?? null
  )

  const [modalEspecialidad, setModalEspecialidad] = useState(null)

  // Agrupar por especialidad
  const especialidades = useMemo(() => {
    const map = new Map()
    profesionales
      .filter(p => p.activo !== false)
      .forEach(p => {
        const esp = p.especialidad?.toLowerCase() || 'general'
        if (!map.has(esp)) {
          map.set(esp, {
            nombre: p.especialidad || 'Medicina General',
            profesionales: [],
          })
        }
        map.get(esp).profesionales.push(p)
      })
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [profesionales])

  function handleSacarTurno(especialidad) {
    const prof = especialidad.profesionales[0]
    if (!prof) return

    if (prof.requiere_orden) {
      setModalEspecialidad(especialidad)
    } else {
      navigate(`/portal/turno?dep=cic_salud&esp=${encodeURIComponent(especialidad.nombre)}`)
    }
  }

  if (loadingDeps || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F4EF]">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!depCicSalud) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F4EF]">
        <div className="text-center">
          <p className="text-[#0F1C35]">CIC — Servicios de Salud no disponible</p>
          <p className="mt-2 text-sm text-[#0F1C35] opacity-70">
            {!municipioId ? 'No se pudo identificar el municipio' : 'La dependencia no está activa'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F4EF] py-8">
      <div className="container mx-auto max-w-5xl px-4">
        <header className="mb-8 text-center">
          <h1 className="font-sora text-3xl font-bold text-[#0F1C35]">
            CIC — Servicios de Salud
          </h1>
          <p className="mt-2 text-[#0F1C35] opacity-70">
            Atención médica especializada para tu salud y bienestar
          </p>
        </header>

        {especialidades.length === 0 ? (
          <div className="rounded-xl border border-[#0F1C35]/10 bg-white p-8 text-center shadow-sm">
            <p className="text-[#0F1C35] opacity-70">
              No hay especialidades disponibles en este momento
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {especialidades.map((esp, idx) => {
              const prof = esp.profesionales[0]
              const diasLabel = prof.dias_atencion?.join(', ') || 'Sin días definidos'
              const horarioLabel = prof.hora_desde && prof.hora_hasta
                ? `${prof.hora_desde.slice(0, 5)} - ${prof.hora_hasta.slice(0, 5)}`
                : 'Sin horario definido'

              return (
                <div
                  key={idx}
                  className="flex flex-col rounded-xl border border-[#0F1C35]/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#1D4ED8]/10">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#1D4ED8"
                        strokeWidth="2"
                        className="h-5 w-5"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                      </svg>
                    </div>
                    <h3 className="font-sora text-base font-bold text-[#0F1C35]">
                      {esp.nombre}
                    </h3>
                  </div>

                  <div className="mb-3 space-y-1 text-sm text-[#0F1C35] opacity-70">
                    <p className="flex items-center gap-2">
                      <span className="font-semibold">Profesional:</span>
                      {prof.nombre}
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-semibold">Días:</span>
                      {diasLabel}
                    </p>
                    <p className="flex items-center gap-2">
                      <span className="font-semibold">Horario:</span>
                      {horarioLabel}
                    </p>
                  </div>

                  {prof.requiere_orden && (
                    <div className="mb-3 rounded-md border border-[#C9A84C] bg-[#C9A84C]/10 px-2 py-1 text-xs text-[#0F1C35]">
                      📄 Requiere orden médica previa
                    </div>
                  )}

                  <Button
                    onClick={() => handleSacarTurno(esp)}
                    className="mt-auto w-full"
                  >
                    Sacar turno
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {modalEspecialidad && (
        <ModalOrdenRequerida
          especialidad={modalEspecialidad}
          onClose={() => setModalEspecialidad(null)}
        />
      )}
    </div>
  )
}

function ModalOrdenRequerida({ especialidad, onClose }) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#C9A84C]/10">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="#C9A84C"
              strokeWidth="2"
              className="h-6 w-6"
            >
              <circle cx="12" cy="12" r="10" />
              <path strokeLinecap="round" d="M12 8v4M12 16h.01" />
            </svg>
          </div>
          <h3 className="font-sora text-lg font-bold text-[#0F1C35]">
            Orden médica requerida
          </h3>
        </div>

        <p className="mb-4 text-sm text-[#0F1C35] opacity-70">
          La especialidad <strong>{especialidad.nombre}</strong> requiere orden de
          derivación médica. Podés obtenerla consultando con nuestro médico clínico
          o adjuntar una orden externa.
        </p>

        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              navigate(`/portal/turno?dep=cic_salud&esp=${encodeURIComponent(especialidad.nombre)}&requiere_orden=true`)
              onClose()
            }}
            className="w-full"
          >
            Tengo una orden
          </Button>
          <Button
            onClick={() => {
              navigate('/portal/turno?dep=cic_salud&esp=clinico')
              onClose()
            }}
            variant="secondary"
            className="w-full border border-[#0F1C35]/20 bg-white text-[#0F1C35] hover:bg-[#0F1C35]/5"
          >
            Sacar turno con Clínico primero
          </Button>
          <button
            onClick={onClose}
            className="mt-2 text-sm text-[#0F1C35] opacity-70 transition-opacity hover:opacity-100"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
