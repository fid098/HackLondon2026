/**
 * Navbar.jsx — Sticky top navigation bar.
 *
 * Logo → navigates home (Landing page).
 * Three nav items: Fact Check, Heatmap, Reports.
 * Active item highlighted with emerald accent.
 *
 * Design: frosted glass with subtle bottom border.
 * No router — uses the onNavigate callback from App.jsx.
 */

const NAV_ITEMS = [
  { id: 'factcheck', label: 'Fact Check' },
  { id: 'heatmap',   label: 'Heatmap'    },
  { id: 'reports',   label: 'Reports'    },
]

export default function Navbar({ currentPage, onNavigate }) {
  return (
    <nav
      style={{
        position:    'sticky',
        top:         0,
        zIndex:      50,
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background:  'rgba(4, 4, 10, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-5">
        <div className="flex h-16 items-center justify-between">

          {/* ── Logo ── */}
          <button
            onClick={() => onNavigate('home')}
            aria-label="TruthGuard home"
            className="flex items-center gap-2.5 group focus:outline-none"
          >
            {/* Shield icon with gradient background */}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'linear-gradient(135deg, #059669, #10b981)',
                boxShadow:  '0 0 0 0 rgba(16,185,129,0)',
                transition: 'box-shadow 0.3s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.boxShadow = '0 0 20px rgba(16,185,129,0.4)')}
              onMouseLeave={(e) => (e.currentTarget.style.boxShadow = '0 0 0 0 rgba(16,185,129,0)')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>

            <div className="flex flex-col items-start leading-none">
              <span
                className="text-[17px] font-bold text-white tracking-tight group-hover:text-emerald-400 transition-colors"
              >
                TruthGuard
              </span>
              <span className="text-[10px] text-slate-600 tracking-widest uppercase font-medium mt-0.5">
                AI Fact Check
              </span>
            </div>
          </button>

          {/* ── Nav items ── */}
          <div className="flex items-center gap-1">
            {NAV_ITEMS.map(({ id, label }) => {
              const isActive = currentPage === id
              return (
                <button
                  key={id}
                  onClick={() => onNavigate(id)}
                  className={[
                    'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 focus:outline-none',
                    isActive
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')}
                  style={
                    isActive
                      ? { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }
                      : { background: 'transparent', border: '1px solid transparent' }
                  }
                  aria-current={isActive ? 'page' : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* ── Right slot: status pill ── */}
          <div
            className="hidden md:flex items-center gap-1.5 text-xs text-slate-600 px-3 py-1.5 rounded-full"
            style={{ border: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            v0.1.0 — Phase 0
          </div>
        </div>
      </div>
    </nav>
  )
}
