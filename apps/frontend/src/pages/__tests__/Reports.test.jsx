import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Reports from '../Reports'

// Prevent real network calls — let the catch branch do client-side mock filtering
vi.mock('../../lib/api', () => ({
  getReports: vi.fn(() => Promise.reject(new Error('No API in tests'))),
  submitClaim: vi.fn(),
  saveReport: vi.fn(),
}))

function setup() {
  const onNavigate = vi.fn()
  render(<Reports onNavigate={onNavigate} />)
  return { onNavigate }
}

describe('Reports page', () => {
  it('renders the page heading', () => {
    setup()
    expect(screen.getByText('Report Archive')).toBeInTheDocument()
  })

  it('renders verdict filter tabs', () => {
    setup()
    // The filter strip buttons — use getAllByText since the word also appears in stat pills
    expect(screen.getAllByText('All').length).toBeGreaterThan(0)
    expect(screen.getAllByText('True').length).toBeGreaterThan(0)
    expect(screen.getAllByText('False').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Misleading').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Unverified').length).toBeGreaterThan(0)
  })

  it('renders the search input', () => {
    setup()
    expect(screen.getByPlaceholderText(/Search reports/i)).toBeInTheDocument()
  })

  it('shows report cards on initial load', async () => {
    setup()
    // Wait for mock fallback to settle
    await waitFor(() => expect(screen.getByText(/5G towers/i)).toBeInTheDocument())
  })

  it('filters reports by search query', async () => {
    setup()
    const input = screen.getByPlaceholderText(/Search reports/i)
    fireEvent.change(input, { target: { value: 'Bitcoin' } })
    await waitFor(() => expect(screen.getByText(/Central banks/i)).toBeInTheDocument())
    expect(screen.queryByText(/5G towers/i)).toBeNull()
  })

  it('filters reports by verdict tab', async () => {
    setup()
    // Wait for initial mock data to load
    await waitFor(() => expect(screen.getByText(/5G towers/i)).toBeInTheDocument())
    // Click "True" filter — should only show TRUE verdict reports
    const trueBtn = screen.getAllByText('True').find((el) => el.closest('button'))
    fireEvent.click(trueBtn)
    await waitFor(() => expect(screen.getByText(/Antarctic ice sheet/i)).toBeInTheDocument())
    expect(screen.queryByText(/5G towers/i)).toBeNull()
  })

  it('shows empty state when nothing matches', async () => {
    setup()
    const input = screen.getByPlaceholderText(/Search reports/i)
    fireEvent.change(input, { target: { value: 'xyzzy_no_match_at_all' } })
    await waitFor(() => expect(screen.getByText('No reports found')).toBeInTheDocument())
  })

  it('empty state has a Start Fact Checking button that navigates', async () => {
    const { onNavigate } = setup()
    const input = screen.getByPlaceholderText(/Search reports/i)
    fireEvent.change(input, { target: { value: 'xyzzy_no_match_at_all' } })
    await waitFor(() => screen.getByText(/Start Fact Checking/i))
    fireEvent.click(screen.getByText(/Start Fact Checking/i))
    expect(onNavigate).toHaveBeenCalledWith('factcheck')
  })

  it('renders the New Analysis CTA that navigates to factcheck', () => {
    const { onNavigate } = setup()
    fireEvent.click(screen.getByText('New Analysis →'))
    expect(onNavigate).toHaveBeenCalledWith('factcheck')
  })
})
