/**
 * App.jsx — Root component with state-based navigation and auth state.
 *
 * Auth:
 *   - Token lives in localStorage (managed by api.js)
 *   - User object lives in React state; re-hydrated on mount via GET /auth/me
 *   - AuthModal is rendered as an overlay — no separate page/route needed
 *
 * Navigation:
 *   - State-based (no React Router): page string → component
 *   - transitionKey increments on every page change to force page-enter animation
 */

import { useEffect, useState } from 'react'
import AuthModal from './components/AuthModal'
import Navbar from './components/Navbar'
import Analyze from './pages/Analyze'
import Heatmap from './pages/Heatmap'
import Landing from './pages/Landing'
import Reports from './pages/Reports'
import { getMe, getToken, logout } from './lib/api'

const PAGES = {
  home:    Landing,
  analyze: Analyze,
  heatmap: Heatmap,
  reports: Reports,
}

export default function App() {
  const [page,          setPage]          = useState('home')
  const [transitionKey, setTransitionKey] = useState(0)
  const [user,          setUser]          = useState(null)      // null = logged out
  const [authModal,     setAuthModal]     = useState(null)      // null | 'login' | 'register'
  const [authLoading,   setAuthLoading]   = useState(true)      // re-hydrating on mount

  /* ── Re-hydrate user on first load ── */
  useEffect(() => {
    if (!getToken()) {
      setAuthLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch(() => {/* token expired / invalid — already cleared by api.js */})
      .finally(() => setAuthLoading(false))
  }, [])

  /* ── Navigation ── */
  const navigate = (newPage) => {
    if (newPage === page) return
    setPage(newPage)
    setTransitionKey((k) => k + 1)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  /* ── Auth actions ── */
  const openLogin    = () => setAuthModal('login')
  const openRegister = () => setAuthModal('register')
  const closeAuth    = () => setAuthModal(null)

  const handleAuthSuccess = (userObj) => {
    setUser(userObj)
    closeAuth()
  }

  const handleLogout = () => {
    logout()
    setUser(null)
  }

  const PageComponent = PAGES[page] || Landing

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar
        currentPage={page}
        onNavigate={navigate}
        user={user}
        onLogin={openLogin}
        onLogout={handleLogout}
      />

      <main key={transitionKey} className="flex-1 page-enter">
        {authLoading ? (
          /* Tiny skeleton while re-hydrating token */
          <div className="flex items-center justify-center min-h-[60vh]">
            <span className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          </div>
        ) : (
          <PageComponent
            onNavigate={navigate}
            user={user}
            onLogin={openLogin}
            onRegister={openRegister}
          />
        )}
      </main>

      {/* ── Site footer (hidden on Analyze page) ── */}
      {page !== 'analyze' && (
        <footer
          className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-6 py-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(4,4,10,0.9)' }}
        >
          <span className="text-xs text-slate-700">© 2026 TruthGuard</span>
          <nav className="flex items-center gap-1">
            {[
              { id: 'home',    label: 'Home' },
              { id: 'analyze', label: 'Analyze' },
              { id: 'heatmap', label: 'Heatmap' },
              { id: 'reports', label: 'Reports' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => navigate(id)}
                className="text-xs px-3 py-1 rounded-md transition-colors"
                style={{
                  color: page === id ? '#f87171' : '#475569',
                  background: page === id ? 'rgba(239,68,68,0.08)' : 'transparent',
                }}
              >
                {label}
              </button>
            ))}
          </nav>
        </footer>
      )}

      {/* Auth modal overlay */}
      {authModal && (
        <AuthModal
          mode={authModal}
          onSuccess={handleAuthSuccess}
          onClose={closeAuth}
        />
      )}
    </div>
  )
}
