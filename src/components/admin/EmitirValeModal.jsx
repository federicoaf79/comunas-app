import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useProveedores } from '../../hooks/useProveedores'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import Avatar from '../ui/Avatar'

// =============================================================
// EmitirValeModal — Vales Electrónicos, Fase 1.
//
// Buscador de vecino: mismo patrón de debounce + DNI/nombre que
// TurnoPresencialModal.jsx/SumReservaFormModal.jsx, pero simplificado
// -- acá no hace falta Historia Clínica, solo identificar al vecino
// beneficiario.
//
// Monto vs. Cantidad+Unidad son mutuamente excluyentes (mismo CHECK
// que ya tiene la tabla `vales` en la DB) -- el toggle limpia el otro
// modo al cambiar para que nunca puedan coexistir campos de los dos.
// =============================================================

const VIGENCIA_OPTS = [
  { value: 24, label: '24 horas' },
  { value: 48, label: '48 horas' },
  { value: 72, label: '72 horas' },
]

function vecinoLabel(v) {
  if (!v) return ''
  return v.nombre_completo || `${v.apellido ?? ''} ${v.nombre ?? ''}`.trim() || 'Vecino'
}

function emptyForm() {
  return {
    query: '', proveedorId: '', descripcion: '',
    modo: 'monto', monto: '', cantidad: '', unidad: '',
    vigencia: 48,
  }
}

export default function EmitirValeModal({ open, onClose, onCreated, municipioId }) {
  const [form, setForm]   = useState(emptyForm)
  const [vecino, setVec]  = useState(null)
  const [candidatos, setCandidatos] = useState([])
  const [searching, setSearching]   = useState(false)
  const [searched, setSearched]     = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const proveedoresQ = useProveedores()
  const proveedorOpts = useMemo(
    () => (proveedoresQ.data ?? [])
      .filter(p => p.activo)
      .map(p => ({ value: p.id, label: p.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [proveedoresQ.data],
  )

  const set = (k, v) => setForm(s => ({ ...s, [k]: v }))

  useEffect(() => {
    if (!open) return
    setForm(emptyForm())
    setVec(null)
    setCandidatos([])
    setSearched(false)
    setError('')
  }, [open])

  // Búsqueda con debounce -- se apaga apenas hay un vecino elegido.
  useEffect(() => {
    if (!open || vecino) return
    const term = form.query.trim()
    if (term.length < 2) { setCandidatos([]); setSearched(false); return }
    let cancel = false
    setSearching(true)
    setSearched(false)
    const id = setTimeout(async () => {
      try {
        const esNumerico = /^\d{6,}$/.test(term)
        const pattern = `%${term.replace(/[%_]/g, '\\$&')}%`
        let q = supabase
          .from('vecinos')
          .select('id, municipio_id, dni, nombre, apellido, nombre_completo, telefono')
          .limit(8)
        q = esNumerico
          ? q.or(`dni.eq.${term},dni.ilike.${pattern}`)
          : q.or(`apellido.ilike.${pattern},nombre.ilike.${pattern},nombre_completo.ilike.${pattern},dni.ilike.${pattern}`)
        if (municipioId) q = q.eq('municipio_id', municipioId)
        const { data, error: err } = await q
        if (cancel) return
        if (err) throw err
        setCandidatos(data ?? [])
        setSearched(true)
      } catch (e) {
        if (!cancel) setError(e?.message ?? 'No pudimos buscar el vecino.')
      } finally {
        if (!cancel) setSearching(false)
      }
    }, 250)
    return () => { cancel = true; clearTimeout(id) }
  }, [form.query, open, vecino, municipioId])

  // Exactamente uno de los dos modos completo -- mismo CHECK que la DB.
  const montoOK    = form.modo === 'monto'    && Number(form.monto) > 0
  const cantidadOK = form.modo === 'cantidad' && Number(form.cantidad) > 0 && form.unidad.trim().length > 0
  const canSubmit  = !!vecino?.id && !!form.proveedorId && form.descripcion.trim().length > 0
    && (montoOK || cantidadOK) && !saving

  async function handleSave() {
    setError('')
    if (!canSubmit) return
    setSaving(true)
    try {
      const created = await onCreated({
        vecino_id:      vecino.id,
        proveedor_id:   form.proveedorId,
        descripcion:    form.descripcion.trim(),
        monto:          form.modo === 'monto' ? Number(form.monto) : null,
        cantidad:       form.modo === 'cantidad' ? Number(form.cantidad) : null,
        unidad:         form.modo === 'cantidad' ? form.unidad.trim() : null,
        vigencia_horas: form.vigencia,
      })
      if (created !== false) onClose?.()
    } catch (e) {
      setError(e?.message ?? 'No pudimos emitir el vale.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Emitir vale"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} loading={saving} disabled={!canSubmit}>Emitir vale</Button>
        </>
      }
    >
      <div className="flex min-h-[520px] flex-col gap-4">
        {/* ── Vecino beneficiario ── */}
        <Input
          label="Buscar vecino beneficiario"
          value={form.query}
          onChange={e => { set('query', e.target.value); setVec(null) }}
          placeholder="DNI o nombre…"
          autoComplete="off"
        />

        {vecino && (
          <div className="flex items-center gap-3 rounded-md border border-ok-100 bg-ok-50 p-3 text-sm">
            <Avatar name={vecinoLabel(vecino)} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ok-700">✓ Beneficiario seleccionado</p>
              <p className="text-xs text-ok-700/80">
                {vecinoLabel(vecino)} · DNI {vecino.dni || '—'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setVec(null); set('query', '') }}
              className="text-xs font-medium text-primary-500 hover:text-primary"
            >
              Cambiar
            </button>
          </div>
        )}

        {!vecino && form.query.trim().length >= 2 && (
          searching ? (
            <div className="flex items-center justify-center rounded-md border border-border bg-white py-6">
              <Spinner size="sm" />
            </div>
          ) : candidatos.length > 0 ? (
            <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-md border border-border bg-white">
              {candidatos.map(v => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => { setVec(v); set('query', '') }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-primary-50"
                  >
                    <Avatar name={vecinoLabel(v)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-primary">{vecinoLabel(v)}</p>
                      <p className="truncate text-xs text-primary-400">
                        DNI {v.dni || '—'}{v.telefono ? ` · ${v.telefono}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : searched ? (
            <div className="rounded-md border border-dashed border-accent-200 bg-accent-50/50 p-4 text-center text-sm text-primary-500">
              No se encontró ningún vecino con ese dato.
            </div>
          ) : null
        )}

        {/* ── Proveedor ── */}
        <Select
          label="Proveedor"
          value={form.proveedorId}
          onChange={v => set('proveedorId', v)}
          options={proveedorOpts}
          placeholder={proveedorOpts.length > 0 ? 'Seleccionar comercio…' : 'No hay proveedores activos cargados'}
        />

        {/* ── Descripción ── */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Descripción</label>
          <textarea
            value={form.descripcion}
            onChange={e => set('descripcion', e.target.value)}
            rows={2}
            className="input-field resize-none"
            placeholder="Ej: ayuda para compra de alimentos…"
          />
        </div>

        {/* ── Monto vs. Cantidad + Unidad ── */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-primary-700">Este vale es por…</label>
          <div className="mb-2 flex gap-2">
            <button
              type="button"
              onClick={() => setForm(s => ({ ...s, modo: 'monto', cantidad: '', unidad: '' }))}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                form.modo === 'monto'
                  ? 'border-accent-300 bg-accent-50 text-accent-700'
                  : 'border-border bg-white text-primary-500 hover:border-primary-200'
              }`}
            >
              Monto ($)
            </button>
            <button
              type="button"
              onClick={() => setForm(s => ({ ...s, modo: 'cantidad', monto: '' }))}
              className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                form.modo === 'cantidad'
                  ? 'border-accent-300 bg-accent-50 text-accent-700'
                  : 'border-border bg-white text-primary-500 hover:border-primary-200'
              }`}
            >
              Cantidad + Unidad
            </button>
          </div>

          {form.modo === 'monto' ? (
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.monto}
              onChange={e => set('monto', e.target.value)}
              placeholder="Ej: 15000"
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cantidad}
                onChange={e => set('cantidad', e.target.value)}
                placeholder="Cantidad"
              />
              <Input
                value={form.unidad}
                onChange={e => set('unidad', e.target.value)}
                placeholder="Unidad — ej: kg, litros, bolsones"
              />
            </div>
          )}
        </div>

        {/* ── Vigencia ── */}
        <Select
          label="Vigencia"
          value={form.vigencia}
          onChange={v => set('vigencia', Number(v))}
          options={VIGENCIA_OPTS}
        />

        {error && (
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
            {error}
          </div>
        )}
      </div>
    </Modal>
  )
}
