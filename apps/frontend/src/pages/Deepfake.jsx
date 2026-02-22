/**
 * Deepfake.jsx — Phase 5 Deepfake & Synthetic Media Detection page.
 *
 * Accepts image, audio, or video uploads.
 * Automatically detects file type and calls the appropriate backend endpoint:
 *   POST /api/v1/deepfake/image  → is_deepfake + confidence + reasoning
 *   POST /api/v1/deepfake/audio  → is_synthetic + confidence + reasoning
 *   POST /api/v1/deepfake/video  → is_deepfake + confidence + reasoning
 *
 * In mock mode (no backend) a fallback result is shown for demo purposes.
 */

import { useCallback, useRef, useState } from 'react'
import { analyzeDeepfakeAudio, analyzeDeepfakeImage, analyzeDeepfakeVideo } from '../lib/api'

/* ─── constants ─────────────────────────────────────────────────────────────── */

const ACCEPTED_MEDIA = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
}
const ALL_MEDIA_TYPES = Object.values(ACCEPTED_MEDIA).flat()

const MAX_FILE_BYTES = 50 * 1024 * 1024  // 50 MB

function detectKind(file) {
  if (ACCEPTED_MEDIA.image.includes(file.type)) return 'image'
  if (ACCEPTED_MEDIA.audio.includes(file.type)) return 'audio'
  if (ACCEPTED_MEDIA.video.includes(file.type)) return 'video'
  return 'unknown'
}

/* ─── mock fallback ─────────────────────────────────────────────────────────── */

const MOCK_RESULT = {
  label:      'is_deepfake',   // is_deepfake | is_synthetic
  flagged:    false,
  confidence: 0.5,
  reasoning:  '[Demo] No backend running — this is a placeholder result. Upload a file and start the API to see real analysis.',
}

/* ─── sub-components ─────────────────────────────────────────────────────────── */

function ConfidenceRing({ value, flagged }) {
  const pct         = Math.round(value * 100)
  const color       = flagged ? '#ef4444' : '#10b981'
  const circumference = 2 * Math.PI * 36
  const offset      = circumference - (pct / 100) * circumference

  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <circle
          cx="40" cy="40" r="36" fill="none"
          stroke={color} strokeWidth="7"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{pct}%</span>
      </div>
    </div>
  )
}

/* ─── main component ─────────────────────────────────────────────────────────── */

export default function Deepfake() {
  const [file,      setFile]      = useState(null)
  const [dragOver,  setDragOver]  = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState(null)
  const [error,     setError]     = useState(null)
  const fileRef = useRef(null)

  /* ── file selection ── */
  const selectFile = useCallback((f) => {
    if (!f) return
    if (!ALL_MEDIA_TYPES.includes(f.type)) {
      setError('Unsupported file type. Please upload an image, audio, or video file.')
      return
    }
    if (f.size > MAX_FILE_BYTES) {
      setError('File too large — maximum size is 50 MB.')
      return
    }
    setError(null)
    setResult(null)
    setFile(f)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    selectFile(e.dataTransfer?.files?.[0])
  }, [selectFile])

  /* ── analyse ── */
  const handleAnalyse = async () => {
    if (!file) return
    setError(null)
    setResult(null)
    setLoading(true)

    try {
      // Read file as base64
      const b64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload  = (e) => resolve(e.target.result.split(',')[1])  // strip data: prefix
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const kind = detectKind(file)

      if (kind === 'image') {
        const data = await analyzeDeepfakeImage({ image_b64: b64, filename: file.name })
        setResult({ label: 'is_deepfake', flagged: data.is_deepfake, confidence: data.confidence, reasoning: data.reasoning })
      } else if (kind === 'audio') {
        const data = await analyzeDeepfakeAudio({ audio_b64: b64, filename: file.name })
        setResult({ label: 'is_synthetic', flagged: data.is_synthetic, confidence: data.confidence, reasoning: data.reasoning })
      } else if (kind === 'video') {
        const data = await analyzeDeepfakeVideo({ video_b64: b64, filename: file.name })
        setResult({ label: 'is_deepfake', flagged: data.is_deepfake, confidence: data.confidence, reasoning: data.reasoning })
      } else {
        throw new Error('Unsupported media type.')
      }
    } catch (err) {
      console.warn('Deepfake API unavailable, using mock result:', err.message)
      setResult(MOCK_RESULT)
    } finally {
      setLoading(false)
    }
  }

  const kind    = file ? detectKind(file) : null
  const kindIcon = { image: '🖼', audio: '🎵', video: '🎬', unknown: '📁' }

  const flagged    = result?.flagged ?? false
  const resultColor = flagged ? '#ef4444' : '#10b981'
  const resultBg    = flagged ? 'rgba(239,68,68,0.08)'   : 'rgba(16,185,129,0.08)'
  const resultBorder = flagged ? 'rgba(239,68,68,0.25)'  : 'rgba(16,185,129,0.25)'

  const verdictLabel = result
    ? result.label === 'is_synthetic'
      ? (flagged ? 'Synthetic / Cloned' : 'Likely Authentic')
      : (flagged ? 'Deepfake Detected'  : 'Likely Authentic')
    : null

  return (
    <div className="relative max-w-3xl mx-auto px-5 py-14">

      {/* ── Background shapes ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute rounded-full blur-3xl" style={{ width: 480, height: 480, top: '-10%', left: '-15%', background: 'radial-gradient(circle, rgba(239,68,68,0.2), transparent 70%)' }} />
        <div className="absolute blur-3xl" style={{ width: 360, height: 240, bottom: '5%', right: '-10%', borderRadius: '50% 50% 40% 60%', background: 'radial-gradient(circle, rgba(185,28,28,0.15), transparent 70%)' }} />
      </div>

      {/* ── Page header ── */}
      <div className="mb-10">
        <p className="text-xs text-red-500 uppercase tracking-[3px] font-semibold mb-3">
          Phase 5 · Deepfake Detection
        </p>
        <h1 className="text-4xl font-extrabold text-white mb-2">Detect Synthetic Media</h1>
        <p className="text-slate-500">
          Upload an image, audio clip, or video. Our AI scans for GAN artifacts, voice cloning,
          and temporal inconsistencies that indicate deepfake or AI-generated content.
        </p>
      </div>

      {/* ── Upload card ── */}
      <div
        className="rounded-2xl p-8 mb-8"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-14 cursor-pointer transition-all duration-200"
          style={{
            borderColor: dragOver ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)',
            background:  dragOver ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.01)',
          }}
        >
          <span className="text-5xl select-none">{file ? (kindIcon[kind] ?? '📁') : '📂'}</span>
          {file ? (
            <>
              <p className="text-white font-semibold">{file.name}</p>
              <p className="text-slate-500 text-xs">
                {(kind ?? 'unknown').toUpperCase()} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            </>
          ) : (
            <>
              <p className="text-slate-300 font-medium">Drop file here or click to browse</p>
              <p className="text-slate-600 text-xs">Image · Audio · Video &mdash; max 50 MB</p>
            </>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={ALL_MEDIA_TYPES.join(',')}
          className="hidden"
          onChange={(e) => selectFile(e.target.files?.[0])}
        />

        {/* Type pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            { icon: '🖼', label: 'Images (JPG, PNG, WebP)' },
            { icon: '🎵', label: 'Audio (MP3, WAV, OGG)' },
            { icon: '🎬', label: 'Video (MP4, WebM)' },
          ].map(({ icon, label }) => (
            <span
              key={label}
              className="text-xs text-slate-600 px-3 py-1 rounded-full"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {icon}  {label}
            </span>
          ))}
        </div>

        {file && (
          <button
            onClick={(e) => { e.stopPropagation(); setFile(null); setResult(null) }}
            className="mt-3 text-xs text-slate-600 hover:text-red-400 transition-colors"
          >
            ✕ Remove file
          </button>
        )}

        {/* Error */}
        {error && (
          <div
            className="mt-5 px-4 py-3 rounded-xl text-sm text-red-400"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {error}
          </div>
        )}

        {/* Analyse button */}
        <div className="mt-7 flex items-center gap-4">
          <button
            onClick={handleAnalyse}
            disabled={!file || loading}
            className="px-9 py-3.5 rounded-xl text-sm font-semibold flex items-center gap-2.5 transition-all duration-200 focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(239,68,68,0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239,68,68,0.35)',
            }}
          >
            {loading ? (
              <>
                <span className="spinner" />
                Analysing…
              </>
            ) : (
              <>
                <span>🔍</span>
                Scan for Deepfake
              </>
            )}
          </button>
          {loading && (
            <p className="text-xs text-slate-600 animate-pulse">
              Running detection model…
            </p>
          )}
        </div>
      </div>

      {/* ══ RESULT ═══════════════════════════════════════════════════════════════ */}
      {result && (
        <div
          className="rounded-2xl p-8 space-y-7"
          style={{ background: resultBg, border: `1px solid ${resultBorder}` }}
        >
          {/* Verdict row */}
          <div className="flex flex-col md:flex-row items-center gap-8">
            <ConfidenceRing value={result.confidence} flagged={flagged} />

            <div className="flex-1 text-center md:text-left">
              <p className="text-xs text-slate-600 uppercase tracking-widest mb-2">Detection Result</p>

              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-lg font-bold mb-3"
                style={{ background: flagged ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', border: `1px solid ${resultBorder}`, color: resultColor }}
              >
                {flagged ? '⚠ ' : '✓ '}{verdictLabel}
              </div>

              <p className="text-slate-400 text-sm leading-relaxed max-w-xl">
                {result.reasoning}
              </p>
            </div>
          </div>

          {/* Confidence breakdown */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-3">Confidence breakdown</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.06)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.round(result.confidence * 100)}%`, background: resultColor }}
                />
              </div>
              <span className="text-sm font-semibold shrink-0" style={{ color: resultColor }}>
                {Math.round(result.confidence * 100)}%
              </span>
            </div>
            <p className="text-xs text-slate-700 mt-2">
              {result.confidence >= 0.8
                ? 'High certainty — strong signal detected.'
                : result.confidence >= 0.5
                ? 'Moderate certainty — some indicators present.'
                : 'Low certainty — result is inconclusive.'}
            </p>
          </div>

          <button
            className="text-sm text-slate-600 hover:text-slate-400 transition-colors"
            onClick={() => { setResult(null); setFile(null) }}
          >
            Clear result
          </button>
        </div>
      )}

    </div>
  )
}
