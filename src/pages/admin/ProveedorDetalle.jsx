import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import {
  useProveedores, useProveedorAccesos, useCreateProveedorAcceso,
  useCambiarRolAcceso, useToggleAccesoActivo,
  useProveedorDispositivos, useDesvincularDispositivoStaff,
} from '../../hooks/useProveedores'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import AgregarAccesoModal from '../../components/admin/AgregarAccesoModal'
import DesactivarAccesoModal from '../../components/admin/DesactivarAccesoModal'
import DesvincularDispositivoModal from '../../components/admin/DesvincularDispositivoModal'
import { dateTimeOf } from '../../lib/datetime'

// =============================================================
// ProveedorDetalle — Vales Electrónicos, Fase 4 parte 2.
//
// Todo el módulo depende de proveedor_accesos.rol para decidir quién
// puede vincular/desvincular teléfonos y qué ve cada quien en su
// historial (ver Fase 4 parte 1). Hasta ahora eso se administraba por
// SQL a mano -- esta pantalla es la declaración jurada: la comuna
// carga quién puede operar en cada comercio.
// =============================================================

const ROL_OPTS = [
  { value: 'secundario', label: 'Secundario' },
  { value: 'responsable', label: 'Responsable' },
]

function EstadoBadge({ activo }) {
  if (activo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ok-50 px-2.5 py-0.5 text-xs font-semibold text-ok-700 ring-1 ring-inset ring-ok-100">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" /> Activo
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-200">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" /> Inactivo
    </span>
  )
}

function AccesoDenegado() {
  return (
    <div className="card p-10 text-center">
      <p className="font-sora text-lg font-semibold text-primary">Acceso restringido</p>
      <p className="mt-2 text-sm text-primary-500">
        No tenés el permiso de gestión de Vales Electrónicos habilitado. Pedile a un
        administrador de la comuna que te lo asigne desde Usuarios.
      </p>
    </div>
  )
}

export default function ProveedorDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { perfil, hasRole } = useAuth()
  const esDirector = hasRole(['admin_comuna', 'superadmin'])
  const accesoVales = (perfil?.modulos_acceso ?? []).find(m => m?.modulo === 'vales')
  const puedeGestionar = esDirector || !!accesoVales?.puede_gestionar || !!accesoVales?.puede_administrar

  const proveedoresQ = useProveedores()
  const proveedor = (proveedoresQ.data ?? []).find(p => p.id === id)

  const accesosQ = useProveedorAccesos(id)
  const createAccesoMut = useCreateProveedorAcceso()
  const cambiarRolMut = useCambiarRolAcceso()
  const toggleAccesoMut = useToggleAccesoActivo()

  const [soloActivosDispositivos, setSoloActivosDispositivos] = useState(true)
  const dispositivosQ = useProveedorDispositivos(id, { soloActivos: soloActivosDispositivos })
  const desvincularMut = useDesvincularDispositivoStaff()

  const [modalAgregarOpen, setModalAgregarOpen] = useState(false)
  const [accesoADesactivar, setAccesoADesactivar] = useState(null)
  const [dispositivoADesvincular, setDispositivoADesvincular] = useState(null)

  if (!puedeGestionar) return <AccesoDenegado />

  if (proveedoresQ.isLoading) {
    return <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
  }

  if (!proveedor) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/admin/vales/proveedores')}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-accent-700"
        >
          ← Volver a proveedores
        </button>
        <div className="card p-10 text-center text-sm text-primary-400">
          No encontramos ese proveedor.
        </div>
      </div>
    )
  }

  const accesos = accesosQ.data ?? []
  const dispositivos = dispositivosQ.data ?? []
  const sinResponsables = !accesosQ.isLoading
    && accesos.filter(a => a.rol === 'responsable' && a.activo).length === 0

  async function handleAgregar({ vecino, rol }) {
    await createAccesoMut.mutateAsync({
      proveedorId: id,
      proveedorNombre: proveedor.nombre,
      proveedorMunicipioId: proveedor.municipio_id,
      vecino, rol,
    })
  }

  function handleCambiarRol(acceso, nuevoRol) {
    if (nuevoRol === acceso.rol) return
    cambiarRolMut.mutate({
      id: acceso.id, proveedorId: id, rol: nuevoRol,
      vecinoNombre: acceso.vecino?.nombre_completo, proveedorNombre: proveedor.nombre,
    })
  }

  // Reactivar es de bajo riesgo (devuelve un acceso, no lo quita) -- va
  // directo. Desactivar SÍ necesita el modal: puede ser el último
  // responsable activo, el estado inválido que la ficha ya avisa
  // después pero conviene evitar antes de crearlo.
  function handleToggleAcceso(acceso) {
    if (!acceso.activo) {
      toggleAccesoMut.mutate({
        id: acceso.id, proveedorId: id, activo: true,
        vecinoNombre: acceso.vecino?.nombre_completo, proveedorNombre: proveedor.nombre,
      })
      return
    }
    setAccesoADesactivar(acceso)
  }

  const esUltimoResponsableDeAccesoADesactivar = !!accesoADesactivar
    && accesoADesactivar.rol === 'responsable'
    && accesos.filter(a => a.rol === 'responsable' && a.activo && a.id !== accesoADesactivar.id).length === 0

  async function confirmarDesactivarAcceso() {
    await toggleAccesoMut.mutateAsync({
      id: accesoADesactivar.id, proveedorId: id, activo: false,
      vecinoNombre: accesoADesactivar.vecino?.nombre_completo, proveedorNombre: proveedor.nombre,
    })
  }

  async function confirmarDesvincular() {
    await desvincularMut.mutateAsync({
      deviceId: dispositivoADesvincular.device_id,
      proveedorId: id,
      alias: dispositivoADesvincular.alias,
      proveedorNombre: proveedor.nombre,
    })
  }

  return (
    <div className="space-y-5">
      <button
        onClick={() => navigate('/admin/vales/proveedores')}
        className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-accent-700"
      >
        ← Volver a proveedores
      </button>

      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">{proveedor.nombre}</h1>
        <p className="mt-1 text-sm text-primary-500">
          {proveedor.categoria || 'Sin categoría'} · Personas autorizadas y teléfonos vinculados.
        </p>
      </header>

      {sinResponsables && (
        <div className="rounded-md border border-accent-200 bg-accent-50 p-3 text-sm text-accent-700">
          Este comercio no tiene ningún responsable. Nadie va a poder vincular un teléfono,
          así que no va a poder canjear vales.
        </div>
      )}

      {/* ── Personas autorizadas ── */}
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-sora text-lg font-bold text-primary">Personas autorizadas</h2>
            <p className="text-xs text-primary-400">
              Quién puede vincular teléfonos (responsable) y quién puede canjear (ambos roles).
            </p>
          </div>
          <Button size="sm" onClick={() => setModalAgregarOpen(true)}>+ Agregar persona</Button>
        </div>

        {accesosQ.isLoading ? (
          <div className="flex items-center justify-center py-8"><Spinner size="lg" /></div>
        ) : accesosQ.error ? (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            No pudimos cargar las personas autorizadas: {accesosQ.error.message}
          </div>
        ) : accesos.length === 0 ? (
          <p className="py-4 text-center text-sm text-primary-400">
            Todavía no hay nadie autorizado para este comercio.
          </p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Nombre</Th>
                <Th>DNI</Th>
                <Th>Rol</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </Tr>
            </THead>
            <tbody>
              {accesos.map(a => (
                <Tr key={a.id}>
                  <Td className="font-medium text-primary">{a.vecino?.nombre_completo ?? '—'}</Td>
                  <Td className="text-primary-500">{a.vecino?.dni ?? '—'}</Td>
                  <Td>
                    <Select
                      value={a.rol}
                      onChange={v => handleCambiarRol(a, v)}
                      options={ROL_OPTS}
                      disabled={!a.activo}
                    />
                  </Td>
                  <Td><EstadoBadge activo={a.activo} /></Td>
                  <Td className="whitespace-nowrap text-right text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => handleToggleAcceso(a)}
                      className={a.activo ? 'text-danger hover:underline' : 'text-ok-700 hover:underline'}
                    >
                      {a.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      {/* ── Teléfonos ── */}
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-sora text-lg font-bold text-primary">Teléfonos</h2>
            <p className="text-xs text-primary-400">
              Vincular es siempre una acción del responsable desde su propio celular.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-primary-600">
            <input
              type="checkbox"
              checked={!soloActivosDispositivos}
              onChange={e => setSoloActivosDispositivos(!e.target.checked)}
            />
            Ver también los desvinculados
          </label>
        </div>

        {dispositivosQ.isLoading ? (
          <div className="flex items-center justify-center py-8"><Spinner size="lg" /></div>
        ) : dispositivosQ.error ? (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
            No pudimos cargar los teléfonos: {dispositivosQ.error.message}
          </div>
        ) : dispositivos.length === 0 ? (
          <p className="py-4 text-center text-sm text-primary-400">
            {soloActivosDispositivos ? 'Ningún teléfono vinculado todavía.' : 'Sin teléfonos para mostrar.'}
          </p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Alias</Th>
                <Th>Dispositivo</Th>
                <Th>Vinculado por</Th>
                <Th>Vinculado el</Th>
                <Th>Último uso</Th>
                <Th>Estado</Th>
                <Th className="text-right">Acciones</Th>
              </Tr>
            </THead>
            <tbody>
              {dispositivos.map(d => (
                <Tr key={d.id}>
                  <Td className="font-medium text-primary">{d.alias || '—'}</Td>
                  <Td className="font-mono text-xs text-primary-500">···{(d.device_id ?? '').slice(-6)}</Td>
                  <Td className="text-primary-500">{d.vinculado?.nombre_completo ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-xs text-primary-400">
                    {d.vinculado_en ? dateTimeOf(d.vinculado_en) : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-primary-400">
                    {d.ultimo_uso_en ? dateTimeOf(d.ultimo_uso_en) : 'Nunca'}
                  </Td>
                  <Td><EstadoBadge activo={d.activo} /></Td>
                  <Td className="whitespace-nowrap text-right text-xs font-medium">
                    {d.activo && (
                      <button
                        type="button"
                        onClick={() => setDispositivoADesvincular(d)}
                        className="text-danger hover:underline"
                      >
                        Desvincular
                      </button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <AgregarAccesoModal
        open={modalAgregarOpen}
        onClose={() => setModalAgregarOpen(false)}
        onAgregar={handleAgregar}
        municipioId={proveedor.municipio_id}
      />

      <DesactivarAccesoModal
        open={!!accesoADesactivar}
        onClose={() => setAccesoADesactivar(null)}
        acceso={accesoADesactivar}
        proveedorNombre={proveedor.nombre}
        esUltimoResponsable={esUltimoResponsableDeAccesoADesactivar}
        onConfirmar={confirmarDesactivarAcceso}
      />

      <DesvincularDispositivoModal
        open={!!dispositivoADesvincular}
        onClose={() => setDispositivoADesvincular(null)}
        dispositivo={dispositivoADesvincular}
        proveedorNombre={proveedor.nombre}
        onConfirmar={confirmarDesvincular}
      />
    </div>
  )
}
