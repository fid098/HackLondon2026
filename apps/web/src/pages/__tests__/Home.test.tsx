/**
 * Home page unit tests.
 *
 * Tests that the landing page renders correctly.
 * The checkHealth() API call is mocked — no real backend needed.
 */

import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Home from '../Home'

// Mock the API module — tests should not make real HTTP calls
vi.mock('../../lib/api', () => ({
  checkHealth: vi.fn().mockResolvedValue({
    status: 'ok',
    version: '0.1.0',
    database: 'disconnected',
    environment: 'test',
  }),
}))

function renderHome() {
  return render(
    <BrowserRouter>
      <Home />
    </BrowserRouter>,
  )
}

describe('Home page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the main hero heading', () => {
    renderHome()
    expect(screen.getByText(/Fight Misinformation/i)).toBeInTheDocument()
  })

  it('renders the AI-Powered Truth highlight', () => {
    renderHome()
    expect(screen.getByText(/AI-Powered Truth/i)).toBeInTheDocument()
  })

  it('renders the Start Fact Checking CTA', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /start fact checking/i })).toBeInTheDocument()
  })

  it('renders the View Heatmap CTA', () => {
    renderHome()
    expect(screen.getByRole('link', { name: /view heatmap/i })).toBeInTheDocument()
  })

  it('renders all feature cards', () => {
    renderHome()
    expect(screen.getByText('AI Agent Debate')).toBeInTheDocument()
    expect(screen.getByText('Misinformation Heatmap')).toBeInTheDocument()
    expect(screen.getByText('Deepfake Detection')).toBeInTheDocument()
    expect(screen.getByText('Scam Detector')).toBeInTheDocument()
    expect(screen.getByText('Chrome Extension')).toBeInTheDocument()
    expect(screen.getByText('Trending Narratives')).toBeInTheDocument()
  })

  it('shows disclaimer text', () => {
    renderHome()
    expect(screen.getByText(/probabilistic/i)).toBeInTheDocument()
  })

  it('shows API status as Connected after health check resolves', async () => {
    renderHome()
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
  })

  it('shows API status as Unreachable when health check fails', async () => {
    const { checkHealth } = await import('../../lib/api')
    vi.mocked(checkHealth).mockRejectedValueOnce(new Error('Network error'))

    renderHome()
    await waitFor(() => {
      expect(screen.getByText(/unreachable/i)).toBeInTheDocument()
    })
  })
})
