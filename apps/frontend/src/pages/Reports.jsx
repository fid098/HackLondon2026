/**
 * Reports.jsx — Archive of previously generated fact-check reports.
 *
 * Features:
 *   - Full-text search across title / summary
 *   - Verdict filter tabs (All, True, False, Misleading, Unverified)
 *   - Report cards with circular confidence ring, source type badge, date
 *   - Expandable detail drawer per card
 *   - Empty state when no results match
 *   - Pagination (client-side for demo; in production from MongoDB Atlas)
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { downloadReport, getReports } from '../lib/api'

/* ─── verdict config ─────────────────────────────────────────────────────── */

const V = {
  TRUE:       { label: 'True',       color: '#10b981', bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.25)'  },
  FALSE:      { label: 'False',      color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)'   },
  MISLEADING: { label: 'Misleading', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.25)'  },
  UNVERIFIED: { label: 'Unverified', color: '#6366f1', bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.25)'  },
  SATIRE:     { label: 'Satire',     color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)'  },
}

const SOURCE_ICONS = { url: '🔗', text: '📝', media: '🎬' }

/* ─── mock reports ───────────────────────────────────────────────────────── */

const MOCK_REPORTS = [
  {
    id:         'r-001',
    verdict:    'FALSE',
    confidence: 94,
    title:      '"5G towers cause COVID-19 symptoms" — viral social post',
    summary:    'The claim that 5G radio waves trigger COVID-19 infection is wholly unsupported by evidence. No peer-reviewed study establishes a biological mechanism; health authorities worldwide have repeatedly debunked this narrative.',
    sourceType: 'url',
    sourceRef:  'twitter.com/status/…',
    date:       '2026-02-20',
    category:   'Health',
    sources:    ['WHO Q&A on 5G networks', 'ICNIRP Guidelines', 'Reuters Fact Check'],
  },
  {
    id:         'r-002',
    verdict:    'MISLEADING',
    confidence: 78,
    title:      'BBC article on renewable energy job figures',
    summary:    'The headline figure is accurate but excludes part-time roles and conflates installation with long-term operations jobs, inflating the net employment benefit by an estimated 40 %.',
    sourceType: 'url',
    sourceRef:  'bbc.co.uk/news/…',
    date:       '2026-02-19',
    category:   'Science',
    sources:    ['IEA World Energy Employment 2024', 'IRENA Renewable Energy Jobs 2025'],
  },
  {
    id:         'r-003',
    verdict:    'TRUE',
    confidence: 91,
    title:      'Text claim: "Antarctic ice sheet lost a record 150 bn tonnes in 2025"',
    summary:    'Confirmed by multiple independent satellite-altimetry datasets. The figure aligns with IPCC AR7 working group projections and has been corroborated by NASA and ESA observations.',
    sourceType: 'text',
    sourceRef:  'pasted text',
    date:       '2026-02-18',
    category:   'Climate',
    sources:    ['NASA Ice Mass Measurement 2025', 'ESA CryoSat-3 Data Release', 'IPCC AR7 WG1'],
  },
  {
    id:         'r-004',
    verdict:    'UNVERIFIED',
    confidence: 43,
    title:      'Video: alleged leaked government document on AI regulation',
    summary:    'The document format matches official templates but metadata analysis is inconclusive. Three out of five AI agents found inconsistencies in the watermark. The originating source has not been identified.',
    sourceType: 'media',
    sourceRef:  'uploaded video',
    date:       '2026-02-17',
    category:   'Politics',
    sources:    ['PDF metadata analysis', 'Government press office (no comment)'],
  },
  {
    id:         'r-005',
    verdict:    'FALSE',
    confidence: 88,
    title:      '"Central banks secretly buying Bitcoin" — finance newsletter',
    summary:    'No central bank has publicly disclosed Bitcoin holdings, and public balance-sheet filings confirm this. The claim appears to originate from a misread of a BIS research paper on CBDC stablecoins.',
    sourceType: 'url',
    sourceRef:  'substack.com/…',
    date:       '2026-02-15',
    category:   'Finance',
    sources:    ['BIS CBDC Report Q4 2025', 'Federal Reserve Balance Sheet', 'ECB Asset Holdings'],
  },
  {
    id:         'r-006',
    verdict:    'SATIRE',
    confidence: 97,
    title:      '"Elon Musk announces purchase of the Moon" — viral image',
    summary:    'The image originates from the well-known satirical publication The Onion. Despite realistic formatting, the article URL and author credits clearly identify it as satire.',
    sourceType: 'media',
    sourceRef:  'uploaded image',
    date:       '2026-02-14',
    category:   'Science',
    sources:    ['The Onion — original article (satire)'],
  },
]

const PAGE_SIZE = 4

/* ─── sub-components ─────────────────────────────────────────────────────── */

function ConfidenceRing({ value, color }) {
  const c = 2 * Math.PI * 22
  const offset = c - (value / 100) * c
  return (
    <div className="relative w-14 h-14 shrink-0">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
        <circle
          cx="24" cy="24" r="22" fill="none"
          stroke={color} strokeWidth="4"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold" style={{ color }}>{value}%</span>
      </div>
    </div>
  )
}

function ReportCard({ report, onNavigate }) {
  const [expanded, setExpanded] = useState(false)
  const vs = V[report.verdict] ?? V.UNVERIFIED

  return (
    <div
      className="rounded-2xl overflow-hidden transition-all duration-200"
      style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${expanded ? vs.border : 'rgba(255,255,255,0.07)'}` }}
    >
      {/* Card header */}
      <div
        className="flex items-start gap-4 p-5 cursor-pointer select-none"
        onClick={() => setExpanded((x) => !x)}
      >
        <ConfidenceRing value={report.confidence} color={vs.color} />

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            {/* Verdict badge */}
            <span
              className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: vs.bg, color: vs.color, border: `1px solid ${vs.border}` }}
            >
              {vs.label}
            </span>
            {/* Source type */}
            <span className="text-xs text-slate-600">
              {SOURCE_ICONS[report.sourceType]} {report.sourceType}
            </span>
            {/* Category */}
            <span
              className="text-xs px-2 py-0.5 rounded-full text-slate-600"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {report.category}
            </span>
          </div>

          <h3 className="text-white text-sm font-semibold leading-snug line-clamp-2">{report.title}</h3>
          <p className="text-slate-600 text-xs mt-1">{report.date}</p>
        </div>

        {/* Expand chevron */}
        <span
          className="text-slate-700 text-sm shrink-0 mt-1 transition-transform duration-200"
          style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
        >
          ▾
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="px-5 pb-5 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}
        >
          <p className="text-slate-400 text-sm leading-relaxed mt-4 mb-4">{report.summary}</p>

          <p className="text-xs text-slate-600 uppercase tracking-widest mb-2">Sources cited</p>
          <ul className="space-y-1 mb-5">
            {report.sources.map((s, i) => (
              <li key={i} className="text-xs text-slate-500 flex gap-2">
                <span className="text-slate-700 font-mono shrink-0">[{i + 1}]</span>
                {s}
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-3">
            <button
              className="text-xs btn-secondary px-4 py-2"
              onClick={(e) => { e.stopPropagation(); onNavigate('analyze') }}
            >
              Re-analyse
            </button>
            <button
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors px-2"
              onClick={async (e) => {
                e.stopPropagation()
                try { await downloadReport(report.id) } catch (_) {}
              }}
            >
              Export JSON ↓
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── main component ─────────────────────────────────────────────────────── */

const FILTER_TABS = [
  { key: 'ALL',        label: 'All' },
  { key: 'TRUE',       label: 'True' },
  { key: 'FALSE',      label: 'False' },
  { key: 'MISLEADING', label: 'Misleading' },
  { key: 'UNVERIFIED', label: 'Unverified' },
  { key: 'SATIRE',     label: 'Satire' },
]

export default function Reports({ onNavigate }) {
  const [query,      setQuery]      = useState('')
  const [filter,     setFilter]     = useState('ALL')
  const [page,       setPage]       = useState(1)
  const [reports,    setReports]    = useState(MOCK_REPORTS)   // start with mock, replace on load
  const [total,      setTotal]      = useState(MOCK_REPORTS.length)
  const [totalPages, setTotalPages] = useState(Math.ceil(MOCK_REPORTS.length / PAGE_SIZE))
  const [apiLoaded,  setApiLoaded]  = useState(false)

  /* ── Normalize API report to match UI shape ── */
  const normaliseReport = (r) => ({
    id:         r.id,
    verdict:    r.verdict,
    confidence: r.confidence,
    title:      r.source_ref || r.summary?.slice(0, 80) || 'Report',
    summary:    r.summary,
    sourceType: r.source_type,
    sourceRef:  r.source_ref,
    date:       r.created_at ? r.created_at.slice(0, 10) : '',
    category:   r.category,
    sources:    (r.sources || []).map((s) => (typeof s === 'string' ? s : s.title || s.url || 'Source')),
  })

  /* ── Load from API (replaces mock on success) ── */
  const fetchReports = useCallback(async () => {
    try {
      const data = await getReports({ page, limit: PAGE_SIZE, verdict: filter, q: query || undefined })
      setReports(data.items.map(normaliseReport))
      setTotal(data.total)
      setTotalPages(data.pages)
      setApiLoaded(true)
    } catch (_err) {
      // Backend not available — keep showing mock data silently
      if (!apiLoaded) {
        // Client-side filter mock data as fallback
        const q = query.toLowerCase()
        const allFiltered = MOCK_REPORTS.filter((r) => {
          const matchVerdict = filter === 'ALL' || r.verdict === filter
          const matchQuery   = !q || r.title?.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)
          return matchVerdict && matchQuery
        })
        setReports(allFiltered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE))
        setTotal(allFiltered.length)
        setTotalPages(Math.max(1, Math.ceil(allFiltered.length / PAGE_SIZE)))
      }
    }
  }, [page, filter, query, apiLoaded])

  useEffect(() => { fetchReports() }, [fetchReports])

  /* Reset to page 1 when filter/search changes */
  const applyFilter = (k) => { setFilter(k); setPage(1) }
  const applyQuery  = (v) => { setQuery(v);  setPage(1) }

  /* Summary stats from whatever data we have */
  const stats = useMemo(() => {
    const source = apiLoaded ? reports : MOCK_REPORTS
    const counts = {}
    source.forEach((r) => { counts[r.verdict] = (counts[r.verdict] || 0) + 1 })
    return counts
  }, [reports, apiLoaded])

  const paged = reports  // API already pages; mock fallback already sliced

  return (
    <div className="relative max-w-4xl mx-auto px-5 py-14">

      {/* ── background shapes ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        {/* Red orbs */}
        <div className="absolute rounded-full blur-3xl" style={{ width: 480, height: 480, top: '-10%', right: '-10%', background: 'radial-gradient(circle, rgba(239,68,68,0.18), transparent 70%)' }} />
        <div className="absolute blur-3xl" style={{ width: 380, height: 380, bottom: '0', left: '-10%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(185,28,28,0.14), transparent 70%)' }} />
        {/* Teal orb — cool contrast */}
        <div className="absolute rounded-full blur-3xl" style={{ width: 360, height: 360, top: '28%', left: '32%', background: 'radial-gradient(circle, rgba(20,184,166,0.09), transparent 70%)' }} />
      </div>

      {/* ── header ── */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <p className="text-xs text-red-500 uppercase tracking-[3px] font-semibold">
            Persistent
          </p>
          <span className="liquid-pill liquid-pill-teal">⬤ Atlas Sync</span>
        </div>
        <h1 className="text-4xl font-extrabold text-white mb-2">Report Archive</h1>
        <p className="text-slate-500">
          Reports you save from the Analyse page are stored in MongoDB Atlas. Search, filter, and re-open any previous analysis.
        </p>
      </div>

      {/* ── Summary stat pills ── */}
      <div className="flex flex-wrap gap-3 mb-8">
        <div
          className="flex items-center gap-2 px-4 py-2 rounded-xl"
          style={{
            background:          'rgba(239,68,68,0.07)',
            border:              '1px solid rgba(239,68,68,0.18)',
            backdropFilter:      'blur(12px)',
            WebkitBackdropFilter:'blur(12px)',
            boxShadow:           'inset 0 1px 0 rgba(255,255,255,0.04)',
          }}
        >
          <span className="text-xl font-black text-white">{total}</span>
          <span className="text-xs" style={{ color: '#f87171', opacity: 0.8 }}>total reports</span>
        </div>
        {Object.entries(stats).map(([verdict, count]) => {
          const vs = V[verdict]
          if (!vs) return null
          return (
            <div
              key={verdict}
              className="flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer"
              style={{ background: vs.bg, border: `1px solid ${vs.border}` }}
              onClick={() => applyFilter(verdict)}
            >
              <span className="text-lg font-black" style={{ color: vs.color }}>{count}</span>
              <span className="text-xs" style={{ color: vs.color }}>{vs.label}</span>
            </div>
          )
        })}
      </div>

      {/* ── Search + filters ── */}
      <div className="space-y-4 mb-7">
        {/* Search */}
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none select-none">🔍</span>
          <input
            type="search"
            value={query}
            onChange={(e) => applyQuery(e.target.value)}
            placeholder="Search reports by title or summary…"
            className="input-field w-full pl-11"
          />
        </div>

        {/* Verdict filter tabs */}
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map(({ key, label }) => {
            const vs = V[key]
            const active = filter === key
            return (
              <button
                key={key}
                onClick={() => applyFilter(key)}
                className="text-xs px-3.5 py-1.5 rounded-full font-medium transition-all duration-150 focus:outline-none"
                style={
                  active
                    ? {
                        background: vs ? vs.bg : 'rgba(255,255,255,0.08)',
                        color:      vs ? vs.color : '#f1f5f9',
                        border:     `1px solid ${vs ? vs.border : 'rgba(255,255,255,0.2)'}`,
                      }
                    : {
                        background: 'transparent',
                        color:      '#475569',
                        border:     '1px solid rgba(255,255,255,0.08)',
                      }
                }
              >
                {label}
                {key !== 'ALL' && stats[key] ? (
                  <span className="ml-1.5 opacity-60">{stats[key]}</span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Results count ── */}
      <p className="text-xs text-slate-600 mb-5">
        {total} report{total !== 1 ? 's' : ''} found
        {query && <> matching &ldquo;<span className="text-slate-400">{query}</span>&rdquo;</>}
      </p>

      {/* ── Report list ── */}
      {paged.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="text-5xl mb-5">🗂️</span>
          <h3 className="text-white font-semibold mb-2">No reports found</h3>
          <p className="text-slate-600 text-sm max-w-xs mb-6">
            {query || filter !== 'ALL'
              ? 'Try adjusting your search or clearing the filter.'
              : 'Run a fact-check to generate your first report.'}
          </p>
          <button className="btn-primary px-7 py-3 text-sm" onClick={() => onNavigate('factcheck')}>
            Start Fact Checking →
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {paged.map((r) => (
            <ReportCard key={r.id} report={r} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary text-sm px-4 py-2 disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-slate-600 text-sm px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="btn-secondary text-sm px-4 py-2 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* ── New report CTA ── */}
      <div
        className="mt-12 rounded-2xl p-7 flex flex-col md:flex-row items-center justify-between gap-5"
        style={{
          background:          'linear-gradient(135deg, rgba(239,68,68,0.07) 0%, rgba(20,184,166,0.06) 100%)',
          border:              '1px solid rgba(255,255,255,0.09)',
          backdropFilter:      'blur(16px)',
          WebkitBackdropFilter:'blur(16px)',
          boxShadow:           'inset 0 1px 0 rgba(255,255,255,0.05)',
        }}
      >
        <div>
          <h3 className="text-white font-bold mb-1">Ready to fact-check something new?</h3>
          <p className="text-slate-500 text-sm">Submit a URL, text, or media file for instant AI analysis.</p>
        </div>
        <button
          className="btn-primary shrink-0 px-7 py-3 text-sm"
          onClick={() => onNavigate('factcheck')}
        >
          New Analysis →
        </button>
      </div>
    </div>
  )
}
