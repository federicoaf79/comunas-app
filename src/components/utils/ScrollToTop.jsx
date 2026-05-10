import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

// Resetea el scroll al tope en cada cambio de pathname. Lo monta
// el RootLayout de App.jsx una sola vez, así toda navegación entre
// rutas (sidebar, header, links inline) arranca arriba en vez de
// quedarse en la posición del scroll de la página anterior.
//
// `behavior: 'instant'` evita la animación smooth que el CSS global
// podría tener seteada — para navegación page-to-page el scroll
// suave se siente como un bug.
export default function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])
  return null
}
