import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Heatmap from '../Heatmap'

// Prevent real network/WebSocket calls — let mock data stay in state
vi.mock('../../lib/api', () => ({
  getHeatmapEvents: vi.fn(() => Promise.reject(new Error('No API in tests'))),
  openHeatmapStream: vi.fn(() => ({ close: vi.fn(), onmessage: null })),
}))

/** Click the category filter button (not a narrative row badge) */
function clickCategoryBtn(label) {
  const btn = screen.getAllByText(label).find((el) => el.closest('button'))
  fireEvent.click(btn)
}

function setup() {
  render(<Heatmap />)
}

describe('Heatmap page', () => {
  it('renders the page heading', () => {
    setup()
    expect(screen.getByText('Misinformation Heatmap')).toBeInTheDocument()
  })

  it('renders the live event counter', () => {
    setup()
    expect(screen.getByText('events tracked')).toBeInTheDocument()
  })

  it('renders the LIVE ticker badge', () => {
    setup()
    expect(screen.getByText('LIVE')).toBeInTheDocument()
  })

  it('renders category filter buttons', () => {
    setup()
    // Categories appear in both filter buttons and narrative badges — use getAllByText
    for (const cat of ['All', 'Health', 'Politics', 'Finance', 'Science', 'Climate', 'Conflict']) {
      expect(screen.getAllByText(cat).length).toBeGreaterThan(0)
    }
  })

  it('renders region cards', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('North America')).toBeInTheDocument())
    expect(screen.getByText('Europe')).toBeInTheDocument()
    expect(screen.getByText('Asia Pacific')).toBeInTheDocument()
  })

  it('renders trending narratives table', async () => {
    setup()
    await waitFor(() => expect(screen.getByText('Trending Narratives')).toBeInTheDocument())
    expect(screen.getByText(/Vaccine microchip/i)).toBeInTheDocument()
  })

  it('filters narratives when a category button is clicked', async () => {
    setup()
    await waitFor(() => screen.getByText(/Vaccine microchip/i))
    clickCategoryBtn('Finance')
    await waitFor(() => expect(screen.getByText(/banking collapse/i)).toBeInTheDocument())
    expect(screen.queryByText(/Vaccine microchip/i)).toBeNull()
  })

  it('filters to Conflict category narratives', async () => {
    setup()
    clickCategoryBtn('Conflict')
    await waitFor(() => expect(screen.getByText(/satellite images/i)).toBeInTheDocument())
  })

  it('renders the data note footer', () => {
    setup()
    expect(screen.getByText(/MongoDB Atlas geospatial/i)).toBeInTheDocument()
  })
})
