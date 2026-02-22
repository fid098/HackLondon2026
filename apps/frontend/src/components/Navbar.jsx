/**
 * Navbar.jsx — Sticky top navigation bar.
 *
 * Logo → navigates home (Landing page).
 * Three nav items: Analyze, Heatmap, Reports.
 * Active item highlighted with indigo accent.
 *
 * Auth slot (right side):
 *   - When user is null: "Sign In" button
 *   - When user is set: avatar pill with display_name/email + logout option
 *
 * Design: frosted glass with subtle bottom border.
 * No router — uses the onNavigate callback from App.jsx.
 */

import { useState } from 'react'

const NAV_ITEMS = [
  { id: 'analyze', label: 'Analyze' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'reports', label: 'Reports' },
]

export default function Navbar({ currentPage, onNavigate, user, onLogin, onLogout }) {
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  return (
    <nav
      style={{
        position:       'sticky',
        top:            0,
        zIndex:         50,
        borderBottom:   '1px solid rgba(255,255,255,0.06)',
        background:     'rgba(4, 4, 10, 0.88)',
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
            aria-label="Veryfi home"
            className="flex items-center group focus:outline-none"
          >
            <span className="text-[30px] font-black leading-none text-white tracking-tight group-hover:text-red-400 transition-colors">
              Veryfi
            </span>
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
                      ? 'text-red-400'
                      : 'text-slate-400 hover:text-slate-200',
                  ].join(' ')}
                  style={
                    isActive
                      ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }
                      : { background: 'transparent', border: '1px solid transparent' }
                  }
                  aria-current={isActive ? 'page' : undefined}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* ── Auth slot ── */}
          <div className="hidden md:flex items-center gap-2">
            {user ? (
              /* Logged-in user pill */
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen((o) => !o)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-all duration-150 focus:outline-none"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
                  aria-label="User menu"
                  aria-expanded={userMenuOpen}
                >
                  {/* Avatar initial */}
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{ background: 'linear-gradient(135deg, #dc2626, #ef4444)', color: 'white' }}
                  >
                    {(user.display_name || user.email || '?')[0].toUpperCase()}
                  </div>
                  <span className="text-red-400 font-medium max-w-[120px] truncate">
                    {user.display_name || user.email}
                  </span>
                  <span className="text-red-700 text-xs" aria-hidden="true">▾</span>
                </button>

                {/* Dropdown */}
                {userMenuOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-48 rounded-xl py-1 overflow-hidden z-50"
                    style={{ background: 'rgba(8,12,24,0.98)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
                  >
                    <div className="px-4 py-2.5 border-b border-white/5">
                      <p className="text-xs text-slate-600 truncate">{user.email}</p>
                    </div>
                    <button
                      onClick={() => { setUserMenuOpen(false); onLogout() }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:text-red-400 hover:bg-red-500/5 transition-colors"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Logged-out state */
              <button
                onClick={onLogin}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all duration-150 focus:outline-none text-red-400 hover:text-red-300"
                style={{ border: '1px solid rgba(239,68,68,0.25)', background: 'rgba(239,68,68,0.06)' }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Sign In
              </button>
            )}
          </div>

        </div>
      </div>

      {/* Close user menu on outside click */}
      {userMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setUserMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </nav>
  )
}
