export default function Tabs({ tabs, value, onChange }) {
  return (
    <div className="border-b border-border">
      <nav className="-mb-px flex gap-6 overflow-x-auto">
        {tabs.map(tab => {
          const active = tab.value === value
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => onChange(tab.value)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-primary-400 hover:border-primary-200 hover:text-primary-700'
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                  active ? 'bg-primary text-white' : 'bg-primary-50 text-primary-500'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
