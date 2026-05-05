export default function AlergiaBadge({ alergias }) {
  if (!alergias?.length) return null
  return (
    <div className="inline-flex items-start gap-1.5 rounded-md border border-red-100 bg-red-50 px-2 py-1 text-xs text-danger">
      <svg className="mt-0.5 h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <span>
        <span className="font-semibold">Alergias:</span> {alergias.join(', ')}
      </span>
    </div>
  )
}
