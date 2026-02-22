/**
 * Landing.jsx — Home page shown when the Verify logo is clicked.
 *
 * DEVELOPER: Leena
 * ─────────────────────────────────────────────────────────────────────────────
 * This is your main frontend file. It owns the landing page design and layout.
 *
 * This component receives ONE prop:
 *   onNavigate(page: string) — call this to navigate to another page.
 *   Valid page values: 'analyze', 'heatmap', 'reports'
 *   These map to routes in App.jsx → PAGES object.
 *   Example: onNavigate('analyze') → shows the Analyze page.
 *
 * DESIGN SYSTEM NOTES
 * ────────────────────
 * - Background orbs: <div className="orb orb-green"> — see index.css .orb
 *   These are blurred radial gradients. Control size with width/height,
 *   position with top/left/right/bottom, intensity with opacity.
 * - Glassmorphism cards: background rgba(255,255,255,0.02) + backdropFilter blur
 * - Gradient headline text: className="gradient-text" — defined in index.css
 * - Buttons: className="btn-primary" or "btn-secondary" — defined in index.css
 * - Section divider: className="section-divider" — defined in index.css
 *
 * SECTIONS IN ORDER
 * ──────────────────
 * 1. HERO          — headline, sub-headline, CTA buttons, tech pills, scroll indicator
 * 2. STATS BAR     — 4 highlight numbers
 * 3. FEATURE CARDS — three glassmorphism cards (AI Suite, Heatmap, Reports)
 * 4. PIPELINE      — "How It Works" 4-step flow diagram + model detail cards
 * 5. DISCLAIMER    — legal disclaimer text
 */

/* ─── Feature cards data ──────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon:        '🤖',
    title:       'AI Analysis Suite',
    description: 'One tab for everything: fact-check claims with a multi-agent debate, detect deepfakes in images/audio/video, and scan for scams — all running in parallel.',
    accent:      { color: '#818cf8', dim: 'rgba(99,102,241,0.07)', border: 'rgba(99,102,241,0.18)' },
    tag:         'Core Feature',
    page:        'analyze',
    capabilities: ['Multi-agent debate', 'Deepfake detection', 'Scam scanner'],
  },
  {
    icon:        '🌐',
    title:       'Live Intelligence Map',
    description: 'Real-time world map of misinformation hotspots powered by MongoDB geospatial queries, aggregation pipelines, and Change Streams for live dashboard updates.',
    accent:      { color: '#38bdf8', dim: 'rgba(56,189,248,0.07)', border: 'rgba(56,189,248,0.18)' },
    tag:         'Live Data',
    page:        'heatmap',
    capabilities: ['3D globe view', 'Narrative arcs', 'Hotspot tracking'],
  },
  {
    icon:        '📊',
    title:       'Report Archive',
    description: 'Every analysis is persisted to MongoDB Atlas. Full-text search, vector similarity search for related claims, and PDF/JSON export for every report.',
    accent:      { color: '#a78bfa', dim: 'rgba(167,139,250,0.07)', border: 'rgba(167,139,250,0.18)' },
    tag:         'Persistent',
    page:        'reports',
    capabilities: ['Vector similarity', 'Full-text search', 'Export reports'],
  },
]

/* ─── Stats bar ──────────────────────────────────────────────────────────── */
const STATS = [
  { value: '3+',    label: 'AI Models',        color: '#818cf8' },
  { value: '< 10s', label: 'Analysis Time',    color: '#38bdf8' },
  { value: '4',     label: 'Detection Layers', color: '#a78bfa' },
  { value: '24/7',  label: 'Live Monitoring',  color: '#34d399' },
]

/* ─── AI pipeline steps ──────────────────────────────────────────────────── */
const PIPELINE_STEPS = [
  { num: '01', label: 'Submit',  sub: 'URL, text, media', icon: '📎' },
  { num: '02', label: 'Extract', sub: 'Claims identified', icon: '🔍' },
  { num: '03', label: 'Debate',  sub: 'Pro vs Con agents', icon: '⚡' },
  { num: '04', label: 'Verdict', sub: 'Judge synthesizes', icon: '✅' },
]

/* ─── Technology stack pills ─────────────────────────────────────────────── */
const TECH_PILLS = [
  'Gemini 1.5 Pro', 'MongoDB Atlas', 'Vector Search',
  'Geospatial', 'Change Streams', 'FastAPI',
]

/* ─── Landing page component ─────────────────────────────────────────────── */
export default function Landing({ onNavigate }) {
  return (
    <div className="relative overflow-x-hidden">

      {/* ── Background orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="orb orb-violet" style={{ width: 800, height: 800, top: '-20%', left: '-20%',  opacity: 0.10 }} />
        <div className="orb orb-blue"   style={{ width: 650, height: 650, top: '35%',  right: '-18%', opacity: 0.09 }} />
        <div className="orb orb-green"  style={{ width: 500, height: 500, bottom: '-12%', left: '25%', opacity: 0.07 }} />
      </div>

      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage: 'linear-gradient(rgba(99,102,241,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-5">

        {/* ══════════════════ HERO SECTION ══════════════════ */}
        <section className="min-h-[90vh] flex flex-col items-center justify-center text-center py-24 gap-7">

          {/* Live badge */}
          <div
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-sm font-medium"
            style={{
              background: 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.22)',
              color: '#a5b4fc',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse shrink-0" />
            Built for HackLondon 2026 · Powered by Gemini 1.5 Pro
          </div>

          {/* Hero heading */}
          <h1 className="text-6xl md:text-7xl lg:text-[88px] font-extrabold tracking-tighter leading-[1.03] max-w-4xl">
            <span style={{ color: '#f1f5f9' }}>Detect</span>{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, #818cf8, #38bdf8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Misinformation
            </span>
            <br />
            <span style={{ color: '#f1f5f9' }}>Before It </span>
            <span style={{ color: '#334155' }}>Spreads</span>
          </h1>

          {/* Sub-headline */}
          <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">
            Verify uses multi-agent AI debates, deepfake detection, and real-time
            geospatial intelligence to help you navigate the information landscape with confidence.
          </p>

          {/* CTA buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
            <button
              onClick={() => onNavigate('analyze')}
              className="text-base px-9 py-4 rounded-xl font-semibold transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                color: 'white',
                boxShadow: '0 0 0 0 rgba(99,102,241,0)',
                border: '1px solid rgba(99,102,241,0.4)',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 0 28px rgba(99,102,241,0.45)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 0 0 0 rgba(99,102,241,0)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Start Analysing →
            </button>
            <button
              onClick={() => onNavigate('heatmap')}
              className="text-base px-9 py-4 rounded-xl font-semibold transition-all duration-200 text-slate-300 hover:text-white"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                transition: 'background 0.2s, border-color 0.2s, transform 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.07)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              View Live Heatmap
            </button>
          </div>

          {/* Technology stack pills */}
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
              style={{ background: 'linear-gradient(to bottom, rgba(99,102,241,0.5), transparent)' }}
            />
          </div>
        </section>

        {/* ══════════════════ STATS BAR ══════════════════ */}
        <section className="pb-20">
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 rounded-2xl p-1"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {STATS.map((s) => (
              <div
                key={s.label}
                className="flex flex-col items-center justify-center py-7 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <span
                  className="text-4xl font-extrabold tracking-tight mb-1"
                  style={{ color: s.color }}
                >
                  {s.value}
                </span>
                <span className="text-xs text-slate-600 uppercase tracking-widest font-medium">
                  {s.label}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════ FEATURE CARDS SECTION ══════════════════ */}
        <section className="pb-24">
          <div className="text-center mb-14">
            <p
              className="text-xs uppercase tracking-[3px] font-semibold mb-3"
              style={{ color: '#818cf8' }}
            >
              Platform Features
            </p>
            <h2 className="text-4xl font-bold text-white mb-3">Three layers of truth</h2>
            <p className="text-slate-500">AI-powered detection at every level</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="relative rounded-2xl p-7 cursor-pointer overflow-hidden flex flex-col"
                style={{
                  background:     f.accent.dim,
                  border:         `1px solid ${f.accent.border}`,
                  backdropFilter: 'blur(14px)',
                  transition:     'transform 0.25s, box-shadow 0.25s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform  = 'translateY(-6px)'
                  e.currentTarget.style.boxShadow  = `0 24px 60px ${f.accent.dim}`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform  = 'translateY(0)'
                  e.currentTarget.style.boxShadow  = 'none'
                }}
                onClick={() => onNavigate(f.page)}
              >
                {/* Large number watermark */}
                <div
                  className="absolute top-4 right-6 text-7xl font-black select-none pointer-events-none"
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
                <p className="text-slate-400 text-sm leading-relaxed flex-1">{f.description}</p>

                {/* Capability bullets */}
                <div className="mt-5 flex flex-col gap-1.5">
                  {f.capabilities.map((cap) => (
                    <div key={cap} className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: f.accent.color }}
                      />
                      <span className="text-xs text-slate-500">{cap}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-2 text-[13px] font-semibold" style={{ color: f.accent.color }}>
                  Explore →
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══════════════════ PIPELINE SECTION ══════════════════ */}
        <section className="pb-24">
          <div
            className="rounded-2xl p-10 md:p-14"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            <div className="text-center mb-12">
              <p className="text-xs uppercase tracking-[3px] font-semibold mb-3" style={{ color: '#818cf8' }}>
                How It Works
              </p>
              <h3 className="text-3xl font-bold text-white">The AI Debate Pipeline</h3>
              <p className="text-slate-600 text-sm mt-2">Four stages from submission to verified verdict</p>
            </div>

            {/* Steps row */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {PIPELINE_STEPS.map((step, i) => (
                <div key={step.num} className="flex items-center gap-3">
                  <div className="text-center">
                    <div
                      className="w-16 h-16 rounded-2xl flex flex-col items-center justify-center mx-auto mb-3 relative"
                      style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
                    >
                      <span className="text-lg mb-0.5">{step.icon}</span>
                      <span className="text-indigo-400 font-bold text-[10px] opacity-60">{step.num}</span>
                    </div>
                    <div className="text-white font-semibold text-sm">{step.label}</div>
                    <div className="text-slate-600 text-xs mt-0.5">{step.sub}</div>
                  </div>
                  {/* Arrow connector */}
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="text-slate-700 text-xl font-light mb-6 hidden md:block">→</div>
                  )}
                </div>
              ))}
            </div>

            {/* Model cards */}
            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
              {[
                { model: 'Gemini Flash',   role: 'Quick triage · Chrome extension',           color: '#818cf8' },
                { model: 'Gemini 1.5 Pro', role: 'Deep analysis · Agent debate · Multimodal', color: '#38bdf8' },
                { model: 'MongoDB Atlas',  role: 'Vector search · Geo · Change Streams',      color: '#a78bfa' },
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

        {/* ══════════════════ DISCLAIMER SECTION ══════════════════ */}
        <section className="pb-16 text-center">
          <div className="section-divider" />
          <p className="text-xs text-slate-700 max-w-lg mx-auto mt-8 leading-relaxed">
            Verify provides <em>probabilistic assessments only</em> and is not guaranteed to
            be accurate. Results should not be the sole basis for any decision. Always verify
            with primary sources and consult professionals where appropriate.
          </p>
        </section>

      </div>
    </div>
  )
}
