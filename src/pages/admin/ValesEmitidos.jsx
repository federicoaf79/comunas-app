import { useState } from 'react'
import { useVales, useCreateVale } from '../../hooks/useVales'
import { useAuth } from '../../context/AuthContext'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import EmitirValeModal from '../../components/admin/EmitirValeModal'
import { dateOf } from '../../lib/datetime'

// =============================================================
// ValesEmitidos — Vales Electrónicos, Fase 1.
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
// coincide con vales_staff_select.
// =============================================================

const ESTADO_BADGES = {
  emitido:  { bg: 'bg-[#0F1C35]',  text: 'text-white',   label: 'Emitido' },
  abierto:  { bg: 'bg-[#1D4ED8]',  text: 'text-white',   label: 'Abierto' },
  canjeado: { bg: 'bg-ok',         text: 'text-white',   label: 'Canjeado' },
  vencido:  { bg: 'bg-slate-400',  text: 'text-white',   label: 'Vencido' },
  cancelado:{ bg: 'bg-red-100',    text: 'text-red-700', label: 'Cancelado' },
}

function EstadoBadge({ estado }) {
  const b = ESTADO_BADGES[estado] ?? ESTADO_BADGES.emitido
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.bg} ${b.text}`}>
      {b.label}
    </span>
  )
}

function detalleVale(v) {
  if (v.monto != null) return `$${Number(v.monto).toLocaleString('es-AR')}`
  if (v.cantidad != null) return `${v.cantidad} ${v.unidad ?? ''}`.trim()
  return '—'
}

export default function ValesEmitidos() {
  const { perfil, hasRole } = useAuth()
  const isSuperadmin = hasRole('superadmin')
  // Candado exclusivo -- calca vales_staff_insert de la RLS, que NO
  // le da bypass a admin_comuna, solo a superadmin.
  const puedeEmitir = isSuperadmin || !!perfil?.puede_emitir_vales

  const { municipioId } = useEffectiveMunicipioId()
  const valesQ = useVales()
  const createMut = useCreateVale()

  const [modalOpen, setModalOpen] = useState(false)

  const vales = valesQ.data ?? []

  // El modal muestra sus propios errores inline (se queda abierto
  // para reintentar) -- acá solo se propaga la excepción, sin
  // duplicar el mensaje en la página.
  async function handleCrear(payload) {
    await createMut.mutateAsync({ ...payload, municipio_id: municipioId, emitido_por: perfil?.id })
    return true
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
    </div>
  )
}
