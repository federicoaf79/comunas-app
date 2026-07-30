import { useMemo, useState } from 'react'
import { useMunicipios } from '../../hooks/useMunicipios'
import {
  useModulosConfigTenant, useUpdateModuloConfig, useSincronizarModulosFaltantes,
  MODULOS_DISPONIBLES, MODULOS_DESC,
} from '../../hooks/useModulos'
import { createAuditLog } from '../../hooks/useAuditLog'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Select from '../../components/ui/Select'
import Modal from '../../components/ui/Modal'
import Spinner from '../../components/ui/Spinner'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { Badge } from '../../components/ui/Badge'

// =============================================================
// Página SuperAdmin — Gestión de módulos por tenant (/superadmin/modulos)
//
// Reemplaza el UPDATE a mano en Supabase que era el único camino hasta
// ahora para prender/apagar un módulo (`useModulos.js` no tenía ninguna
// función de escritura). Cross-tenant: `createAuditLog` acá SIEMPRE va
// con `municipioId` explícito — el actor es el superadmin, no el
// municipio que se está editando, así que inferirlo de su propia fila
// en `usuarios` guardaría el dato equivocado.
// =============================================================

function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[superadmin/Modulos] audit log:', e.message))
}

const CATALOGO_POR_ID = new Map(MODULOS_DISPONIBLES.map(m => [m.id, m]))

// Mismo patrón de Toggle que GestionDependencias.jsx (azul #1D4ED8
// activo / gris inactivo, cero verde) — se duplica en vez de extraer
// a un componente compartido porque es la única otra pantalla que lo
// necesita hoy.
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-[#1D4ED8]' : 'bg-primary-200'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

export default function Modulos() {
  const { data: municipios = [], isLoading: loadingMunis } = useMunicipios()
  const [municipioId, setMunicipioId] = useState('')
  const municipio = municipios.find(m => m.id === municipioId) ?? null

  const { data: filas = [], isLoading: loadingFilas } = useModulosConfigTenant(municipioId || null)
  const updateModulo = useUpdateModuloConfig()
  const sincronizar = useSincronizarModulosFaltantes()
  const [confirmSync, setConfirmSync] = useState(false)

  const faltantes = useMemo(() => {
    if (!municipioId) return []
    const presentes = new Set(filas.map(f => f.modulo))
    return MODULOS_DISPONIBLES.filter(m => !presentes.has(m.id))
  }, [filas, municipioId])

  function handleToggleActivo(fila) {
    const nuevoActivo = !fila.activo
    updateModulo.mutate({ id: fila.id, patch: { activo: nuevoActivo } }, {
      onSuccess: () => {
        logAudit({
          municipioId,
          accion:      'update',
          entidad:     'modulos_config',
          entidadId:   fila.id,
          descripcion: `Módulo "${fila.modulo}" ${nuevoActivo ? 'activado' : 'desactivado'} para ${municipio?.nombre ?? municipioId}`,
          metadata:    { modulo: fila.modulo, activo_antes: fila.activo, activo_despues: nuevoActivo },
        })
      },
    })
  }

  function handleOrdenChange(fila, nuevoOrdenRaw) {
    const n = Number(nuevoOrdenRaw)
    if (!Number.isFinite(n) || n === fila.orden) return
    updateModulo.mutate({ id: fila.id, patch: { orden: n } }, {
      onSuccess: () => {
        logAudit({
          municipioId,
          accion:      'update',
          entidad:     'modulos_config',
          entidadId:   fila.id,
          descripcion: `Orden del módulo "${fila.modulo}" cambiado de ${fila.orden} a ${n} para ${municipio?.nombre ?? municipioId}`,
          metadata:    { modulo: fila.modulo, orden_antes: fila.orden, orden_despues: n },
        })
      },
    })
  }

  function handleSoloInformativoChange(fila, nuevoValor) {
    const configAntes = fila.config ?? {}
    const configDespues = { ...configAntes, solo_informativo: nuevoValor }
    updateModulo.mutate({ id: fila.id, patch: { config: configDespues } }, {
      onSuccess: () => {
        logAudit({
          municipioId,
          accion:      'update',
          entidad:     'modulos_config',
          entidadId:   fila.id,
          descripcion: `"solo_informativo" del módulo "${fila.modulo}" ${nuevoValor ? 'activado' : 'desactivado'} para ${municipio?.nombre ?? municipioId}`,
          metadata:    { modulo: fila.modulo, config_antes: configAntes, config_despues: configDespues },
        })
      },
    })
  }

  async function handleSincronizar() {
    const ids = faltantes.map(m => m.id)
    try {
      await sincronizar.mutateAsync({ municipioId, modulosFaltantes: ids })
      logAudit({
        municipioId,
        accion:      'create',
        entidad:     'modulos_config',
        descripcion: `Sincronizados ${ids.length} módulo${ids.length !== 1 ? 's' : ''} faltante${ids.length !== 1 ? 's' : ''} para ${municipio?.nombre ?? municipioId}`,
        metadata:    { modulos: ids },
      })
      setConfirmSync(false)
    } catch { /* el banner de error de useSincronizarModulosFaltantes ya lo muestra */ }
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-sora text-2xl font-bold text-primary">Módulos por municipio</h1>
        <p className="text-sm text-primary-400">
          Activá, desactivá y ordená los módulos contratados de cada tenant — reemplaza el
          UPDATE a mano en Supabase.
        </p>
      </header>

      <Card>
        <Select
          label="Municipio"
          value={municipioId}
          onChange={setMunicipioId}
          placeholder={loadingMunis ? 'Cargando…' : 'Elegí un municipio'}
          options={municipios.map(m => ({ value: m.id, label: `${m.nombre} (${m.provincia_nombre})` }))}
        />
      </Card>

      {(updateModulo.isError || sincronizar.isError) && (
        <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-danger">
          {updateModulo.error?.message || sincronizar.error?.message}
        </div>
      )}

      {municipioId && (
        <>
          {/* Indicador SIEMPRE visible mientras no esté cargando, incluido
              el caso 0 — si solo aparece cuando falta algo, nadie puede
              distinguir "no falta nada" de "esto no funciona". Se oculta
              durante loadingFilas para no mostrar "faltan 19" de arranque
              (filas todavía vacío por el default de useQuery). */}
          {!loadingFilas && (faltantes.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border border-accent-200 bg-accent-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-accent-700">
                  Le falta{faltantes.length !== 1 ? 'n' : ''} {faltantes.length} módulo{faltantes.length !== 1 ? 's' : ''} del catálogo a este municipio
                </p>
                <p className="text-xs text-accent-700/80">
                  {faltantes.map(m => m.label).join(', ')}
                </p>
              </div>
              <Button variant="accent" onClick={() => setConfirmSync(true)} disabled={sincronizar.isPending}>
                Sincronizar módulos faltantes
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-primary-50/40 p-3 text-sm font-medium text-primary-700">
              0 módulos faltantes — este municipio tiene las {MODULOS_DISPONIBLES.length} filas del catálogo.
            </div>
          ))}

          {loadingFilas ? (
            <div className="flex justify-center p-12"><Spinner /></div>
          ) : filas.length === 0 ? (
            <Card className="p-8 text-center text-sm text-primary-400">
              Este municipio no tiene ningún módulo configurado todavía. El sidebar hoy le
              muestra todo por default (fallback de <code className="font-mono text-xs">useTieneModulo</code>) —
              apretá <b>Sincronizar módulos faltantes</b> arriba para crear las {MODULOS_DISPONIBLES.length} filas del catálogo.
            </Card>
          ) : (
            <Table>
              <THead>
                <Tr>
                  <Th className="w-20">Orden</Th>
                  <Th>Módulo</Th>
                  <Th className="w-24">Activo</Th>
                  <Th className="w-32">Solo informativo</Th>
                </Tr>
              </THead>
              <tbody>
                {filas.map(fila => {
                  const cat = CATALOGO_POR_ID.get(fila.modulo)
                  const soloInformativo = fila.config?.solo_informativo === true
                  return (
                    <Tr key={fila.id} className={!fila.activo ? 'opacity-60' : ''}>
                      <Td>
                        <input
                          type="number"
                          defaultValue={fila.orden ?? 0}
                          onBlur={e => handleOrdenChange(fila, e.target.value)}
                          className="input-field w-16 py-1 text-xs"
                        />
                      </Td>
                      <Td>
                        <div className="flex items-start gap-2">
                          <span className="text-lg leading-none" aria-hidden="true">{cat?.icono ?? '❔'}</span>
                          <div>
                            <div className="flex items-center gap-2 font-semibold text-primary">
                              {cat?.label ?? fila.modulo}
                              {!cat && <Badge variant="danger">no reconocido en el catálogo</Badge>}
                            </div>
                            {cat && MODULOS_DESC[cat.id] && (
                              <div className="text-xs text-primary-400">{MODULOS_DESC[cat.id]}</div>
                            )}
                            {fila.modulo === 'turnos' && (
                              <div className="mt-1 text-xs font-medium text-accent-700">
                                Control efectivo hoy: <code className="font-mono">dependencias.modulo_turnos</code> (por
                                dependencia). Este toggle todavía no gatea nada por sí solo.
                              </div>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <Toggle
                          checked={fila.activo}
                          onChange={() => handleToggleActivo(fila)}
                          disabled={updateModulo.isPending}
                        />
                      </Td>
                      <Td>
                        <Toggle
                          checked={soloInformativo}
                          onChange={(v) => handleSoloInformativoChange(fila, v)}
                          disabled={updateModulo.isPending}
                        />
                      </Td>
                    </Tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </>
      )}

      <Modal
        open={confirmSync}
        onClose={() => (sincronizar.isPending ? null : setConfirmSync(false))}
        title="Sincronizar módulos faltantes"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmSync(false)} disabled={sincronizar.isPending}>
              Cancelar
            </Button>
            <Button onClick={handleSincronizar} loading={sincronizar.isPending}>
              Confirmar
            </Button>
          </>
        }
      >
        <p className="text-sm text-primary-700">
          Se van a crear {faltantes.length} fila{faltantes.length !== 1 ? 's' : ''} nueva{faltantes.length !== 1 ? 's' : ''} en{' '}
          <code className="font-mono text-xs">modulos_config</code> para <b>{municipio?.nombre}</b>, todas{' '}
          <b>inactivas</b> por default:
        </p>
        <ul className="mt-2 space-y-1">
          {faltantes.map(m => (
            <li key={m.id} className="flex items-center gap-2 text-sm text-primary-700">
              <span aria-hidden="true">{m.icono}</span> {m.label}
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  )
}
