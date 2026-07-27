import { useEffect, useMemo, useState } from 'react'
import { useProveedores } from '../../hooks/useProveedores'
import Modal from '../ui/Modal'
import Input from '../ui/Input'
import Select from '../ui/Select'
import Button from '../ui/Button'
import VecinoBuscador from './VecinoBuscador'

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

function emptyForm() {
  return {
    proveedorId: '', descripcion: '',
    modo: 'monto', monto: '', cantidad: '', unidad: '',
    vigencia: 48,
  }
}

export default function EmitirValeModal({ open, onClose, onCreated, municipioId }) {
  const [form, setForm]   = useState(emptyForm)
  const [vecino, setVec]  = useState(null)
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
    setError('')
  }, [open])

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
        <VecinoBuscador
          municipioId={municipioId}
          vecino={vecino}
          onSeleccionar={setVec}
          label="Buscar vecino beneficiario"
          selectedLabel="Beneficiario seleccionado"
        />

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
