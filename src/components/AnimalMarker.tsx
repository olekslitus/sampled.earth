import type { Theme } from "@/lib/sim/attributes"
import { ANIMAL_COLORS, ANIMAL_SHAPES, SPECIES_MARKER, type AnimalShape } from "@/lib/sim/animals"

/** Star with outer radius r and inner radius r·rf, point up, centred like the shader's */
const STAR = Array.from({ length: 10 }, (_, k) => {
  const a = ((-90 + k * 36) * Math.PI) / 180
  const r = k % 2 ? 0.8 * 0.45 : 0.8
  return `${(Math.cos(a) * r).toFixed(3)},${(Math.sin(a) * r + 0.08).toFixed(3)}`
}).join(" ")

/** Shapes in a -1…1 box, matching the signed-distance shapes in AnimalLayer's shader */
const SHAPE: Record<AnimalShape, (fill: string) => React.ReactNode> = {
  square: (fill) => <rect x={-0.66} y={-0.66} width={1.32} height={1.32} rx={0.14} fill={fill} />,
  triangle: (fill) => <polygon points="0,-0.69 0.8,0.69 -0.8,0.69" fill={fill} />,
  hexagon: (fill) => <polygon points="0.762,0 0.381,0.66 -0.381,0.66 -0.762,0 -0.381,-0.66 0.381,-0.66" fill={fill} />,
  diamond: (fill) => <polygon points="0,-0.76 0.76,0 0,0.76 -0.76,0" fill={fill} />,
  star: (fill) => <polygon points={STAR} fill={fill} />,
  plus: (fill) => (
    <polygon
      points="-0.26,-0.72 0.26,-0.72 0.26,-0.26 0.72,-0.26 0.72,0.26 0.26,0.26 0.26,0.72 -0.26,0.72 -0.26,0.26 -0.72,0.26 -0.72,-0.26 -0.26,-0.26"
      fill={fill}
    />
  ),
}

/** The marker a species wears on the globe, for legends and lists */
export function AnimalMarker({ species, theme, size = 12 }: { species: string; theme: Theme; size?: number }) {
  const marker = SPECIES_MARKER.get(species)
  if (!marker) return null
  const fill = ANIMAL_COLORS[theme][marker.color]
  return (
    <svg viewBox="-1 -1 2 2" width={size} height={size} className="shrink-0" aria-hidden>
      {SHAPE[ANIMAL_SHAPES[marker.shape]](fill)}
    </svg>
  )
}
