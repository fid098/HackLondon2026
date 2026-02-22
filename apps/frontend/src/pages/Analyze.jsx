/**
 * Analyze.jsx — Unified AI Analysis Suite.
 *
 * DEVELOPER: Ishaan
 * ─────────────────────────────────────────────────────────────────────────────
 * This is your main frontend file. It renders the content analysis page.
 *
 * INPUT MODES
 * ────────────
 * URL   — calls submitClaim({ source_type:'url', url }) + checkScam in parallel
 * Text  — calls submitClaim({ source_type:'text', text }) + checkScam in parallel
 * Media:
 *   image → calls analyzeDeepfakeImage({ image_b64, filename })
 *   audio → calls analyzeDeepfakeAudio({ audio_b64, filename }) + checkScam in parallel
 *   video → calls analyzeDeepfakeVideo({ video_b64, filename })
 *
 * All API calls use Promise.allSettled so one failure never blocks the other.
 * If ALL calls fail, mock results (MOCK_FACT, MOCK_SCAM, MOCK_DEEPFAKE) are shown
 * so the user always sees something useful even with no backend.
 *
 * RESULT CARDS
 * ─────────────
 * FactCard      — shows verdict badge, confidence ring, pro/con points, sources
 * ScamCard      — shows is_scam badge, model_scores bar chart, feedback buttons
 * DeepfakeCard  — shows is_deepfake badge, confidence ring, reasoning text
 *
 * API FUNCTIONS (from lib/api.js)
 * ─────────────────────────────────
 * submitClaim(payload)       → POST /api/v1/factcheck
 * checkScam({ text })        → POST /api/v1/scam/check
 * analyzeDeepfakeImage(...)  → POST /api/v1/deepfake/image
 * analyzeDeepfakeAudio(...)  → POST /api/v1/deepfake/audio
 * analyzeDeepfakeVideo(...)  → POST /api/v1/deepfake/video
 * saveReport(reportData)     → POST /api/v1/reports
 * submitFeedback(data)       → POST /api/v1/feedback
 *
 * WHAT TO IMPROVE (your tasks as Ishaan)
 * ────────────────────────────────────────
 * - Show per-agent intermediate results for the fact-check debate pipeline:
 *   as each agent (Extractor → Pro → Con → Judge) finishes, update the UI.
 *   Requires SSE streaming from the backend.
 * - Add a "Share result" button that generates a shareable link/permalink.
 * - Add a "Compare with previous analysis" feature for related claims.
 * - Improve the YouTube URL detection: show a transcript preview before analysis.
 * - Add a progress bar showing which step of the pipeline is running.
 *
 * See docs/developers/ISHAAN.md for full task list and backend guide.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  analyzeDeepfakeAudio,
  analyzeDeepfakeImage,
  analyzeDeepfakeVideo,
  analyzeYouTube,
  checkScam,
  saveReport,
  submitClaim,
  submitFeedback,
} from '../lib/api'

/* ─── Media file helpers ─────────────────────────────────────────────────────── */

// MIME type lists for the file-picker accept attribute and drag-and-drop validation.
// To add a new format: add its MIME type to the relevant array.
const ACCEPTED_MEDIA = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4'],
  video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
}
// Flattened list used for <input accept="..."> and drag-and-drop type checks
const ALL_MEDIA_TYPES = Object.values(ACCEPTED_MEDIA).flat()

// Returns 'image' | 'audio' | 'video' | 'unknown' based on file.type MIME string
const detectKind = (file) => {
  if (ACCEPTED_MEDIA.image.includes(file.type)) return 'image'
  if (ACCEPTED_MEDIA.audio.includes(file.type)) return 'audio'
  if (ACCEPTED_MEDIA.video.includes(file.type)) return 'video'
  return 'unknown'
}

// Regex to detect YouTube URLs (watch, youtu.be short links, and Shorts)
const isYouTubeUrl = (str) =>
  /(?:youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/.test(str)

// Converts a File object to a base64 string (without the data: prefix).
//
// WHY BASE64?
// The deepfake API endpoints expect image_b64 / audio_b64 / video_b64 as JSON strings.
// Browsers can't send binary files in JSON; base64 encoding converts binary → ASCII string.
// FileReader.readAsDataURL() returns "data:image/jpeg;base64,/9j/4AAQ..." —
// we strip everything before the comma to get the raw base64 payload.
//
// NOTE: This reads the entire file into memory. For files > 50 MB this may
// cause a tab crash on mobile. The 50 MB limit is enforced in selectFile() below.
const readAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = (e) => resolve(e.target.result.split(',')[1])   // strip "data:...;base64,"
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

/* ─── mock fallbacks ─────────────────────────────────────────────────────────── */

const MOCK_FACT = {
  verdict:    'MISLEADING',
  confidence: 72,
  summary:    'The claim contains partially accurate information but omits critical context that significantly changes its meaning.',
  pro_points: ['The underlying data point exists in peer-reviewed literature.', 'Geographic scope of the claim is broadly correct.'],
  con_points: ['The study cited predates the claim by 12 years.', 'Three fact-checking organisations have flagged similar variants.'],
  sources:    [{ title: 'Reuters Fact Check — Demo', url: '#' }, { title: 'AFP Fact Check — Demo', url: '#' }],
}

const MOCK_SCAM = {
  is_scam: false, confidence: 0.15,
  model_scores: { roberta: 0.12, xgboost: 0.18 },
  scam_type: null,
  reasoning: '[Demo] No backend running — start the API for real analysis.',
}

const MOCK_DEEPFAKE = { is_deepfake: false, is_synthetic: false, confidence: 0.5, reasoning: '[Demo] No backend running — start the API for real analysis.' }

const MOCK_YOUTUBE = {
  video_id: 'demo', title: 'Demo Video', channel: 'Demo Channel',
  verdict: 'UNCERTAIN', confidence: 50,
  summary: '[Demo] No backend running — start the API for real analysis.',
  ai_indicators: ['Could not connect to backend'], human_indicators: [],
  thumbnail_is_ai: false, thumbnail_confidence: 0.0,
  defender_argument: '[Demo] Defender argument unavailable.',
  prosecutor_argument: '[Demo] Prosecutor argument unavailable.',
  judge_reasoning: '[Demo] Judge reasoning unavailable.',
  has_transcript: false, thumbnail_url: '',
}

/* ─── verdict colours ────────────────────────────────────────────────────────── */

const VERDICT_STYLES = {
  TRUE:       { color: '#10b981', label: 'True',       bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)'  },
  FALSE:      { color: '#ef4444', label: 'False',      bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
  MISLEADING: { color: '#f59e0b', label: 'Misleading', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
  UNVERIFIED: { color: '#6366f1', label: 'Unverified', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)'  },
  SATIRE:     { color: '#8b5cf6', label: 'Satire',     bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.3)'  },
}

const SCAM_TYPE_LABELS = {
  phishing: '🎣 Phishing', advance_fee: '💸 Advance Fee', impersonation: '🎭 Impersonation',
  lottery: '🎰 Lottery', romance: '💔 Romance', investment: '📈 Investment', other: '⚠ Other',
}

/* ─── shared sub-components ──────────────────────────────────────────────────── */

function Tab({ id, label, icon, active, onClick }) {
  return (
    <button
      onClick={() => onClick(id)}
      className={['flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 focus:outline-none',
        active ? 'text-red-400' : 'text-slate-500 hover:text-slate-300'].join(' ')}
      style={active
        ? { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }
        : { background: 'transparent', border: '1px solid transparent' }}
    >
      <span>{icon}</span>{label}
    </button>
  )
}

function ConfidenceMeter({ value, color }) {
  const c = 2 * Math.PI * 36
  return (
    <div className="relative w-24 h-24 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
        <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="7"
          strokeDasharray={c} strokeDashoffset={c - (value / 100) * c} strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-black" style={{ color }}>{value}%</span>
      </div>
    </div>
  )
}

function ScoreBar({ label, value, color }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold" style={{ color }}>{pct}%</span>
      </div>
      <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

/* ─── result cards ────────────────────────────────────────────────────────────── */

function FactCard({ result, onSave, saveState, onNavigate }) {
  const vs = VERDICT_STYLES[result.verdict] ?? VERDICT_STYLES.UNVERIFIED
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: vs.bg, border: `1px solid ${vs.border}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: vs.color }}>🔍 Fact Check</p>

      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <ConfidenceMeter value={result.confidence} color={vs.color} />
        <div className="flex-1 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-base font-bold mb-2"
            style={{ background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color }}>
            {vs.label}
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">{result.summary}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <p className="text-emerald-400 text-xs font-semibold mb-2">✓ Supporting</p>
          <ul className="space-y-1.5">
            {result.pro_points?.map((pt, i) => (
              <li key={i} className="text-slate-400 text-xs flex gap-2">
                <span className="text-emerald-700 shrink-0">•</span>{pt}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <p className="text-red-400 text-xs font-semibold mb-2">✕ Contradicting</p>
          <ul className="space-y-1.5">
            {result.con_points?.map((pt, i) => (
              <li key={i} className="text-slate-400 text-xs flex gap-2">
                <span className="text-red-700 shrink-0">•</span>{pt}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {result.sources?.length > 0 && (
        <div>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-2">Sources</p>
          {result.sources.map((s, i) => (
            <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors mb-1">
              <span className="text-slate-700 font-mono shrink-0">[{i + 1}]</span>{s.title}
              <span className="text-slate-700">↗</span>
            </a>
          ))}
        </div>
      )}

      {/* ── Save prompt ── */}
      <div className="flex items-center gap-3 flex-wrap pt-1 border-t border-white/5">
        {saveState === 'saved' ? (
          <>
            <span className="text-xs text-emerald-400 flex items-center gap-1.5">
              ✓ Saved to archive
            </span>
            {onNavigate && (
              <button
                onClick={() => onNavigate('reports')}
                className="text-xs text-violet-400 hover:text-violet-300 transition-colors underline underline-offset-2"
              >
                View Reports →
              </button>
            )}
          </>
        ) : (
          <button
            onClick={onSave}
            disabled={saveState === 'saving'}
            className="btn-secondary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveState === 'saving' ? (
              <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} /> Saving…</>
            ) : saveState === 'error' ? (
              '⚠ Retry Save'
            ) : (
              '💾 Save to Reports'
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function ScamCard({ result, feedback, onFeedback }) {
  const isScam = result.is_scam
  const color  = isScam ? '#ef4444' : '#10b981'
  const bg     = isScam ? 'rgba(239,68,68,0.08)'  : 'rgba(16,185,129,0.08)'
  const border = isScam ? 'rgba(239,68,68,0.25)'  : 'rgba(16,185,129,0.25)'

  return (
    <div className="rounded-2xl p-6 flex flex-col gap-4"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>🚨 Scam Check</p>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-sm"
          style={{ background: isScam ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.12)', border: `1px solid ${border}`, color }}>
          {isScam ? '⚠ Likely Scam' : '✓ Likely Legitimate'}
        </div>
        {result.scam_type && SCAM_TYPE_LABELS[result.scam_type] && (
          <span className="text-xs px-3 py-1 rounded-full"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
            {SCAM_TYPE_LABELS[result.scam_type]}
          </span>
        )}
        <span className="ml-auto text-xl font-black" style={{ color }}>{Math.round(result.confidence * 100)}%</span>
      </div>

      <p className="text-slate-400 text-sm leading-relaxed">{result.reasoning}</p>

      <div className="rounded-xl p-4 space-y-3"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <p className="text-xs text-slate-600 uppercase tracking-widest">Model scores</p>
        <ScoreBar label="RoBERTa" value={result.model_scores.roberta} color={color} />
        <ScoreBar label="XGBoost" value={result.model_scores.xgboost} color={color} />
      </div>

      <div className="flex items-center gap-3 pt-1 border-t border-white/5">
        <p className="text-xs text-slate-600">Accurate?</p>
        {['up', 'down'].map((r) => (
          <button key={r} onClick={() => onFeedback(r)} disabled={!!feedback}
            className="text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
            style={{
              background: feedback === r ? (r === 'up' ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)') : 'rgba(255,255,255,0.04)',
              border: feedback === r ? (r === 'up' ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(239,68,68,0.35)') : '1px solid rgba(255,255,255,0.08)',
              color: feedback === r ? (r === 'up' ? '#10b981' : '#ef4444') : '#64748b',
            }}>
            {r === 'up' ? '👍' : '👎'}
          </button>
        ))}
        {feedback && <span className="text-xs text-slate-600">Thanks!</span>}
      </div>
    </div>
  )
}

function DeepfakeCard({ result, mediaKind }) {
  const isFlag  = result.is_deepfake ?? result.is_synthetic ?? false
  const color   = isFlag ? '#ef4444' : '#10b981'
  const bg      = isFlag ? 'rgba(239,68,68,0.08)'  : 'rgba(16,185,129,0.08)'
  const border  = isFlag ? 'rgba(239,68,68,0.25)'  : 'rgba(16,185,129,0.25)'
  const pct     = Math.round(result.confidence * 100)
  const c       = 2 * Math.PI * 36

  const kindLabel = { image: '🖼 Image', audio: '🎵 Audio', video: '🎬 Video' }[mediaKind] ?? 'Media'
  const verdictLabel = mediaKind === 'audio'
    ? (isFlag ? 'Synthetic / Cloned' : 'Likely Authentic')
    : (isFlag ? 'Deepfake Detected'  : 'Likely Authentic')

  return (
    <div className="rounded-2xl p-6 flex flex-col gap-5"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color }}>
        🔬 Deepfake Detection · {kindLabel}
      </p>

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        {/* Mini ring */}
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" />
            <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="7"
              strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.16,1,0.3,1)' }} />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xl font-black" style={{ color }}>{pct}%</span>
          </div>
        </div>

        <div className="flex-1">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-sm mb-3"
            style={{ background: bg, border: `1px solid ${border}`, color }}>
            {isFlag ? '⚠ ' : '✓ '}{verdictLabel}
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">{result.reasoning}</p>
        </div>
      </div>

      <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <p className="text-xs text-slate-600 uppercase tracking-widest mb-2">Confidence</p>
        <div className="flex items-center gap-3">
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 5, background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
          </div>
          <span className="text-sm font-semibold" style={{ color }}>{pct}%</span>
        </div>
        <p className="text-xs text-slate-700 mt-2">
          {result.confidence >= 0.8 ? 'High certainty.' : result.confidence >= 0.5 ? 'Moderate certainty.' : 'Low certainty — inconclusive.'}
        </p>
      </div>
    </div>
  )
}

/* ─── debate transcript components ───────────────────────────────────────────── */

/**
 * Renders one agent's argument with inline [Title](URL) markdown links made
 * clickable, followed by a row of source chips.
 */
function DebateAgentCard({ label, icon, argument, sources, color, bg, border }) {
  // Split argument text on markdown links and render each chunk appropriately
  const renderArgument = (text) => {
    const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\))/g)
    return parts.map((part, i) => {
      const match = part.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
      if (match) {
        return (
          <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer"
            className="underline transition-opacity hover:opacity-75" style={{ color }}>
            {match[1]}
          </a>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="rounded-xl p-5" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-xs font-semibold mb-3" style={{ color }}>{icon} {label}</p>
      <p className="text-slate-300 text-sm leading-relaxed mb-4">
        {renderArgument(argument)}
      </p>
      {sources?.length > 0 && (
        <div>
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-2">Sources cited</p>
          <div className="flex flex-wrap gap-2">
            {sources.map((s, i) => (
              <a key={i} href={s.url || '#'} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-opacity hover:opacity-75"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: '#94a3b8' }}>
                <span className="text-slate-600 font-mono shrink-0">[{i + 1}]</span>
                <span className="truncate max-w-[180px]">{s.title}</span>
                <span className="text-slate-700 shrink-0">↗</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Collapsible panel showing the full Pro → Con → Judge debate transcript.
 * Rendered below the FactCard/ScamCard grid whenever factResult.debate exists.
 */
function DebateBox({ debate }) {
  const [open, setOpen] = useState(true)
  if (!debate) return null

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.01)' }}>

      {/* Toggle header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center gap-3">
          <span className="text-base select-none">⚖️</span>
          <span className="text-sm font-semibold text-slate-300">AI Debate Transcript</span>
          <span className="text-xs px-2 py-0.5 rounded-full text-slate-500"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            3 agents
          </span>
        </div>
        <span className="text-slate-600 text-xs font-medium">{open ? '▲ Collapse' : '▼ Expand'}</span>
      </button>

      {open && (
        <div className="px-6 pb-6 pt-3 space-y-4">

          {/* Agent A — Pro */}
          <DebateAgentCard
            label="Agent A — Supporting Evidence"
            icon="🟢"
            argument={debate.pro_argument}
            sources={debate.pro_sources}
            color="#10b981"
            bg="rgba(16,185,129,0.04)"
            border="rgba(16,185,129,0.14)"
          />

          {/* Agent B — Con */}
          <DebateAgentCard
            label="Agent B — Counter Evidence"
            icon="🔴"
            argument={debate.con_argument}
            sources={debate.con_sources}
            color="#ef4444"
            bg="rgba(239,68,68,0.04)"
            border="rgba(239,68,68,0.14)"
          />

          {/* Judge */}
          <div className="rounded-xl p-5"
            style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.16)' }}>
            <p className="text-xs font-semibold text-indigo-400 mb-3">⚖️ Judge — Final Reasoning</p>
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">
              {debate.judge_reasoning}
            </p>
          </div>

        </div>
      )}
    </div>
  )
}

/* ─── YouTube AI-detection result card ───────────────────────────────────────── */

const YT_VERDICT_STYLES = {
  AI_GENERATED:  { color: '#ef4444', label: 'AI Generated',   bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  icon: '🤖' },
  HUMAN_CREATED: { color: '#10b981', label: 'Human Created',  bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', icon: '👤' },
  UNCERTAIN:     { color: '#f59e0b', label: 'Uncertain',       bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', icon: '❓' },
}

function YouTubeCard({ result }) {
  const [debateOpen, setDebateOpen] = useState(true)
  const vs = YT_VERDICT_STYLES[result.verdict] ?? YT_VERDICT_STYLES.UNCERTAIN
  const thumbAiPct = Math.round(result.thumbnail_confidence * 100)
  const c = 2 * Math.PI * 36

  const renderArg = (text) => {
    const parts = text.split(/(\[[^\]]+\]\(https?:\/\/[^)]+\))/g)
    return parts.map((part, i) => {
      const match = part.match(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/)
      if (match) return <a key={i} href={match[2]} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-75" style={{ color: '#94a3b8' }}>{match[1]}</a>
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className="rounded-2xl overflow-hidden flex flex-col gap-0"
      style={{ border: `1px solid ${vs.border}`, background: vs.bg }}>

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-4 flex flex-col gap-4">
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: vs.color }}>
          ▶️ YouTube AI-Content Detection
        </p>

        <div className="flex gap-4 items-start">
          {/* Thumbnail */}
          {result.thumbnail_url ? (
            <div className="relative shrink-0">
              <img src={result.thumbnail_url} alt="thumbnail"
                className="w-28 h-20 object-cover rounded-lg"
                style={{ border: `2px solid ${result.thumbnail_is_ai ? '#ef4444' : 'rgba(255,255,255,0.1)'}` }} />
              {result.thumbnail_is_ai && (
                <div className="absolute -top-1.5 -right-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold"
                  style={{ background: '#ef4444', color: 'white' }}>AI</div>
              )}
            </div>
          ) : (
            <div className="w-28 h-20 rounded-lg shrink-0 flex items-center justify-center text-2xl"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>▶️</div>
          )}

          {/* Title + verdict */}
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{result.title || 'Unknown title'}</p>
            <p className="text-slate-500 text-xs mb-3">{result.channel || 'Unknown channel'}</p>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-sm"
                style={{ background: vs.bg, border: `1px solid ${vs.border}`, color: vs.color }}>
                {vs.icon} {vs.label}
              </div>
              <span className="text-xl font-black" style={{ color: vs.color }}>{result.confidence}%</span>
              {!result.has_transcript && (
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                  ⚠ No captions
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="text-slate-400 text-sm leading-relaxed">{result.summary}</p>
      </div>

      {/* ── Indicators ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-6 pb-4">
        <div className="rounded-xl p-4" style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
          <p className="text-red-400 text-xs font-semibold mb-2">🤖 AI Indicators</p>
          {result.ai_indicators.length > 0 ? (
            <ul className="space-y-1">
              {result.ai_indicators.map((ind, i) => (
                <li key={i} className="text-slate-400 text-xs flex gap-2">
                  <span className="text-red-700 shrink-0">•</span>{ind}
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-600 text-xs">None detected.</p>}
        </div>
        <div className="rounded-xl p-4" style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.12)' }}>
          <p className="text-emerald-400 text-xs font-semibold mb-2">👤 Human Indicators</p>
          {result.human_indicators.length > 0 ? (
            <ul className="space-y-1">
              {result.human_indicators.map((ind, i) => (
                <li key={i} className="text-slate-400 text-xs flex gap-2">
                  <span className="text-emerald-700 shrink-0">•</span>{ind}
                </li>
              ))}
            </ul>
          ) : <p className="text-slate-600 text-xs">None detected.</p>}
        </div>
      </div>

      {/* ── Thumbnail AI score ── */}
      {result.thumbnail_url && (
        <div className="mx-6 mb-4 rounded-xl p-3 flex items-center gap-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <span className="text-xs text-slate-500 shrink-0">Thumbnail AI score</span>
          <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${thumbAiPct}%`, background: result.thumbnail_is_ai ? '#ef4444' : '#10b981' }} />
          </div>
          <span className="text-xs font-semibold shrink-0"
            style={{ color: result.thumbnail_is_ai ? '#ef4444' : '#10b981' }}>
            {thumbAiPct}%
          </span>
        </div>
      )}

      {/* ── Debate transcript ── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button onClick={() => setDebateOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 text-left transition-colors hover:bg-white/[0.02]"
          style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-3">
            <span className="text-base select-none">⚖️</span>
            <span className="text-sm font-semibold text-slate-300">AI Debate Transcript</span>
            <span className="text-xs px-2 py-0.5 rounded-full text-slate-500"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              3 agents
            </span>
          </div>
          <span className="text-slate-600 text-xs font-medium">{debateOpen ? '▲ Collapse' : '▼ Expand'}</span>
        </button>

        {debateOpen && (
          <div className="px-6 pb-6 pt-3 space-y-4">
            {/* Defender */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.14)' }}>
              <p className="text-xs font-semibold text-emerald-400 mb-3">👤 Agent A — Human Creation Defender</p>
              <p className="text-slate-300 text-sm leading-relaxed">{renderArg(result.defender_argument)}</p>
            </div>
            {/* Prosecutor */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.14)' }}>
              <p className="text-xs font-semibold text-red-400 mb-3">🤖 Agent B — AI Generation Prosecutor</p>
              <p className="text-slate-300 text-sm leading-relaxed">{renderArg(result.prosecutor_argument)}</p>
            </div>
            {/* Judge */}
            <div className="rounded-xl p-5" style={{ background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.16)' }}>
              <p className="text-xs font-semibold text-indigo-400 mb-3">⚖️ Judge — Final Reasoning</p>
              <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{result.judge_reasoning}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── pipeline step labels (shown during fact-check loading) ─────────────────── */

const PIPELINE_STEPS = [
  { icon: '🔍', label: 'Searching the web for evidence…' },
  { icon: '🟢', label: 'Agent A building supporting case…' },
  { icon: '🔴', label: 'Agent B building counter-case…' },
  { icon: '⚖️', label: 'Judge deliberating final verdict…' },
]

const YT_PIPELINE_STEPS = [
  { icon: '▶️', label: 'Extracting transcript and metadata…' },
  { icon: '🖼', label: 'Scanning thumbnail for AI generation…' },
  { icon: '👤', label: 'Defender building human-creation case…' },
  { icon: '🤖', label: 'Prosecutor building AI-generation case…' },
  { icon: '⚖️', label: 'Judge issuing verdict…' },
]

/* ─── main component ─────────────────────────────────────────────────────────── */

export default function Analyze({ onNavigate }) {
  const [tab,           setTab]           = useState('url')
  const [url,           setUrl]           = useState('')
  const [text,          setText]          = useState('')
  const [mediaFile,     setMediaFile]     = useState(null)
  const [dragOver,      setDragOver]      = useState(false)
  const [loading,       setLoading]       = useState(false)
  const [error,         setError]         = useState(null)
  const [factResult,     setFactResult]     = useState(null)
  const [scamResult,     setScamResult]     = useState(null)
  const [deepfakeResult, setDeepfakeResult] = useState(null)
  const [youtubeResult,  setYoutubeResult]  = useState(null)
  const [mediaKind,     setMediaKind]     = useState(null)
  const [feedback,      setFeedback]      = useState(null)
  const [pipelineStep,   setPipelineStep]   = useState(-1)
  const [saveState,     setSaveState]     = useState('idle') // 'idle' | 'saving' | 'saved' | 'error'
  const fileRef = useRef(null)

  // Advance the pipeline step indicator every ~2 s while a text/URL analysis is running.
  useEffect(() => {
    if (!loading || tab === 'media') { setPipelineStep(-1); return }
    setPipelineStep(0)
    const isYouTube = tab === 'url' && isYouTubeUrl(url)
    const steps = isYouTube ? YT_PIPELINE_STEPS : PIPELINE_STEPS
    const id = setInterval(() => {
      setPipelineStep(s => (s < steps.length - 1 ? s + 1 : s))
    }, 2200)
    return () => clearInterval(id)
  }, [loading, tab, url])

  // Reset all result state. Called before each new analysis and when switching tabs.
  // Not resetting before a new analysis would cause stale results to flash briefly.
  const clearResults = () => {
    setFactResult(null); setScamResult(null); setDeepfakeResult(null)
    setYoutubeResult(null); setMediaKind(null); setFeedback(null); setError(null); setSaveState('idle')
  }

  /* ── file selection ── */
  const selectFile = useCallback((f) => {
    if (!f) return
    if (!ALL_MEDIA_TYPES.includes(f.type)) { setError('Unsupported file type.'); return }
    if (f.size > 50 * 1024 * 1024) { setError('File too large — maximum 50 MB.'); return }
    setError(null); clearResults(); setMediaFile(f)
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer?.files?.[0])
  }, [selectFile])

  /* ── Main analysis handler ── */
  const handleAnalyse = async () => {
    clearResults()
    setLoading(true)

    try {
      if (tab === 'media' && mediaFile) {
        // Convert the uploaded file to base64 before sending to the API.
        // This is done once here and the string is reused across all API calls.
        const b64  = await readAsBase64(mediaFile)
        const kind = detectKind(mediaFile)
        setMediaKind(kind)

        if (kind === 'image') {
          // Image: only deepfake detection (no scam check for images)
          const [df] = await Promise.allSettled([
            analyzeDeepfakeImage({ image_b64: b64, filename: mediaFile.name }),
          ])
          setDeepfakeResult(df.status === 'fulfilled' ? df.value : MOCK_DEEPFAKE)

        } else if (kind === 'audio') {
          // Audio: deepfake detection + scam check in parallel.
          // WHY PARALLEL? Both calls are independent — running them concurrently
          // halves the total wait time vs running them sequentially.
          // WHY Promise.allSettled (not Promise.all)?
          //   Promise.all rejects immediately if ANY call fails.
          //   Promise.allSettled waits for ALL calls and reports each result
          //   individually as { status: 'fulfilled'|'rejected', value|reason }.
          //   This means if the scam API is down, we still show the deepfake result.
          const [df, sc] = await Promise.allSettled([
            analyzeDeepfakeAudio({ audio_b64: b64, filename: mediaFile.name }),
            checkScam({ text: `Audio file: ${mediaFile.name}` }),
          ])
          setDeepfakeResult(df.status === 'fulfilled' ? df.value : MOCK_DEEPFAKE)
          setScamResult(sc.status === 'fulfilled' ? sc.value : MOCK_SCAM)

        } else if (kind === 'video') {
          // Video: only deepfake detection (no scam check for video files)
          const [df] = await Promise.allSettled([
            analyzeDeepfakeVideo({ video_b64: b64, filename: mediaFile.name }),
          ])
          setDeepfakeResult(df.status === 'fulfilled' ? df.value : MOCK_DEEPFAKE)
        }

      } else if (tab === 'url' && isYouTubeUrl(url)) {
        // YouTube URL: run the dedicated AI-content detection pipeline
        const [ytRes] = await Promise.allSettled([analyzeYouTube({ url })])
        setYoutubeResult(ytRes.status === 'fulfilled' ? ytRes.value : MOCK_YOUTUBE)

      } else {
        // URL or Text tab: fact-check + scam check run in parallel.
        // submitClaim calls POST /api/v1/factcheck (the full debate pipeline).
        // checkScam calls POST /api/v1/scam/check.
        const claimPayload = tab === 'url'
          ? { source_type: 'url', url }
          : { source_type: 'text', text }
        // Scam check gets the raw URL/text (capped at 2000 chars to stay within limits)
        const textToCheck = (tab === 'url' ? url : text).slice(0, 2000)

        // Both API calls fire simultaneously — neither waits for the other
        const [factRes, scamRes] = await Promise.allSettled([
          submitClaim(claimPayload),
          checkScam({ text: textToCheck }),
        ])

        // factRes.value.report is the full ReportOut Pydantic model from the backend.
        // Fall back to MOCK_FACT if the API is down.
        setFactResult(factRes.status === 'fulfilled' ? (factRes.value.report ?? MOCK_FACT) : MOCK_FACT)
        setScamResult(scamRes.status === 'fulfilled' ? scamRes.value : MOCK_SCAM)
      }

    } catch {
      // Unexpected error (e.g. network completely down) — show both mocks
      setFactResult(MOCK_FACT)
      setScamResult(MOCK_SCAM)
    } finally {
      setLoading(false)
    }
  }

  /* ── save report ── */
  const handleSave = async () => {
    if (!factResult || saveState === 'saving' || saveState === 'saved') return
    setSaveState('saving')
    try {
      await saveReport({
        source_type: factResult.source_type ?? tab,
        source_ref:  factResult.source_ref ?? (url || text?.slice(0, 80) || 'media upload'),
        verdict:     factResult.verdict,
        confidence:  factResult.confidence,
        summary:     factResult.summary,
        pro_points:  factResult.pro_points ?? [],
        con_points:  factResult.con_points ?? [],
        sources:     factResult.sources ?? [],
        category:    factResult.category ?? 'General',
      })
      setSaveState('saved')
    } catch (_) {
      setSaveState('error')
    }
  }

  /* ── scam feedback ── */
  const handleFeedback = async (rating) => {
    if (feedback) return
    setFeedback(rating)
    try {
      await submitFeedback({
        report_id: 'analyze-check',
        rating:    rating === 'up' ? 'thumbs_up' : 'thumbs_down',
        notes:     `Scam check on: "${(url || text || mediaFile?.name || '').slice(0, 80)}"`,
      })
    } catch (_) { /* silently ignore */ }
  }

  /* ── canSubmit ── */
  const canSubmit = !loading && (
    (tab === 'url'   && url.trim().length > 0) ||
    (tab === 'text'  && text.trim().length > 20) ||
    (tab === 'media' && mediaFile !== null)
  )

  const isYT        = tab === 'url' && isYouTubeUrl(url)
  const hasResults  = factResult || scamResult || deepfakeResult || youtubeResult
  const kind        = mediaFile ? detectKind(mediaFile) : null
  const kindIcon    = { image: '🖼', audio: '🎵', video: '🎬' }

  return (
    <div className="relative max-w-5xl mx-auto px-5 py-14">

      {/* ── Background shapes ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        {/* Red orbs */}
        <div className="absolute rounded-full blur-3xl" style={{ width: 520, height: 520, top: '-12%', left: '-12%', background: 'radial-gradient(circle, rgba(239,68,68,0.22), transparent 70%)' }} />
        <div className="absolute blur-3xl" style={{ width: 420, height: 280, top: '35%', right: '-8%', borderRadius: '60% 40% 40% 60% / 50% 60% 40% 50%', background: 'radial-gradient(circle, rgba(185,28,28,0.18), transparent 70%)' }} />
        <div className="absolute rounded-full blur-2xl" style={{ width: 280, height: 280, bottom: '8%', left: '25%', background: 'radial-gradient(circle, rgba(239,68,68,0.14), transparent 70%)' }} />
        <div className="absolute blur-3xl" style={{ width: 320, height: 200, top: '60%', left: '-5%', borderRadius: '40% 60%', background: 'radial-gradient(circle, rgba(220,38,38,0.12), transparent 70%)' }} />
        {/* Teal orbs — cool contrast */}
        <div className="absolute rounded-full blur-3xl" style={{ width: 400, height: 400, top: '10%', right: '-6%', background: 'radial-gradient(circle, rgba(20,184,166,0.11), transparent 70%)' }} />
        <div className="absolute blur-3xl" style={{ width: 260, height: 200, bottom: '22%', right: '28%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(20,184,166,0.08), transparent 70%)' }} />
      </div>

      {/* ── Page header ── */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <p className="text-xs text-red-500 uppercase tracking-[3px] font-semibold">
            AI Analysis Suite
          </p>
          <span className="liquid-pill liquid-pill-teal">Multi-Model · Real-Time</span>
        </div>
        <h1 className="text-4xl font-extrabold text-white mb-2">Analyze Content</h1>
        <p className="text-slate-500 max-w-2xl">
          Submit a URL, text, or media file. We simultaneously run{' '}
          <span className="text-slate-400">fact-checking</span>,{' '}
          <span className="text-slate-400">scam detection</span>, and{' '}
          <span className="text-slate-400">deepfake analysis</span> — all in one go.
        </p>
      </div>

      {/* ── Input card ── */}
      <div className="rounded-2xl p-8 mb-8"
        style={{
          background:          'rgba(255,255,255,0.025)',
          border:              '1px solid rgba(255,255,255,0.08)',
          backdropFilter:      'blur(20px)',
          WebkitBackdropFilter:'blur(20px)',
          boxShadow:           '0 0 80px rgba(239,68,68,0.05), 0 0 80px rgba(20,184,166,0.04), inset 0 1px 0 rgba(255,255,255,0.05)',
        }}>

        {/* Tab strip */}
        <div className="flex flex-wrap gap-2 mb-7">
          <Tab id="url"   label="URL"   icon="🔗" active={tab === 'url'}   onClick={(t) => { setTab(t); clearResults() }} />
          <Tab id="text"  label="Text"  icon="📝" active={tab === 'text'}  onClick={(t) => { setTab(t); clearResults() }} />
          <Tab id="media" label="Media" icon="🎬" active={tab === 'media'} onClick={(t) => { setTab(t); clearResults() }} />
        </div>

        {/* What runs label */}
        <p className="text-xs text-slate-600 mb-5">
          {tab === 'media'
            ? 'Media: deepfake detection · audio also runs scam check'
            : 'Text / URL: fact-check (debate pipeline) + scam check — in parallel'}
        </p>

        {/* ── URL tab ── */}
        {tab === 'url' && (
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-lg select-none pointer-events-none">
                {isYT ? '▶️' : '🌐'}
              </div>
              <input type="url" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article  or  https://youtu.be/..."
                className="input-field w-full pl-12" />
            </div>
            {isYT && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm text-amber-400"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
                <span>▶️</span> YouTube detected — transcript and metadata will be extracted.
              </div>
            )}
          </div>
        )}

        {/* ── Text tab ── */}
        {tab === 'text' && (
          <div className="space-y-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Paste the claim, article, message, or any text you want to analyse…"
              rows={7} className="input-field w-full resize-none" style={{ lineHeight: 1.6 }} />
            <div className="flex justify-between text-xs">
              <span className="text-slate-600">Minimum 20 characters</span>
              <span className={text.length < 20 ? 'text-slate-600' : 'text-red-500'}>
                {text.length.toLocaleString()} chars
              </span>
            </div>
          </div>
        )}

        {/* ── Media tab ── */}
        {tab === 'media' && (
          <div>
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop} onClick={() => fileRef.current?.click()}
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-3 py-12 cursor-pointer transition-all duration-200"
              style={{
                borderColor: dragOver ? 'rgba(239,68,68,0.6)' : 'rgba(255,255,255,0.1)',
                background:  dragOver ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.01)',
              }}>
              <span className="text-4xl select-none">{mediaFile ? (kindIcon[kind] ?? '📁') : '📂'}</span>
              {mediaFile ? (
                <>
                  <p className="text-white font-semibold">{mediaFile.name}</p>
                  <p className="text-slate-500 text-xs">
                    {(kind ?? 'unknown').toUpperCase()} · {(mediaFile.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                </>
              ) : (
                <>
                  <p className="text-slate-300 font-medium">Drop file here or click to browse</p>
                  <p className="text-slate-600 text-xs">Image · Audio · Video — max 50 MB</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept={ALL_MEDIA_TYPES.join(',')} className="hidden"
              onChange={(e) => selectFile(e.target.files?.[0])} />
            {mediaFile && (
              <button onClick={(e) => { e.stopPropagation(); setMediaFile(null); clearResults() }}
                className="mt-3 text-xs text-slate-600 hover:text-red-400 transition-colors">
                ✕ Remove file
              </button>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="mt-5 px-4 py-3 rounded-xl text-sm text-red-400"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* ── Analyse button ── */}
        <div className="mt-7 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <button onClick={handleAnalyse} disabled={!canSubmit}
              className="btn-primary px-9 py-3.5 flex items-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed">
              {loading ? <><span className="spinner" />Analysing…</> : <><span>🔍</span>Analyse</>}
            </button>
            {loading && tab === 'media' && (
              <p className="text-xs text-slate-600 animate-pulse">Running detection…</p>
            )}
          </div>

          {/* Pipeline step indicator — text / URL fact-check only */}
          {loading && tab !== 'media' && (
            <div className="flex flex-col gap-1.5 p-4 rounded-xl"
              style={{
                background:          'rgba(20,184,166,0.04)',
                border:              '1px solid rgba(20,184,166,0.14)',
                backdropFilter:      'blur(10px)',
                WebkitBackdropFilter:'blur(10px)',
              }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#5eead4', letterSpacing: '0.07em', textTransform: 'uppercase', fontSize: 9 }}>
                Pipeline Running
              </p>
              {(isYT ? YT_PIPELINE_STEPS : PIPELINE_STEPS).map((step, i) => {
                const done    = i < pipelineStep
                const active  = i === pipelineStep
                return (
                  <div key={i} className="flex items-center gap-2 text-xs transition-all duration-300"
                    style={{ color: done ? '#10b981' : active ? '#e2e8f0' : '#334155', opacity: done || active ? 1 : 0.45 }}>
                    <span style={{ fontSize: 11 }}>{done ? '✓' : step.icon}</span>
                    <span className={active ? 'animate-pulse' : ''}>{step.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ══ RESULTS ══════════════════════════════════════════════════════════════ */}
      {hasResults && (
        <div className="space-y-5">

          {/* Text/URL: two-column grid */}
          {factResult && scamResult && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <FactCard result={factResult} onSave={handleSave} saveState={saveState} onNavigate={onNavigate} />
              <ScamCard result={scamResult} feedback={feedback} onFeedback={handleFeedback} />
            </div>
          )}

          {/* Debate transcript — shown whenever a fact-check debate is available */}
          {factResult?.debate && (
            <DebateBox debate={factResult.debate} />
          )}

          {/* YouTube: AI-content detection card (full width) */}
          {youtubeResult && (
            <YouTubeCard result={youtubeResult} />
          )}

          {/* Media: deepfake card (full width) */}
          {deepfakeResult && (
            <DeepfakeCard result={deepfakeResult} mediaKind={mediaKind} />
          )}

          {/* Audio: also show scam card */}
          {deepfakeResult && scamResult && mediaKind === 'audio' && (
            <ScamCard result={scamResult} feedback={feedback} onFeedback={handleFeedback} />
          )}

          {/* Clear */}
          <div className="flex justify-end">
            <button onClick={clearResults}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Clear results
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
