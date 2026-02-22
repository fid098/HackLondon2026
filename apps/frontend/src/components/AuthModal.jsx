/**
 * AuthModal.jsx — Glassmorphism login / register modal.
 *
 * Props:
 *   mode       — 'login' | 'register'  (initial tab)
 *   onSuccess  — called with the user object after successful auth
 *   onClose    — called when the modal should be dismissed
 *
 * Calls api.login / api.register; the token is stored in localStorage
 * by api.js — the parent just receives the user object.
 */

import { useState } from 'react'
import { login, register } from '../lib/api'

export default function AuthModal({ mode: initialMode = 'login', onSuccess, onClose }) {
  const [mode,        setMode]        = useState(initialMode)
  const [email,       setEmail]       = useState('')
  const [password,    setPassword]    = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const isRegister = mode === 'register'

  const reset = () => {
    setError(null)
    setLoading(false)
  }

  const switchMode = (m) => {
    setMode(m)
    setError(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const payload = isRegister
        ? { email, password, display_name: displayName || undefined }
        : { email, password }
      const data = isRegister ? await register(payload) : await login(payload)
      onSuccess(data.user)
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) { reset(); onClose() } }}
      role="dialog"
      aria-modal="true"
      aria-label={isRegister ? 'Create account' : 'Sign in'}
    >
      {/* Card */}
      <div
        className="w-full max-w-md rounded-2xl p-8 relative"
        style={{
          background: 'rgba(8,12,24,0.97)',
          border:     '1px solid rgba(255,255,255,0.1)',
          boxShadow:  '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Close */}
        <button
          onClick={() => { reset(); onClose() }}
          className="absolute top-4 right-4 text-slate-600 hover:text-slate-300 transition-colors text-xl leading-none"
          aria-label="Close"
        >
          ✕
        </button>

        {/* Logo */}
        <div className="mb-7">
          <span className="text-white font-bold text-2xl tracking-tight">Veryfi</span>
        </div>

        {/* Mode tabs */}
        <div
          className="flex rounded-xl mb-7 p-1"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {[['login', 'Sign In'], ['register', 'Create Account']].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 focus:outline-none"
              style={
                mode === m
                  ? { background: 'rgba(239,68,68,0.12)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
                  : { background: 'transparent', color: '#475569', border: '1px solid transparent' }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
                Display Name <span className="text-slate-700">(optional)</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                className="input-field w-full"
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="input-field w-full"
              required
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 mb-1.5 font-medium uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? 'At least 8 characters' : 'Your password'}
              className="input-field w-full"
              required
              minLength={isRegister ? 8 : undefined}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
            />
          </div>

          {/* Error */}
          {error && (
            <div
              className="px-4 py-3 rounded-xl text-sm text-red-400"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <><span className="spinner" /> {isRegister ? 'Creating account…' : 'Signing in…'}</>
            ) : (
              isRegister ? 'Create Account →' : 'Sign In →'
            )}
          </button>
        </form>

        {/* Switch mode hint */}
        <p className="text-center text-xs text-slate-600 mt-5">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            type="button"
            onClick={() => switchMode(isRegister ? 'login' : 'register')}
            className="text-red-500 hover:text-red-400 transition-colors font-medium"
          >
            {isRegister ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  )
}
