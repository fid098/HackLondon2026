import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AuthModal from '../AuthModal'

// Mock the api module so no real HTTP calls are made
vi.mock('../../lib/api', () => ({
  login: vi.fn(),
  register: vi.fn(),
}))

import * as api from '../../lib/api'

beforeEach(() => {
  vi.clearAllMocks()
})

function setup(mode = 'login') {
  const onSuccess = vi.fn()
  const onClose   = vi.fn()
  render(<AuthModal mode={mode} onSuccess={onSuccess} onClose={onClose} />)
  return { onSuccess, onClose }
}

describe('AuthModal', () => {
  it('renders Sign In tab by default (login mode)', () => {
    setup('login')
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByText('Sign In →')).toBeInTheDocument()
  })

  it('renders Create Account form when mode is register', () => {
    setup('register')
    expect(screen.getByText('Create Account →')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/How should we call you/i)).toBeInTheDocument()
  })

  it('switches to register form when "Create one" is clicked', () => {
    setup('login')
    fireEvent.click(screen.getByText('Create one'))
    expect(screen.getByText('Create Account →')).toBeInTheDocument()
  })

  it('switches to login form when "Sign in" is clicked from register', () => {
    setup('register')
    fireEvent.click(screen.getByText('Sign in'))
    expect(screen.getByText('Sign In →')).toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const { onClose } = setup('login')
    const backdrop = document.querySelector('[role="dialog"]')
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when ✕ button is clicked', () => {
    const { onClose } = setup('login')
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('submit button is disabled when fields are empty', () => {
    setup('login')
    const btn = screen.getByText('Sign In →').closest('button')
    expect(btn).toBeDisabled()
  })

  it('calls api.login with correct payload and fires onSuccess', async () => {
    const mockUser = { id: '1', email: 'test@test.com' }
    api.login.mockResolvedValue({ access_token: 'tok', user: mockUser })

    const { onSuccess } = setup('login')
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'test@test.com' } })
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByText('Sign In →'))

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(mockUser))
  })

  it('shows error message when api.login rejects', async () => {
    api.login.mockRejectedValue(new Error('Invalid credentials'))

    setup('login')
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'a@b.com' } })
    fireEvent.change(screen.getByPlaceholderText('Your password'), { target: { value: 'wrongpass' } })
    fireEvent.click(screen.getByText('Sign In →'))

    await waitFor(() => expect(screen.getByText('Invalid credentials')).toBeInTheDocument())
  })
})
