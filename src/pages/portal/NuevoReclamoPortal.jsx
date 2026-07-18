import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVecino } from '../../context/VecinoContext'
import { useCreateReclamo } from '../../hooks/useReclamos'
import { TABS } from './VecinoDashboard'
import { supabase } from '../../lib/supabase'
import DashboardHeader from '../../components/portal/DashboardHeader'
import Spinner from '../../components/ui/Spinner'

const TIPOS_RECLAMO = [
  { value: 'escombros', label: 'Escombros' },
  { value: 'ramas', label: 'Ramas y poda' },
  { value: 'restos_poda', label: 'Otro residuo de gran tamaño' },
  { value: 'otro', label: 'Otro' },
]

const MAX_FOTOS = 4
const MAX_SIZE_MB = 5

export default function NuevoReclamoPortal() {
  const { vecinoSession, clearVecinoSession } = useVecino()
  const navigate = useNavigate()
  const createMut = useCreateReclamo()

  function handleSignOut() {
    clearVecinoSession()
    navigate('/portal', { replace: true })
  }

  const [form, setForm] = useState({
    tipo: 'escombros',
    direccion: '',
    descripcion: '',
  })
  const [fotos, setFotos] = useState([]) // Array de { file, preview }
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  // Restricción: solo auth_mode === 'supabase' puede crear reclamos
  if (vecinoSession?.auth_mode !== 'supabase') {
    return (
      <div className="min-h-screen bg-[#F5F4EF] py-8 px-4">
        <div className="mx-auto max-w-2xl">
          <button
            onClick={() => navigate('/portal')}
            className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-[#0F1C35] transition-colors hover:text-[#C9A84C]"
          >
            ← Volver al inicio
          </button>

          <div className="rounded-xl border border-[#C9A84C]/30 bg-[#C9A84C]/10 p-6 sm:p-8">
            <div className="mx-auto max-w-lg text-center">
              <div className="mb-4 text-5xl">🔒</div>
              <h2 className="font-sora text-lg font-bold text-[#0F1C35]">
                Cuenta requerida para realizar reclamos
              </h2>
              <p className="mt-3 text-sm text-[#0F1C35]/80">
                Para realizar reclamos necesitás ingresar con tu cuenta (email y contraseña).
                Si entraste con acceso rápido, cerrá sesión y registrate o iniciá sesión con tu cuenta.
              </p>
              <button
                onClick={() => navigate('/portal/acceso')}
                className="mt-6 rounded-lg bg-[#0F1C35] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0F1C35]/90"
              >
                Ir a iniciar sesión
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleFileChange(e) {
    const files = Array.from(e.target.files || [])
    if (fotos.length + files.length > MAX_FOTOS) {
      setError(`Máximo ${MAX_FOTOS} fotos`)
      return
    }

    const newFotos = []
    for (const file of files) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`La foto ${file.name} supera los ${MAX_SIZE_MB}MB`)
        continue
      }
      if (!file.type.startsWith('image/')) {
        setError(`${file.name} no es una imagen`)
        continue
      }
      const preview = URL.createObjectURL(file)
      newFotos.push({ file, preview })
    }

    setFotos(prev => [...prev, ...newFotos])
    setError('')
  }

  function removeFoto(index) {
    setFotos(prev => {
      const updated = [...prev]
      URL.revokeObjectURL(updated[index].preview)
      updated.splice(index, 1)
      return updated
    })
  }

  async function subirFotos() {
    if (fotos.length === 0) return []

    const urls = []
    for (let i = 0; i < fotos.length; i++) {
      const foto = fotos[i]
      const ext = foto.file.name.split('.').pop()
      const timestamp = Date.now()
      const path = `${vecinoSession.id}/${timestamp}-${i}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('reclamos')
        .upload(path, foto.file, { upsert: false })

      if (uploadError) {
        console.error('Error subiendo foto:', uploadError)
        throw new Error(`Error al subir foto ${i + 1}`)
      }

      const { data: { publicUrl } } = supabase.storage
        .from('reclamos')
        .getPublicUrl(path)

      urls.push(publicUrl)
    }

    return urls
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.direccion.trim()) {
      setError('La dirección es requerida')
      return
    }
    if (!form.descripcion.trim()) {
      setError('La descripción es requerida')
      return
    }

    setError('')
    setUploading(true)

    try {
      // Subir fotos
      const fotosUrls = await subirFotos()

      // Crear reclamo
      await createMut.mutateAsync({
        municipio_id: vecinoSession.municipio_id,
        vecino_id: vecinoSession.id,
        tipo: form.tipo,
        descripcion: form.descripcion,
        ubicacion: form.direccion,
        fotos_urls: fotosUrls,
        canal: 'portal',
        estado: 'pendiente',
        prioridad: 'normal',
      })

      // Limpiar previews
      fotos.forEach(f => URL.revokeObjectURL(f.preview))

      // Navegar al dashboard del vecino (tab reclamos)
      navigate('/portal/mi-cuenta?tab=reclamos')
    } catch (err) {
      setError(err.message || 'Error al enviar el reclamo')
    } finally {
      setUploading(false)
    }
  }

  const inputCls = 'w-full rounded-lg border border-border bg-white px-4 py-2.5 text-sm text-primary focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]'

  return (
    <div className="min-h-screen bg-[#F5F4EF]">
      {/* Header consistente con VecinoDashboard */}
      <DashboardHeader vecino={vecinoSession} onSignOut={handleSignOut} subtitle="Nuevo reclamo" menuItems={TABS} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Breadcrumb */}
        <div className="mb-6">
          <button
            type="button"
            onClick={() => navigate('/portal/mi-cuenta?tab=reclamos')}
            className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-[#1D4ED8]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Volver a mis reclamos
          </button>
          <h1 className="font-sora text-2xl font-bold text-primary">Nuevo reclamo</h1>
          <p className="mt-1 text-sm text-primary-600">
            Reportá escombros, ramas o residuos de gran tamaño en la vía pública
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-border bg-white p-6 shadow-card">
          {/* Tipo */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-primary">Tipo de reclamo *</label>
            <select
              value={form.tipo}
              onChange={e => set('tipo', e.target.value)}
              className={inputCls}
              required
            >
              {TIPOS_RECLAMO.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Dirección */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-primary">Dirección *</label>
            <input
              type="text"
              value={form.direccion}
              onChange={e => set('direccion', e.target.value)}
              placeholder="Ej: Calle 25 de Mayo 123"
              className={inputCls}
              required
            />
          </div>

          {/* Descripción */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-primary">Descripción *</label>
            <textarea
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Describí el problema con el mayor detalle posible"
              rows={4}
              className={inputCls}
              required
            />
          </div>

          {/* Fotos */}
          <div>
            <label className="mb-2 block text-sm font-semibold text-primary">
              Fotos (opcional, máximo {MAX_FOTOS})
            </label>
            <p className="mb-3 text-xs text-primary-500">
              Las fotos ayudan a resolver tu reclamo más rápido
            </p>

            {/* Input file */}
            {fotos.length < MAX_FOTOS && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-50">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                {fotos.length === 0 ? 'Tomar o seleccionar fotos' : 'Agregar más fotos'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            )}

            {/* Preview grid */}
            {fotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {fotos.map((foto, idx) => (
                  <div key={idx} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                    <img src={foto.preview} alt={`Foto ${idx + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeFoto(idx)}
                      disabled={uploading}
                      className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100 disabled:opacity-30"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Botones */}
          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => navigate('/portal/mi-cuenta?tab=reclamos')}
              disabled={uploading}
              className="rounded-lg border border-border bg-white px-6 py-2.5 font-sora text-sm font-semibold text-primary transition-colors hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#1D4ED8] px-6 py-2.5 font-sora text-sm font-semibold text-white transition-colors hover:bg-[#1e40af] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {uploading && <Spinner size="sm" />}
              {uploading ? 'Enviando...' : 'Enviar reclamo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
