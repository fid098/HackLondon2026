import Dither from './Dither'

const WAVE_COLOR = [0.807843137254902, 0.23137254901960785, 0.2901960784313726]

export default function AppDitherBackground() {
  // WebGL effects are skipped in tests for stable jsdom runs.
  if (import.meta.env.MODE === 'test') {
    return <div className="app-dither-bg" aria-hidden />
  }

  const reduceMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches

  return (
    <div className="app-dither-bg" aria-hidden>
      <Dither
        waveColor={WAVE_COLOR}
        disableAnimation={reduceMotion}
        enableMouseInteraction={false}
        mouseRadius={0.8}
        colorNum={4}
        pixelSize={1}
        waveAmplitude={0.3}
        waveFrequency={3}
        waveSpeed={0.04}
      />
    </div>
  )
}
