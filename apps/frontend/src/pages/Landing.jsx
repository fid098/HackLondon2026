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
 * - Brand accent: #ef4444 (red) — used for CTAs, labels, hero gradient
 * - Background shapes: Framer Motion parallax shapes on scroll
 * - Buttons: className="btn-primary" or "btn-secondary" — defined in index.css
 *
 * SECTIONS IN ORDER
 * ──────────────────
 * 1. HERO             — headline, sub-headline, CTA buttons
 * 2. PROBLEM + SOLUTION
 * 3. SDG / IMPACT CARDS
 * 4. LOCAL GOVERNANCE / PHYSICAL TRUST
 *
 * WHAT TO IMPROVE (your tasks as Leena)
 * ────────────────────────────────────────
 * - Add a short demo GIF or screenshot above the fold (between sub-headline and CTAs).
 * - Add a social proof section: "Built at HackLondon 2026 · X teams · Y participants".
 * - Add a footer with links (GitHub repo, team info, license).
 * - Make the tech pills clickable: scroll to the relevant section of the page.
 * - Consider a "dark/light mode" toggle — would require CSS variable overrides.
 */

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'

export default function Landing({ onNavigate }) {
  const containerRef = useRef(null)
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  })

  /* Declare every parallax transform at the top level (Rules of Hooks) */
  const y1 = useTransform(scrollYProgress, [0, 1], [0, -250])
  const y2 = useTransform(scrollYProgress, [0, 1], [0, 200])
  const y3 = useTransform(scrollYProgress, [0, 1], [0, -180])
  const y4 = useTransform(scrollYProgress, [0, 1], [0, 150])
  const y5 = useTransform(scrollYProgress, [0, 1], [0, -200])
  const y6 = useTransform(scrollYProgress, [0, 1], [0, 250])
  const shapeOpacity = useTransform(scrollYProgress, [0.7, 1], [1, 0])

  return (
    <div ref={containerRef} className="relative text-white">

      {/* ── Floating shapes layer ── */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <motion.div style={{ y: y1, opacity: shapeOpacity }}
          className="absolute top-10 left-[-8rem] w-96 h-96 rounded-full bg-red-700/20 blur-2xl" />
        <motion.div style={{ y: y2, opacity: shapeOpacity }}
          className="absolute top-[40vh] right-[-10rem] w-80 h-80 rounded-full bg-red-500/15 blur-3xl" />
        <motion.div style={{ y: y3, opacity: shapeOpacity }}
          className="absolute bottom-[5vh] left-1/4 w-72 h-72 rounded-full bg-red-900/20 blur-2xl" />
        <motion.div style={{ y: y4, opacity: shapeOpacity }}
          className="absolute top-[25vh] left-1/2 w-64 h-64 rounded-full bg-red-600/20 blur-2xl" />
        <motion.div style={{ y: y5, opacity: shapeOpacity }}
          className="absolute top-[10vh] right-1/3 w-80 h-80 rounded-full bg-red-700/15 blur-2xl" />
        <motion.div style={{ y: y6, opacity: shapeOpacity }}
          className="absolute bottom-[10vh] right-1/3 w-72 h-72 rounded-full bg-red-800/20 blur-2xl" />
      </div>

      {/* ── Main content ── */}
      <div className="relative z-10">

        {/* ══════════════════ HERO ══════════════════ */}
        <section className="min-h-[calc(100svh-88px)] flex items-center justify-center px-6 md:px-16">
          <div className="max-w-6xl mx-auto w-full text-center">
            <h1 className="leading-none font-extrabold">
              <span className="block text-white text-4xl md:text-6xl lg:text-7xl">REALITY</span>
              <span className="block text-red-600  text-4xl md:text-6xl lg:text-7xl">CAN BE</span>
              <span className="block text-red-700  text-4xl md:text-6xl lg:text-7xl">FABRICATED.</span>
            </h1>
            <p className="mt-8 max-w-2xl mx-auto text-gray-400 text-base md:text-lg">
              Deepfake officials. Forged planning notices. Synthetic infrastructure
              failures. In smart cities, misinformation becomes physical risk.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => onNavigate('analyze')}
                className="bg-gradient-to-r from-red-500 to-red-700 hover:scale-105 transition-transform px-8 py-3 rounded-md font-medium"
              >
                Launch Verification →
              </button>
              <button
                onClick={() => onNavigate('heatmap')}
                className="border border-gray-600 hover:border-red-500 transition-colors px-8 py-3 rounded-md text-gray-300"
              >
                View Global Heatmap
              </button>
            </div>
          </div>
        </section>

        {/* ══════════════════ PROBLEM + SOLUTION ══════════════════ */}
        <Section>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div>
              <h2 className="text-3xl md:text-5xl font-bold mb-6">
                The Next Infrastructure Threat
              </h2>
              <p className="text-gray-400 mb-4">
                Hyper-realistic AI-generated media — deepfakes, synthetic voices, falsified images —
                is spreading faster than detection tools. Truth is no longer self-evident.
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-2">
                <li>Election interference &amp; social instability</li>
                <li>Impossible to distinguish real vs AI-generated media</li>
                <li>Real-time verification needed for autonomous agents &amp; civic trust</li>
              </ul>
            </div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="p-6 rounded-xl border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <h3 className="text-red-400 font-semibold text-lg mb-2">Shadow Planning</h3>
              <p className="text-gray-300">
                Fake digital notices can manipulate property prices, creating chaos in local governance.
              </p>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════ SDG / IMPACT CARDS ══════════════════ */}
        <Section>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">Protecting People &amp; Cities</h2>
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl">
            <ImpactCard
              goal="Goal 3: Health &amp; Wellbeing"
              description="Fake medical scans &amp; insurance claims are flagged to reduce misinformation."
            />
            <ImpactCard
              goal="Goal 4: Quality Education"
              description="AI-generated certificates verified to prevent fraud."
            />
            <ImpactCard
              goal="Goal 8: Work &amp; Economic Growth"
              description="False claims evidence is validated to protect employers &amp; insurers."
            />
            <ImpactCard
              goal="Goal 16: Justice &amp; Government"
              description="Falsified statistics and climate denial misinformation are identified to protect democracy."
            />
          </div>
        </Section>

        {/* ══════════════════ LOCAL GOVERNANCE / PHYSICAL TRUST ══════════════════ */}
        <Section>
          <h2 className="text-3xl md:text-5xl font-bold mb-6">
            Physical Trust &amp; Local Governance
          </h2>
          <div className="grid md:grid-cols-2 gap-10 items-center">
            <div className="space-y-4">
              <p className="text-gray-400">
                Everything — from planning notices to mayoral announcements — could be faked.
                TruthGuard distinguishes between "Flagged as Fake" and "Unauthenticated".
              </p>
              <ul className="list-disc list-inside text-gray-400 space-y-2">
                <li>Fabricated infrastructure failures: fake bridge collapses</li>
                <li>Shadow planning affecting property markets</li>
                <li>Liar's dividend: scandals denied via AI excuses</li>
                <li>Physical Reality Anchors: QR codes verify real-world locations</li>
              </ul>
            </div>
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="p-6 rounded-xl border"
              style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
            >
              <h3 className="text-red-400 font-semibold text-lg mb-2">Future-Proof Civic Trust</h3>
              <p className="text-gray-300">
                Interactive verification ensures all citizens can trust critical information,
                even in smart cities.
              </p>
            </motion.div>
          </div>
        </Section>

        {/* ══════════════════ BOTTOM PADDING ══════════════════ */}
        <div className="h-16" />

      </div>
    </div>
  )
}

/* ─── Section wrapper with scroll-triggered fade-in ─────────────────────── */
function Section({ children }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 80 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8 }}
      viewport={{ once: true, amount: 0.3 }}
      className="py-16 md:py-20 px-6 md:px-16 relative z-10"
    >
      <div className="max-w-6xl mx-auto w-full space-y-8">{children}</div>
    </motion.section>
  )
}

/* ─── SDG impact card ────────────────────────────────────────────────────── */
function ImpactCard({ goal, description }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="p-6 rounded-xl border transition-transform"
      style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}
    >
      <h3 className="text-red-400 font-semibold text-lg mb-2">{goal}</h3>
      <p className="text-gray-300 text-base">{description}</p>
    </motion.div>
  )
}
