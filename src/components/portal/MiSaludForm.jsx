import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { dateTimeOf } from '../../lib/datetime'
import Input from '../ui/Input'
import Button from '../ui/Button'

// Se invoca al RPC public.consultas_publicas_por_vecino(p_dni, p_telefono).
// El RPC verifica DNI + teléfono y devuelve sólo id/fecha/motivo/medico_nombre.
// NUNCA devuelve diagnóstico ni receta — eso queda restringido a la HC
// completa que se consulta presencialmente en la Sala Primeros Auxilios.
async function consultarMiSalud(dni, telefono) {
  const { data, error } = await supabase.rpc('consultas_publicas_por_vecino', {
    p_dni:      dni.trim(),
    p_telefono: telefono.trim(),
  })
  if (error) throw error
  return data ?? []
}

export default function MiSaludForm() {
  const [dni, setDni]             = useState('')
  const [telefono, setTelefono]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [consultas, setConsultas] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!dni.trim() || !telefono.trim()) return
    setError('')
    setSubmitting(true)
    setConsultas(null)
    try {
      const result = await consultarMiSalud(dni, telefono)
      setConsultas(result)
    } catch (e) {
      setError(e?.message ?? 'No pudimos cargar tu información de salud.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card p-5">
      <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input
          label="DNI"
          value={dni}
          onChange={e => setDni(e.target.value)}
          required
          inputMode="numeric"
          autoComplete="off"
        />
        <Input
          label="Teléfono celular"
          value={telefono}
          onChange={e => setTelefono(e.target.value)}
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="+54 9 ..."
        />
        <div className="flex flex-col gap-1">
          <Button
            type="submit"
            loading={submitting}
            disabled={!dni.trim() || !telefono.trim()}
          >
            Ver mi salud
          </Button>
          {(!dni.trim() || !telefono.trim()) && (
            <p className="text-xs text-primary-400">Completá los campos para continuar</p>
          )}
        </div>
      </form>

      <p className="mt-3 text-xs text-primary-400">
        Verificamos tu identidad cruzando DNI con el teléfono que tenemos registrado.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-xs text-danger">
          {error}
        </div>
      )}

      {consultas !== null && !error && consultas.length === 0 && (
        <div className="mt-4 rounded-md border border-border bg-primary-50 p-3 text-sm text-primary-500">
          No encontramos consultas asociadas. Verificá que el DNI y el teléfono
          coincidan con los que tenemos en la Sala Primeros Auxilios.
        </div>
      )}

      {consultas && consultas.length > 0 && (
        <>
          <div className="mt-4 space-y-3">
            {consultas.map(c => (
              <div key={c.id} className="rounded-md border border-border bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-primary">
                    {c.motivo || 'Consulta médica'}
                  </p>
                  <span className="text-xs text-primary-400">{dateTimeOf(c.fecha)}</span>
                </div>
                <p className="mt-1 text-xs text-primary-500">
                  Atención de <strong className="text-primary-700">{c.medico_nombre || '—'}</strong>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-md border border-accent-100 bg-accent-50 p-4 text-sm text-accent-700">
            <p>
              Por privacidad no mostramos diagnóstico ni receta en este resumen.
              Para ver tu historia clínica completa, solicitá acceso presencialmente
              en la Sala de Primeros Auxilios.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
