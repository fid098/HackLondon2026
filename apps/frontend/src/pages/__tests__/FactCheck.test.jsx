import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import FactCheck from '../FactCheck'

function setup() {
  const onNavigate = vi.fn()
  render(<FactCheck onNavigate={onNavigate} />)
  return { onNavigate }
}

describe('FactCheck page', () => {
  it('renders the page heading', () => {
    setup()
    expect(screen.getByText('Analyse a Claim')).toBeInTheDocument()
  })

  it('renders three input tabs: URL, Text, Media', () => {
    setup()
    expect(screen.getByText('URL')).toBeInTheDocument()
    expect(screen.getByText('Text')).toBeInTheDocument()
    expect(screen.getByText('Media')).toBeInTheDocument()
  })

  it('shows URL input by default', () => {
    setup()
    expect(screen.getByPlaceholderText(/youtu\.be/i)).toBeInTheDocument()
  })

  it('switches to text input when Text tab is clicked', () => {
    setup()
    fireEvent.click(screen.getByText('Text'))
    expect(screen.getByPlaceholderText(/Paste the claim/i)).toBeInTheDocument()
  })

  it('switches to media drop zone when Media tab is clicked', () => {
    setup()
    fireEvent.click(screen.getByText('Media'))
    expect(screen.getByText(/Drop file here/i)).toBeInTheDocument()
  })

  it('Analyse button is disabled with empty URL input', () => {
    setup()
    const btn = screen.getByText('Analyse Claim').closest('button')
    expect(btn).toBeDisabled()
  })

  it('Analyse button enables after typing a URL', () => {
    setup()
    const input = screen.getByPlaceholderText(/youtu\.be/i)
    fireEvent.change(input, { target: { value: 'https://example.com/article' } })
    const btn = screen.getByText('Analyse Claim').closest('button')
    expect(btn).not.toBeDisabled()
  })

  it('shows YouTube detected notice for a YouTube URL', () => {
    setup()
    const input = screen.getByPlaceholderText(/youtu\.be/i)
    fireEvent.change(input, { target: { value: 'https://youtu.be/dQw4w9WgXcQ' } })
    expect(screen.getByText(/YouTube detected/i)).toBeInTheDocument()
  })

  it('Analyse button disabled when text is too short', () => {
    setup()
    fireEvent.click(screen.getByText('Text'))
    const ta = screen.getByPlaceholderText(/Paste the claim/i)
    fireEvent.change(ta, { target: { value: 'Short' } })
    const btn = screen.getByText('Analyse Claim').closest('button')
    expect(btn).toBeDisabled()
  })

  it('renders disclaimer text', () => {
    setup()
    expect(screen.getByText(/probabilistic assessments only/i)).toBeInTheDocument()
  })
})
