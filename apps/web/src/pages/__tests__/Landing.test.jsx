import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Landing from '../Landing'

function setup() {
  const onNavigate = vi.fn()
  render(<Landing onNavigate={onNavigate} />)
  return { onNavigate }
}

describe('Landing page', () => {
  it('renders the main hero headline', () => {
    setup()
    expect(screen.getByText('Detect')).toBeInTheDocument()
    expect(screen.getByText('Misinformation')).toBeInTheDocument()
  })

  it('renders the HackLondon badge', () => {
    setup()
    expect(screen.getByText(/HackLondon 2026/)).toBeInTheDocument()
  })

  it('renders the Start Fact Checking CTA', () => {
    setup()
    expect(screen.getByText(/Start Fact Checking/i)).toBeInTheDocument()
  })

  it('renders the View Live Heatmap CTA', () => {
    setup()
    expect(screen.getByText(/View Live Heatmap/i)).toBeInTheDocument()
  })

  it('navigates to factcheck when primary CTA is clicked', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText(/Start Fact Checking/i))
    expect(onNavigate).toHaveBeenCalledWith('factcheck')
  })

  it('navigates to heatmap when secondary CTA is clicked', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText(/View Live Heatmap/i))
    expect(onNavigate).toHaveBeenCalledWith('heatmap')
  })

  it('renders 3 feature cards', () => {
    setup()
    expect(screen.getByText('AI Agent Debate')).toBeInTheDocument()
    expect(screen.getByText('Live Heatmap')).toBeInTheDocument()
    expect(screen.getByText('Report Archive')).toBeInTheDocument()
  })

  it('navigates to factcheck when AI Agent Debate card is clicked', () => {
    const { onNavigate } = setup()
    const card = screen.getByText('AI Agent Debate').closest('div[class*="rounded"]')
    if (card) fireEvent.click(card)
    expect(onNavigate).toHaveBeenCalledWith('factcheck')
  })

  it('renders the pipeline section heading', () => {
    setup()
    expect(screen.getByText('The AI Debate Pipeline')).toBeInTheDocument()
  })

  it('renders all 4 pipeline steps', () => {
    setup()
    expect(screen.getByText('Submit')).toBeInTheDocument()
    expect(screen.getByText('Extract')).toBeInTheDocument()
    expect(screen.getByText('Debate')).toBeInTheDocument()
    expect(screen.getByText('Verdict')).toBeInTheDocument()
  })

  it('renders the disclaimer text', () => {
    setup()
    expect(screen.getByText(/probabilistic assessments only/i)).toBeInTheDocument()
  })
})
