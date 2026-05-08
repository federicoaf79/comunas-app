import { bgColorForCategoria, iconForCategoria } from '../../lib/noticiasCategoria'

// Placeholder visual usado cuando la noticia no tiene `imagen_url`.
// `aspectClass` controla el aspect ratio (4:3 en cards, 16:9 en
// destacada/detalle) y `iconSize` el tamaño del ícono interno.
export default function CategoriaPlaceholder({
  categoria,
  aspectClass = 'aspect-[4/3]',
  iconSize    = 'h-12 w-12',
}) {
  return (
    <div
      className={`flex w-full items-center justify-center text-primary ${aspectClass}`}
      style={{ backgroundColor: bgColorForCategoria(categoria) }}
      aria-hidden="true"
    >
      {iconForCategoria(categoria, iconSize)}
    </div>
  )
}
