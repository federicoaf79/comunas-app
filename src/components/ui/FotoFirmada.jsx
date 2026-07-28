import { useEffect, useRef, useState } from 'react'
import { getDocumentoSignedUrl } from '../../hooks/useAtenciones'

// Miniatura de una foto guardada como PATH en un bucket privado
// (reclamos, documentos-hc, etc.) — a diferencia del patrón de "Ver
// documento" (firma solo al click, pestaña en blanco), acá SÍ hace
// falta firmar al montar: es una miniatura visual, no hay forma de
// mostrar una imagen sin resolver la URL primero. Con pocas fotos por
// reclamo (máximo 4) firmar una por instancia es aceptable.
export default function FotoFirmada({ bucket, path, alt = '', wrapperClassName, imgClassName, linkify = false }) {
  const [url, setUrl] = useState(null)
  const [broken, setBroken] = useState(false)
  const retriedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    setUrl(null)
    setBroken(false)
    retriedRef.current = false
    if (!path) return
    getDocumentoSignedUrl(bucket, path)
      .then(u => { if (!cancelled) setUrl(u) })
      .catch(e => {
        console.error('[FotoFirmada] signed url error:', e)
        if (!cancelled) setBroken(true)
      })
    return () => { cancelled = true }
  }, [bucket, path])

  // La firma dura 1h — si la pantalla queda abierta más tiempo, la
  // miniatura rompe en silencio (a diferencia del patrón "firmar al
  // click", que siempre re-firma). Reintentamos UNA vez; si el
  // segundo intento también falla, mostramos el placeholder en vez de
  // un ícono roto.
  function handleImgError() {
    if (retriedRef.current) {
      setBroken(true)
      return
    }
    retriedRef.current = true
    getDocumentoSignedUrl(bucket, path)
      .then(u => setUrl(u))
      .catch(e => {
        console.error('[FotoFirmada] signed url retry error:', e)
        setBroken(true)
      })
  }

  if (broken) {
    return (
      <div className={`${wrapperClassName ?? ''} flex items-center justify-center bg-primary-50 text-primary-300`} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </div>
    )
  }

  if (!url) {
    return <div className={`${wrapperClassName ?? ''} animate-pulse bg-primary-100`} aria-hidden="true" />
  }

  const img = <img src={url} alt={alt} className={imgClassName} onError={handleImgError} />

  if (linkify) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className={wrapperClassName}>
        {img}
      </a>
    )
  }
  return <div className={wrapperClassName}>{img}</div>
}
