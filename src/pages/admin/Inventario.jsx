import { useMemo, useState } from 'react'
import { useDependencias } from '../../hooks/useTurnos'
import { useEffectiveMunicipioId } from '../../hooks/useEffectiveMunicipioId'
import { useAuth } from '../../context/AuthContext'
import { createAuditLog } from '../../hooks/useAuditLog'
import {
  useInventario, useMovimientos, useOrdenesCompra, usePartidasTipo,
  useCreateInventarioItem, useUpdateInventarioItem,
  useCreateMovimiento, useCreateOrdenCompra, useUpdateOrdenEstado,
  useEnviarSolicitudOC,
  LIMITE_COMPRA_DIRECTA,
} from '../../hooks/useInventario'
import Tabs from '../../components/ui/Tabs'
import Select from '../../components/ui/Select'
import Input from '../../components/ui/Input'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import StatCard from '../../components/ui/StatCard'
import { Table, THead, Th, Tr, Td } from '../../components/ui/Table'
import { dateOf, dateTimeOf, todayArgYMD } from '../../lib/datetime'

// =============================================================
// Inventario — stock, movimientos y órdenes de compra.
// 3 tabs. Paleta COMUNAS estricta (cero verde).
// =============================================================

const fmtMoney = new Intl.NumberFormat('es-AR', {
  style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
})

// Auditoría best-effort: nunca bloquea la mutación real si falla.
function logAudit(args) {
  createAuditLog(args).catch(e => console.warn('[Inventario] audit log:', e.message))
}

const TABS = [
  { value: 'stock',       label: 'Stock general' },
  { value: 'movimientos', label: 'Movimientos' },
  { value: 'ordenes',     label: 'Solicitudes y órdenes' },
]

const CATEGORIAS = ['Limpieza', 'Oficina', 'Salud', 'Construcción', 'Combustible', 'Repuestos', 'Otros']

// Catálogos para el split unidad_compra / unidad_consumo. Mantener
// los `value` en lowercase, sin acentos — los persiste el schema y
// los lee también AtencionDrawer / DependenciaGeneral.
const UNIDADES_COMPRA = [
  { value: 'unidad',   label: 'Unidad' },
  { value: 'caja',     label: 'Caja' },
  { value: 'bulto',    label: 'Bulto' },
  { value: 'paquete',  label: 'Paquete' },
  { value: 'frasco',   label: 'Frasco' },
  { value: 'rollo',    label: 'Rollo' },
  { value: 'bidon',    label: 'Bidón' },
  { value: 'bolsa',    label: 'Bolsa' },
]
const UNIDADES_CONSUMO = [
  { value: 'unidades', label: 'Unidades' },
  { value: 'pares',    label: 'Pares' },
  { value: 'ml',       label: 'ml' },
  { value: 'litros',   label: 'Litros' },
  { value: 'gramos',   label: 'Gramos' },
  { value: 'kg',       label: 'Kg' },
  { value: 'metros',   label: 'Metros' },
]

// Texto del stock con conversión opcional. Si el ítem tiene
// unidad_consumo distinta de unidad_compra y cantidad_por_unidad_compra
// > 0, muestra "X consumo (≈ Y compra)". Si son iguales o falta data,
// cae al formato simple "X unidad".
function stockDisplayLabel(item) {
  const stock = Number(item?.stock_actual ?? 0)
  const ucon  = item?.unidad_consumo || item?.unidad || ''
  const ucom  = item?.unidad_compra ?? null
  const ratio = Number(item?.cantidad_por_unidad_compra ?? 0)
  if (ucon && ucom && ucon !== ucom && ratio > 0) {
    const enCompra = Math.floor(stock / ratio)
    return `${stock} ${ucon} (≈ ${enCompra} ${ucom})`
  }
  return `${stock}${ucon ? ` ${ucon}` : ''}`
}

// ─────────────────────────────────────────────────────────────────
// Página
// ─────────────────────────────────────────────────────────────────

export default function Inventario() {
  const { municipioId } = useEffectiveMunicipioId()
  const { hasRole } = useAuth()
  const canEdit     = hasRole(['admin_comuna', 'superadmin'])
  const canApprove  = canEdit
  const [tab, setTab] = useState('stock')
  const { data: dependencias = [] } = useDependencias()

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-primary">Inventario</h1>
        <p className="text-sm text-primary-400">
          Stock por dependencia, movimientos y órdenes de compra.
        </p>
      </header>

      {!municipioId && (
        <div className="rounded-md border border-accent-100 bg-accent-50 p-3 text-sm text-accent-700">
          No encontramos un municipio asignado ni un fallback activo.
        </div>
      )}

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      <div>
        {tab === 'stock' && (
          <StockTab municipioId={municipioId} dependencias={dependencias} canEdit={canEdit} />
        )}
        {tab === 'movimientos' && (
          <MovimientosTab municipioId={municipioId} dependencias={dependencias} />
        )}
        {tab === 'ordenes' && (
          <OrdenesTab municipioId={municipioId} dependencias={dependencias} canApprove={canApprove} />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 1 — Stock general
// ─────────────────────────────────────────────────────────────────

function stockEstado(item) {
  const a = Number(item.stock_actual ?? 0)
  const m = Number(item.stock_minimo ?? 0)
  if (a <= m)         return 'critico'
  if (a <= m * 1.5)   return 'bajo'
  return 'ok'
}

function StockBadge({ estado }) {
  if (estado === 'critico') return <span className="badge-danger">Crítico</span>
  if (estado === 'bajo')    return <span className="badge-accent">Bajo</span>
  return <span className="badge-ok">OK</span>
}

const PAGE_SIZE_STOCK = 20

function StockTab({ municipioId, dependencias, canEdit }) {
  const [dependenciaId, setDependenciaId] = useState('')
  const [categoria, setCategoria]         = useState('')
  const [estadoFiltro, setEstadoFiltro]   = useState('')
  const [modalNew, setModalNew]           = useState(false)
  const [editing, setEditing]             = useState(null)
  const [movItem, setMovItem]             = useState(null)
  const [movTipo, setMovTipo]             = useState('entrada')
  const [page, setPage]                   = useState(1) // 1-indexed para la UI

  // Cambios de filtro disparan reset a página 1 vía wrappers — sino
  // podés quedar mirando "Página 5 de 1" cuando el filtro reduce
  // el resultado. Hacerlo en useEffect dispara `react-hooks/
  // set-state-in-effect` (cascading renders).
  const onChangeDep      = (v) => { setDependenciaId(v); setPage(1) }
  const onChangeCateg    = (v) => { setCategoria(v);     setPage(1) }
  const onChangeEstado   = (v) => { setEstadoFiltro(v);  setPage(1) }

  const filters = {
    dependenciaId: dependenciaId || undefined,
    categoria:     categoria     || undefined,
  }
  const { data: items = [], isLoading } = useInventario(filters, { municipioIdOverride: municipioId })

  const filtered = useMemo(() => {
    if (!estadoFiltro) return items
    return items.filter(i => stockEstado(i) === estadoFiltro)
  }, [items, estadoFiltro])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE_STOCK))
  const safePage   = Math.min(page, totalPages)
  const pageStart  = (safePage - 1) * PAGE_SIZE_STOCK
  const pageItems  = filtered.slice(pageStart, pageStart + PAGE_SIZE_STOCK)

  const totalItems    = items.length
  const itemsCriticos = items.filter(i => stockEstado(i) === 'critico').length
  const valorTotal    = items.reduce((acc, i) =>
    acc + Number(i.stock_actual ?? 0) * Number(i.precio_referencia ?? 0), 0)

  const createMut = useCreateInventarioItem()
  const updateMut = useUpdateInventarioItem()

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Ítems totales" value={totalItems} accent="primary" />
        <StatCard label="En estado crítico" value={itemsCriticos} accent={itemsCriticos > 0 ? 'danger' : 'primary'} />
        <StatCard label="Valor estimado" value={fmtMoney.format(valorTotal)} accent="accent" />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Dependencia" value={dependenciaId} onChange={onChangeDep}
            placeholder="Todas"
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
          />
          <Select
            label="Categoría" value={categoria} onChange={onChangeCateg}
            placeholder="Todas"
            options={CATEGORIAS.map(c => ({ value: c, label: c }))}
          />
          <Select
            label="Estado de stock" value={estadoFiltro} onChange={onChangeEstado}
            placeholder="Todos"
            options={[
              { value: 'critico', label: 'Crítico' },
              { value: 'bajo',    label: 'Bajo' },
              { value: 'ok',      label: 'Normal' },
            ]}
          />
        </div>
        {canEdit && (
          <Button onClick={() => setModalNew(true)}>+ Agregar ítem</Button>
        )}
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">No hay ítems con estos filtros.</div>
      ) : (
        <>
        <Table>
          <THead>
            <Tr>
              <Th>Dependencia</Th>
              <Th>Ítem</Th>
              <Th>Categoría</Th>
              <Th>Unidad</Th>
              <Th className="text-right">Stock</Th>
              <Th className="text-right">Mínimo</Th>
              <Th>Estado</Th>
              <Th className="text-right">Precio ref.</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {pageItems.map(i => {
              const est = stockEstado(i)
              return (
                <Tr key={i.id}>
                  <Td>{i.dependencia?.nombre ?? '—'}</Td>
                  <Td className="font-medium text-primary">{i.nombre}</Td>
                  <Td>{i.categoria || '—'}</Td>
                  <Td>{i.unidad_consumo || i.unidad || '—'}</Td>
                  <Td className="text-right tabular-nums">{stockDisplayLabel(i)}</Td>
                  <Td className="text-right tabular-nums text-primary-500">{i.stock_minimo}</Td>
                  <Td><StockBadge estado={est} /></Td>
                  <Td className="text-right tabular-nums">
                    {i.precio_referencia ? fmtMoney.format(i.precio_referencia) : '—'}
                  </Td>
                  <Td className="whitespace-nowrap text-right text-xs">
                    <button
                      onClick={() => { setMovItem(i); setMovTipo('entrada') }}
                      className="font-medium text-ok-700 hover:underline"
                    >Entrada</button>
                    <span className="mx-1 text-primary-200">·</span>
                    <button
                      onClick={() => { setMovItem(i); setMovTipo('salida') }}
                      className="font-medium text-accent-700 hover:underline"
                    >Salida</button>
                    {canEdit && (
                      <>
                        <span className="mx-1 text-primary-200">·</span>
                        <button
                          onClick={() => setEditing(i)}
                          className="font-medium text-primary-500 hover:underline"
                        >Editar</button>
                      </>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
        <Paginacion
          page={safePage}
          totalPages={totalPages}
          totalItems={filtered.length}
          pageStart={pageStart}
          pageSize={PAGE_SIZE_STOCK}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => Math.min(totalPages, p + 1))}
        />
        </>
      )}

      {modalNew && (
        <ItemFormModal
          onClose={() => setModalNew(false)}
          onSave={async (data) => {
            await createMut.mutateAsync({ ...data, municipio_id: municipioId })
            setModalNew(false)
          }}
          dependencias={dependencias}
          saving={createMut.isPending}
        />
      )}
      {editing && (
        <ItemFormModal
          editing={editing}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            await updateMut.mutateAsync({ id: editing.id, ...data })
            setEditing(null)
          }}
          dependencias={dependencias}
          saving={updateMut.isPending}
        />
      )}
      {movItem && (
        <MovimientoFormModal
          item={movItem}
          tipo={movTipo}
          onClose={() => setMovItem(null)}
        />
      )}
    </div>
  )
}

// Paginación inline genérica — la usa StockTab y se reusa desde
// DependenciaGeneral via export.
export function Paginacion({ page, totalPages, totalItems, pageStart, pageSize, onPrev, onNext }) {
  if (totalItems === 0) return null
  const fin = Math.min(pageStart + pageSize, totalItems)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white px-4 py-3 text-sm shadow-card">
      <span className="text-primary-500">
        Mostrando <b className="text-primary">{pageStart + 1}–{fin}</b> de{' '}
        <b className="text-primary">{totalItems}</b>
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page <= 1}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          ← Anterior
        </button>
        <span className="px-2 text-xs font-medium text-primary-700">
          Página <b className="text-primary">{page}</b> de <b className="text-primary">{totalPages}</b>
        </span>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
        >
          Siguiente →
        </button>
      </div>
    </div>
  )
}

export function ItemFormModal({ editing = null, onClose, onSave, dependencias, saving }) {
  const [form, setForm] = useState(() => editing ?? {
    dependencia_id: '', nombre: '', categoria: '', unidad: '',
    unidad_compra: 'unidad', unidad_consumo: 'unidades',
    cantidad_por_unidad_compra: '',
    stock_actual: '', stock_minimo: '', precio_referencia: '', partida_codigo: '',
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const { data: partidas = [] } = usePartidasTipo()

  // El select de Categoría tolera valores legacy que no estén en
  // CATEGORIAS — agregamos la categoría actual si falta para que
  // el <Select> no muestre vacío al editar items antiguos.
  const categoriaOpts = useMemo(() => {
    const base = CATEGORIAS.map(c => ({ value: c, label: c }))
    if (form.categoria && !CATEGORIAS.includes(form.categoria)) {
      return [{ value: form.categoria, label: form.categoria }, ...base]
    }
    return base
  }, [form.categoria])

  // Conversión activa = unidades difieren y hay ratio > 0. Cuando la
  // unidad de compra y consumo coinciden, los campos extra no aplican
  // y el comportamiento es el legacy (sumar/restar directo).
  const ucom  = form.unidad_compra
  const ucon  = form.unidad_consumo
  const ratio = Number(form.cantidad_por_unidad_compra ?? 0)
  const conversionActiva = ucom && ucon && ucom !== ucon
  const hintConversion = conversionActiva && ratio > 0
    ? `Al comprar 1 ${ucom} se suman ${ratio} ${ucon} al stock`
    : null

  const canSubmit =
    !!form.nombre?.trim() && !!form.dependencia_id &&
    !!form.unidad_consumo &&
    // Si las unidades difieren, exigimos el ratio para que la
    // entrada de stock pueda hacer la conversión sin asumir.
    (!conversionActiva || ratio > 0)

  async function handle() {
    setError('')
    try {
      await onSave({
        dependencia_id:    form.dependencia_id,
        nombre:            form.nombre.trim(),
        categoria:         form.categoria || null,
        // `unidad` queda en sync con unidad_consumo para que el
        // código legacy que lee `.unidad` siga funcionando.
        unidad:            form.unidad_consumo || form.unidad || null,
        unidad_compra:     form.unidad_compra  || null,
        unidad_consumo:    form.unidad_consumo || null,
        cantidad_por_unidad_compra: conversionActiva ? Number(form.cantidad_por_unidad_compra) : null,
        stock_actual:      Number(form.stock_actual ?? 0) || 0,
        stock_minimo:      Number(form.stock_minimo ?? 0) || 0,
        precio_referencia: form.precio_referencia ? Number(form.precio_referencia) : null,
        partida_codigo:    form.partida_codigo || null,
      })
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="lg"
      title={editing ? 'Editar ítem' : 'Nuevo ítem de inventario'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handle} loading={saving} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Dependencia" value={form.dependencia_id} onChange={v => set('dependencia_id', v)}
          placeholder="Seleccionar..."
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <Select
          label="Categoría" value={form.categoria ?? ''} onChange={v => set('categoria', v)}
          placeholder="Seleccionar..."
          options={categoriaOpts}
        />
        <div className="sm:col-span-2">
          <Input label="Nombre del ítem" value={form.nombre} onChange={e => set('nombre', e.target.value)} required />
        </div>
        <Select
          label="Se compra por"
          value={form.unidad_compra ?? ''}
          onChange={v => set('unidad_compra', v)}
          options={UNIDADES_COMPRA}
        />
        <Select
          label="Se consume en"
          value={form.unidad_consumo ?? ''}
          onChange={v => set('unidad_consumo', v)}
          options={UNIDADES_CONSUMO}
        />
        {conversionActiva && (
          <div className="sm:col-span-2">
            <Input
              label={`Unidades de consumo por unidad de compra (${ucon} por ${ucom})`}
              type="number" min="0" step="0.01"
              value={form.cantidad_por_unidad_compra ?? ''}
              onChange={e => set('cantidad_por_unidad_compra', e.target.value)}
              placeholder={`Ej: 100 (un ${ucom} trae 100 ${ucon})`}
              required
            />
            {hintConversion && (
              <p className="mt-1 text-xs text-ok-700">
                {hintConversion}
              </p>
            )}
          </div>
        )}
        <Select
          label="Partida presupuestaria" value={form.partida_codigo ?? ''} onChange={v => set('partida_codigo', v)}
          placeholder="Sin asignar"
          options={partidas.map(p => ({ value: p.codigo, label: `${p.codigo} — ${p.nombre}` }))}
        />
        <Input
          label={`Stock actual (${ucon || 'unidades'})`}
          type="number" min="0"
          value={form.stock_actual ?? ''}
          onChange={e => set('stock_actual', e.target.value)}
        />
        <Input
          label={`Stock mínimo (${ucon || 'unidades'})`}
          type="number" min="0"
          value={form.stock_minimo ?? ''}
          onChange={e => set('stock_minimo', e.target.value)}
        />
        <div className="sm:col-span-2">
          <Input
            label={`Precio de referencia ${conversionActiva ? `(por ${ucom}, opcional)` : '(opcional)'}`}
            type="number" min="0" step="0.01"
            value={form.precio_referencia ?? ''}
            onChange={e => set('precio_referencia', e.target.value)}
          />
        </div>
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}

export function MovimientoFormModal({ item, tipo, onClose }) {
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo]     = useState('')
  const [error, setError]       = useState('')
  const create = useCreateMovimiento()
  const titulo = tipo === 'entrada' ? 'Registrar entrada' : 'Registrar salida'

  const ucon  = item.unidad_consumo || item.unidad || 'unidades'
  const ucom  = item.unidad_compra ?? null
  const ratio = Number(item.cantidad_por_unidad_compra ?? 0)
  // Conversión activa solo cuando difieren las unidades Y hay
  // ratio. La entrada se ingresa en unidad de compra; la salida
  // siempre en unidad de consumo (lo que sale del stock).
  const conversionActiva = !!ucom && ucon !== ucom && ratio > 0

  const cantidadNum = Number(cantidad)
  const cantidadValida = cantidadNum > 0

  // Cantidad real que se va a sumar/restar del stock_actual (en
  // unidad_consumo, que es la unidad del stock).
  const cantidadEnStock = (() => {
    if (!cantidadValida) return 0
    if (tipo === 'entrada' && conversionActiva) return cantidadNum * ratio
    return cantidadNum
  })()

  // Hint de conversión visible en tiempo real.
  const hint = (() => {
    if (!cantidadValida || !conversionActiva) return null
    if (tipo === 'entrada') {
      return `= ${cantidadEnStock} ${ucon} que se sumarán al stock`
    }
    // Salida: convertimos los X consumo a Y compra para que el
    // operador entienda cuánto del stock-bruto se gasta.
    const enCompra = cantidadNum / ratio
    const compraTxt = enCompra >= 1
      ? `≈ ${enCompra.toFixed(2).replace(/\.?0+$/, '')} ${ucom}`
      : `≈ ${enCompra.toFixed(3).replace(/\.?0+$/, '')} ${ucom}`
    return `${compraTxt} del stock`
  })()

  // Motivo auto-armado para Entrada con conversión — el operador
  // puede sobreescribirlo. Para Salida y Entradas sin conversión,
  // el motivo lo escribe libre.
  function motivoFinal() {
    if (motivo.trim()) return motivo.trim()
    if (tipo === 'entrada' && conversionActiva && cantidadValida) {
      return `Entrada: ${cantidadNum} ${ucom} (${cantidadEnStock} ${ucon})`
    }
    return null
  }

  const canSubmit = cantidadValida

  async function handle() {
    setError('')
    try {
      await create.mutateAsync({
        inventarioId: item.id,
        tipo,
        // Pasamos la cantidad EN STOCK (unidad_consumo) — el hook
        // ya hace la suma/resta sobre stock_actual directamente.
        cantidad: cantidadEnStock,
        motivo: motivoFinal(),
      })
      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="md" title={titulo}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button onClick={handle} loading={create.isPending} disabled={!canSubmit}>Guardar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-primary-50/40 p-3 text-sm">
          <div className="font-semibold text-primary">{item.nombre}</div>
          <div className="text-primary-500">
            Stock actual: <b className="tabular-nums">{stockDisplayLabel(item)}</b>
          </div>
        </div>

        {tipo === 'entrada' && conversionActiva ? (
          // Entrada con conversión: cantidad en unidad_compra.
          <Input
            label={`Cantidad recibida (${ucom})`}
            type="number" min="0.01" step="0.01"
            value={cantidad} onChange={e => setCantidad(e.target.value)}
            placeholder={`Ej: 8 ${ucom}s`}
            required autoFocus
          />
        ) : (
          // Entrada sin conversión + cualquier salida: en unidad_consumo.
          <Input
            label={tipo === 'entrada'
              ? `Cantidad recibida (${ucon})`
              : `Cantidad consumida (${ucon})`}
            type="number" min="0.01" step="0.01"
            value={cantidad} onChange={e => setCantidad(e.target.value)}
            required autoFocus
          />
        )}

        {hint && (
          <p className="rounded-md border border-ok-100 bg-ok-50 p-2 text-xs font-medium text-ok-700">
            {hint}
          </p>
        )}

        <Input
          label="Motivo (opcional)"
          value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder={
            tipo === 'entrada'
              ? (conversionActiva ? 'Se genera automático — completá si querés más detalle' : 'Ej: Compra OC #123')
              : 'Ej: Consumo en atención, descarte, ajuste'
          }
        />
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">{error}</div>
        )}
      </div>
    </Modal>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 2 — Movimientos
// ─────────────────────────────────────────────────────────────────

const TIPO_MOV_BADGE = {
  entrada: { label: 'Entrada', cls: 'badge-ok' },
  salida:  { label: 'Salida',  cls: 'badge-accent' },
  ajuste:  { label: 'Ajuste',  cls: 'badge-neutral' },
}

function MovimientosTab({ municipioId, dependencias }) {
  const [dependenciaId, setDependenciaId] = useState('')
  const [tipo, setTipo]                   = useState('')
  const [fechaDesde, setFechaDesde]       = useState('')
  const [fechaHasta, setFechaHasta]       = useState('')

  const { data: movimientos = [], isLoading } = useMovimientos({
    dependenciaId: dependenciaId || undefined,
    tipo:          tipo || undefined,
    fechaDesde:    fechaDesde || undefined,
    fechaHasta:    fechaHasta || undefined,
    limit:         50,
  }, { municipioIdOverride: municipioId })

  function exportCSV() {
    const headers = ['Fecha', 'Dependencia', 'Ítem', 'Tipo', 'Cantidad', 'Stock anterior', 'Stock posterior', 'Motivo']
    const rows = movimientos.map(m => [
      dateTimeOf(m.fecha),
      m.inventario?.dependencia?.nombre ?? '',
      m.inventario?.nombre ?? '',
      m.tipo,
      m.cantidad,
      m.stock_anterior,
      m.stock_posterior,
      (m.motivo ?? '').replace(/"/g, '""'),
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${c}"`).join(','))
      .join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `movimientos-${todayArgYMD()}.csv`
    a.click()
    URL.revokeObjectURL(url)
    logAudit({
      accion: 'export', entidad: 'inventario_movimientos',
      descripcion: `Exportación CSV de movimientos de inventario (${movimientos.length} filas)`,
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Dependencia" value={dependenciaId} onChange={setDependenciaId}
            placeholder="Todas"
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
          />
          <Select
            label="Tipo" value={tipo} onChange={setTipo}
            placeholder="Todos"
            options={[
              { value: 'entrada', label: 'Entrada' },
              { value: 'salida',  label: 'Salida' },
              { value: 'ajuste',  label: 'Ajuste' },
            ]}
          />
          <Input label="Desde" type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
          <Input label="Hasta" type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
        </div>
        <Button variant="secondary" onClick={exportCSV} disabled={movimientos.length === 0}>
          Exportar CSV
        </Button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : movimientos.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">No hay movimientos.</div>
      ) : (
        <ol className="space-y-2">
          {movimientos.map(m => {
            const badge = TIPO_MOV_BADGE[m.tipo] ?? { label: m.tipo, cls: 'badge-neutral' }
            return (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-white px-4 py-3 text-sm shadow-card"
              >
                <span className="whitespace-nowrap font-mono text-xs text-primary-400">
                  {dateTimeOf(m.fecha)}
                </span>
                <span className={badge.cls}>{badge.label}</span>
                <span className="font-semibold text-primary">{m.inventario?.nombre ?? '—'}</span>
                <span className="text-primary-500">·</span>
                <span className="text-primary-500">{m.inventario?.dependencia?.nombre ?? '—'}</span>
                <span className="text-primary-500">·</span>
                <span className="tabular-nums">
                  <b>{m.cantidad}</b> {m.inventario?.unidad ?? ''}
                </span>
                <span className="text-primary-400">
                  {m.stock_anterior} → <b className="text-primary">{m.stock_posterior}</b>
                </span>
                {m.motivo && (
                  <>
                    <span className="text-primary-500">·</span>
                    <span className="text-primary-500">{m.motivo}</span>
                  </>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Tab 3 — Órdenes de compra
// ─────────────────────────────────────────────────────────────────

// Cero verde — el flujo de borrador→pendiente→aprobada/rechazada
// usa solo navy / gold / red. `borrador` toma `estado-pendiente`
// (gold) para diferenciarlo visualmente del navy aprobado.
const OC_ESTADO_BADGE = {
  borrador:   { label: 'Borrador',   cls: 'badge-neutral' },
  pendiente:  { label: 'Pendiente',  cls: 'estado-pendiente' },
  aprobada:   { label: 'Aprobada',   cls: 'estado-confirmado' },
  rechazada:  { label: 'Rechazada',  cls: 'estado-cancelado' },
}

function OrdenesTab({ municipioId, dependencias, canApprove }) {
  const { perfil } = useAuth()
  const [dependenciaId, setDependenciaId] = useState('')
  const [estado, setEstado]               = useState('')
  const [modalNew, setModalNew]           = useState(false)

  const { data: ordenes = [], isLoading } = useOrdenesCompra({
    dependenciaId: dependenciaId || undefined,
    estado:        estado        || undefined,
  }, { municipioIdOverride: municipioId })

  const updateEst = useUpdateOrdenEstado()
  const enviarMut = useEnviarSolicitudOC()

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select
            label="Dependencia" value={dependenciaId} onChange={setDependenciaId}
            placeholder="Todas"
            options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
          />
          <Select
            label="Estado" value={estado} onChange={setEstado}
            placeholder="Todos"
            options={Object.entries(OC_ESTADO_BADGE).map(([v, b]) => ({ value: v, label: b.label }))}
          />
        </div>
        <Button onClick={() => setModalNew(true)}>+ Nueva solicitud</Button>
      </div>

      {isLoading ? (
        <div className="card flex items-center justify-center p-12"><Spinner size="lg" /></div>
      ) : ordenes.length === 0 ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          No hay solicitudes ni órdenes con estos filtros.
        </div>
      ) : (
        <Table>
          <THead>
            <Tr>
              <Th>N°</Th>
              <Th>Dependencia</Th>
              <Th>Proveedor</Th>
              <Th className="text-right">Monto</Th>
              <Th>Partida</Th>
              <Th>Tipo</Th>
              <Th>Estado</Th>
              <Th>Fecha</Th>
              <Th className="text-right">Acciones</Th>
            </Tr>
          </THead>
          <tbody>
            {ordenes.map(o => {
              const badge = OC_ESTADO_BADGE[o.estado] ?? { label: o.estado, cls: 'estado-pendiente' }
              // Borradores se "envían a aprobación" solo si los creó
              // este mismo usuario o si tiene permiso de aprobación
              // (admin_comuna fallback). Evita que un operario mueva
              // el borrador de otro a la cola.
              const puedeEnviar = o.estado === 'borrador' && (canApprove || o.created_by === perfil?.id)
              return (
                <Tr key={o.id}>
                  <Td className="font-mono text-xs">{o.numero ?? `OC-${o.id.slice(0, 6)}`}</Td>
                  <Td>{o.dependencia?.nombre ?? '—'}</Td>
                  <Td className="font-medium text-primary">{o.proveedor ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-right font-semibold tabular-nums">
                    {fmtMoney.format(o.monto_total ?? 0)}
                  </Td>
                  <Td className="font-mono text-xs">{o.partida_codigo ?? '—'}</Td>
                  <Td className="text-xs">{o.tipo === 'cotizacion' ? 'Cotización' : 'Directa'}</Td>
                  <Td><span className={badge.cls}>{badge.label}</span></Td>
                  <Td className="whitespace-nowrap">{o.created_at ? dateOf(o.created_at) : '—'}</Td>
                  <Td className="whitespace-nowrap text-right text-xs">
                    {puedeEnviar && (
                      <button
                        onClick={() => enviarMut.mutate({ id: o.id })}
                        disabled={enviarMut.isPending}
                        className="font-medium text-primary hover:underline"
                      >
                        Enviar a aprobación
                      </button>
                    )}
                    {canApprove && o.estado === 'pendiente' && (
                      <div className="flex justify-end gap-3 font-medium">
                        <button
                          onClick={() => updateEst.mutate({ id: o.id, estado: 'aprobada' })}
                          className="text-ok-700 hover:underline"
                        >Aprobar</button>
                        <button
                          onClick={() => updateEst.mutate({ id: o.id, estado: 'rechazada' })}
                          className="text-danger hover:underline"
                        >Rechazar</button>
                      </div>
                    )}
                    {o.comprobante_url && (
                      <a
                        href={o.comprobante_url} target="_blank" rel="noopener noreferrer"
                        className="ml-2 text-primary-500 hover:underline"
                      >Comprob.</a>
                    )}
                  </Td>
                </Tr>
              )
            })}
          </tbody>
        </Table>
      )}

      {modalNew && (
        <OrdenFormModal
          municipioId={municipioId}
          dependencias={dependencias}
          onClose={() => setModalNew(false)}
        />
      )}
    </div>
  )
}

function OrdenFormModal({ municipioId, dependencias, onClose }) {
  const [form, setForm] = useState({
    dependencia_id: '', proveedor: '', descripcion: '',
    partida_codigo: '', monto_total: '',
    tipo: 'directa', comprobante_url: '', numero: '',
    crearGastoPendiente: false,
  })
  const [error, setError] = useState('')
  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))
  const create = useCreateOrdenCompra()
  const { data: partidas = [] } = usePartidasTipo()
  const { perfil } = useAuth()

  // Si el monto supera el límite forzamos cotización y mostramos el aviso.
  const monto = Number(form.monto_total ?? 0)
  const superaLimite = monto > LIMITE_COMPRA_DIRECTA
  const tipoEfectivo = superaLimite ? 'cotizacion' : form.tipo

  const canSubmit =
    !!form.numero.trim() &&
    !!form.dependencia_id &&
    !!form.proveedor.trim() &&
    !!form.descripcion.trim() &&
    !!form.partida_codigo &&
    monto > 0

  // `estado` se decide por el botón que apretó el usuario:
  //   'borrador'  → guarda y deja sin enviar (el SubAdmin puede
  //                  editar más tarde antes de mandarla).
  //   'pendiente' → la deja en cola de aprobación del Admin Comuna.
  async function handle(estado) {
    setError('')
    try {
      await create.mutateAsync({
        municipio_id:    municipioId,
        dependencia_id:  form.dependencia_id,
        numero:          form.numero.trim() || null,
        proveedor:       form.proveedor.trim(),
        descripcion:     form.descripcion.trim(),
        monto_total:     monto,
        partida_codigo:  form.partida_codigo,
        tipo:            tipoEfectivo,
        estado,
        comprobante_url: form.comprobante_url.trim() || null,
        created_by:      perfil?.id ?? null,
        crearGastoPendiente: form.crearGastoPendiente && estado !== 'borrador',
      })
      onClose()
    } catch (e) { setError(e?.message ?? 'No pudimos guardar') }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Nueva solicitud de insumos"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancelar</Button>
          <Button
            variant="secondary"
            onClick={() => handle('borrador')}
            loading={create.isPending}
            disabled={!canSubmit}
          >
            Guardar borrador
          </Button>
          <Button onClick={() => handle('pendiente')} loading={create.isPending} disabled={!canSubmit}>
            Enviar a aprobación
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="N° de orden" value={form.numero} onChange={e => set('numero', e.target.value)} required />
        <Select
          label="Dependencia" value={form.dependencia_id} onChange={v => set('dependencia_id', v)}
          placeholder="Seleccionar..."
          options={dependencias.map(d => ({ value: d.id, label: d.nombre }))}
        />
        <Input label="Proveedor" value={form.proveedor} onChange={e => set('proveedor', e.target.value)} required />
        <div className="sm:col-span-2">
          <Input
            label="Descripción" value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)} required
          />
        </div>
        <Input
          label="Monto total" type="number" min="0" step="0.01"
          value={form.monto_total} onChange={e => set('monto_total', e.target.value)} required
        />
        <Select
          label="Partida" value={form.partida_codigo} onChange={v => set('partida_codigo', v)}
          placeholder="Seleccionar..."
          options={partidas.map(p => ({ value: p.codigo, label: `${p.codigo} — ${p.nombre}` }))}
        />
        <Select
          label="Tipo" value={tipoEfectivo} onChange={v => set('tipo', v)}
          options={[
            { value: 'directa',    label: 'Compra directa' },
            { value: 'cotizacion', label: 'Cotización / Licitación' },
          ]}
        />
        <Input
          label="Comprobante (URL, opcional)"
          value={form.comprobante_url} onChange={e => set('comprobante_url', e.target.value)}
          placeholder="https://..."
        />

        <label className="flex items-start gap-3 rounded-md border border-border bg-primary-50 p-3 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.crearGastoPendiente}
            onChange={e => set('crearGastoPendiente', e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-primary"
          />
          <span className="flex-1">
            <span className="block font-semibold text-primary">
              También registrar el gasto en estado <em>pendiente</em>
            </span>
            <span className="block text-xs text-primary-500">
              Útil cuando ya conocés el monto y querés que aparezca en Administración.
              Al aprobar la solicitud, el gasto se promueve a <em>aprobado</em>.
              No aplica a borradores.
            </span>
          </span>
        </label>

        {superaLimite && (
          <div className="rounded-md border border-accent-200 bg-accent-50 p-3 text-xs text-accent-700 sm:col-span-2">
            <b>Supera el límite de compra directa</b> ({fmtMoney.format(LIMITE_COMPRA_DIRECTA)}).
            Se registrará como <b>cotización</b>.
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger sm:col-span-2">{error}</div>
        )}
      </div>
    </Modal>
  )
}
