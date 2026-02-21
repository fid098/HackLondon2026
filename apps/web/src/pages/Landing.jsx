/**
 * Landing.jsx — Home page shown when the TruthGuard logo is clicked.
 *
 * Design goals:
 *   - Full-height hero with animated gradient orbs
 *   - Gradient headline, animated badge
 *   - CTA buttons wired to state-based nav
 *   - Feature cards with glassmorphism
 *   - AI pipeline walkthrough
 *   - Prominent disclaimer
 */

const FEATURES = [
  {
    icon:        '🤖',
    title:       'AI Agent Debate',
    description: 'Two opposing Gemini 1.5 Pro agents research and debate any claim. A third "Judge" agent synthesizes a verdict with cited sources and confidence scores.',
    accent:      { color: '#10b981', dim: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
    tag:         'Core Feature',
    page:        'factcheck',
  },
  {
    icon:        '🗺️',
    title:       'Live Heatmap',
    description: 'Real-time world map of misinformation hotspots powered by MongoDB geospatial queries, aggregation pipelines, and Change Streams for live dashboard updates.',
    accent:      { color: '#3b82f6', dim: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)' },
    tag:         'Live Data',
    page:        'heatmap',
  },
  {
    icon:        '📊',
    title:       'Report Archive',
    description: 'Every analysis is persisted to MongoDB Atlas. Full-text search, vector similarity search for related claims, and PDF/JSON export for every report.',
    accent:      { color: '#8b5cf6', dim: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.18)' },
    tag:         'Persistent',
    page:        'reports',
  },
]

const PIPELINE_STEPS = [
  { num: '01', label: 'Submit',  sub: 'URL, text, media' },
  { num: '02', label: 'Extract', sub: 'Claims identified' },
  { num: '03', label: 'Debate',  sub: 'Pro vs Con agents' },
  { num: '04', label: 'Verdict', sub: 'Judge synthesizes' },
]

const TECH_PILLS = [
  'Gemini 1.5 Pro', 'MongoDB Atlas', 'Vector Search',
  'Geospatial', 'Change Streams', 'FastAPI',
]

export default function Landing({ onNavigate }) {
  return (
    <div className="relative overflow-x-hidden">

      {/* ── Background orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="orb orb-green"  style={{ width: 700, height: 700, top: '-15%', left: '-15%',  opacity: 0.12 }} />
        <div className="orb orb-violet" style={{ width: 600, height: 600, top: '40%',  right: '-20%', opacity: 0.10 }} />
        <div className="orb orb-blue"   style={{ width: 500, height: 500, bottom: '-10%', left: '30%', opacity: 0.08 }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-5">

        {/* ══════════════════ HERO ══════════════════ */}
        <section className="min-h-[90vh] flex flex-col items-center justify-center text-center py-24 gap-7">

          {/* Animated badge */}
          <div
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-sm font-medium text-emerald-400"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            Built for HackLondon 2026 · Powered by Gemini 1.5 Pro
          </div>

          {/* Hero heading */}
          <h1
            className="text-6xl md:text-7xl lg:text-[88px] font-extrabold tracking-tighter leading-[1.03] max-w-4xl"
          >
            <span style={{ color: '#f1f5f9' }}>Detect</span>{' '}
            <span className="gradient-text">Misinformation</span>
            <br />
            <span style={{ color: '#f1f5f9' }}>Before It </span>
            <span style={{ color: '#334155' }}>Spreads</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">
            TruthGuard uses multi-agent AI debates, deepfake detection, and real-time
            geospatial heatmaps to help you navigate the information landscape with confidence.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
            <button
              className="btn-primary text-base px-9 py-4"
              onClick={() => onNavigate('factcheck')}
            >
              Start Fact Checking →
            </button>
            <button
              className="btn-secondary text-base px-9 py-4"
              onClick={() => onNavigate('heatmap')}
            >
              View Live Heatmap
            </button>
          </div>

          {/* Tech pills */}
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {TECH_PILLS.map((p) => (
              <span
                key={p}
                className="text-xs font-mono text-slate-600 px-3 py-1 rounded-full"
                style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
              >
                {p}
              </span>
            ))}
          </div>

          {/* Scroll indicator */}
          <div className="pt-8 flex flex-col items-center gap-2 text-slate-700">
            <span className="text-xs tracking-widest uppercase">Scroll to explore</span>
            <div
              className="w-0.5 h-10 rounded-full"
              style={{ background: 'linear-gradient(to bottom, rgba(16,185,129,0.4), transparent)' }}
            />
          </div>
        </section>

        {/* ══════════════════ FEATURE CARDS ══════════════════ */}
        <section className="pb-24">
          <div className="text-center mb-14">
            <p className="text-xs text-emerald-500 uppercase tracking-[3px] font-semibold mb-3">
              Platform Features
            </p>
            <h2 className="text-4xl font-bold text-white mb-3">Three layers of truth</h2>
            <p className="text-slate-500">AI-powered detection at every level</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="relative rounded-2xl p-7 cursor-pointer overflow-hidden"
                style={{
                  background:   f.accent.dim,
                  border:       `1px solid ${f.accent.border}`,
                  backdropFilter: 'blur(14px)',
                  transition:   'transform 0.25s, box-shadow 0.25s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform  = 'translateY(-5px)'
                  e.currentTarget.style.boxShadow  = `0 20px 50px ${f.accent.dim}`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform  = 'translateY(0)'
                  e.currentTarget.style.boxShadow  = 'none'
                }}
                onClick={() => onNavigate(f.page)}
              >
                {/* Step number watermark */}
                <div
                  className="absolute top-4 right-6 text-7xl font-black select-none"
                  style={{ color: f.accent.border, lineHeight: 1 }}
                >
                  0{i + 1}
                </div>

                <div className="flex items-start justify-between mb-6">
                  <span className="text-4xl">{f.icon}</span>
                  <span
                    className="text-xs font-medium px-2.5 py-1 rounded-full"
                    style={{ background: 'rgba(255,255,255,0.05)', color: '#64748b', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {f.tag}
                  </span>
                </div>

                <h3 className="text-xl font-bold text-white mb-2">{f.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{f.description}</p>

                <div className="mt-6 flex items-center gap-2" style={{ color: f.accent.color, fontSize: 13, fontWeight: 600 }}>
                  Explore →
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════ PIPELINE ══════════════════ */}
        <section className="pb-24">
          <div
            className="rounded-2xl p-10 md:p-14"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="text-center mb-12">
              <p className="text-xs text-emerald-500 uppercase tracking-[3px] font-semibold mb-3">
                How It Works
              </p>
              <h3 className="text-3xl font-bold text-white">The AI Debate Pipeline</h3>
            </div>

            {/* Steps row */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.num} className="flex items-center gap-3">
                  <div className="text-center">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3"
                      style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}
                    >
                      <span className="text-emerald-400 font-bold text-sm">{step.num}</span>
                    </div>
                    <div className="text-white font-semibold text-sm">{step.label}</div>
                    <div className="text-slate-600 text-xs mt-0.5">{step.sub}</div>
                  </div>
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="text-slate-700 text-xl font-light mb-6 hidden md:block">→</div>
                  )}
                </div>
              ))}
            </div>

            {/* Model detail */}
            <div
              className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 text-center"
            >
              {[
                { model: 'Gemini Flash', role: 'Quick triage · Chrome extension', color: '#10b981' },
                { model: 'Gemini 1.5 Pro', role: 'Deep analysis · Agent debate · Multimodal', color: '#34d399' },
                { model: 'MongoDB Atlas', role: 'Vector search · Geo · Change Streams', color: '#8b5cf6' },
              ].map((m) => (
                <div
                  key={m.model}
                  className="rounded-xl p-5"
                  style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                >
                  <div className="font-mono font-bold mb-1" style={{ color: m.color }}>{m.model}</div>
                  <div className="text-xs text-slate-600">{m.role}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ══════════════════ DISCLAIMER ══════════════════ */}
        <section className="pb-16 text-center">
          <div className="section-divider" />
          <p className="text-xs text-slate-700 max-w-lg mx-auto mt-8 leading-relaxed">
            TruthGuard provides <em>probabilistic assessments only</em> and is not guaranteed to
            be accurate. Results should not be the sole basis for any decision. Always verify
            with primary sources and consult professionals where appropriate.
          </p>
        </section>

      </div>
    </div>
  )
}
