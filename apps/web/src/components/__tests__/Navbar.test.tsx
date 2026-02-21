/**
 * Navbar unit tests.
 *
 * Tests the Navbar renders correctly and shows the right navigation items.
 * Wrapped in BrowserRouter because NavLink requires a routing context.
 */

import { render, screen } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import Navbar from '../Navbar'

function renderNavbar() {
  return render(
    <BrowserRouter>
      <Navbar />
    </BrowserRouter>,
  )
}

describe('Navbar', () => {
  it('renders the TruthGuard brand name', () => {
    renderNavbar()
    expect(screen.getByText('TruthGuard')).toBeInTheDocument()
  })

  it('renders the Fact Check nav link', () => {
    renderNavbar()
    expect(screen.getByText('Fact Check')).toBeInTheDocument()
  })

  it('renders the Heatmap nav link', () => {
    renderNavbar()
    expect(screen.getByText('Heatmap')).toBeInTheDocument()
  })

  it('renders the Deepfake nav link', () => {
    renderNavbar()
    expect(screen.getByText('Deepfake')).toBeInTheDocument()
  })

  it('renders the Reports nav link', () => {
    renderNavbar()
    expect(screen.getByText('Reports')).toBeInTheDocument()
  })

  it('renders the Settings nav link', () => {
    renderNavbar()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('brand link points to /', () => {
    renderNavbar()
    const brandLink = screen.getByRole('link', { name: /truthguard home/i })
    expect(brandLink).toHaveAttribute('href', '/')
  })

  it('has navigation role for accessibility', () => {
    renderNavbar()
    expect(screen.getByRole('navigation')).toBeInTheDocument()
  })
})
