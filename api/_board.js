import katex from 'katex'
// OWNED BY: Board lane. Board item schema for prompts + server-side sanitising.
// Every prompt that asks the model for board items interpolates BOARD_ITEM_SHAPES, so changing it here
// changes lesson, lesson-stream, ask and chat at once.
export const BOARD_KINDS = ['title', 'text', 'bullet', 'equation', 'highlight', 'example', 'drawing', 'numberline', 'fraction', 'chart', 'table', 'diagram']
export const BOARD_SHAPES = ['circle', 'arrow', 'box', 'star', 'underline', 'divider']

// Doodle diagram library: name -> parts, in the order labels[] are written on the picture.
// MIRROR: src/components/Whiteboard/diagrams.tsx (DIAGRAM_LIB keys + default labels). Keep both in sync.
export const DIAGRAM_PARTS = {
  plant: ['Root', 'Stem', 'Leaf', 'Flower'],
  tree: ['Leaves', 'Branch', 'Trunk', 'Roots'],
  sun: ['Core', 'Rays', 'Surface'],
  earth: ['North Pole', 'Equator', 'South Pole', 'Land'],
  'solar-system': ['Sun', 'Earth', 'Jupiter', 'Saturn'],
  'moon-phases': ['New moon', 'Crescent', 'Half moon', 'Full moon'],
  'water-cycle': ['Evaporation', 'Condensation', 'Rain', 'Collection'],
  'states-of-matter': ['Solid', 'Liquid', 'Gas'],
  'food-chain': ['Grass', 'Rabbit', 'Snake', 'Eagle'],
  heart: ['Aorta', 'Vena cava', 'Atrium', 'Ventricle'],
  'digestive-system': ['Mouth', 'Food pipe', 'Stomach', 'Small intestine', 'Large intestine'],
  tooth: ['Enamel', 'Dentine', 'Pulp', 'Root'],
  atom: ['Proton', 'Neutron', 'Electron', 'Orbit'],
  cell: ['Cell membrane', 'Cytoplasm', 'Nucleus', 'Mitochondria'],
  magnet: ['North pole', 'South pole', 'Field lines'],
  circuit: ['Battery', 'Bulb', 'Switch', 'Wire'],
  prism: ['White light', 'Prism', 'Red', 'Violet'],
  lever: ['Load', 'Fulcrum', 'Effort', 'Beam'],
  'balance-scale': ['Beam', 'Pivot', 'Pan', 'Stand'],
  thermometer: ['Bulb', 'Mercury', 'Scale', 'Tube'],
  clock: ['Hour hand', 'Minute hand', 'Numbers', 'Centre'],
  triangle: ['Vertex', 'Side', 'Base', 'Angle'],
  'right-triangle': ['Right angle', 'Base', 'Height', 'Hypotenuse'],
  circle: ['Centre', 'Radius', 'Diameter', 'Circumference'],
  'rectangle-area': ['Length', 'Width', 'Area', 'Unit square'],
  volcano: ['Ash cloud', 'Crater', 'Lava', 'Vent', 'Magma chamber'],
  'rupee-coins': ['₹1 coin', '₹2 coin', '₹5 coin', '₹10 note'],
  // 20 new diagrams (E1)
  eye: ['Cornea', 'Iris', 'Pupil', 'Lens', 'Retina'],
  ear: ['Outer ear', 'Ear canal', 'Ear drum', 'Cochlea'],
  'flower-parts': ['Petal', 'Stigma', 'Anther', 'Ovary', 'Sepal'],
  seed: ['Seed coat', 'Cotyledon', 'Embryo', 'Radicle'],
  insect: ['Head', 'Thorax', 'Abdomen', 'Antenna', 'Legs'],
  'human-skeleton': ['Skull', 'Rib cage', 'Spine', 'Pelvis', 'Femur'],
  'nervous-system': ['Brain', 'Spinal cord', 'Nerves'],
  lungs: ['Trachea', 'Bronchus', 'Right lung', 'Left lung', 'Diaphragm'],
  kidney: ['Kidney', 'Renal artery', 'Ureter', 'Bladder'],
  'leaf-structure': ['Cuticle', 'Epidermis', 'Palisade layer', 'Spongy layer', 'Stoma'],
  'convex-lens': ['Principal axis', 'Focus', 'Optical centre', 'Convex lens'],
  'concave-mirror': ['Reflecting surface', 'Pole', 'Focus', 'Centre of curvature'],
  pulley: ['Fixed support', 'Wheel', 'Rope', 'Load', 'Effort'],
  'inclined-plane': ['Slope', 'Height', 'Base', 'Load'],
  'food-pyramid': ['Fats and oils', 'Proteins', 'Vitamins', 'Carbohydrates'],
  'rain-gauge': ['Funnel', 'Outer cylinder', 'Measuring tube', 'Scale'],
  compass: ['Compass needle', 'North mark', 'Dial', 'Casing'],
  'map-directions': ['North', 'East', 'South', 'West'],
  'number-place-value': ['Thousands', 'Hundreds', 'Tens', 'Ones'],
  'analog-thermometer-scale': ['Boiling point', 'Freezing point', 'Body temp', 'Mercury thread'],
  // 5 geometry diagrams (E2)
  'protractor-angle': ['Baseline', 'Origin', 'Angle arc', 'Reading'],
  'coordinate-grid': ['X axis', 'Y axis', 'Origin', 'Point (x, y)'],
  'polygon-hexagon': ['Side', 'Vertex', 'Interior angle', 'Diagonal'],
  'parallel-lines-transversal': ['Parallel lines', 'Transversal', 'Alternate angles', 'Corresponding angles'],
  'circle-chord-tangent': ['Centre', 'Chord', 'Tangent', 'Secant', 'Point of contact'],
}
export const DIAGRAMS = Object.keys(DIAGRAM_PARTS)
const diagramKey = n => { const k = String(n || '').toLowerCase().trim().replace(/[\s_]+/g, '-'); return DIAGRAM_PARTS[k] ? k : null }

export const BOARD_ITEM_SHAPES = `Item shapes: {"kind":"title"|"text"|"bullet"|"equation"|"highlight"|"example","text":string} or {"kind":"drawing","shape":"circle"|"arrow"|"box"|"star"|"underline"|"divider","label"?:string}.
Rich visuals (each is ONE item, max 1 per step). RULE: use a rich visual whenever one genuinely shows THIS topic (usually in step 2 or 3, 2 or more when the topic allows); NEVER use a diagram about a different topic just to have a picture (no water-cycle in a chemistry lesson, no atom in a history lesson). When no diagram fits, prefer a table, chart or highlight (maths: fraction/numberline; data/comparison: chart/table; science/body/nature/shapes: diagram). They teach better than extra text or drawings, so use them INSTEAD of drawing items and of repeating text. If a listed diagram name matches the topic or a part of it (e.g. area of a rectangle -> rectangle-area, rain -> water-cycle), use it:
{"kind":"numberline","from":-3,"to":6,"marks":[2,5],"label"?:string} (marks = dots with hops between them; from/to whole or decimal numbers)
{"kind":"fraction","num":3,"den":4,"label"?:string} (a shaded pie; num>den draws several pies)
{"kind":"chart","chart":"bar"|"line","labels":["Mon","Tue"],"values":[3,5],"title"?:string} (2-8 points, values >= 0, same length as labels)
{"kind":"table","rows":[["Head","Head"],["a","b"]]} (row 0 is the header; max 5 rows x 4 columns; short cells)
{"kind":"diagram","name":string,"title"?:string} (the parts are labelled automatically; do NOT send labels) where name is EXACTLY one of these (its labelled parts shown in brackets): ${DIAGRAMS.map(n => `${n} (${DIAGRAM_PARTS[n].join(', ')})`).join('; ')}. Never invent other diagram names.`

const str = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const num = (v, lim = 1e6) => { const x = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= lim ? x : null }
const rnd = x => Math.round(x * 1e4) / 1e4

function cleanVisual(b) {
  switch (b.kind) {
    case 'numberline': {
      let from = num(b.from), to = num(b.to)
      if (from === null || to === null || from === to) return null
      if (from > to) [from, to] = [to, from]
      if (to - from > 1e5) return null
      const marks = (Array.isArray(b.marks) ? b.marks : []).map(m => num(m)).filter(m => m !== null && m >= from && m <= to).slice(0, 8).map(rnd)
      const label = str(b.label, 60)
      return { kind: 'numberline', from: rnd(from), to: rnd(to), ...(marks.length ? { marks } : {}), ...(label ? { label } : {}) }
    }
    case 'fraction': {
      const n = num(b.num, 1000), d = num(b.den, 1000)
      if (n === null || d === null || !Number.isInteger(n) || !Number.isInteger(d) || n < 1 || d < 1 || d > 60 || n > d * 4) return null
      const label = str(b.label, 60)
      return { kind: 'fraction', num: n, den: d, ...(label ? { label } : {}) }
    }
    case 'chart': {
      if (b.chart !== 'bar' && b.chart !== 'line') return null
      if (!Array.isArray(b.labels) || !Array.isArray(b.values)) return null
      const n = Math.min(b.labels.length, b.values.length, 8)
      const labels = [], values = []
      for (let i = 0; i < n; i++) {
        const v = num(b.values[i], 1e9), l = str(b.labels[i], 14)
        if (v === null || v < 0 || !l) return null
        labels.push(l); values.push(rnd(v))
      }
      if (n < 2) return null
      const title = str(b.title, 60)
      return { kind: 'chart', chart: b.chart, labels, values, ...(title ? { title } : {}) }
    }
    case 'table': {
      if (!Array.isArray(b.rows)) return null
      const rows = b.rows.slice(0, 5).map(r => (Array.isArray(r) ? r : []).slice(0, 4).map(c => str(c, 24)))
      const cols = Math.max(0, ...rows.map(r => r.length))
      if (rows.length < 2 || cols < 2) return null
      return { kind: 'table', rows: rows.map(r => Array.from({ length: cols }, (_, i) => r[i] ?? '')) }
    }
    case 'diagram': {
      const name = diagramKey(b.name)
      if (!name) return null
      // Labels always come from the library so each one sits on the right anchor (the model's own labels were
      // often in a different order / different parts). Non-English lessons get them translated in api/_localize.js.
      const title = str(b.title, 50)
      return { kind: 'diagram', name, ...(title ? { title } : {}) }
    }
  }
  return null
}

/** Readable fallback for maths KaTeX can't parse: "\\frac{a}{b}" -> "a/b", drops stray commands. */
export function plainMath(t) {
  return String(t).replace(/\$/g, '')
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)').replace(/\(([A-Za-z0-9]+)\)\/\(([A-Za-z0-9]+)\)/g, '$1/$2')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1').replace(/\\(times|cdot)/g, '×').replace(/\\div/g, '÷')
    .replace(/\\(theta)/g, 'θ').replace(/\\pi/g, 'π').replace(/\\(le|leq)\b/g, '≤').replace(/\\(ge|geq)\b/g, '≥')
    .replace(/\\text\s*\{([^{}]*)\}/g, '$1').replace(/\\\\/g, '; ').replace(/\\[a-zA-Z]+/g, '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}
/** Equation items: strip $ wrappers the model adds, and only keep them as LaTeX if KaTeX can actually parse them. */
function cleanEquation(text) {
  const tex = text.replace(/\$/g, '').trim().slice(0, 160)
  if (!tex) return null
  try {
    for (const line of tex.split(/\\\\/)) if (line.trim()) katex.renderToString(line, { throwOnError: true, strict: 'ignore' })
    return { kind: 'equation', text: tex }
  } catch {
    const plain = plainMath(tex)
    if (/\\frac/.test(tex) && !plain.includes('/')) return null   // structure lost: better to show nothing than wrong maths
    return plain ? { kind: 'example', text: plain.slice(0, 120) } : null
  }
}

/** Returns a clean {say, board} or null. Invalid items are dropped; never throws. */
export function sanitizeStep(s) {
  try {
    const say = String(s?.say || '').trim()
    const board = (Array.isArray(s?.board) ? s.board : []).map(b => {
      if (!b || typeof b !== 'object' || !BOARD_KINDS.includes(b.kind)) return null
      if (b.kind === 'drawing') {
        if (!BOARD_SHAPES.includes(b.shape)) return null
        return b.label ? { kind: 'drawing', shape: b.shape, label: String(b.label).slice(0, 40) } : { kind: 'drawing', shape: b.shape }
      }
      if (['numberline', 'fraction', 'chart', 'table', 'diagram'].includes(b.kind)) {
        try { return cleanVisual(b) } catch { return null }
      }
      const text = String(b.text || '').trim()
      if (!text) return null
      if (b.kind === 'equation') return cleanEquation(text)
      return { kind: b.kind, text: text.slice(0, 120) }
    }).filter(Boolean).slice(0, 5)
    return say && board.length ? { say, board } : null
  } catch { return null }
}
