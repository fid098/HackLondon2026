interface OrbProps {
  hue?: number
  hoverIntensity?: number
  rotateOnHover?: boolean
  forceHoverState?: boolean
  backgroundColor?: string
}

declare function Orb(props: OrbProps): JSX.Element

export default Orb
