/**
 * Scam.jsx — Phase 6 Scam & Phishing Detection page.
 *
 * User pastes suspicious text (email, SMS, message, ad copy…).
 * Calls POST /api/v1/scam/check → shows is_scam verdict, dual-model
 * confidence scores (RoBERTa + XGBoost), scam type, and reasoning.
 *
 * Thumbs-up/down feedback buttons call POST /api/v1/feedback.
 * Falls back to a mock result if the backend is unavailable.
 */

import { useState } from 'react'
import { checkScam, submitFeedback } from '../lib/api'

/* ─── mock fallback ─────────────────────────────────────────────────────────── */

const MOCK_RESULT = {
  is_scam:    false,
  confidence: 0.15,
  model_scores: { roberta: 0.12, xgboost: 0.18 },
  scam_type:  null,
  reasoning:  '[Demo] No backend running — this is a placeholder result. Start the API to see real analysis.',
}

/* ─── scam-type labels ──────────────────────────────────────────────────────── */

const SCAM_TYPE_LABELS = {
  phishing:    '🎣 Phishing',
  advance_fee: '💸 Advance Fee',
  impersonation: '🎭 Impersonation',
  lottery:     '🎰 Lottery / Prize',
  romance:     '💔 Romance Scam',
  investment:  '📈 Investment Fraud',
  other:       '⚠ Other Scam',
}

/* ─── example scam texts ────────────────────────────────────────────────────── */

const EXAMPLES = [
  'CONGRATULATIONS! You have been selected to receive a £500 Amazon gift card. Click the link to claim in the next 24 hours or it will expire.',
  'Your Apple ID has been locked due to suspicious activity. Verify your account immediately: http://apple-secure-login.xyz/verify',
  'Hi, I\'m a Nigerian prince with $15 million held in escrow. I need your help to transfer this money — you keep 30%. Reply with your bank details.',
]

/* ─── sub-components ─────────────────────────────────────────────────────────── */

function ScoreBar({ label, value, color }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

/* ─── main component ─────────────────────────────────────────────────────────── */

export default function Scam() {
  const [text,      setText]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [reportId,  setReportId]  = useState(null)   // id to attach feedback to
  const [feedback,  setFeedback]  = useState(null)   // 'up' | 'down' | null
  const [error,     setError]     = useState(null)

  /* ── analyse ── */
  const handleAnalyse = async () => {
    if (text.trim().length < 10) return
    setError(null)
    setResult(null)
    setReportId(null)
    setFeedback(null)
    setLoading(true)
    try {
      const data = await checkScam({ text: text.trim() })
      setResult(data)
      setReportId(null)  // scam check doesn't create a DB report — feedback uses a placeholder
    } catch (err) {
      console.warn('Scam API unavailable, using mock result:', err.message)
      setResult(MOCK_RESULT)
    } finally {
      setLoading(false)
    }
  }

  /* ── feedback ── */
  const handleFeedback = async (rating) => {
    if (feedback) return
    setFeedback(rating)
    try {
      await submitFeedback({
        report_id: reportId ?? 'scam-check',
        rating:    rating === 'up' ? 'thumbs_up' : 'thumbs_down',
        notes:     `Scam check feedback on: "${text.slice(0, 80)}"`,
      })
    } catch (_) { /* silently ignore */ }
  }

  const isScam     = result?.is_scam ?? false
  const resultColor = isScam ? '#ef4444' : '#10b981'
  const resultBg    = isScam ? 'rgba(239,68,68,0.08)'  : 'rgba(16,185,129,0.08)'
  const resultBorder = isScam ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'
  const scamLabel  = result
    ? (isScam ? '⚠ Likely Scam' : '✓ Likely Legitimate')
    : null

  const canSubmit = !loading && text.trim().length >= 10

  return (
    <div className="relative max-w-3xl mx-auto px-5 py-14">

      {/* ── Background shapes ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute rounded-full blur-3xl" style={{ width: 450, height: 450, top: '-8%', left: '-12%', background: 'radial-gradient(circle, rgba(239,68,68,0.18), transparent 70%)' }} />
        <div className="absolute blur-3xl" style={{ width: 350, height: 240, bottom: '5%', right: '-10%', borderRadius: '60% 40% 50% 50%', background: 'radial-gradient(circle, rgba(185,28,28,0.14), transparent 70%)' }} />
      </div>

      {/* ── Page header ── */}
      <div className="mb-10">
        <p className="text-xs text-red-500 uppercase tracking-[3px] font-semibold mb-3">
          Phase 6 · Scam Detection
        </p>
        <h1 className="text-4xl font-extrabold text-white mb-2">Scam & Phishing Checker</h1>
        <p className="text-slate-500">
          Paste suspicious text — emails, SMS messages, ads, or social-media posts.
          Our dual-model AI (RoBERTa + XGBoost) flags scams, phishing attempts, and fraud.
        </p>
      </div>

      {/* ── Input card ── */}
      <div
        className="rounded-2xl p-8 mb-8"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste suspicious text here…&#10;e.g. 'URGENT: Your account has been suspended…'"
          rows={7}
          className="input-field w-full resize-none"
          style={{ lineHeight: 1.6 }}
        />
        <div className="flex justify-between text-xs mt-1 mb-5">
          <span className="text-slate-600">Minimum 10 characters</span>
          <span className={text.length < 10 ? 'text-slate-600' : 'text-red-500'}>
            {text.length.toLocaleString()} / 2000
          </span>
        </div>

        {/* Example buttons */}
        <div className="mb-5">
          <p className="text-xs text-slate-600 mb-2">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => { setText(ex); setResult(null) }}
                className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                Example {i + 1}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            className="mb-5 px-4 py-3 rounded-xl text-sm text-red-400"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {error}
          </div>
        )}

        {/* Analyse button */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleAnalyse}
            disabled={!canSubmit}
            className="btn-primary px-9 py-3.5 flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="spinner" />
                Checking…
              </>
            ) : (
              <>
                <span>🔍</span>
                Check for Scam
              </>
            )}
          </button>
          {loading && (
            <p className="text-xs text-slate-600 animate-pulse">
              Running dual-model analysis…
            </p>
          )}
        </div>
      </div>

      {/* ══ RESULT ═══════════════════════════════════════════════════════════════ */}
      {result && (
        <div
          className="rounded-2xl p-8 space-y-6"
          style={{ background: resultBg, border: `1px solid ${resultBorder}` }}
        >
          {/* Verdict row */}
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* Big verdict pill */}
            <div
              className="flex items-center gap-3 px-6 py-3 rounded-full font-bold text-lg shrink-0"
              style={{ background: isScam ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)', border: `1px solid ${resultBorder}`, color: resultColor }}
            >
              {scamLabel}
            </div>

            {/* Scam type badge */}
            {result.scam_type && SCAM_TYPE_LABELS[result.scam_type] && (
              <span
                className="text-sm font-medium px-4 py-1.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}
              >
                {SCAM_TYPE_LABELS[result.scam_type]}
              </span>
            )}

            {/* Combined confidence */}
            <div className="ml-auto text-right">
              <p className="text-xs text-slate-600 mb-0.5">Combined confidence</p>
              <p className="text-2xl font-black" style={{ color: resultColor }}>
                {Math.round(result.confidence * 100)}%
              </p>
            </div>
          </div>

          {/* Reasoning */}
          <p className="text-slate-400 text-sm leading-relaxed">{result.reasoning}</p>

          {/* Model scores */}
          <div
            className="rounded-xl p-5 space-y-4"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-1">Model breakdown</p>
            <ScoreBar label="RoBERTa (NLP transformer)" value={result.model_scores.roberta} color={resultColor} />
            <ScoreBar label="XGBoost (feature ensemble)" value={result.model_scores.xgboost} color={resultColor} />
          </div>

          {/* Feedback */}
          <div className="flex items-center gap-4 pt-2 border-t border-white/5">
            <p className="text-xs text-slate-600">Was this result accurate?</p>
            <button
              onClick={() => handleFeedback('up')}
              disabled={!!feedback}
              className="text-sm px-4 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{
                background: feedback === 'up' ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.04)',
                border: feedback === 'up' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.08)',
                color: feedback === 'up' ? '#10b981' : '#64748b',
              }}
            >
              👍 Yes
            </button>
            <button
              onClick={() => handleFeedback('down')}
              disabled={!!feedback}
              className="text-sm px-4 py-1.5 rounded-lg transition-all disabled:opacity-40"
              style={{
                background: feedback === 'down' ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.04)',
                border: feedback === 'down' ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(255,255,255,0.08)',
                color: feedback === 'down' ? '#ef4444' : '#64748b',
              }}
            >
              👎 No
            </button>
            {feedback && (
              <span className="text-xs text-slate-600">Thanks for your feedback!</span>
            )}

            <button
              className="ml-auto text-xs text-slate-600 hover:text-slate-400 transition-colors"
              onClick={() => { setResult(null); setText('') }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
