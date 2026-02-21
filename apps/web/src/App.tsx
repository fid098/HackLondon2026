/**
 * App.tsx — Root component and router configuration.
 *
 * Routing strategy: React Router v6 nested routes with a shared Layout.
 * All pages render inside <Layout> which provides the Navbar + main container.
 *
 * Future phases add routes here — search for "Phase N" comments to find
 * the right place to add each new page.
 */

import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
// Phase 1: import Login from './pages/Login'
// Phase 1: import Register from './pages/Register'
// Phase 2: import FactCheck from './pages/FactCheck'
// Phase 2: import Reports from './pages/Reports'
// Phase 3: import Heatmap from './pages/Heatmap'
// Phase 5: import Deepfake from './pages/Deepfake'
// Phase 6: import ScamCheck from './pages/ScamCheck'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* All routes share the Layout (Navbar + container) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />

          {/* Placeholder routes — pages will be built phase-by-phase */}
          {/* Phase 1 */}
          {/* <Route path="login" element={<Login />} /> */}
          {/* <Route path="register" element={<Register />} /> */}
          {/* <Route path="settings" element={<Settings />} /> */}

          {/* Phase 2 */}
          {/* <Route path="factcheck" element={<FactCheck />} /> */}
          {/* <Route path="reports" element={<Reports />} /> */}
          {/* <Route path="reports/:id" element={<ReportDetail />} /> */}

          {/* Phase 3 */}
          {/* <Route path="heatmap" element={<Heatmap />} /> */}

          {/* Phase 5 */}
          {/* <Route path="deepfake" element={<Deepfake />} /> */}

          {/* Phase 6 */}
          {/* <Route path="scam" element={<ScamCheck />} /> */}
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
