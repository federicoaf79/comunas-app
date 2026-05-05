import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 text-center">
      <p className="text-7xl font-extrabold text-primary">404</p>
      <h1 className="mt-4 text-2xl font-bold text-primary-700">Página no encontrada</h1>
      <p className="mt-2 text-primary-400">La página que buscás no existe o fue movida.</p>
      <Link to="/" className="btn-primary mt-8">Volver al inicio</Link>
    </div>
  )
}
