import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CHECKLIST_ITEMS } from '../../hooks/useOnboardingProgress'

function groupItems(progress) {
  const groups = {}
  for (const item of CHECKLIST_ITEMS) {
    if (!groups[item.group]) groups[item.group] = []
    groups[item.group].push({ ...item, done: progress[item.id] ?? false })
  }
  return groups
}

function ProgressRing({ pct, size = 28, stroke = 2.5 }) {
  const r = (size - stroke) / 2 - 1
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ height: size, width: size }}>
      <svg className="-rotate-90" viewBox={`0 0 ${size} ${size}`} style={{ height: size, width: size }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke="#C9A84C"
          strokeWidth={stroke}
          strokeDasharray={`${c}`}
          strokeDashoffset={`${c * (1 - pct / 100)}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold text-white">
        {pct}%
      </span>
    </div>
  )
}

export default function OnboardingChecklist({ progress, pct, completedCount, totalCount }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const panelRef = useRef(null)
  const pillRef = useRef(null)

  const groups = groupItems(progress)

  useEffect(() => {
    if (!expanded) return
    function handleClickOutside(e) {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        pillRef.current && !pillRef.current.contains(e.target)
      ) {
        setExpanded(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [expanded])

  if (pct === 100) return null

  return (
    <>
      {/* Panel expandido */}
      {expanded && (
        <div
          ref={panelRef}
          className="fixed bottom-20 right-6 z-50 w-[300px] max-h-[560px] overflow-y-auto rounded-2xl shadow-2xl"
          style={{ background: '#FFFFFF', border: '1.5px solid #E2E8F0', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}
        >
          {/* Header */}
          <div className="sticky top-0 flex items-start justify-between gap-3 px-4 py-3"
            style={{ background: 'var(--color-background-primary)', borderBottom: '1px solid var(--color-border-tertiary)' }}>
            <div>
              <p className="text-sm font-semibold text-primary font-sora">Configuración de la plataforma</p>
              <div className="mt-0.5 flex items-center gap-2">
                <p className="text-[11px]" style={{ color: '#64748B' }}>
                  {completedCount} de {totalCount} completados
                </p>
                <span className="rounded-full bg-[#C9A84C] px-1.5 py-0.5 text-[9px] font-bold text-primary-900">
                  {totalCount - completedCount} pendientes
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="shrink-0 rounded-lg p-1 transition-colors"
              style={{ color: 'var(--color-text-tertiary)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="px-4 py-3 space-y-4">
            {Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName}>
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2"
                  style={{ color: 'var(--color-text-tertiary)' }}>
                  {groupName}
                </p>
                <div className="space-y-1.5">
                  {items.map(item => (
                    <div key={item.id} className={`flex items-center justify-between gap-2 px-2 py-1 rounded-md ${item.done ? 'bg-[#1D4ED8]/5' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        {item.done ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="#1D4ED8" strokeWidth="2.5" className="h-3.5 w-3.5 shrink-0">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.5" className="h-3.5 w-3.5 shrink-0">
                            <circle cx="12" cy="12" r="9" />
                          </svg>
                        )}
                        <span className={`text-xs truncate ${item.done ? 'line-through' : ''}`}
                          style={{ color: item.done ? '#94A3B8' : '#0F1C35', fontWeight: item.done ? 400 : 500 }}>
                          {item.label}
                        </span>
                      </div>
                      {!item.done && (
                        <button
                          type="button"
                          onClick={() => { navigate(item.action_url); setExpanded(false) }}
                          className="shrink-0 text-[11px] whitespace-nowrap transition-colors"
                          style={{ color: '#C9A84C' }}
                        >
                          {item.action_label} →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pill flotante */}
      <button
        ref={pillRef}
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-full px-4 py-2.5 shadow-lg transition-all"
        style={{ background: '#0F1C35', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <ProgressRing pct={pct} size={26} />
        <span className="flex flex-col items-start gap-0.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-white">
            <svg viewBox="0 0 24 24" fill="none" stroke="#C9A84C" strokeWidth="2" className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Configuración
          </span>
          <div style={{ width: '80px', height: '3px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#C9A84C', borderRadius: '2px', transition: 'width 0.5s ease' }} />
          </div>
        </span>
      </button>
    </>
  )
}
