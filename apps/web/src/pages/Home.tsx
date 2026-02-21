/**
 * Home — Landing page.
 *
 * Communicates the product value proposition and links to the key features.
 * The API status badge at the bottom gives developers quick visual feedback
 * that the backend is reachable.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { checkHealth } from '../lib/api'

interface Feature {
  icon: string
  title: string
  description: string
  href: string
  phase: string
  available: boolean
}

const FEATURES: Feature[] = [
  {
    icon: '🤖',
    title: 'AI Agent Debate',
    description:
      'Two opposing Gemini agents research a claim, debate it, and a judge synthesizes a verdict with cited sources.',
    href: '/factcheck',
    phase: 'Phase 2',
    available: false,
  },
  {
    icon: '🗺️',
    title: 'Misinformation Heatmap',
    description:
      'Real-time world map of misinformation hotspots by region, category, and confidence — powered by MongoDB geospatial.',
    href: '/heatmap',
    phase: 'Phase 3',
    available: false,
  },
  {
    icon: '🎭',
    title: 'Deepfake Detection',
    description:
      'Triple-check pipeline: CNN baseline + HuggingFace model + Gemini VLM for images, audio, and video.',
    href: '/deepfake',
    phase: 'Phase 5',
    available: false,
  },
  {
    icon: '🛡️',
    title: 'Scam Detector',
    description:
      'RoBERTa + XGBoost classifier to detect scam messages and phishing emails with confidence scores.',
    href: '/scam',
    phase: 'Phase 6',
    available: false,
  },
  {
    icon: '🔌',
    title: 'Chrome Extension',
    description:
      'Non-disruptive misinformation flags on X and Instagram. Highlight text to instantly request analysis.',
    href: '#',
    phase: 'Phase 4',
    available: false,
  },
  {
    icon: '📊',
    title: 'Trending Narratives',
    description:
      'Live dashboard of top false narratives per region and category, updated via MongoDB Change Streams.',
    href: '/heatmap',
    phase: 'Phase 3',
    available: false,
  },
]

type ApiStatus = 'checking' | 'ok' | 'error'

export default function Home() {
  const [apiStatus, setApiStatus] = useState<ApiStatus>('checking')

  useEffect(() => {
    checkHealth()
      .then(() => setApiStatus('ok'))
      .catch(() => setApiStatus('error'))
  }, [])

  return (
    <div className="space-y-16">
      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-12 pb-6 space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10
                        border border-brand-500/20 text-brand-400 text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
          Built for HackLondon 2026
        </div>

        <h1 className="text-5xl md:text-6xl font-bold text-white leading-tight max-w-3xl">
          Fight Misinformation with{' '}
          <span className="text-brand-400">AI-Powered Truth</span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl leading-relaxed">
          TruthGuard uses AI agent debates, deepfake detection, and real-time geospatial
          heatmaps to help you navigate the information landscape with confidence.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Link to="/factcheck" className="btn-primary text-base">
            Start Fact Checking
          </Link>
          <Link to="/heatmap" className="btn-secondary text-base">
            View Heatmap
          </Link>
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-gray-600 max-w-lg">
          Results are probabilistic and not guaranteed. Always verify with primary sources.
        </p>
      </section>

      {/* Feature grid */}
      <section aria-labelledby="features-heading">
        <h2
          id="features-heading"
          className="text-2xl font-bold text-white text-center mb-8"
        >
          What TruthGuard can do
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card hover:border-gray-600 transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <span className="text-3xl" role="img" aria-label={feature.title}>
                  {feature.icon}
                </span>
                <span className="text-xs text-gray-500 bg-gray-700/50 px-2 py-1 rounded-full">
                  {feature.phase}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">{feature.description}</p>
              {feature.available ? (
                <Link
                  to={feature.href}
                  className="text-brand-400 text-sm font-medium hover:text-brand-300 transition-colors"
                >
                  Try it →
                </Link>
              ) : (
                <span className="text-gray-600 text-sm">Coming soon</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* API status indicator — useful for developers */}
      <section className="flex justify-center pb-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">API status:</span>
          {apiStatus === 'checking' && (
            <span className="text-gray-400">Checking...</span>
          )}
          {apiStatus === 'ok' && (
            <span className="flex items-center gap-1 text-brand-400">
              <span className="w-2 h-2 rounded-full bg-brand-400" />
              Connected
            </span>
          )}
          {apiStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-2 h-2 rounded-full bg-red-400" />
              Unreachable — is the API running?
            </span>
          )}
        </div>
      </section>
    </div>
  )
}
