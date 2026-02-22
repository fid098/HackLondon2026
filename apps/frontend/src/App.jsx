/**
 * App.jsx - Root component with state-based navigation and auth state.
 */

import { useEffect, useState } from 'react'
import AppDitherBackground from './components/AppDitherBackground'
import AuthModal from './components/AuthModal'
import Navbar from './components/Navbar'
import Analyze from './pages/Analyze'
import Heatmap from './pages/Heatmap'
import Landing from './pages/Landing'
import Reports from './pages/Reports'
import { getMe, getToken, logout } from './lib/api'

const PAGES = {
  home: Landing,
  analyze: Analyze,
  heatmap: Heatmap,
  reports: Reports,
}

export default function App() {
  const [page, setPage] = useState('home')
  const [transitionKey, setTransitionKey] = useState(0)
  const [user, setUser] = useState(null)
  const [authModal, setAuthModal] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    if (!getToken()) {
      setAuthLoading(false)
      return
    }
    getMe()
      .then(setUser)
      .catch(() => {})
      .finally(() => setAuthLoading(false))
  }, [])

  const navigate = (newPage) => {
    if (newPage === page) return
    setPage(newPage)
    setTransitionKey((k) => k + 1)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const openLogin = () => setAuthModal('login')
  const openRegister = () => setAuthModal('register')
  const closeAuth = () => setAuthModal(null)

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
    <div className="app-shell min-h-screen flex flex-col">
      <AppDitherBackground />
      <div className="app-dither-vignette" aria-hidden />

      <div className="relative z-10 min-h-screen flex flex-col">
        <Navbar
          currentPage={page}
          onNavigate={navigate}
          user={user}
          onLogin={openLogin}
          onLogout={handleLogout}
        />

        <main key={transitionKey} className="flex-1 page-enter">
          {authLoading ? (
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

        {page !== 'analyze' && (
          <footer
            className="shrink-0 flex flex-wrap items-center justify-between gap-4 px-6 py-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(4,4,10,0.72)' }}
          >
            <span className="text-xs text-slate-700">© 2026 Veryfi</span>
            <nav className="flex items-center gap-1">
              {[
                { id: 'home', label: 'Home' },
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

        {authModal && (
          <AuthModal
            mode={authModal}
            onSuccess={handleAuthSuccess}
            onClose={closeAuth}
          />
        )}
      </div>
    </div>
  )
}
