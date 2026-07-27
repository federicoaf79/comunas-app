import { useState } from 'react'
import { useVales, useCreateVale, useAnularVale } from '../../hooks/useVales'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import Tabs from '../../components/ui/Tabs'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import EmitirValeModal from '../../components/admin/EmitirValeModal'
import AnularValeModal from '../../components/admin/AnularValeModal'
import ValeDetalleModal from '../../components/admin/ValeDetalleModal'
import ValesConciliacionTab from '../../components/admin/ValesConciliacionTab'
import { EstadoBadge } from '../../components/admin/EstadoBadgeVale'
import { dateOf } from '../../lib/datetime'

// =============================================================
// ValesEmitidos — Vales Electrónicos.
//
// "+ Emitir vale" solo aparece para quien tiene puede_emitir_vales
// (el candado exclusivo, Fase 0) -- distinto del acceso general de
// Gestión al módulo Vales (Parte D) que ya deja entrar a esta
// pantalla a cualquier staff con ese permiso. Ver
// vales_staff_insert en la migración: ni admin_comuna bypasea este
// candado, solo superadmin -- por eso el gate acá tampoco usa
// esDirector, calca exactamente el criterio de la RLS.
//
// El listado (quién, cuándo, a quién, estado) SÍ es visible para
// cualquier staff con acceso al módulo -- no requiere el candado,
// coincide con vales_staff_select. "Anular" tampoco requiere el
// candado de emisión: el RPC anular_vale() ya exige staff/superadmin
// del lado del server (defensa en profundidad, no confiar solo en
// ocultar el botón acá) -- por eso se ofrece a cualquiera que vea
// esta pantalla, igual que el resto del listado.
//
// Fase 4 parte 1 sumó una segunda tab ("Conciliación", ver
// ValesConciliacionTab.jsx) y la acción de anular vales 'emitido'
// (ValesEmitidos ya no es solo el listado de Fase 1).
// =============================================================

const TABS = [
  { value: 'emitidos',     label: 'Emitidos' },
  { value: 'conciliacion', label: 'Conciliación' },
]

function detalleVale(v) {
  if (v.monto != null) return `$${Number(v.monto).toLocaleString('es-AR')}`
  if (v.cantidad != null) return `${v.cantidad} ${v.unidad ?? ''}`.trim()
  return '—'
}

function TabEmitidos({ perfil, municipioId, puedeEmitir }) {
  const valesQ = useVales()
  const createMut = useCreateVale()
  const anularMut = useAnularVale()

  const [modalOpen, setModalOpen] = useState(false)
  const [valeParaAnular, setValeParaAnular] = useState(null)
  const [valeDetalle, setValeDetalle] = useState(null)

  const vales = valesQ.data ?? []

  // El modal muestra sus propios errores inline (se queda abierto
  // para reintentar) -- acá solo se propaga la excepción, sin
  // duplicar el mensaje en la página.
  async function handleCrear(payload) {
    await createMut.mutateAsync({ ...payload, municipio_id: municipioId, emitido_por: perfil?.id })
    return true
  }

  // AnularValeModal también se queda abierto en error (muestra el
  // mensaje del server tal cual) -- por eso acá se propaga la
  // excepción en vez de absorberla.
  async function handleAnular(motivo) {
    await anularMut.mutateAsync({ codigo: valeParaAnular.codigo, motivo })
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-sora text-2xl font-bold text-primary">Vales emitidos</h1>
          <p className="mt-1 text-sm text-primary-500">
            Vales electrónicos emitidos a vecinos beneficiarios.
          </p>
        </div>
        {puedeEmitir && (
          <Button onClick={() => setModalOpen(true)}>
            + Emitir vale
          </Button>
        )}
      </header>

      {!puedeEmitir && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No tenés el permiso de emisión habilitado (candado aparte del acceso general a Vales).
          Pedile a un administrador de la comuna que te lo asigne desde Usuarios.
        </div>
      )}

      {valesQ.isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : valesQ.error ? (
        <div className="card border-red-100 bg-red-50 p-4 text-sm text-danger">
          No pudimos cargar los vales: {valesQ.error.message}
        </div>
      ) : vales.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay vales emitidos todavía.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>Código</Th>
              <Th>Beneficiario</Th>
              <Th>Proveedor</Th>
              <Th>Detalle</Th>
              <Th>Estado</Th>
              <Th>Emitido por</Th>
              <Th>Emitido el</Th>
              <Th>Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {vales.map(v => (
              <Tr key={v.id}>
                <Td className="font-mono text-xs font-medium text-primary">{v.codigo}</Td>
                <Td>
                  <p className="font-medium text-primary">{v.vecino?.nombre_completo ?? '—'}</p>
                  <p className="text-xs text-primary-400">DNI {v.vecino?.dni ?? '—'}</p>
                </Td>
                <Td className="text-primary-500">{v.proveedor?.nombre ?? '—'}</Td>
                <Td className="text-primary-500">{detalleVale(v)}</Td>
                <Td><EstadoBadge estado={v.estado} /></Td>
                <Td className="text-primary-500">{v.emisor?.nombre ?? '—'}</Td>
                <Td className="whitespace-nowrap text-xs text-primary-400">
                  {v.emitido_en ? dateOf(v.emitido_en) : '—'}
                </Td>
                <Td>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setValeDetalle(v)}
                      className="text-xs font-semibold text-primary-500 hover:text-primary"
                    >
                      Ver
                    </button>
                    {/* Solo 'emitido' -- un vale ya abierto no se puede
                        anular, el vecino puede estar en el mostrador. */}
                    {v.estado === 'emitido' && (
                      <button
                        type="button"
                        onClick={() => setValeParaAnular(v)}
                        className="text-xs font-semibold text-danger hover:underline"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <EmitirValeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCrear}
        municipioId={municipioId}
      />

      <AnularValeModal
        open={!!valeParaAnular}
        onClose={() => setValeParaAnular(null)}
        vale={valeParaAnular}
        onAnular={handleAnular}
      />

      <ValeDetalleModal
        open={!!valeDetalle}
        onClose={() => setValeDetalle(null)}
        vale={valeDetalle}
      />
    </div>
  )
}

export default function ValesEmitidos() {
  const { perfil, hasRole } = useAuth()
  const isSuperadmin = hasRole('superadmin')
  // Candado exclusivo -- calca vales_staff_insert de la RLS, que NO
  // le da bypass a admin_comuna, solo a superadmin.
  const puedeEmitir = isSuperadmin || !!perfil?.puede_emitir_vales

  const { municipioId } = useEffectiveMunicipioId()
  const [tab, setTab] = useState('emitidos')

  return (
    <div className="space-y-5">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {tab === 'emitidos' && (
        <TabEmitidos perfil={perfil} municipioId={municipioId} puedeEmitir={puedeEmitir} />
      )}
      {tab === 'conciliacion' && <ValesConciliacionTab />}
    </div>
  )
}
