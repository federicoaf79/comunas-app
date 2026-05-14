import { useEffect, useState } from 'react'
import PortalFormPage from '../../components/portal/PortalFormPage'
import Spinner from '../../components/ui/Spinner'
import { useHistoriaMunicipio } from '../../hooks/useHistoriaMunicipio'
import { useDatosMunicipio, usePortalMunicipioId } from '../../hooks/useConfigPortal'

// =============================================================
// /portal/historia — página dedicada para "Nuestra Historia".
//
// Antes la sección vivía inline en el home (PortalPublico.jsx).
// Se sacó a página propia para que el link "Historia" del nav
// navegue limpiamente y se pueda agregar mapa + galería sin
// pesar el home.
//
// Coordenadas Real Sayana (aproximadas) — bbox un poco amplio
// para que se vea el pueblo y un anillo de campo alrededor:
//   center  -27.9 / -64.2
//   bbox    -64.3,-28.0,-64.1,-27.8
// Si el municipio carga sus propias coordenadas en
// configuracion_portal.datos_municipio (lat/lng), las usamos.
// =============================================================

const REAL_SAYANA_LAT = -27.9
const REAL_SAYANA_LNG = -64.2

function bboxFor(lat, lng, delta = 0.1) {
  const minLng = (lng - delta).toFixed(4)
  const maxLng = (lng + delta).toFixed(4)
  const minLat = (lat - delta).toFixed(4)
  const maxLat = (lat + delta).toFixed(4)
  return `${minLng},${minLat},${maxLng},${maxLat}`
}

function osmEmbedUrl({ lat, lng }) {
  const bbox = bboxFor(lat, lng)
  const marker = `${lat},${lng}`
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`
}
function osmLinkUrl({ lat, lng }) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=14/${lat}/${lng}`
}

// Lightbox simple — copiado del HistoriaSection original. Se cierra
// con click fuera, ESC o botón X.
function Lightbox({ src, onClose }) {
  useEffect(() => {
    if (!src) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])
  if (!src) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/85 p-4 backdrop-blur-sm"
    >
      <img
        src={src}
        alt=""
        className="max-h-[90vh] max-w-full rounded-lg object-contain shadow-2xl"
        onClick={e => e.stopPropagation()}
      />
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar"
        className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
          <path strokeLinecap="round" d="M6 6l12 12M6 18L18 6" />
        </svg>
      </button>
    </div>
  )
}

export default function HistoriaPage() {
  const { data: municipioId } = usePortalMunicipioId()
  const { data: historia, isLoading } = useHistoriaMunicipio(municipioId)
  const { datos } = useDatosMunicipio()
  const [lightbox, setLightbox] = useState(null)

  const municipioNombre =
    datos?.nombre ?? datos?.nombre_oficial ?? 'Comisión Municipal Real Sayana'

  // Si el admin guarda lat/lng en datos_municipio, las usamos.
  // Si no, caemos a las coords aproximadas de Real Sayana.
  const lat = Number(datos?.lat) || REAL_SAYANA_LAT
  const lng = Number(datos?.lng) || REAL_SAYANA_LNG

  const fotos = Array.isArray(historia?.fotos) ? historia.fotos : []
  const tieneTexto = !!(historia?.resena || historia?.importancia_regional || historia?.recursos_naturales)
  const tieneContenido = tieneTexto || fotos.length > 0
  const cargando = isLoading

  const titulo = historia?.fundacion
    ? `${municipioNombre} — Fundada en ${historia.fundacion}`
    : municipioNombre

  return (
    <PortalFormPage
      titulo="Nuestra Historia"
      descripcion={titulo}
    >
      {cargando ? (
        <div className="card flex flex-col items-center justify-center gap-3 p-12 text-sm text-primary-400">
          <Spinner size="lg" />
          <span>Cargando historia…</span>
        </div>
      ) : !tieneContenido ? (
        <div className="card p-10 text-center text-sm text-primary-400">
          La historia del municipio se va a publicar pronto.
        </div>
      ) : (
        <div className="space-y-8">
          {/* Texto: reseña + importancia + recursos */}
          {tieneTexto && (
            <article className="card space-y-5 p-5 sm:p-6">
              {historia?.resena && (
                <p className="whitespace-pre-line text-sm leading-relaxed text-primary-700 sm:text-base">
                  {historia.resena}
                </p>
              )}
              {historia?.importancia_regional && (
                <div>
                  <h2 className="font-sora text-lg font-bold text-primary">Importancia regional</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-primary-700 sm:text-base">
                    {historia.importancia_regional}
                  </p>
                </div>
              )}
              {historia?.recursos_naturales && (
                <div>
                  <h2 className="font-sora text-lg font-bold text-primary">Recursos naturales</h2>
                  <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-primary-700 sm:text-base">
                    {historia.recursos_naturales}
                  </p>
                </div>
              )}
            </article>
          )}

          {/* Galería de fotos — 2 cols mobile, 3 cols desktop. */}
          {fotos.length > 0 && (
            <section>
              <h2 className="font-sora text-lg font-bold text-primary mb-3">Galería</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {fotos.map((url, i) => (
                  <button
                    key={url + i}
                    type="button"
                    onClick={() => setLightbox(url)}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <img
                      src={url}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Mapa */}
          <section>
            <h2 className="font-sora text-lg font-bold text-primary mb-3">Ubicación</h2>
            <iframe
              title={`Mapa de ${municipioNombre}`}
              src={osmEmbedUrl({ lat, lng })}
              loading="lazy"
              className="w-full"
              style={{ height: 350, border: 'none', borderRadius: 12 }}
            />
            <p className="mt-2 text-xs text-primary-400">
              <a
                href={osmLinkUrl({ lat, lng })}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-700 underline-offset-2 hover:underline"
              >
                Ver más grande en OpenStreetMap →
              </a>
            </p>
          </section>
        </div>
      )}

      <Lightbox src={lightbox} onClose={() => setLightbox(null)} />
    </PortalFormPage>
  )
}
