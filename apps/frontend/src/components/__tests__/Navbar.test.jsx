import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Navbar from '../Navbar'

function setup(currentPage = 'home', user = null) {
  const onNavigate = vi.fn()
  const onLogin    = vi.fn()
  const onLogout   = vi.fn()
  render(
    <Navbar
      currentPage={currentPage}
      onNavigate={onNavigate}
      user={user}
      onLogin={onLogin}
      onLogout={onLogout}
    />,
  )
  return { onNavigate, onLogin, onLogout }
}

describe('Navbar', () => {
  it('renders the Veryfi brand name', () => {
    setup()
    expect(screen.getByText('Veryfi')).toBeInTheDocument()
  })

  it('renders 3 nav items: Analyze, Heatmap, Reports', () => {
    setup()
    expect(screen.getByText('Analyze')).toBeInTheDocument()
    expect(screen.getByText('Heatmap')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
  })

  it('does not render standalone Fact Check, Deepfake or Scam Check nav items', () => {
    setup()
    expect(screen.queryByText('Fact Check')).toBeNull()
    expect(screen.queryByText('Deepfake')).toBeNull()
    expect(screen.queryByText('Scam Check')).toBeNull()
  })

  it('calls onNavigate("home") when the logo is clicked', () => {
    const { onNavigate } = setup('analyze')
    fireEvent.click(screen.getByLabelText('Veryfi home'))
    expect(onNavigate).toHaveBeenCalledWith('home')
  })

  it('calls onNavigate("analyze") when Analyze is clicked', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText('Analyze'))
    expect(onNavigate).toHaveBeenCalledWith('analyze')
  })

  it('calls onNavigate("heatmap") when Heatmap is clicked', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText('Heatmap'))
    expect(onNavigate).toHaveBeenCalledWith('heatmap')
  })

  it('calls onNavigate("reports") when Reports is clicked', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText('Reports'))
    expect(onNavigate).toHaveBeenCalledWith('reports')
  })

  it('marks the active page button with aria-current="page"', () => {
    setup('heatmap')
    const heatmapBtn = screen.getByText('Heatmap').closest('button')
    expect(heatmapBtn).toHaveAttribute('aria-current', 'page')
  })

  it('does not set aria-current on inactive nav buttons', () => {
    setup('heatmap')
    const analyzeBtn = screen.getByText('Analyze').closest('button')
    expect(analyzeBtn).not.toHaveAttribute('aria-current')
  })

  it('shows Sign In button when no user is logged in', () => {
    setup('home', null)
    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })

  it('calls onLogin when Sign In is clicked', () => {
    const { onLogin } = setup('home', null)
    fireEvent.click(screen.getByText('Sign In'))
    expect(onLogin).toHaveBeenCalled()
  })

  it('shows user avatar initial when logged in', () => {
    const user = { id: '1', email: 'alice@example.com', display_name: 'Alice' }
    setup('home', user)
    expect(screen.getByText('A')).toBeInTheDocument()  // avatar initial
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('does not show Sign In button when user is logged in', () => {
    const user = { id: '1', email: 'alice@example.com', display_name: 'Alice' }
    setup('home', user)
    expect(screen.queryByText('Sign In')).toBeNull()
  })
})
