import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Navbar from '../Navbar'

function setup(currentPage = 'home') {
  const onNavigate = vi.fn()
  render(<Navbar currentPage={currentPage} onNavigate={onNavigate} />)
  return { onNavigate }
}

describe('Navbar', () => {
  it('renders the TruthGuard brand name', () => {
    setup()
    expect(screen.getByText('TruthGuard')).toBeInTheDocument()
  })

  it('renders exactly 3 nav items: Fact Check, Heatmap, Reports', () => {
    setup()
    expect(screen.getByText('Fact Check')).toBeInTheDocument()
    expect(screen.getByText('Heatmap')).toBeInTheDocument()
    expect(screen.getByText('Reports')).toBeInTheDocument()
  })

  it('does not render Settings, Scam Check or Deepfake nav items', () => {
    setup()
    expect(screen.queryByText(/settings/i)).toBeNull()
    expect(screen.queryByText(/scam/i)).toBeNull()
    expect(screen.queryByText(/deepfake/i)).toBeNull()
  })

  it('calls onNavigate("home") when the logo is clicked', () => {
    const { onNavigate } = setup('factcheck')
    fireEvent.click(screen.getByLabelText('TruthGuard home'))
    expect(onNavigate).toHaveBeenCalledWith('home')
  })

  it('calls onNavigate with correct id when Fact Check is clicked', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText('Fact Check'))
    expect(onNavigate).toHaveBeenCalledWith('factcheck')
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
    const factCheckBtn = screen.getByText('Fact Check').closest('button')
    expect(factCheckBtn).not.toHaveAttribute('aria-current')
  })
})
