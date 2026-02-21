/**
 * Navbar — Top navigation bar.
 *
 * Uses NavLink for automatic active-state styling.
 * Phase 1 will add a user avatar / login button on the right.
 *
 * Mobile responsiveness: hamburger menu planned for Phase 4+.
 * For now we use a scrollable horizontal nav for small screens.
 */

import { Link, NavLink } from 'react-router-dom'

const NAV_ITEMS = [
  { to: '/', label: 'Home', exact: true },
  { to: '/factcheck', label: 'Fact Check', exact: false },
  { to: '/heatmap', label: 'Heatmap', exact: false },
  { to: '/deepfake', label: 'Deepfake', exact: false },
  { to: '/scam', label: 'Scam Check', exact: false },
  { to: '/reports', label: 'Reports', exact: false },
  { to: '/settings', label: 'Settings', exact: false },
]

export default function Navbar() {
  return (
    <nav
      className="sticky top-0 z-50 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="container mx-auto px-4 max-w-7xl">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Brand */}
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold text-brand-400 shrink-0
                       hover:text-brand-300 transition-colors"
            aria-label="TruthGuard home"
          >
            {/* Simple SVG shield icon inline to avoid asset dependencies */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            TruthGuard
          </Link>

          {/* Nav links — scrollable on small screens */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
            {NAV_ITEMS.map(({ to, label, exact }) => (
              <NavLink
                key={to}
                to={to}
                end={exact}
                className={({ isActive }) =>
                  `whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-brand-400'
                      : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800/50'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </div>

          {/* Right slot — Phase 1 adds login/avatar here */}
          <div className="shrink-0 text-xs text-gray-600 hidden md:block">
            v0.1.0
          </div>
        </div>
      </div>
    </nav>
  )
}
