/**
 * Layout — Shared shell for all pages.
 *
 * Renders the Navbar at the top and the current page content via <Outlet>.
 * The Outlet is provided by React Router and renders whichever nested route
 * matches the current URL.
 *
 * To add page-level layout elements (footer, sidebar, toast notifications),
 * add them here so all pages benefit automatically.
 */

import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      <Navbar />

      {/* Main content area — constrained width, consistent padding */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <Outlet />
      </main>

      {/* Footer placeholder — Phase 7 */}
      <footer className="border-t border-gray-800 py-4 text-center text-xs text-gray-600">
        TruthGuard &mdash; Results are probabilistic, not guaranteed. Always verify with primary
        sources.
      </footer>
    </div>
  )
}
