import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Landing from '../Landing'

// framer-motion hooks rely on browser scroll APIs not available in jsdom
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_, tag) => {
      const Component = ({ children, ...props }) => {
        const {
          style: _s, variants: _v, initial: _i, animate: _a,
          whileInView: _w, whileHover: _wh, viewport: _vp,
          transition: _t,
          ...rest
        } = props
        return <tag {...rest}>{children}</tag>
      }
      Component.displayName = `motion.${tag}`
      return Component
    },
  }),
  useScroll: () => ({ scrollYProgress: { get: () => 0 } }),
  useTransform: () => 0,
}))

function setup() {
  render(<Landing />)
}

describe('Landing page', () => {
  it('renders the hero headline words', () => {
    setup()
    expect(screen.getByText('REALITY')).toBeInTheDocument()
    expect(screen.getByText('CAN BE')).toBeInTheDocument()
    expect(screen.getByText('FABRICATED.')).toBeInTheDocument()
  })

  it('renders the TruthGuard / HackLondon badge', () => {
    setup()
    expect(screen.getByText(/HackLondon 2026/)).toBeInTheDocument()
  })

  it('renders the Launch Verification CTA button', () => {
    setup()
    expect(screen.getByText(/Launch Verification/i)).toBeInTheDocument()
  })

  it('renders the View Global Heatmap CTA button', () => {
    setup()
    expect(screen.getByText(/View Global Heatmap/i)).toBeInTheDocument()
  })

  it('renders the problem section heading', () => {
    setup()
    expect(screen.getByText(/The Next Infrastructure Threat/i)).toBeInTheDocument()
  })

  it('renders the SDG / impact section heading', () => {
    setup()
    expect(screen.getByText(/Protecting People & Cities/i)).toBeInTheDocument()
  })

  it('renders impact goal cards', () => {
    setup()
    expect(screen.getByText(/Goal 3: Health & Wellbeing/i)).toBeInTheDocument()
    expect(screen.getByText(/Goal 16: Justice & Government/i)).toBeInTheDocument()
  })

  it('renders the local governance section heading', () => {
    setup()
    expect(screen.getByText(/Physical Trust & Local Governance/i)).toBeInTheDocument()
  })

  it('renders the footer copyright', () => {
    setup()
    expect(screen.getByText(/2026 TruthGuard Protocol/i)).toBeInTheDocument()
  })
})
