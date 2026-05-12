import { useMemo, useState } from 'react'
import { mensajes, vecinoById } from '../../lib/mockData'
import {
  useVecinosPorSegmento, useBarriosDeVecinos,
} from '../../hooks/useVecinosSegmento'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import SearchBar from '../../components/ui/SearchBar'
import Spinner from '../../components/ui/Spinner'
import MensajeItem from '../../components/sms/MensajeItem'

export default function Mensajeria() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Mensajería</h1>
        <p className="text-sm text-primary-400">SMS y WhatsApp con los vecinos</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-3">
        <Historial />
        <EnvioMasivo />
      </div>
    </div>
  )
}

function Historial() {
  const [canal, setCanal] = useState('')
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return mensajes.filter(m => {
      if (canal && m.canal !== canal) return false
      if (!term) return true
      const v = vecinoById(m.vecino_id)
      const name = v ? `${v.nombre} ${v.apellido}`.toLowerCase() : ''
      return name.includes(term) || m.mensaje.toLowerCase().includes(term)
    })
  }, [canal, q])

  return (
    <div className="card overflow-hidden p-0 lg:col-span-2">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-primary-700">Historial</h2>
        <div className="flex flex-wrap gap-2">
          <SearchBar value={q} onChange={setQ} placeholder="Buscar..." className="w-56" />
          <Select
            value={canal}
            onChange={setCanal}
            placeholder="Todos los canales"
            options={[
              { value: 'sms', label: 'SMS' },
              { value: 'whatsapp', label: 'WhatsApp' },
            ]}
            className="w-44"
          />
        </div>
      </header>
      {list.length === 0 ? (
        <div className="px-5 py-10 text-center text-sm text-primary-400">
          No hay mensajes con esos filtros.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map(m => <MensajeItem key={m.id} mensaje={m} />)}
        </ul>
      )}
    </div>
  )
}

const CANALES = [
  { value: 'sms',      label: 'SMS' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'ambos',    label: 'Ambos' },
]

// Catálogo fijo de segmentos NO-barrio. Los barrios se generan
// dinámicamente desde useBarriosDeVecinos.
const SEGMENTOS_FIJOS = [
  { value: 'todos',   label: 'Todos los vecinos',       grupo: 'Zona' },
  { value: 'urbano',  label: 'Zona Urbana',             grupo: 'Zona' },
  { value: 'rural',   label: 'Zona Rural',              grupo: 'Zona' },
  { value: 'sala_pa', label: 'Pacientes Sala PA (turnos activos)', grupo: 'Por dependencia' },
  { value: 'juez',    label: 'Visitantes Juez de Paz',  grupo: 'Por dependencia' },
  { value: 'sum',     label: 'Reservas SUM (60 días)',  grupo: 'Por dependencia' },
  { value: 'manual',  label: 'Selección manual',        grupo: 'Personalizado' },
]

const SEGMENTO_LABEL_FIJO = Object.fromEntries(SEGMENTOS_FIJOS.map(s => [s.value, s.label]))

function labelDeSegmento(segmento) {
  if (!segmento) return ''
  if (segmento.startsWith('barrio:')) return `Barrio: ${segmento.slice('barrio:'.length)}`
  return SEGMENTO_LABEL_FIJO[segmento] ?? segmento
}

function vecinoLabel(v) {
  if (v.apellido && v.nombre) return `${v.apellido}, ${v.nombre}`
  return v.nombre_completo || v.apellido || v.nombre || 'Vecino'
}

function ZonaBadge({ zona }) {
  if (zona === 'rural') {
    return (
      <span className="inline-flex items-center rounded-full bg-accent-50 px-2 py-0.5 text-[10px] font-semibold text-accent-700 ring-1 ring-inset ring-accent-100">
        Rural
      </span>
    )
  }
  if (zona === 'urbano') {
    return (
      <span className="inline-flex items-center rounded-full bg-ok-50 px-2 py-0.5 text-[10px] font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
        Urbano
      </span>
    )
  }
  return null
}

function EnvioMasivo() {
  const [canal, setCanal]                 = useState('sms')
  const [mensaje, setMensaje]             = useState('')
  const [segmento, setSegmento]           = useState('todos')
  const [seleccionados, setSeleccionados] = useState([])
  const [filtroDest, setFiltroDest]       = useState('')

  const segQ = useVecinosPorSegmento(segmento)
  const { data: barrios = [] } = useBarriosDeVecinos()

  const segmentoOptions = useMemo(() => {
    // Para el componente <Select> simple usamos labels prefijados con
    // el grupo entre paréntesis. Los barrios van como "Barrio · X".
    const out = []
    for (const s of SEGMENTOS_FIJOS.filter(s => s.grupo === 'Zona')) {
      out.push({ value: s.value, label: `Zona · ${s.label}` })
    }
    for (const b of barrios) {
      out.push({ value: `barrio:${b}`, label: `Barrio · ${b}` })
    }
    for (const s of SEGMENTOS_FIJOS.filter(s => s.grupo === 'Por dependencia')) {
      out.push({ value: s.value, label: `Dependencia · ${s.label}` })
    }
    for (const s of SEGMENTOS_FIJOS.filter(s => s.grupo === 'Personalizado')) {
      out.push({ value: s.value, label: `Personalizado · ${s.label}` })
    }
    return out
  }, [barrios])

  const vecinosSegmento = useMemo(() => segQ.data ?? [], [segQ.data])
  const vecinosFiltrados = useMemo(() => {
    const term = filtroDest.trim().toLowerCase()
    if (!term) return vecinosSegmento
    return vecinosSegmento.filter(v =>
      (v.nombre ?? '').toLowerCase().includes(term)
      || (v.apellido ?? '').toLowerCase().includes(term)
      || (v.nombre_completo ?? '').toLowerCase().includes(term)
      || (v.dni ?? '').includes(term)
      || (v.telefono ?? '').includes(term),
    )
  }, [vecinosSegmento, filtroDest])

  function toggleDest(id) {
    setSeleccionados(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }
  function selectAll() {
    setSeleccionados(vecinosFiltrados.map(v => v.id))
  }
  function clearAll() {
    setSeleccionados([])
  }

  // Al cambiar de segmento limpiamos la selección — los IDs viejos
  // ya no aplican al nuevo conjunto de candidatos.
  function handleSegmento(v) {
    setSegmento(v || 'todos')
    setSeleccionados([])
    setFiltroDest('')
  }

  function handleSend(e) {
    e.preventDefault()
    alert(
      `Envío simulado por ${canal.toUpperCase()} a ${seleccionados.length} destinatarios:\n\n"${mensaje}"`,
    )
    setMensaje('')
    setSeleccionados([])
  }

  const conteoSegmento = vecinosSegmento.length
  const segmentoEsManual = segmento === 'manual'

  return (
    <div className="card p-0">
      <header className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-semibold text-primary-700">Envío masivo</h2>
        <p className="mt-0.5 text-xs text-primary-400">
          Elegí un segmento de vecinos y ajustá la selección antes de enviar.
        </p>
      </header>
      <form onSubmit={handleSend} className="space-y-4 p-5">
        {/* Canal */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Canal</label>
          <div className="flex gap-2">
            {CANALES.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCanal(opt.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  canal === opt.value
                    ? 'border-primary bg-primary text-white'
                    : 'border-border bg-white text-primary-500 hover:border-primary-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Segmento */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">
            Segmento de destinatarios
          </label>
          <Select
            value={segmento}
            onChange={handleSegmento}
            options={segmentoOptions}
            placeholder="Seleccionar segmento…"
          />
          {/* Chip de segmento activo */}
          {!segmentoEsManual && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#0F1C35]/5 px-3 py-1 text-xs font-medium text-primary-700 ring-1 ring-inset ring-[#0F1C35]/10">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-[#C9A84C]">
                Segmento
              </span>
              <span>{labelDeSegmento(segmento)}</span>
              {segQ.isFetching ? (
                <Spinner size="sm" />
              ) : (
                <span className="text-primary-400">· {conteoSegmento} vecino{conteoSegmento === 1 ? '' : 's'}</span>
              )}
              <button
                type="button"
                onClick={() => handleSegmento('todos')}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-primary-400 hover:bg-primary-100 hover:text-primary"
                aria-label="Limpiar segmento"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                  <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
                </svg>
              </button>
            </div>
          )}
          {segmentoEsManual && (
            <p className="mt-2 text-xs italic text-primary-400">
              Modo manual: el segmento queda vacío. Pasá a "Todos los vecinos"
              o a un filtro de zona/barrio para listar candidatos y tildalos.
            </p>
          )}
        </div>

        {/* Lista de destinatarios */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-primary-700">
              Destinatarios <span className="text-primary-400">({seleccionados.length})</span>
            </label>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={selectAll} className="font-medium text-primary hover:underline">
                Seleccionar todos del segmento
              </button>
              <span className="text-primary-300">·</span>
              <button type="button" onClick={clearAll} className="font-medium text-primary-400 hover:text-primary hover:underline">
                Limpiar selección
              </button>
            </div>
          </div>

          <input
            type="search"
            value={filtroDest}
            onChange={e => setFiltroDest(e.target.value)}
            placeholder="Filtrar dentro del segmento (nombre, DNI o teléfono)…"
            className="input-field mb-2"
            disabled={segmentoEsManual}
          />

          <div className="max-h-60 overflow-y-auto rounded-md border border-border bg-white">
            {segQ.isLoading ? (
              <div className="flex items-center justify-center py-6"><Spinner size="sm" /></div>
            ) : segQ.error ? (
              <p className="px-3 py-3 text-xs text-danger">
                No pudimos cargar el segmento: {segQ.error.message}
              </p>
            ) : vecinosFiltrados.length === 0 ? (
              <p className="px-3 py-3 text-xs text-primary-400">
                {segmentoEsManual
                  ? 'Cambiá a un segmento para listar vecinos.'
                  : conteoSegmento === 0
                    ? 'No hay vecinos en este segmento.'
                    : 'Ningún vecino coincide con el filtro.'}
              </p>
            ) : (
              vecinosFiltrados.map(v => (
                <label
                  key={v.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-primary-50"
                >
                  <input
                    type="checkbox"
                    checked={seleccionados.includes(v.id)}
                    onChange={() => toggleDest(v.id)}
                    className="h-4 w-4 cursor-pointer accent-[#C9A84C]"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary-700">
                    {vecinoLabel(v)}
                  </span>
                  <ZonaBadge zona={v.zona} />
                  <span className="text-xs text-primary-400">{v.telefono || '—'}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Mensaje */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Mensaje</label>
          <textarea
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            rows={4}
            placeholder="Escribí el mensaje..."
            className="input-field resize-none"
            required
          />
          <p className="mt-1 text-xs text-primary-400">{mensaje.length} caracteres</p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={!mensaje.trim() || seleccionados.length === 0}
        >
          Enviar a {seleccionados.length} {seleccionados.length === 1 ? 'vecino' : 'vecinos'}
        </Button>
      </form>
    </div>
  )
}
