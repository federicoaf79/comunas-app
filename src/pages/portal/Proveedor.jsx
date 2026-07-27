import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Scanner } from '@yudiel/react-qr-scanner'
import { useVecino } from '../../context/VecinoContext'
import { getDeviceId } from '../../lib/deviceId'
import {
  useAccesosProveedorVecino, useDispositivoVinculado,
  useVincularDispositivo, useDesvincularDispositivo,
  useCanjearVale, useHistorialCanjesProveedor, fetchValePorCodigo,
} from '../../hooks/useProveedorVecino'
import { msRestantes, formatearCountdown } from '../../lib/valeEstado'
import Spinner from '../../components/ui/Spinner'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { dateTimeOf } from '../../lib/datetime'

// =============================================================
// Proveedor — Vales Electrónicos, Fase 3. Sección de la cuenta del
// vecino para CANJEAR vales en nombre de un comercio.
//
// Regla central: un vale se canjea solo en el comercio para el que
// fue emitido, y este teléfono opera en UN SOLO comercio a la vez
// (proveedor_dispositivos, device_id único global). El dueño de
// varios comercios puede VER los otros, nunca operar en ellos desde
// acá -- para eso necesitaría vincular OTRO teléfono.
// =============================================================

function detalleVale(v) {
  if (v.monto != null) return `$${Number(v.monto).toLocaleString('es-AR')}`
  if (v.cantidad != null) return `${v.cantidad} ${v.unidad ?? ''}`.trim()
  return '—'
}

// Traduce los errores conocidos del server a algo que entienda un
// comerciante. Si no matchea ninguno, se muestra el del server tal
// cual -- nunca se inventa un mensaje para un error que no se conoce.
function traducirErrorCanje(mensaje, nombreComercioActual) {
  const m = (mensaje ?? '').toLowerCase()
  if (m.includes('no está vinculado a ningún comercio') || m.includes('no esta vinculado a ningun comercio')) {
    return 'Este teléfono todavía no está vinculado a un comercio'
  }
  if (m.includes('es de otro comercio')) {
    return `Este vale no es de ${nombreComercioActual ?? 'este comercio'}`
  }
  if (m.includes('vale no encontrado')) {
    return 'Puede que el vecino todavía no lo haya abierto en su celular, que el código esté mal escrito, o que se haya vencido el plazo.'
  }
  if (m.includes('venció la ventana de canje') || m.includes('vencio la ventana de canje')) {
    return 'El vale venció. El vecino tiene que pedir uno nuevo'
  }
  if (m.includes('no canjeable') && m.includes('canjeado')) {
    return 'Este vale ya fue canjeado'
  }
  return mensaje
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'border-accent text-primary' : 'border-transparent text-primary-400 hover:text-primary'
      }`}
    >
      {children}
    </button>
  )
}

// ── Paso 1 (primera vez con este teléfono) ──────────────────────
//
// Desde 2026-07-28 vincular es exclusivo del responsable -- ofrecer
// el flujo a un secundario solo termina en el error del server
// ("Solo el responsable del comercio puede vincular teléfonos"),
// después de elegir comercio y confirmar. Se filtra ANTES de mostrar
// nada: si este vecino no es responsable de ningún comercio, no hay
// flujo de vinculación que ofrecerle, solo la explicación de a quién
// pedirle el alta. El server sigue siendo la autoridad real (esto es
// nada más qué UI mostrar); si el rol de este vecino cambiara entre
// que carga la lista y confirma, el server igual lo rechaza.
function VincularView({ accesos, deviceId, onVinculado }) {
  const accesosResponsable = accesos.filter(a => a.rol === 'responsable')
  const [seleccionado, setSeleccionado] = useState(null)
  const [error, setError] = useState('')
  const vincularMut = useVincularDispositivo()

  async function confirmar() {
    if (!seleccionado) return
    setError('')
    try {
      await vincularMut.mutateAsync({ deviceId, proveedorId: seleccionado, alias: null })
      onVinculado?.()
    } catch (e) {
      setError(e?.message ?? 'No pudimos vincular el dispositivo.')
    }
  }

  if (accesosResponsable.length === 0) {
    return (
      <div className="rounded-xl border border-[#DDE0EC] bg-white p-6 text-center">
        <p className="text-sm text-primary-700">
          Este teléfono todavía no está habilitado para canjear vales. Pedile al
          responsable del comercio que lo vincule desde acá con su cuenta.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-sora text-xl font-bold text-primary sm:text-2xl">
          ¿En qué comercio vas a operar con este teléfono?
        </h1>
        <p className="mt-1 text-sm text-primary-500">
          Este teléfono va a quedar asociado a un solo comercio para canjear vales.
        </p>
      </div>

      <div className="space-y-2">
        {accesosResponsable.map(a => (
          <button
            key={a.proveedor.id}
            type="button"
            onClick={() => setSeleccionado(a.proveedor.id)}
            className={`w-full rounded-lg border p-4 text-left transition-colors ${
              seleccionado === a.proveedor.id
                ? 'border-accent-400 bg-accent-50'
                : 'border-[#DDE0EC] bg-white hover:border-accent-200'
            }`}
          >
            <p className="font-semibold text-primary">{a.proveedor.nombre}</p>
            {a.proveedor.categoria && <p className="text-xs text-primary-400">{a.proveedor.categoria}</p>}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}

      <Button
        variant="accent"
        className="w-full"
        disabled={!seleccionado}
        loading={vincularMut.isPending}
        onClick={confirmar}
      >
        Confirmar vinculación
      </Button>
    </div>
  )
}

// ── Canjear ──────────────────────────────────────────────────────
function CanjearView({ dispositivo, deviceId }) {
  const [scanning, setScanning] = useState(false)
  const [codigoInput, setCodigoInput] = useState('')
  const [vale, setVale] = useState(null)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState('')
  const [resultadoOk, setResultadoOk] = useState(null)
  const canjearMut = useCanjearVale()

  async function buscarCodigo(codigoCrudo) {
    const codigo = (codigoCrudo ?? '').trim().toUpperCase()
    if (!codigo) return
    setError('')
    setVale(null)
    setResultadoOk(null)
    setBuscando(true)
    try {
      const v = await fetchValePorCodigo(codigo, deviceId)
      setVale(v)
    } catch (e) {
      setError(traducirErrorCanje(e?.message, dispositivo.proveedor?.nombre))
    } finally {
      setBuscando(false)
    }
  }

  function handleScan(detectedCodes) {
    const raw = detectedCodes?.[0]?.rawValue
    setScanning(false)
    if (!raw) return
    setCodigoInput(raw)
    buscarCodigo(raw)
  }

  // La cámara puede fallar (permiso denegado, sin cámara, navegador
  // embebido de WhatsApp) -- nunca bloquea nada, el campo tipeado ya
  // está siempre visible al mismo nivel, no es un fallback oculto.
  function handleScanError() {
    setScanning(false)
  }

  const esOtroComercio = !!vale?.es_otro_comercio
  const yaCanjeado = vale && vale.estado === 'canjeado'
  const puedeConfirmar = vale && !esOtroComercio && !yaCanjeado

  async function confirmarCanje() {
    if (!puedeConfirmar) return
    setError('')
    try {
      const resultado = await canjearMut.mutateAsync({ codigo: vale.codigo, deviceId })
      setResultadoOk(resultado)
      setVale(null)
      setCodigoInput('')
    } catch (e) {
      setError(traducirErrorCanje(e?.message, dispositivo.proveedor?.nombre))
    }
  }

  return (
    <div className="space-y-4">
      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black">
          <div className="relative flex-1">
            <Scanner
              onScan={handleScan}
              onError={handleScanError}
              formats={['qr_code']}
              styles={{ container: { width: '100%', height: '100%' } }}
            />
            <button
              type="button"
              onClick={() => setScanning(false)}
              className="absolute right-4 top-4 rounded-full bg-white/90 p-2 text-primary shadow-lg"
              aria-label="Cerrar cámara"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <Button variant="accent" className="w-full" onClick={() => setScanning(true)}>
        📷 Escanear código
      </Button>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-primary-700">O escribí el código</label>
        <div className="flex gap-2">
          <Input
            value={codigoInput}
            onChange={e => setCodigoInput(e.target.value.toUpperCase())}
            placeholder="XXXX-XXXX"
            autoComplete="off"
            className="flex-1"
          />
          <Button onClick={() => buscarCodigo(codigoInput)} loading={buscando}>Buscar</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}

      {resultadoOk && (
        <div className="rounded-lg border p-4 text-center" style={{ borderColor: '#1D4ED8', backgroundColor: '#EFF6FF' }}>
          <p className="font-sora text-lg font-bold" style={{ color: '#1D4ED8' }}>✓ Vale canjeado</p>
          <p className="mt-1 text-sm text-primary-600">Código {resultadoOk.codigo}</p>
        </div>
      )}

      {vale && (
        <div className="rounded-lg border border-[#DDE0EC] bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">Vale encontrado</p>
          <p className="mt-1 font-sora text-lg font-bold text-primary">{vale.proveedor_nombre}</p>

          {esOtroComercio ? (
            <p className="mt-3 rounded-md border border-red-100 bg-red-50 p-2 text-sm text-danger">
              Este vale no es de {dispositivo.proveedor?.nombre}.
            </p>
          ) : (
            <>
              <p className="text-sm text-primary-600">{vale.descripcion}</p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-primary">{detalleVale(vale)}</span>
                <span className="text-primary-500">
                  Vecino: {vale.vecino_nombre ?? '—'}
                  {vale.vecino_dni ? ` · DNI ${vale.vecino_dni}` : ''}
                </span>
              </div>
              {vale.estado === 'abierto' && (
                <p className="mt-2 text-sm font-semibold" style={{ color: '#C9A84C' }}>
                  {formatearCountdown(msRestantes(vale))} restantes para canjear
                </p>
              )}

              {yaCanjeado ? (
                <p className="mt-3 rounded-md bg-primary-50 p-2 text-sm font-medium text-primary-700">
                  Este vale ya fue canjeado.
                </p>
              ) : (
                <div className="mt-3 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setVale(null)}>Cancelar</Button>
                  <Button variant="accent" onClick={confirmarCanje} loading={canjearMut.isPending}>
                    Confirmar canje
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Historial de canjes de un comercio ──────────────────────────
//
// Un solo componente para los dos lugares donde hace falta mostrar
// esto: el comercio ACTIVO (pantalla principal, este dispositivo
// opera acá) y "Mis otros comercios" (solo lectura, otro dispositivo
// opera ahí). `esComercioActivo` solo cambia el cartel de aviso -- la
// lógica de qué columnas mostrar es la misma en los dos casos.
//
// historial_canjes_proveedor() devuelve columnas distintas según el
// rol real de quien llama para ESE comercio -- responsable ve todo,
// secundario ve solo codigo/canjeado_en/estado (filtrado además por
// canjeado_por = quien llama, para el secundario). Acá NUNCA se le
// pregunta el rol al vecino ni se lo infiere de otro lado: se detecta
// mirando si la fila trae `vecino_nombre` (si vino, es el vecino_nombre
// real de un canje real, no un campo que se pueda simular con ausencia
// de otro dato). Sin filas no hay forma de saber qué vería este
// vecino si hubiera canjes -- no se muestra la nota "ves menos" en ese
// caso, no hace falta explicar una restricción sobre una lista vacía.
function ComercioCanjeadosCard({ proveedor, esComercioActivo = false }) {
  const { data: vales = [], isLoading } = useHistorialCanjesProveedor(proveedor.id)
  const vistaReducida = vales.length > 0 && !('vecino_nombre' in vales[0])

  return (
    <div className="rounded-lg border border-[#DDE0EC] bg-white p-4">
      <p className="font-sora text-base font-bold text-primary">{proveedor.nombre}</p>
      {!esComercioActivo && (
        <p className="text-xs text-primary-400">Solo lectura — no podés operar acá desde este teléfono.</p>
      )}
      {vistaReducida && (
        <p className="mt-2 rounded-md bg-primary-50 p-2 text-xs text-primary-600">
          Ves los vales que canjeaste vos. El detalle completo está en la cuenta del
          responsable del comercio.
        </p>
      )}
      {isLoading ? (
        <div className="flex justify-center py-3"><Spinner size="sm" /></div>
      ) : vales.length === 0 ? (
        <p className="mt-2 text-sm text-primary-500">Sin vales canjeados todavía.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {vales.map(v => (
            <li key={v.codigo} className="py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-medium text-primary">{v.codigo}</span>
                <span className="text-xs capitalize text-primary-400">
                  {v.canjeado_en ? dateTimeOf(v.canjeado_en) : ''} · {v.estado}
                </span>
              </div>
              {'vecino_nombre' in v && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="font-medium text-primary">{detalleVale(v)}</span>
                  <span className="text-primary-500">
                    {v.vecino_nombre ?? '—'}
                    {v.vecino_dni ? ` · DNI ${v.vecino_dni}` : ''}
                  </span>
                </div>
              )}
              {'descripcion' in v && v.descripcion && (
                <p className="mt-0.5 text-xs text-primary-400">{v.descripcion}</p>
              )}
              {'canjeado_por' in v && (
                <p className="mt-0.5 text-xs text-primary-400">Canjeado por: {v.canjeado_por}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OtrosComerciosView({ accesos, comercioActualId }) {
  const otros = accesos.filter(a => a.proveedor?.id !== comercioActualId)
  if (otros.length === 0) {
    return <p className="text-sm text-primary-500">No tenés acceso a otros comercios.</p>
  }
  return (
    <div className="space-y-3">
      {otros.map(a => <ComercioCanjeadosCard key={a.proveedor.id} proveedor={a.proveedor} />)}
    </div>
  )
}

// ── Este dispositivo (desvincular) ──────────────────────────────
//
// Desde 2026-07-28, desvincular es del responsable del comercio (o
// staff) -- ya no alcanza con ser quien lo vinculó. `esResponsable` lo
// calcula Proveedor() cruzando dispositivo.proveedor.id contra el
// rol real de este vecino en `accesos`; acá solo decide qué OFRECER,
// el server (desvincular_dispositivo) sigue siendo quien rechaza de
// verdad a un secundario.
function DispositivoView({ dispositivo, deviceId, esResponsable, onDesvinculado }) {
  const desvincularMut = useDesvincularDispositivo()
  const [confirmando, setConfirmando] = useState(false)
  const [error, setError] = useState('')

  async function handleDesvincular() {
    setError('')
    try {
      await desvincularMut.mutateAsync(deviceId)
      setConfirmando(false)
      onDesvinculado?.()
    } catch (e) {
      const msg = (e?.message ?? '').toLowerCase()
      setError(
        msg.includes('permiso')
          ? 'Solo el responsable del comercio o el personal de la comuna puede desvincularlo'
          : (e?.message ?? 'No pudimos desvincular el dispositivo.'),
      )
      setConfirmando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#DDE0EC] bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary-400">Este dispositivo opera en</p>
        <p className="mt-1 font-sora text-lg font-bold text-primary">{dispositivo.proveedor?.nombre}</p>
        {dispositivo.alias && <p className="text-sm text-primary-500">{dispositivo.alias}</p>}
      </div>

      {error && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</div>
      )}

      {!esResponsable ? (
        <p className="text-sm text-primary-500">
          Solo el responsable del comercio o el personal de la comuna puede desvincular
          este teléfono.
        </p>
      ) : !confirmando ? (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-sm font-semibold text-danger hover:underline"
        >
          Desvincular este dispositivo
        </button>
      ) : (
        <div className="rounded-lg border border-accent-200 bg-accent-50 p-4">
          <p className="text-sm text-primary-700">
            ¿Desvincular este teléfono de <strong>{dispositivo.proveedor?.nombre}</strong>? Vas a tener
            que volver a elegir un comercio la próxima vez que quieras canjear acá.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmando(false)}>Cancelar</Button>
            <Button variant="danger" onClick={handleDesvincular} loading={desvincularMut.isPending}>
              Sí, desvincular
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────
export default function Proveedor() {
  const { vecino } = useVecino()
  const navigate = useNavigate()
  const deviceId = useMemo(() => getDeviceId(), [])
  const accesosQ = useAccesosProveedorVecino(vecino?.id)
  const dispositivoQ = useDispositivoVinculado(deviceId)
  const [tab, setTab] = useState('canjear')

  if (vecino?.auth_mode !== 'supabase') {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => navigate('/portal')}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-accent-700"
          >
            ← Volver al inicio
          </button>
          <div className="rounded-xl border border-accent-200 bg-accent-50 p-6 sm:p-8">
            <div className="mx-auto max-w-lg text-center">
              <div className="mb-4 text-5xl">🔒</div>
              <h2 className="font-sora text-lg font-bold text-primary">Cuenta requerida</h2>
              <p className="mt-3 text-sm text-primary-700">
                Para operar como comercio necesitás ingresar con tu cuenta (email y contraseña).
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

  if (accesosQ.isLoading || dispositivoQ.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    )
  }

  const accesos = accesosQ.data ?? []

  // Defensivo -- la entrada en VecinoDashboard.jsx ya solo se muestra
  // con accesos activos, pero alguien podría llegar por URL directa.
  if (accesos.length === 0) {
    return (
      <div className="min-h-screen bg-background px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => navigate('/portal/mi-cuenta')}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-accent-700"
          >
            ← Volver a mi cuenta
          </button>
          <div className="rounded-xl border border-[#DDE0EC] bg-white p-8 text-center">
            <p className="text-sm text-primary-500">No tenés acceso a ningún comercio.</p>
          </div>
        </div>
      </div>
    )
  }

  const dispositivo = dispositivoQ.data
  const accesoActivo = accesos.find(a => a.proveedor?.id === dispositivo?.proveedor?.id)
  const esResponsableActivo = accesoActivo?.rol === 'responsable'

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => navigate('/portal/mi-cuenta')}
          className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-accent-700"
        >
          ← Volver a mi cuenta
        </button>

        {!dispositivo ? (
          <VincularView accesos={accesos} deviceId={deviceId} onVinculado={() => dispositivoQ.refetch()} />
        ) : (
          <>
            <header className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Operando en</p>
              <h1 className="font-sora text-xl font-bold text-primary sm:text-2xl">
                {dispositivo.proveedor?.nombre}
              </h1>
            </header>

            <div className="mb-4 flex gap-1 border-b border-border">
              <TabButton active={tab === 'canjear'} onClick={() => setTab('canjear')}>Canjear</TabButton>
              {accesos.length > 1 && (
                <TabButton active={tab === 'otros'} onClick={() => setTab('otros')}>Mis otros comercios</TabButton>
              )}
              <TabButton active={tab === 'dispositivo'} onClick={() => setTab('dispositivo')}>Este dispositivo</TabButton>
            </div>

            {tab === 'canjear' && (
              <div className="space-y-6">
                <CanjearView dispositivo={dispositivo} deviceId={deviceId} />
                <ComercioCanjeadosCard proveedor={dispositivo.proveedor} esComercioActivo />
              </div>
            )}
            {tab === 'otros' && (
              <OtrosComerciosView accesos={accesos} comercioActualId={dispositivo.proveedor?.id} />
            )}
            {tab === 'dispositivo' && (
              <DispositivoView
                dispositivo={dispositivo}
                deviceId={deviceId}
                esResponsable={esResponsableActivo}
                onDesvinculado={() => { dispositivoQ.refetch(); setTab('canjear') }}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
