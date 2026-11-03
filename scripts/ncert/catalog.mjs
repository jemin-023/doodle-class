// Parse ncert.nic.in/textbook.php (saved HTML) -> raw books list. Usage: node scripts/ncert/catalog.mjs [tb.html]
// Exports parseBooks(html). Running it prints a summary and writes data/ncert-cache/books.json.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const SUBJECTS = { // site subject text -> [id, friendly name]
  'English': ['english', 'English'], 'Mathematics': ['maths', 'Mathematics'], 'Hindi': ['hindi', 'Hindi'], 'Science': ['science', 'Science'],
  'Environmental Studies': ['evs', 'EVS'], 'The World Around Us': ['evs', 'The World Around Us'], 'Sanskrit': ['sanskrit', 'Sanskrit'],
  'Arts': ['arts', 'Arts'], 'Art Education': ['arts', 'Arts'], 'Physical Education and Well Being': ['health-pe', 'Health & PE'], 'Health and Physical Education': ['health-pe', 'Health & PE'],
  'Social Science': ['social', 'Social Science'], 'History': ['social', 'Social Science'], 'Geography': ['social', 'Social Science'], 'Political Science': ['social', 'Social Science'],
  'Economics': ['social', 'Social Science'], 'Social Sciences': ['social', 'Social Science'], 'Vocational Education': ['vocational', 'Vocational'],
}
const friendly = (s) => SUBJECTS[s] || [s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), s]

export function parseBooks(html) {
  let s = html.slice(html.indexOf('function change1'))
  const e = s.search(/\n\s*function /); if (e > 30) s = s.slice(0, e)
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out = []
  // blocks: (class==N) && (subject text=="X") { ... option text/value pairs ... }
  const re = /tclass\.value==(\d+)\)\s*&&\s*\(document\.test\.tsubject\.options\[sind\]\.text=="([^"]+)"\)\)\s*\{([\s\S]*?)\n\s*\}/g
  let m
  while ((m = re.exec(s))) {
    const [, cls, subj, body] = m
    const texts = {}, vals = {}
    for (const t of body.matchAll(/tbook\.options\[(\d+)\]\.text="([^"]*)"/g)) texts[t[1]] = t[2]
    for (const v of body.matchAll(/tbook\.options\[(\d+)\]\.value="textbook\.php\?([a-z0-9]+)=(\d+)-(\d+)"/g)) vals[v[1]] = v
    for (const i of Object.keys(vals)) {
      const [, , code, a, b] = vals[i]
      if (!/^[a-l][eh][a-z]{2}\d$/.test(code)) continue
      out.push({ grade: +cls, siteSubject: subj, title: (texts[i] || code).trim(), code, from: +a, to: +b })
    }
  }
  return out
}
export function groupCatalog(books, chapterTitles = {}) {
  const classes = []
  for (const b of books) {
    if (b.code[1] === 'h' && !/^(hindi|sanskrit)$/.test(friendly(b.siteSubject)[0])) continue // Hindi medium only for language books
    let c = classes.find((x) => x.grade === b.grade); if (!c) classes.push(c = { grade: b.grade, subjects: [] })
    const [id, name] = friendly(b.siteSubject)
    let sub = c.subjects.find((x) => x.id === id); if (!sub) c.subjects.push(sub = { id, name, books: [] })
    if (sub.books.some((x) => x.code === b.code)) continue
    const chapters = []
    for (let n = Math.max(1, b.from); n <= b.to; n++) { const file = b.code + String(n).padStart(2, '0'); chapters.push({ n, file, title: chapterTitles[file] || `Chapter ${n}`, sections: [] }) }
    sub.books.push({ code: b.code, title: b.title, medium: b.code[1] === 'h' ? 'hi' : 'en', chapters })
  }
  classes.sort((a, b) => a.grade - b.grade)
  return classes
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = fs.readFileSync(process.argv[2] || '/tmp/claude-1000/dc-ncert/tb.html', 'latin1')
  const books = parseBooks(html).filter((b) => b.grade <= 10)
  fs.mkdirSync(path.join(ROOT, 'data/ncert-cache'), { recursive: true })
  fs.writeFileSync(path.join(ROOT, 'data/ncert-cache/books.json'), JSON.stringify(books, null, 1))
  const cat = groupCatalog(books)
  for (const c of cat) console.log('class', c.grade, c.subjects.map((s) => `${s.id}[${s.books.map((b) => b.code + ':' + b.title + ':' + b.chapters.length).join('; ')}]`).join('\n   '))
  console.log('books', books.length, 'chapters', cat.flatMap((c) => c.subjects.flatMap((s) => s.books.flatMap((b) => b.chapters))).length)
}
