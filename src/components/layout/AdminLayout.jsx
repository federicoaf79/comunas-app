import { NavLink, Outlet } from 'react-router-dom'

const NAV = [
  {
    to: '/admin',
    label: 'Dashboard',
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13l9-9 9 9M5 11v9h14v-9" />
      </svg>
    ),
  },
  {
    to: '/admin/crm',
    label: 'CRM Vecinal',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <circle cx="9" cy="8" r="3.5" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0 0-6M21.5 20a4.5 4.5 0 0 0-4-4.45" />
      </svg>
    ),
  },
  {
    to: '/admin/turnos',
    label: 'Turnos',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path strokeLinecap="round" d="M3 9h18M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    to: '/admin/mensajeria',
    label: 'Mensajería',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 15a2 2 0 0 1-2 2H8l-5 4V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9z" />
      </svg>
    ),
  },
  {
    to: '/admin/sala',
    label: 'Sala',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    to: '/admin/noticias',
    label: 'Portal Web',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l18-7v16L3 13v-2zM7 13v5a2 2 0 0 0 4 0v-3" />
      </svg>
    ),
  },
]

export default function AdminLayout() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <nav className="sticky top-4 flex gap-1 overflow-x-auto rounded-xl border border-border bg-white p-2 shadow-card lg:flex-col lg:overflow-visible">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-primary-500 hover:bg-primary-50 hover:text-primary'
                }`
              }
            >
              <span aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
