import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { useVecino } from '../../context/VecinoContext'
import { useValesVecino, useAbrirVale } from '../../hooks/useValesVecino'
import { estadoEfectivo, msRestantes, formatearCountdown, VALE_UI } from '../../lib/valeEstado'
import Spinner from '../../components/ui/Spinner'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import PortalBackLink from '../../components/portal/PortalBackLink'
import { dateOf } from '../../lib/datetime'

// =============================================================
// MisVales — Vales Electrónicos, Fase 2 (portal del vecino).
//
// Solo cuenta completa (auth_mode === 'supabase'): current_vecino_id()
// -- usado por la policy de SELECT y por abrir_vale() -- depende de
// una sesión real de Supabase Auth. Mismo guard que ReclamosTab en
// VecinoDashboard.jsx.
// =============================================================

function detalleVale(v) {
  if (v.monto != null) return `$${Number(v.monto).toLocaleString('es-AR')}`
  if (v.cantidad != null) return `${v.cantidad} ${v.unidad ?? ''}`.trim()
  return '—'
}

function EstadoPill({ estado }) {
  const ui = VALE_UI[estado] ?? VALE_UI.emitido
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
      style={{ color: ui.color, backgroundColor: ui.bg }}
    >
      {ui.label}
    </span>
  )
}

function ValeCard({ vale, onClick }) {
  const efectivo = estadoEfectivo(vale)
  const clickable = efectivo === 'emitido' || efectivo === 'abierto'
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`w-full rounded-xl border border-[#DDE0EC] bg-white p-4 text-left transition-colors ${
        clickable ? 'cursor-pointer hover:border-accent-300' : 'cursor-default opacity-70'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-sora text-base font-bold text-primary">
            {vale.proveedor?.nombre ?? 'Comercio'}
          </p>
          <p className="mt-0.5 text-sm text-primary-500">{vale.descripcion}</p>
        </div>
        <EstadoPill estado={efectivo} />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-primary">{detalleVale(vale)}</span>
        <span className="text-xs text-primary-400">
          {vale.emitido_en ? `Emitido ${dateOf(vale.emitido_en)}` : ''}
        </span>
      </div>
      {clickable && (
        <p className="mt-2 text-xs font-semibold text-accent-700">
          {efectivo === 'abierto' ? 'Ver código →' : 'Tocar para usar →'}
        </p>
      )}
    </button>
  )
}

// Modal de apertura — dos pasos reales (confirm → qr) más los estados
// intermedios de carga/error. Si el vale ya está 'abierto' (reingreso),
// se saltea el aviso y se llama abrir_vale() directo -- es idempotente,
// devuelve el mismo vale sin reiniciar el reloj de 30 min.
function AbrirValeModal({ vale, onClose }) {
  const abrirMut = useAbrirVale()
  const [step, setStep] = useState(() =>
    estadoEfectivo(vale) === 'abierto' ? 'loading' : 'confirm',
  )
  const [valeAbierto, setValeAbierto] = useState(null)
  const [error, setError] = useState('')
  const [msLeft, setMsLeft] = useState(0)

  useEffect(() => {
    if (step !== 'loading') return
    let cancel = false
    abrirMut.mutate(vale.codigo, {
      onSuccess: (data) => {
        if (cancel) return
        // abrir_vale() devuelve la fila cruda de `vales` -- sin el
        // embed de proveedor (eso solo lo trae el SELECT del listado,
        // vía useValesVecino). Mezclamos: proveedor/descripción del
        // `vale` de la lista + los 4 campos que sí son autoridad del
        // server en la respuesta del RPC.
        setValeAbierto({
          ...vale,
          codigo: data.codigo,
          estado: data.estado,
          abierto_en: data.abierto_en,
          vence_apertura_en: data.vence_apertura_en,
        })
        setStep('qr')
      },
      onError: (e) => {
        if (cancel) return
        setError(e?.message ?? 'No pudimos abrir el vale.')
        setStep('error')
      },
    })
    return () => { cancel = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  // Countdown -- recalcula siempre contra vence_apertura_en del
  // server (valeAbierto), nunca contra un timestamp local capturado
  // al abrir. Es cosmético: la autoridad es canjear_vale() del lado
  // del proveedor, no esta pantalla.
  useEffect(() => {
    if (step !== 'qr' || !valeAbierto) return
    const tick = () => setMsLeft(msRestantes(valeAbierto))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [step, valeAbierto])

  const vencido = step === 'qr' && msLeft <= 0

  return (
    <Modal
      open
      onClose={onClose}
      title={step === 'confirm' ? '¿Abrir el vale ahora?' : (vale.proveedor?.nombre ?? 'Vale')}
      size="sm"
      footer={
        step === 'confirm' ? (
          <>
            {/* autoFocus en Cancelar a propósito -- "Sí, abrir vale"
                es una acción destructiva (quema los 30 min) si se
                toca por error, no debe ser el foco/default. */}
            <Button variant="secondary" autoFocus onClick={onClose}>Cancelar</Button>
            <Button variant="accent" onClick={() => setStep('loading')}>Sí, abrir vale</Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
        )
      }
    >
      {step === 'confirm' && (
        <div className="space-y-3 text-sm text-primary-700">
          <p>Vas a tener <strong>30 minutos</strong> para canjearlo en el comercio.</p>
          <p className="rounded-md border border-accent-200 bg-accent-50 p-3 font-medium text-accent-800">
            Si pasan los 30 minutos sin canjear, <strong>el vale se pierde</strong> y vas
            a tener que pedir uno nuevo en la comuna.
          </p>
          <p>Abrilo recién cuando estés en el mostrador.</p>
        </div>
      )}

      {step === 'loading' && (
        <div className="flex items-center justify-center py-10"><Spinner size="lg" /></div>
      )}

      {step === 'error' && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}

      {step === 'qr' && !vencido && (
        <div className="flex flex-col items-center gap-4 py-2">
          {/* Fondo blanco puro, sin ningún elemento superpuesto -- se
              escanea con cámaras de celular baratas bajo luz de comercio. */}
          <div className="rounded-xl bg-white p-4" style={{ boxShadow: '0 0 0 1px #DDE0EC' }}>
            <QRCodeSVG value={valeAbierto.codigo} size={220} level="M" bgColor="#FFFFFF" fgColor="#0F1C35" />
          </div>
          <p className="font-mono text-2xl font-bold tracking-widest text-primary">
            {valeAbierto.codigo}
          </p>
          <p className="text-center text-sm text-primary-500">
            Mostrale este código al comercio (o decíselo si no puede escanear).
          </p>
          <p className="font-sora text-3xl font-bold" style={{ color: '#C9A84C' }}>
            {formatearCountdown(msLeft)}
          </p>
          <p className="text-xs text-primary-400">Tiempo restante para canjear</p>
        </div>
      )}

      {step === 'qr' && vencido && (
        <div className="py-6 text-center">
          <p className="font-sora text-lg font-bold text-primary-500">Vale vencido</p>
          <p className="mt-2 text-sm text-primary-500">Pedí uno nuevo en la comuna.</p>
        </div>
      )}
    </Modal>
  )
}

export default function MisVales() {
  const { vecino } = useVecino()
  const navigate = useNavigate()
  const { data: vales = [], isLoading } = useValesVecino(vecino?.id)
  const [valeSeleccionado, setValeSeleccionado] = useState(null)

  if (vecino?.auth_mode !== 'supabase') {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <PortalBackLink to="/portal" className="mb-6 text-primary hover:bg-primary-50 hover:text-primary-700" />
          <div className="rounded-xl border border-accent-200 bg-accent-50 p-6 sm:p-8">
            <div className="mx-auto max-w-lg text-center">
              <div className="mb-4 text-5xl">🔒</div>
              <h2 className="font-sora text-lg font-bold text-primary">
                Cuenta requerida para ver tus vales
              </h2>
              <p className="mt-3 text-sm text-primary-700">
                Para ver tus vales necesitás ingresar con tu cuenta (email y contraseña).
                Si entraste con acceso rápido, cerrá sesión y registrate o iniciá sesión con tu cuenta.
              </p>
              <button
                onClick={() => navigate('/portal/acceso')}
                className="mt-6 rounded-lg bg-primary px-6 py-3 font-semibold text-white transition-colors hover:bg-primary-700"
              >
                Ir a iniciar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="p-4"><PortalBackLink to="/portal/mi-cuenta?tab=vales" className="text-primary hover:bg-primary-50 hover:text-primary-700" /></div>
        <div className="flex flex-1 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <PortalBackLink to="/portal/mi-cuenta?tab=vales" className="mb-6 text-primary hover:bg-primary-50 hover:text-primary-700" />

        <h1 className="font-sora text-xl font-bold text-primary sm:text-2xl">Mis vales</h1>
        <p className="mt-1 text-sm text-primary-500">
          {vales.length === 0 ? 'Todavía no tenés vales.' : `${vales.length} vale${vales.length === 1 ? '' : 's'}.`}
        </p>

        {vales.length === 0 ? (
          <div className="mt-6 rounded-xl border border-[#DDE0EC] bg-white p-10 text-center">
            <div className="mb-3 text-4xl">🎫</div>
            <p className="text-sm text-primary-500">
              Cuando la comuna te emita un vale, va a aparecer acá.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {vales.map(v => (
              <ValeCard key={v.id} vale={v} onClick={() => setValeSeleccionado(v)} />
            ))}
          </div>
        )}
      </div>

      {valeSeleccionado && (
        <AbrirValeModal
          vale={valeSeleccionado}
          onClose={() => setValeSeleccionado(null)}
        />
      )}
    </div>
  )
}
