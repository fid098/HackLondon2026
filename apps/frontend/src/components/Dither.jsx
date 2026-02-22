/* eslint-disable react/no-unknown-property */
import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

import './Dither.css'

const vertexShader = `
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
precision highp float;

uniform vec2 resolution;
uniform float time;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
uniform float colorNum;
uniform float pixelSize;

vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec2 fade(vec2 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

float cnoise(vec2 P) {
  vec4 Pi = floor(P.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 Pf = fract(P.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  Pi = mod289(Pi);
  vec4 ix = Pi.xzxz;
  vec4 iy = Pi.yyww;
  vec4 fx = Pf.xzxz;
  vec4 fy = Pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx = gx - tx;
  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(vec4(dot(g00, g00), dot(g01, g01), dot(g10, g10), dot(g11, g11)));
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;
  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fade_xy = fade(Pf.xy);
  vec2 n_x = mix(vec2(n00, n01), vec2(n10, n11), fade_xy.x);
  return 2.3 * mix(n_x.x, n_x.y, fade_xy.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 1.0;
  float freq = waveFrequency;
  for (int i = 0; i < 4; i++) {
    value += amp * abs(cnoise(p));
    p *= freq;
    amp *= waveAmplitude;
  }
  return value;
}

float bayer8(vec2 p) {
  int x = int(mod(p.x, 8.0));
  int y = int(mod(p.y, 8.0));
  int idx = y * 8 + x;
  float mat[64];
  mat[0]=0.; mat[1]=48.; mat[2]=12.; mat[3]=60.; mat[4]=3.; mat[5]=51.; mat[6]=15.; mat[7]=63.;
  mat[8]=32.; mat[9]=16.; mat[10]=44.; mat[11]=28.; mat[12]=35.; mat[13]=19.; mat[14]=47.; mat[15]=31.;
  mat[16]=8.; mat[17]=56.; mat[18]=4.; mat[19]=52.; mat[20]=11.; mat[21]=59.; mat[22]=7.; mat[23]=55.;
  mat[24]=40.; mat[25]=24.; mat[26]=36.; mat[27]=20.; mat[28]=43.; mat[29]=27.; mat[30]=39.; mat[31]=23.;
  mat[32]=2.; mat[33]=50.; mat[34]=14.; mat[35]=62.; mat[36]=1.; mat[37]=49.; mat[38]=13.; mat[39]=61.;
  mat[40]=34.; mat[41]=18.; mat[42]=46.; mat[43]=30.; mat[44]=33.; mat[45]=17.; mat[46]=45.; mat[47]=29.;
  mat[48]=10.; mat[49]=58.; mat[50]=6.; mat[51]=54.; mat[52]=9.; mat[53]=57.; mat[54]=5.; mat[55]=53.;
  mat[56]=42.; mat[57]=26.; mat[58]=38.; mat[59]=22.; mat[60]=41.; mat[61]=25.; mat[62]=37.; mat[63]=21.;
  return mat[idx] / 64.0;
}

vec3 dither(vec2 fragCoord, vec3 color) {
  vec2 scaled = floor(fragCoord / max(1.0, pixelSize));
  float threshold = bayer8(scaled) - 0.25;
  float stepSize = 1.0 / max(1.0, colorNum - 1.0);
  color += threshold * stepSize;
  color = clamp(color, 0.0, 1.0);
  return floor(color * (colorNum - 1.0) + 0.5) / (colorNum - 1.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 p = uv - 0.5;
  p.x *= resolution.x / resolution.y;

  float f = fbm(p + fbm(p - time * waveSpeed));

  if (enableMouseInteraction == 1) {
    vec2 m = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    m.x *= resolution.x / resolution.y;
    float dist = length(p - m);
    float effect = 1.0 - smoothstep(0.0, mouseRadius, dist);
    f -= 0.5 * effect;
  }

  vec3 col = mix(vec3(0.0), waveColor, f);
  col = dither(gl_FragCoord.xy, col);
  gl_FragColor = vec4(col, 1.0);
}
`

function DitherPlane({
  waveSpeed,
  waveFrequency,
  waveAmplitude,
  waveColor,
  colorNum,
  pixelSize,
  disableAnimation,
  enableMouseInteraction,
  mouseRadius,
}) {
  const { viewport, size, gl } = useThree()
  const materialRef = useRef(null)
  const mouseRef = useRef(new THREE.Vector2(0, 0))

  const uniformsRef = useRef({
    resolution: new THREE.Uniform(new THREE.Vector2(1, 1)),
    time: new THREE.Uniform(0),
    waveSpeed: new THREE.Uniform(waveSpeed),
    waveFrequency: new THREE.Uniform(waveFrequency),
    waveAmplitude: new THREE.Uniform(waveAmplitude),
    waveColor: new THREE.Uniform(new THREE.Color(...waveColor)),
    mousePos: new THREE.Uniform(new THREE.Vector2(0, 0)),
    enableMouseInteraction: new THREE.Uniform(enableMouseInteraction ? 1 : 0),
    mouseRadius: new THREE.Uniform(mouseRadius),
    colorNum: new THREE.Uniform(colorNum),
    pixelSize: new THREE.Uniform(pixelSize),
  })

  useEffect(() => {
    const dpr = gl.getPixelRatio()
    const w = Math.floor(size.width * dpr)
    const h = Math.floor(size.height * dpr)
    uniformsRef.current.resolution.value.set(w, h)
  }, [size, gl])

  useFrame(({ clock }) => {
    const u = uniformsRef.current
    if (!disableAnimation) {
      u.time.value = clock.getElapsedTime()
    }
    u.waveSpeed.value = waveSpeed
    u.waveFrequency.value = waveFrequency
    u.waveAmplitude.value = waveAmplitude
    u.waveColor.value.set(...waveColor)
    u.enableMouseInteraction.value = enableMouseInteraction ? 1 : 0
    u.mouseRadius.value = mouseRadius
    u.colorNum.value = colorNum
    u.pixelSize.value = pixelSize
    if (enableMouseInteraction) {
      u.mousePos.value.copy(mouseRef.current)
    }
  })

  const handlePointerMove = (e) => {
    if (!enableMouseInteraction) return
    const rect = gl.domElement.getBoundingClientRect()
    const dpr = gl.getPixelRatio()
    mouseRef.current.set((e.clientX - rect.left) * dpr, (e.clientY - rect.top) * dpr)
  }

  return (
    <mesh onPointerMove={handlePointerMove} scale={[viewport.width, viewport.height, 1]}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniformsRef.current}
      />
    </mesh>
  )
}

export default function Dither({
  waveColor = [0.5, 0.5, 0.5],
  disableAnimation = false,
  enableMouseInteraction = false,
  mouseRadius = 0.8,
  colorNum = 4,
  pixelSize = 1,
  waveAmplitude = 0.3,
  waveFrequency = 3,
  waveSpeed = 0.04,
}) {
  return (
    <Canvas className="dither-container" camera={{ position: [0, 0, 3] }} dpr={1}>
      <DitherPlane
        waveSpeed={waveSpeed}
        waveFrequency={waveFrequency}
        waveAmplitude={waveAmplitude}
        waveColor={waveColor}
        colorNum={colorNum}
        pixelSize={pixelSize}
        disableAnimation={disableAnimation}
        enableMouseInteraction={enableMouseInteraction}
        mouseRadius={mouseRadius}
      />
    </Canvas>
  )
}
