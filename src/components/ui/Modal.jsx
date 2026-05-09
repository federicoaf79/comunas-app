import { useEffect } from 'react'
import { cn } from '../../lib/utils'

const sizeClass = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-primary-900/50 px-4 py-4 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      {/* Layout flex-col + max-h-[90vh] hace que el body crezca y
          se scrollee solo, mientras header y footer quedan siempre
          visibles. min-h-0 en el body es necesario para que el
          flex item respete el overflow en lugar de crecer. */}
      <div
        className={cn(
          'card flex max-h-[90vh] w-full flex-col p-0 animate-slide-up',
          sizeClass[size] ?? sizeClass.md,
        )}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-base font-semibold text-primary">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-primary-400 transition-colors hover:bg-primary-50 hover:text-primary"
              aria-label="Cerrar"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-white px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  )
}
