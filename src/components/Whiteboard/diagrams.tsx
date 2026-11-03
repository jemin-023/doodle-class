// Hand-drawn doodle diagram library for the whiteboard (Indian K-10 syllabus). No maps of countries on purpose.
// MIRROR: the names and default label lists below must match DIAGRAM_PARTS in api/_board.js (the server validates names).
import { M_BLUE, M_GREEN, M_ORANGE, M_RED, INK, INK_FAINT, type RC } from './shared'

export const DW = 300, DH = 220 // diagram canvas; shapes live in x 80..220, labels in the side gutters

export interface Anchor { x: number; y: number; side: 'l' | 'r'; ly?: number }
export interface DiagramDef { title: string; labels: string[]; anchors: Anchor[]; draw: (k: Kit) => SVGElement[] }

const YEL = '#f0c93a', BRN = '#8b5a2b', SKY = '#9ccbe8', GRY = '#8d887e'
const NS = 'http://www.w3.org/2000/svg'

export interface Kit {
  ln: (x1: number, y1: number, x2: number, y2: number, c?: string, w?: number) => SVGElement
  dash: (x1: number, y1: number, x2: number, y2: number, c?: string) => SVGElement
  el: (cx: number, cy: number, w: number, h: number, c?: string, fill?: string) => SVGElement
  rt: (x: number, y: number, w: number, h: number, c?: string, fill?: string) => SVGElement
  pg: (pts: [number, number][], c?: string, fill?: string) => SVGElement
  cv: (pts: [number, number][], c?: string, w?: number) => SVGElement
  pa: (d: string, c?: string, fill?: string, w?: number) => SVGElement
  ar: (cx: number, cy: number, w: number, h: number, a0: number, a1: number, closed: boolean, c?: string, fill?: string) => SVGElement
  dot: (x: number, y: number, r: number, c: string) => SVGElement
  tx: (x: number, y: number, s: string, c?: string, size?: number, anchor?: string) => SVGElement
  arrow: (x1: number, y1: number, x2: number, y2: number, c?: string) => SVGElement[]
}

export function makeKit(rc: RC): Kit {
  let n = 100
  const o = (c: string, extra: object = {}) => ({ stroke: c, strokeWidth: 2.2, roughness: 1.15, seed: n++, ...extra })
  const f = (fill?: string) => (fill ? { fill, fillStyle: 'hachure', hachureGap: 5, fillWeight: 1.8, hachureAngle: -40 } : {})
  const k: Kit = {
    ln: (x1, y1, x2, y2, c = INK, w = 2.2) => rc.line(x1, y1, x2, y2, o(c, { strokeWidth: w })),
    dash: (x1, y1, x2, y2, c = INK_FAINT) => rc.line(x1, y1, x2, y2, o(c, { strokeWidth: 1.6, strokeLineDash: [6, 6] })),
    el: (cx, cy, w, h, c = INK, fill) => rc.ellipse(cx, cy, w, h, o(c, f(fill))),
    rt: (x, y, w, h, c = INK, fill) => rc.rectangle(x, y, w, h, o(c, f(fill))),
    pg: (pts, c = INK, fill) => rc.polygon(pts, o(c, f(fill))),
    cv: (pts, c = INK, w = 2.2) => rc.curve(pts, o(c, { strokeWidth: w })),
    pa: (d, c = INK, fill, w = 2.2) => rc.path(d, o(c, { strokeWidth: w, ...f(fill) })),
    ar: (cx, cy, w, h, a0, a1, closed, c = INK, fill) => rc.arc(cx, cy, w, h, rad(a0), rad(a1), closed, o(c, f(fill))),
    dot: (x, y, r, c) => rc.circle(x, y, r * 2, o(c, { fill: c, fillStyle: 'solid', strokeWidth: 1.2 })),
    tx: (x, y, s, c = INK, size = 16, anchor = 'middle') => {
      const t = document.createElementNS(NS, 'text')
      t.setAttribute('x', String(x)); t.setAttribute('y', String(y))
      t.setAttribute('fill', c); t.setAttribute('font-size', String(size)); t.setAttribute('text-anchor', anchor)
      t.setAttribute('font-family', "'Caveat', 'Comic Sans MS', cursive"); t.setAttribute('font-weight', '700')
      t.textContent = s
      return t
    },
    arrow: (x1, y1, x2, y2, c = INK) => {
      const a = Math.atan2(y2 - y1, x2 - x1), L = 9
      return [k.ln(x1, y1, x2, y2, c, 2.2),
        k.ln(x2, y2, x2 - L * Math.cos(a - 0.5), y2 - L * Math.sin(a - 0.5), c, 2.2),
        k.ln(x2, y2, x2 - L * Math.cos(a + 0.5), y2 - L * Math.sin(a + 0.5), c, 2.2)]
    },
  }
  return k
}

const rad = (d: number) => (d * Math.PI) / 180
const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => [cx + r * Math.cos(rad(deg)), cy + r * Math.sin(rad(deg))]
function tilted(cx: number, cy: number, a: number, b: number, deg: number, n = 28): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2, x = a * Math.cos(t), y = b * Math.sin(t)
    out.push([cx + x * Math.cos(rad(deg)) - y * Math.sin(rad(deg)), cy + x * Math.sin(rad(deg)) + y * Math.cos(rad(deg))])
  }
  return out
}
const cloud = (k: Kit, x: number, y: number, s = 1, c = M_BLUE): SVGElement[] =>
  [k.pa(`M${x - 30 * s} ${y + 10 * s} Q${x - 42 * s} ${y - 6 * s} ${x - 22 * s} ${y - 8 * s} Q${x - 18 * s} ${y - 28 * s} ${x + 2 * s} ${y - 20 * s} Q${x + 20 * s} ${y - 30 * s} ${x + 28 * s} ${y - 8 * s} Q${x + 46 * s} ${y - 4 * s} ${x + 32 * s} ${y + 10 * s} Z`, c, SKY)]

const orbitPt = (r: number, a: number, side: 'l' | 'r'): Anchor => ({ x: 150 + r * Math.cos(rad(a)), y: 110 + r * 0.8 * Math.sin(rad(a)), side })

export const DIAGRAM_LIB: Record<string, DiagramDef> = {
  plant: {
    title: 'Parts of a plant', labels: ['Root', 'Stem', 'Leaf', 'Flower'],
    anchors: [{ x: 130, y: 197, side: 'l' }, { x: 151, y: 140, side: 'r' }, { x: 122, y: 108, side: 'l' }, { x: 150, y: 40, side: 'r' }],
    draw: k => [
      k.ln(90, 168, 210, 168, BRN, 2.6),
      k.cv([[150, 168], [147, 130], [152, 95], [150, 62]], M_GREEN, 3.4),
      k.pa('M150 125 Q112 92 100 112 Q114 140 150 125 Z', M_GREEN, M_GREEN),
      k.pa('M151 105 Q188 72 200 92 Q186 122 151 105 Z', M_GREEN, M_GREEN),
      ...[0, 72, 144, 216, 288].map(a => k.el(150 + 16 * Math.cos(rad(a - 90)), 46 + 16 * Math.sin(rad(a - 90)), 17, 17, M_RED, M_RED)),
      k.el(150, 46, 16, 16, M_ORANGE, YEL),
      k.cv([[150, 168], [140, 185], [124, 198]], BRN), k.cv([[150, 168], [152, 188], [150, 208]], BRN), k.cv([[150, 168], [165, 184], [182, 198]], BRN),
    ],
  },
  tree: {
    title: 'A tree', labels: ['Leaves', 'Branch', 'Trunk', 'Roots'],
    anchors: [{ x: 112, y: 75, side: 'l' }, { x: 176, y: 108, side: 'r' }, { x: 150, y: 150, side: 'l' }, { x: 170, y: 196, side: 'r' }],
    draw: k => [
      k.pa('M138 188 L142 112 L158 112 L162 188 Z', BRN, BRN),
      k.ln(155, 118, 190, 96, BRN, 4),
      k.el(150, 62, 100, 68, M_GREEN, M_GREEN), k.el(114, 92, 66, 52, M_GREEN, M_GREEN), k.el(186, 92, 66, 52, M_GREEN, M_GREEN),
      k.ln(86, 188, 214, 188, BRN, 2.6),
      k.cv([[142, 188], [128, 198], [112, 204]], BRN), k.cv([[158, 188], [172, 198], [188, 204]], BRN),
    ],
  },
  sun: {
    title: 'The Sun', labels: ['Core', 'Rays', 'Surface'],
    anchors: [{ x: 150, y: 110, side: 'l' }, { x: 205, y: 50, side: 'r' }, { x: 186, y: 128, side: 'r' }],
    draw: k => [
      ...Array.from({ length: 12 }, (_, i) => { const [x1, y1] = polar(150, 110, 52, i * 30), [x2, y2] = polar(150, 110, 78, i * 30); return k.ln(x1, y1, x2, y2, M_ORANGE, 3) }),
      k.el(150, 110, 80, 80, M_ORANGE, YEL), k.el(150, 110, 30, 30, M_RED, M_RED),
    ],
  },
  earth: {
    title: 'Planet Earth', labels: ['North Pole', 'Equator', 'South Pole', 'Land'],
    anchors: [{ x: 137, y: 49, side: 'l' }, { x: 205, y: 112, side: 'r' }, { x: 163, y: 171, side: 'r' }, { x: 120, y: 95, side: 'l' }],
    draw: k => [
      k.el(150, 110, 120, 120, M_BLUE, SKY),
      k.pa('M104 90 Q118 72 138 84 Q130 104 112 108 Z', M_GREEN, M_GREEN), k.pa('M160 120 Q184 104 196 124 Q186 146 164 142 Z', M_GREEN, M_GREEN), k.pa('M120 128 Q132 124 134 142 Q124 150 118 140 Z', M_GREEN, M_GREEN),
      k.dash(92, 110, 208, 110, M_RED),
      k.ln(133, 40, 167, 180, INK, 2),
    ],
  },
  'solar-system': {
    title: 'Solar system', labels: ['Sun', 'Earth', 'Jupiter', 'Saturn'],
    anchors: [{ x: 150, y: 110, side: 'l', ly: 178 }, orbitPt(34, 40, 'r'), orbitPt(66, 200, 'l'), orbitPt(82, 310, 'r')],
    draw: k => {
      const out: SVGElement[] = []
      const planets: [number, number, string, number][] = [[16, 100, GRY, 3], [24, 250, M_ORANGE, 4], [34, 40, M_BLUE, 5], [44, 330, M_RED, 4], [66, 200, M_ORANGE, 8], [82, 310, YEL, 6], [96, 130, SKY, 5], [104, 20, M_BLUE, 5]]
      planets.forEach(([r]) => out.push(k.el(150, 110, r * 2, r * 1.6, INK_FAINT)))
      out.push(k.el(150, 110, 24, 24, M_ORANGE, YEL))
      planets.forEach(([r, a, c, s]) => { const [x, y] = polar(150, 110, r, a); out.push(k.dot(x, 110 + (y - 110) * 0.8, s, c)) })
      return out
    },
  },
  'moon-phases': {
    title: 'Phases of the Moon', labels: ['New moon', 'Crescent', 'Half moon', 'Full moon'],
    anchors: [{ x: 90, y: 62, side: 'l' }, { x: 210, y: 62, side: 'r' }, { x: 90, y: 158, side: 'l' }, { x: 210, y: 158, side: 'r' }],
    draw: k => {
      const R = 30
      return [
        k.el(120, 62, 60, 60, INK_FAINT),
        k.pa(`M180 ${62 - R} A${R} ${R} 0 0 1 180 ${62 + R} A${R * 0.55} ${R} 0 0 0 180 ${62 - R} Z`, INK, YEL),
        k.pa(`M120 ${158 - R} A${R} ${R} 0 0 1 120 ${158 + R} Z`, INK, YEL), k.ar(120, 158, 60, 60, 90, 270, false, INK_FAINT),
        k.el(180, 158, 60, 60, INK, YEL), k.dot(170, 150, 3, GRY), k.dot(188, 166, 4, GRY), k.dot(184, 146, 2, GRY),
      ]
    },
  },
  'water-cycle': {
    title: 'The water cycle', labels: ['Evaporation', 'Condensation', 'Rain', 'Collection'],
    anchors: [{ x: 208, y: 125, side: 'r' }, { x: 196, y: 42, side: 'r' }, { x: 142, y: 98, side: 'l' }, { x: 190, y: 190, side: 'r' }],
    draw: k => [
      k.el(104, 34, 26, 26, M_ORANGE, YEL), k.ln(104, 12, 104, 6, M_ORANGE, 2.4), k.ln(126, 34, 134, 34, M_ORANGE, 2.4), k.ln(82, 34, 74, 34, M_ORANGE, 2.4),
      k.pg([[80, 165], [118, 92], [155, 165]], GRY, '#b9b3a6'), k.pg([[107, 112], [118, 92], [130, 114], [118, 108]], INK_FAINT, '#fff'),
      k.pa('M135 165 Q165 175 205 168 L205 200 Q165 206 135 200 Z', M_BLUE, SKY),
      k.cv([[140, 182], [150, 176], [160, 182], [170, 176]], M_BLUE, 1.6), k.cv([[175, 192], [185, 186], [195, 192]], M_BLUE, 1.6),
      ...cloud(k, 180, 46, 1.1),
      ...[150, 164, 178].map((x, i) => k.ln(x, 72 + i * 3, x - 5, 92 + i * 3, M_BLUE, 2.2)),
      k.cv([[118, 112], [126, 140], [135, 165]], M_BLUE, 1.8),
      ...k.arrow(208, 160, 208, 92, M_RED), k.cv([[200, 148], [212, 128], [204, 110]], M_RED, 1.8),
    ],
  },
  'states-of-matter': {
    title: 'States of matter', labels: ['Solid', 'Liquid', 'Gas'],
    anchors: [{ x: 90, y: 42, side: 'l' }, { x: 90, y: 110, side: 'l' }, { x: 90, y: 178, side: 'l' }],
    draw: k => {
      const out: SVGElement[] = [k.rt(90, 14, 120, 56, INK), k.rt(90, 82, 120, 56, INK), k.rt(90, 150, 120, 56, INK)]
      for (let r = 0; r < 3; r++) for (let c = 0; c < 8; c++) out.push(k.el(100 + c * 14.6, 26 + r * 15, 11, 11, M_BLUE, M_BLUE))
      const liq: [number, number][] = [[102, 126], [118, 128], [134, 125], [150, 129], [166, 126], [182, 128], [198, 125], [108, 114], [128, 116], [148, 113], [170, 116], [190, 113], [114, 102], [140, 104], [176, 103]]
      liq.forEach(([x, y]) => out.push(k.el(x, y, 11, 11, M_GREEN, M_GREEN)))
      const gas: [number, number][] = [[102, 162], [130, 190], [160, 160], [196, 184], [118, 176], [148, 194], [182, 166], [200, 200]]
      gas.forEach(([x, y]) => out.push(k.el(x, y, 11, 11, M_RED, M_RED)))
      return out
    },
  },
  'food-chain': {
    title: 'A food chain', labels: ['Grass', 'Rabbit', 'Snake', 'Eagle'],
    anchors: [{ x: 98, y: 188, side: 'l' }, { x: 128, y: 146, side: 'l' }, { x: 168, y: 104, side: 'r' }, { x: 198, y: 52, side: 'r' }],
    draw: k => [
      ...[-12, -6, 0, 6, 12].map((d, i) => k.cv([[98 + d, 198], [98 + d * 1.4, 188 - i % 2 * 4], [98 + d * 2, 176]], M_GREEN, 2.4)),
      k.el(124, 150, 34, 22, GRY, '#d8d2c4'), k.el(140, 138, 18, 16, GRY, '#d8d2c4'), k.el(137, 120, 5, 16, GRY), k.el(145, 120, 5, 16, GRY), k.dot(107, 146, 4, '#fff'),
      k.cv([[142, 112], [162, 118], [150, 100], [176, 96], [190, 104]], M_GREEN, 5), k.dot(192, 104, 4, M_GREEN),
      k.el(198, 56, 24, 16, BRN, BRN), k.cv([[160, 42], [180, 50], [198, 56]], INK, 2.4), k.cv([[236, 42], [216, 50], [198, 56]], INK, 2.4), k.pg([[210, 54], [220, 58], [210, 62]], M_ORANGE, M_ORANGE),
      ...k.arrow(104, 172, 118, 162, M_RED), ...k.arrow(150, 126, 160, 110, M_RED), ...k.arrow(184, 90, 192, 72, M_RED),
    ],
  },
  heart: {
    title: 'The human heart', labels: ['Aorta', 'Vena cava', 'Atrium', 'Ventricle'],
    anchors: [{ x: 172, y: 50, side: 'r' }, { x: 122, y: 52, side: 'l' }, { x: 122, y: 108, side: 'l' }, { x: 176, y: 158, side: 'r' }],
    draw: k => [
      k.pa('M150 192 C88 152 78 102 108 82 C130 68 150 80 150 98 C150 80 176 68 196 82 C226 102 212 152 150 192 Z', M_RED, M_RED, 2.8),
      k.ln(150, 98, 150, 188, INK, 2), k.ln(112, 134, 192, 134, INK, 2),
      k.cv([[168, 84], [172, 56], [190, 40], [208, 58]], M_RED, 8), k.cv([[130, 84], [124, 56], [128, 36]], M_BLUE, 8),
      ...k.arrow(150, 150, 150, 168, '#fff'),
    ],
  },
  'digestive-system': {
    title: 'Digestive system', labels: ['Mouth', 'Food pipe', 'Stomach', 'Small intestine', 'Large intestine'],
    anchors: [{ x: 150, y: 32, side: 'l' }, { x: 150, y: 68, side: 'r' }, { x: 138, y: 100, side: 'l' }, { x: 160, y: 150, side: 'r' }, { x: 112, y: 150, side: 'l', ly: 180 }],
    draw: k => [
      k.el(150, 30, 40, 36, M_ORANGE, '#f6d8b0'), k.pa('M138 36 Q150 46 162 36', M_RED, undefined, 2.6),
      k.ln(150, 48, 150, 82, M_RED, 6),
      k.pa('M148 82 Q176 78 176 106 Q172 130 148 126 Q130 120 134 102 Q138 90 148 82 Z', M_RED, '#f2a48f'),
      k.rt(110, 128, 80, 58, M_GREEN),
      k.pa('M128 136 L172 136 L128 148 L172 148 L128 160 L172 160 L128 172 L170 174', M_ORANGE, undefined, 3),
    ],
  },
  tooth: {
    title: 'Inside a tooth', labels: ['Enamel', 'Dentine', 'Pulp', 'Root'],
    anchors: [{ x: 115, y: 52, side: 'l' }, { x: 186, y: 80, side: 'r' }, { x: 150, y: 96, side: 'l', ly: 120 }, { x: 138, y: 165, side: 'l', ly: 180 }],
    draw: k => [
      k.pa('M108 62 Q106 28 134 34 Q150 40 166 34 Q194 28 192 62 Q192 98 178 118 Q176 170 164 192 Q154 198 150 150 Q146 198 136 192 Q124 170 122 118 Q108 98 108 62 Z', M_BLUE, undefined, 3.2),
      k.pa('M118 62 Q118 40 136 44 Q150 48 164 44 Q182 40 182 62 Q182 94 170 112 Q168 160 160 180 Q152 186 150 140 Q148 186 140 180 Q132 160 130 112 Q118 94 118 62 Z', INK_FAINT, '#f3eee2', 1.6),
      k.el(150, 78, 30, 40, M_RED, '#f2a48f'), k.ln(144, 98, 142, 175, M_RED, 2.4), k.ln(156, 98, 158, 175, M_RED, 2.4),
      k.pa('M92 120 Q110 108 124 118 M176 118 Q190 108 208 120', M_GREEN, undefined, 5),
    ],
  },
  atom: {
    title: 'An atom', labels: ['Proton', 'Neutron', 'Electron', 'Orbit'],
    anchors: [{ x: 142, y: 106, side: 'l' }, { x: 158, y: 108, side: 'r', ly: 90 }, { x: 230, y: 110, side: 'r', ly: 130 }, { x: 111, y: 41, side: 'l' }],
    draw: k => {
      const out: SVGElement[] = []
      ;[0, 60, 120].forEach((d, i) => out.push(k.pg(tilted(150, 110, 80, 26, d), [M_BLUE, M_GREEN, M_ORANGE][i])))
      out.push(k.dot(142, 106, 8, M_RED), k.dot(158, 108, 8, M_BLUE), k.dot(148, 120, 8, M_BLUE), k.dot(153, 98, 8, M_RED))
      ;[[230, 110, M_BLUE], [111, 41, M_GREEN], [111, 179, M_ORANGE]].forEach(([x, y, c]) => out.push(k.dot(x as number, y as number, 5, c as string)))
      return out
    },
  },
  cell: {
    title: 'An animal cell', labels: ['Cell membrane', 'Cytoplasm', 'Nucleus', 'Mitochondria'],
    anchors: [{ x: 86, y: 128, side: 'l' }, { x: 112, y: 160, side: 'l', ly: 175 }, { x: 156, y: 96, side: 'r' }, { x: 186, y: 146, side: 'r' }],
    draw: k => [
      k.pa('M92 110 Q86 62 150 56 Q218 58 212 114 Q214 168 150 172 Q88 170 92 110 Z', M_GREEN, '#e1f1d9', 2.8),
      k.el(150, 100, 50, 46, M_BLUE, '#cfdcf5'), k.dot(150, 100, 8, M_BLUE),
      k.el(186, 146, 28, 16, M_ORANGE, '#f6d8b0'), k.cv([[176, 146], [182, 140], [188, 150], [196, 144]], M_ORANGE, 1.6),
      k.el(112, 138, 20, 12, M_ORANGE, '#f6d8b0'), k.dot(188, 82, 3, INK_FAINT), k.dot(122, 98, 3, INK_FAINT), k.dot(130, 158, 3, INK_FAINT),
    ],
  },
  magnet: {
    title: 'A bar magnet', labels: ['North pole', 'South pole', 'Field lines'],
    anchors: [{ x: 94, y: 110, side: 'l' }, { x: 206, y: 110, side: 'r' }, { x: 150, y: 52, side: 'r', ly: 36 }],
    draw: k => [
      k.rt(90, 92, 60, 36, M_RED, M_RED), k.rt(150, 92, 60, 36, M_BLUE, M_BLUE),
      k.tx(120, 118, 'N', INK, 26), k.tx(180, 118, 'S', INK, 26),
      k.pa('M100 90 C100 30 200 30 200 90', INK_FAINT, undefined, 1.8), k.pa('M110 90 C112 50 188 50 190 90', INK_FAINT, undefined, 1.8),
      k.pa('M100 130 C100 190 200 190 200 130', INK_FAINT, undefined, 1.8), k.pa('M110 130 C112 170 188 170 190 130', INK_FAINT, undefined, 1.8),
    ],
  },
  circuit: {
    title: 'A simple circuit', labels: ['Battery', 'Bulb', 'Switch', 'Wire'],
    anchors: [{ x: 100, y: 110, side: 'l' }, { x: 150, y: 36, side: 'r' }, { x: 150, y: 150, side: 'r', ly: 190 }, { x: 200, y: 110, side: 'r' }],
    draw: k => [
      k.ln(100, 50, 136, 50, INK, 2.6), k.ln(164, 50, 200, 50, INK, 2.6), k.ln(200, 50, 200, 170, INK, 2.6), k.ln(200, 170, 166, 170, INK, 2.6),
      k.ln(134, 170, 100, 170, INK, 2.6), k.ln(100, 170, 100, 128, INK, 2.6), k.ln(100, 92, 100, 50, INK, 2.6),
      k.ln(86, 92, 114, 92, M_RED, 4), k.ln(93, 104, 107, 104, INK, 4), k.ln(86, 116, 114, 116, M_RED, 4), k.ln(93, 128, 107, 128, INK, 4),
      k.el(150, 50, 30, 30, M_ORANGE, YEL), k.cv([[140, 56], [145, 44], [155, 44], [160, 56]], M_RED, 1.8),
      k.dot(134, 170, 4, INK), k.dot(166, 170, 4, INK), k.ln(134, 170, 160, 146, M_BLUE, 3),
      k.ln(140, 28, 136, 22, M_ORANGE, 2), k.ln(150, 24, 150, 17, M_ORANGE, 2), k.ln(160, 28, 164, 22, M_ORANGE, 2),
    ],
  },
  prism: {
    title: 'Light and a prism', labels: ['White light', 'Prism', 'Red', 'Violet'],
    anchors: [{ x: 96, y: 134, side: 'l' }, { x: 150, y: 150, side: 'l', ly: 175 }, { x: 212, y: 98, side: 'r' }, { x: 212, y: 154, side: 'r' }],
    draw: k => [
      k.pg([[110, 164], [190, 164], [150, 78]], M_BLUE, '#d6e4f7'),
      k.ln(84, 140, 134, 128, GRY, 5), k.ln(84, 140, 134, 128, '#fff', 2),
      ...[[M_RED, 98], [M_ORANGE, 112], [YEL, 126], [M_GREEN, 140], [M_BLUE, 154]].map(([c, y]) => k.ln(166, 124, 212, y as number, c as string, 3.4)),
    ],
  },
  lever: {
    title: 'A lever', labels: ['Load', 'Fulcrum', 'Effort', 'Beam'],
    anchors: [{ x: 110, y: 104, side: 'l' }, { x: 150, y: 150, side: 'l', ly: 176 }, { x: 204, y: 64, side: 'r' }, { x: 188, y: 100, side: 'r', ly: 120 }],
    draw: k => [
      k.ln(88, 168, 212, 168, BRN, 2.6), k.pg([[150, 112], [128, 166], [172, 166]], INK, '#d8d2c4'),
      k.ln(90, 126, 212, 96, M_BLUE, 5), k.rt(98, 92, 30, 28, M_RED, M_RED),
      ...k.arrow(204, 56, 204, 90, M_GREEN),
    ],
  },
  'balance-scale': {
    title: 'A balance', labels: ['Beam', 'Pivot', 'Pan', 'Stand'],
    anchors: [{ x: 112, y: 56, side: 'l', ly: 46 }, { x: 150, y: 46, side: 'r', ly: 30 }, { x: 205, y: 124, side: 'r' }, { x: 150, y: 150, side: 'l', ly: 176 }],
    draw: k => [
      k.ln(150, 50, 150, 176, INK, 3), k.ln(118, 186, 182, 186, INK, 3), k.ln(150, 186, 150, 176, INK, 3),
      k.ln(88, 60, 212, 60, M_BLUE, 4), k.dot(150, 52, 6, M_RED),
      k.ln(95, 62, 76, 112, INK_FAINT, 1.8), k.ln(95, 62, 114, 112, INK_FAINT, 1.8), k.ln(205, 62, 186, 112, INK_FAINT, 1.8), k.ln(205, 62, 224, 112, INK_FAINT, 1.8),
      k.pa('M72 112 Q95 134 118 112 Z', M_GREEN, M_GREEN), k.pa('M182 112 Q205 134 228 112 Z', M_GREEN, M_GREEN),
      k.rt(86, 92, 18, 18, M_ORANGE, M_ORANGE), k.rt(196, 92, 18, 18, M_ORANGE, M_ORANGE),
    ],
  },
  thermometer: {
    title: 'A thermometer', labels: ['Bulb', 'Mercury', 'Scale', 'Tube'],
    anchors: [{ x: 138, y: 180, side: 'l' }, { x: 150, y: 120, side: 'l', ly: 110 }, { x: 178, y: 80, side: 'r' }, { x: 150, y: 24, side: 'r', ly: 24 }],
    draw: k => [
      k.pa('M138 168 L138 34 Q138 22 150 22 Q162 22 162 34 L162 168', INK, undefined, 2.6),
      k.el(150, 182, 44, 44, M_RED, M_RED), k.ln(150, 176, 150, 70, M_RED, 6),
      ...[0, 1, 2, 3, 4, 5].map(i => k.ln(168, 156 - i * 24, i % 5 === 0 ? 184 : 178, 156 - i * 24, INK, 1.8)),
      k.tx(196, 160, '0', INK, 15, 'start'), k.tx(196, 40, '100', INK, 15, 'start'),
    ],
  },
  clock: {
    title: 'A clock', labels: ['Hour hand', 'Minute hand', 'Numbers', 'Centre'],
    anchors: [{ x: 136, y: 102, side: 'l' }, { x: 172, y: 98, side: 'r' }, { x: 98, y: 118, side: 'l', ly: 150 }, { x: 150, y: 110, side: 'r', ly: 150 }],
    draw: k => [
      k.el(150, 110, 140, 140, INK, '#fffefa'),
      ...Array.from({ length: 12 }, (_, i) => { const [x, y] = polar(150, 110, 54, i * 30 - 60); return k.tx(x, y + 5, String(i + 1), M_BLUE, 17) }),
      k.ln(150, 110, 122, 94, INK, 5), k.ln(150, 110, 193, 85, M_RED, 3.2), k.dot(150, 110, 5, INK),
    ],
  },
  triangle: {
    title: 'A triangle', labels: ['Vertex', 'Side', 'Base', 'Angle'],
    anchors: [{ x: 140, y: 40, side: 'r' }, { x: 118, y: 102, side: 'l' }, { x: 150, y: 165, side: 'l', ly: 190 }, { x: 188, y: 152, side: 'r', ly: 180 }],
    draw: k => [
      k.pg([[140, 40], [95, 165], [210, 165]], M_BLUE, '#dfe7f8'),
      k.ar(95, 165, 36, 36, -68, 0, false, M_RED), k.ar(210, 165, 40, 40, 180, 248, false, M_RED), k.ar(140, 40, 34, 34, 60, 118, false, M_RED),
      k.dot(140, 40, 4, INK), k.dot(95, 165, 4, INK), k.dot(210, 165, 4, INK),
    ],
  },
  'right-triangle': {
    title: 'Right-angled triangle', labels: ['Right angle', 'Base', 'Height', 'Hypotenuse'],
    anchors: [{ x: 110, y: 154, side: 'l', ly: 175 }, { x: 160, y: 165, side: 'r', ly: 192 }, { x: 100, y: 112, side: 'l', ly: 100 }, { x: 150, y: 112, side: 'r' }],
    draw: k => [
      k.pg([[100, 165], [205, 165], [100, 58]], M_BLUE, '#dfe7f8'),
      k.pa('M100 148 L117 148 L117 165', M_RED, undefined, 2.2),
    ],
  },
  circle: {
    title: 'Parts of a circle', labels: ['Centre', 'Radius', 'Diameter', 'Circumference'],
    anchors: [{ x: 150, y: 110, side: 'l', ly: 140 }, { x: 178, y: 94, side: 'r' }, { x: 112, y: 110, side: 'l', ly: 110 }, { x: 170, y: 46, side: 'r', ly: 30 }],
    draw: k => [
      k.el(150, 110, 130, 130, INK, '#fff'), k.ln(85, 110, 215, 110, M_BLUE, 2.4), k.ln(150, 110, 206, 78, M_RED, 3.2), k.dot(150, 110, 4.5, INK),
    ],
  },
  'rectangle-area': {
    title: 'Area of a rectangle', labels: ['Length', 'Width', 'Area', 'Unit square'],
    anchors: [{ x: 155, y: 150, side: 'l', ly: 178 }, { x: 215, y: 105, side: 'r' }, { x: 125, y: 94, side: 'l' }, { x: 195, y: 71, side: 'r', ly: 40 }],
    draw: k => {
      const out: SVGElement[] = [k.rt(95, 60, 120, 90, INK), k.rt(175, 60, 20, 22.5, M_ORANGE, YEL)]
      for (let c = 1; c < 6; c++) out.push(k.ln(95 + c * 20, 60, 95 + c * 20, 150, INK_FAINT, 1.2))
      for (let r = 1; r < 4; r++) out.push(k.ln(95, 60 + r * 22.5, 215, 60 + r * 22.5, INK_FAINT, 1.2))
      return out
    },
  },
  volcano: {
    title: 'A volcano', labels: ['Ash cloud', 'Crater', 'Lava', 'Vent', 'Magma chamber'],
    anchors: [{ x: 150, y: 26, side: 'r', ly: 22 }, { x: 134, y: 72, side: 'l' }, { x: 182, y: 100, side: 'r' }, { x: 150, y: 130, side: 'l', ly: 130 }, { x: 150, y: 188, side: 'l', ly: 190 }],
    draw: k => [
      k.pg([[88, 170], [130, 70], [170, 70], [212, 170]], BRN, '#c9a77a'), k.ln(80, 170, 220, 170, INK, 2.4),
      k.pa('M130 70 Q150 82 170 70 L164 62 Q150 70 136 62 Z', M_RED, M_RED),
      k.cv([[168, 72], [176, 92], [172, 112], [184, 140]], M_RED, 4), k.cv([[132, 72], [128, 90], [136, 108]], M_ORANGE, 3),
      k.ln(150, 74, 150, 168, M_ORANGE, 8), k.el(150, 188, 90, 30, M_RED, M_RED),
      ...cloud(k, 150, 40, 1, GRY), k.dot(120, 50, 4, GRY), k.dot(184, 54, 3, M_RED),
    ],
  },
  'rupee-coins': {
    title: 'Indian money', labels: ['₹1 coin', '₹2 coin', '₹5 coin', '₹10 note'],
    anchors: [{ x: 98, y: 62, side: 'l' }, { x: 202, y: 62, side: 'r', ly: 50 }, { x: 108, y: 156, side: 'l' }, { x: 196, y: 160, side: 'r' }],
    draw: k => [
      k.el(120, 62, 52, 52, GRY, '#e6e3dc'), k.el(120, 62, 38, 38, GRY), k.tx(120, 70, '₹1', INK, 22),
      k.el(180, 62, 52, 52, GRY, '#e6e3dc'), k.el(180, 62, 38, 38, GRY), k.tx(180, 70, '₹2', INK, 22),
      k.el(120, 158, 56, 56, YEL, '#f3e2a0'), k.el(120, 158, 42, 42, BRN), k.tx(120, 166, '₹5', INK, 24),
      k.rt(156, 138, 70, 40, M_GREEN, '#dcefd0'), k.el(191, 158, 22, 22, M_GREEN), k.tx(191, 166, '₹10', INK, 15),
    ],
  },
}

export const DIAGRAM_NAMES = Object.keys(DIAGRAM_LIB)
export function diagramKey(name: string): string | null {
  const k = String(name || '').toLowerCase().trim().replace(/[\s_]+/g, '-')
  return DIAGRAM_LIB[k] ? k : null
}
