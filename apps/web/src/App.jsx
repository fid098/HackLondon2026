/**
 * App.jsx — Root component with state-based navigation.
 *
 * Why state-based instead of React Router:
 *   Content switches instantly with a CSS fade-up animation — no URL
 *   changes, no full-page transitions, no router overhead. Pages feel
 *   like they "refresh" in place, which is exactly what the user requested.
 *
 * To add a new page:
 *   1. Import the component
 *   2. Add it to PAGES with a string key
 *   3. Add a nav item in Navbar.jsx
 */

import { useState } from 'react'
import Navbar from './components/Navbar'
import Landing from './pages/Landing'
import FactCheck from './pages/FactCheck'
import Heatmap from './pages/Heatmap'
import Reports from './pages/Reports'

const PAGES = {
  home:      Landing,
  factcheck: FactCheck,
  heatmap:   Heatmap,
  reports:   Reports,
}

export default function App() {
  const [page, setPage] = useState('home')
  // transitionKey increments on every page change, forcing React to
  // remount the <main> child and re-run the CSS page-enter animation
  const [transitionKey, setTransitionKey] = useState(0)

  const navigate = (newPage) => {
    if (newPage === page) return
    setPage(newPage)
    setTransitionKey((k) => k + 1)
    // Scroll to top on page switch
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const PageComponent = PAGES[page] || Landing

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg-base)' }}>
      <Navbar currentPage={page} onNavigate={navigate} />
      <main key={transitionKey} className="flex-1 page-enter">
        <PageComponent onNavigate={navigate} />
      </main>
    </div>
  )
}
