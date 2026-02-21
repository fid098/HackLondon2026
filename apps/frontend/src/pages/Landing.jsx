/**
 * Landing.jsx — Home page shown when the TruthGuard logo is clicked.
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
 * 2. FEATURE CARDS — three glassmorphism cards (AI Suite, Heatmap, Reports)
 * 3. PIPELINE      — "How It Works" 4-step flow diagram + model detail cards
 * 4. DISCLAIMER    — legal disclaimer text
 *
 * WHAT TO IMPROVE (your tasks as Leena)
 * ────────────────────────────────────────
 * - Add a short demo GIF or screenshot above the fold (between sub-headline and CTAs).
 * - Add a social proof section: "Built at HackLondon 2026 · X teams · Y participants".
 * - Add a footer with links (GitHub repo, team info, license).
 * - Add scroll-triggered entrance animations: use IntersectionObserver API or
 *   install Framer Motion (npm i framer-motion) for smooth reveal effects.
 * - Make the tech pills clickable: scroll to the relevant section of the page.
 * - Consider a "dark/light mode" toggle — would require CSS variable overrides.
 */

/* ─── Feature cards data ──────────────────────────────────────────────────── */
// Each object represents one feature card in the "Three layers of truth" section.
//
// Fields:
//   icon        — emoji shown at top of card
//   title       — card heading
//   description — card body text
//   accent      — colour theme: color = text/arrow, dim = semi-transparent bg,
//                               border = card border colour
//   tag         — small badge in top-right corner (e.g. "Core Feature")
//   page        — WHERE the card navigates to when clicked (via onNavigate)
//
// To add a new feature card: add a new object here with a valid `page` value.
// To remove a card: delete the object.
const FEATURES = [
  {
    icon:        '🤖',
    title:       'AI Analysis Suite',
    description: 'One tab for everything: fact-check claims with a multi-agent debate, detect deepfakes in images/audio/video, and scan for scams — all running in parallel.',
    accent:      { color: '#10b981', dim: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.18)' },
    tag:         'Core Feature',
    page:        'analyze',   // clicking navigates to Analyze.jsx
  },
  {
    icon:        '🗺️',
    title:       'Live Heatmap',
    description: 'Real-time world map of misinformation hotspots powered by MongoDB geospatial queries, aggregation pipelines, and Change Streams for live dashboard updates.',
    accent:      { color: '#3b82f6', dim: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.18)' },
    tag:         'Live Data',
    page:        'heatmap',   // clicking navigates to Heatmap.jsx
  },
  {
    icon:        '📊',
    title:       'Report Archive',
    description: 'Every analysis is persisted to MongoDB Atlas. Full-text search, vector similarity search for related claims, and PDF/JSON export for every report.',
    accent:      { color: '#8b5cf6', dim: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.18)' },
    tag:         'Persistent',
    page:        'reports',   // clicking navigates to the Reports page
  },
]

/* ─── AI pipeline steps ──────────────────────────────────────────────────── */
// Displayed as a horizontal sequence of numbered boxes in the "How It Works" section.
// num   — displayed inside the icon box (must be a string, e.g. '01')
// label — bold text under the icon
// sub   — small grey subtitle
//
// To add/remove a pipeline step, edit this array.
// The arrow connectors between steps are rendered automatically.
const PIPELINE_STEPS = [
  { num: '01', label: 'Submit',  sub: 'URL, text, media' },
  { num: '02', label: 'Extract', sub: 'Claims identified' },
  { num: '03', label: 'Debate',  sub: 'Pro vs Con agents' },
  { num: '04', label: 'Verdict', sub: 'Judge synthesizes' },
]

/* ─── Technology stack pills ─────────────────────────────────────────────── */
// Small monospace labels displayed in the hero section below the CTAs.
// These are purely decorative — they don't link to anything.
// To add/remove a tech: edit this array.
const TECH_PILLS = [
  'Gemini 1.5 Pro', 'MongoDB Atlas', 'Vector Search',
  'Geospatial', 'Change Streams', 'FastAPI',
]

/* ─── Landing page component ─────────────────────────────────────────────── */
// onNavigate is passed down from App.jsx and switches the displayed page.
// This component has NO internal state — it is a fully static presentation page.
export default function Landing({ onNavigate }) {
  return (
    <div className="relative overflow-x-hidden">

      {/* ── Background orbs ──
           Three blurred gradient circles positioned behind all content.
           fixed = they don't scroll with the page.
           pointer-events-none = they don't block user clicks.
           To change a colour: swap 'orb-green' → 'orb-blue', 'orb-violet', etc.
           Colour CSS variables are defined in index.css.
           To move/resize: adjust width/height/top/left/right/bottom/opacity. */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="orb orb-green"  style={{ width: 700, height: 700, top: '-15%', left: '-15%',  opacity: 0.12 }} />
        <div className="orb orb-violet" style={{ width: 600, height: 600, top: '40%',  right: '-20%', opacity: 0.10 }} />
        <div className="orb orb-blue"   style={{ width: 500, height: 500, bottom: '-10%', left: '30%', opacity: 0.08 }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-5">

        {/* ══════════════════ HERO SECTION ══════════════════ */}
        {/* Full-height section — min-h-[90vh] keeps it nearly full screen. */}
        {/* gap-7 controls vertical spacing between each child element. */}
        <section className="min-h-[90vh] flex flex-col items-center justify-center text-center py-24 gap-7">

          {/* Animated badge — the pulsing dot makes it feel "live" */}
          <div
            className="inline-flex items-center gap-2.5 px-5 py-2 rounded-full text-sm font-medium text-emerald-400"
            style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)' }}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            Built for HackLondon 2026 · Powered by Gemini 1.5 Pro
          </div>

          {/* Hero heading — "gradient-text" applies the green→blue gradient (see index.css) */}
          <h1
            className="text-6xl md:text-7xl lg:text-[88px] font-extrabold tracking-tighter leading-[1.03] max-w-4xl"
          >
            <span style={{ color: '#f1f5f9' }}>Detect</span>{' '}
            <span className="gradient-text">Misinformation</span>
            <br />
            <span style={{ color: '#f1f5f9' }}>Before It </span>
            <span style={{ color: '#334155' }}>Spreads</span>
          </h1>

          {/* Sub-headline — one sentence describing TruthGuard */}
          <p className="text-xl text-slate-400 max-w-2xl leading-relaxed">
            TruthGuard uses multi-agent AI debates, deepfake detection, and real-time
            geospatial heatmaps to help you navigate the information landscape with confidence.
          </p>

          {/* CTA buttons
               btn-primary = filled green button (index.css)
               btn-secondary = ghost/outline button (index.css)
               onNavigate('analyze') / onNavigate('heatmap') triggers page switch in App.jsx */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
            <button
              className="btn-primary text-base px-9 py-4"
              onClick={() => onNavigate('analyze')}
            >
              Start Analysing →
            </button>
            <button
              className="btn-secondary text-base px-9 py-4"
              onClick={() => onNavigate('heatmap')}
            >
              View Live Heatmap
            </button>
          </div>

          {/* Technology stack pills — purely decorative labels */}
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

          {/* Scroll indicator — gradient line fading to transparent */}
          <div className="pt-8 flex flex-col items-center gap-2 text-slate-700">
            <span className="text-xs tracking-widest uppercase">Scroll to explore</span>
            <div
              className="w-0.5 h-10 rounded-full"
              style={{ background: 'linear-gradient(to bottom, rgba(16,185,129,0.4), transparent)' }}
            />
          </div>
        </section>

        {/* ══════════════════ FEATURE CARDS SECTION ══════════════════ */}
        {/* Three glassmorphism cards from the FEATURES array above.
            Each card lifts on hover (translateY -5px) and navigates on click. */}
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
                  background:      f.accent.dim,          // semi-transparent tinted background
                  border:          `1px solid ${f.accent.border}`,
                  backdropFilter:  'blur(14px)',           // glassmorphism blur effect
                  transition:      'transform 0.25s, box-shadow 0.25s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform  = 'translateY(-5px)'
                  e.currentTarget.style.boxShadow  = `0 20px 50px ${f.accent.dim}`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform  = 'translateY(0)'
                  e.currentTarget.style.boxShadow  = 'none'
                }}
                onClick={() => onNavigate(f.page)}        // navigate to the feature's page
              >
                {/* Large number watermark in the background ("01", "02", "03") */}
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

        {/* ══════════════════ PIPELINE SECTION ══════════════════ */}
        {/* Visualises the 4-step AI debate pipeline.
            Arrows between steps are hidden on mobile (hidden md:block). */}
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
                  {/* Arrow connector between steps — hidden on mobile */}
                  {i < PIPELINE_STEPS.length - 1 && (
                    <div className="text-slate-700 text-xl font-light mb-6 hidden md:block">→</div>
                  )}
                </div>
              ))}
            </div>

            {/* Model cards — which AI / DB handles each stage */}
            <div
              className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-4 text-center"
            >
              {[
                { model: 'Gemini Flash',   role: 'Quick triage · Chrome extension',             color: '#10b981' },
                { model: 'Gemini 1.5 Pro', role: 'Deep analysis · Agent debate · Multimodal',   color: '#34d399' },
                { model: 'MongoDB Atlas',  role: 'Vector search · Geo · Change Streams',        color: '#8b5cf6' },
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
        {/* Legal disclaimer — keep this visible per the project brief.
            section-divider is a thin horizontal line (defined in index.css). */}
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
