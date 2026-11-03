import katex from 'katex'
import type { BoardItem, LanguageCode, LessonStep } from '../types'
import { uid, saveNotebook, listNotebooks } from './notebook/store'
import type { Notebook, Note } from './notebook/types'

export function stripWrap(t: string): string {
  t = t.trim()
  const pairs: [string, string][] = [['$$', '$$'], ['\\[', '\\]'], ['\\(', '\\)'], ['$', '$']]
  for (const [a, b] of pairs) if (t.length >= a.length + b.length && t.startsWith(a) && t.endsWith(b)) return t.slice(a.length, t.length - b.length).trim()
  return t
}

export function plainMath(t: string): string {
  return t
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√$1')
    .replace(/\\(times|cdot)/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\theta/g, 'θ')
    .replace(/\\pi/g, 'π')
    .replace(/\\text\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface GenerateNotesOptions {
  steps: LessonStep[]
  uptoStep?: number
  topic: string
  subject?: string
  characterName?: string
  grade?: number
  language?: LanguageCode
  includeNarration?: boolean
}

export function sanitizeFilename(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'board-notes'
  )
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function cleanMarkdown(str: string): string {
  return str.replace(/\*\*/g, '').trim()
}

/** Render text with inline math $...$ into safe HTML with KaTeX */
function renderInlineMathHtml(text: string): string {
  const parts = text.split(/(\$[^$]+\$)/)
  return parts
    .map(part => {
      if (/^\$[^$]+\$$/.test(part)) {
        const math = part.slice(1, -1)
        try {
          return katex.renderToString(math, { throwOnError: false, displayMode: false })
        } catch {
          return `<code>${escapeHtml(plainMath(math))}</code>`
        }
      }
      return escapeHtml(part)
    })
    .join('')
}

/** Convert a single BoardItem to Markdown */
export function formatBoardItemToMarkdown(item: BoardItem): string {
  switch (item.kind) {
    case 'title':
      return `\n### ${cleanMarkdown(item.text)}\n`
    case 'text':
      return `${item.text}\n`
    case 'bullet':
      return `* ${item.text}`
    case 'equation': {
      const tex = stripWrap(item.text)
      return `\n$$\n${tex}\n$$\n`
    }
    case 'highlight':
      return `\n> 💡 **Key Concept:** ${cleanMarkdown(item.text)}\n`
    case 'example':
      return `\n> 📌 **Example:** *${cleanMarkdown(item.text)}*\n`
    case 'drawing':
      return `*[Illustration: ${item.shape}${item.label ? ' — ' + cleanMarkdown(item.label) : ''}]*\n`
    case 'numberline':
      return `**Number Line:** ${item.from} to ${item.to}${item.marks?.length ? ` (Points marked: ${item.marks.join(', ')})` : ''}${item.label ? ` — *${cleanMarkdown(item.label)}*` : ''}\n`
    case 'fraction':
      return `**Fraction:** ${item.num}/${item.den}${item.label ? ` (${cleanMarkdown(item.label)})` : ''}\n`
    case 'chart': {
      const title = item.title ? `**Chart:** ${cleanMarkdown(item.title)} (${item.chart})\n` : `**Chart (${item.chart}):**\n`
      const points = item.labels.map((l, i) => `  * ${l}: **${item.values[i] ?? 0}**`).join('\n')
      return title + points + '\n'
    }
    case 'table': {
      const rows = item.rows || []
      if (!rows.length) return ''
      const head = rows[0] || []
      const sep = head.map(() => '---')
      const body = rows.slice(1).map(r => `| ${r.map(c => cleanMarkdown(c)).join(' | ')} |`).join('\n')
      return `\n| ${head.map(c => cleanMarkdown(c)).join(' | ')} |\n| ${sep.join(' | ')} |\n${body}\n`
    }
    case 'diagram':
      return `**Diagram:** ${cleanMarkdown(item.title || item.name)}${item.labels?.length ? ` (Labels: ${item.labels.join(', ')})` : ''}\n`
    case 'reaction': {
      const l = (item.left || []).map(t => (t.count > 1 ? t.count : '') + t.formula).join(' + ')
      const r = (item.right || []).map(t => (t.count > 1 ? t.count : '') + t.formula).join(' + ')
      return `**Chemical Reaction:** \`${l} → ${r}\`${item.label ? ` (*${cleanMarkdown(item.label)}*)` : ''}\n`
    }
    default:
      return ''
  }
}

/** Convert a single BoardItem to Plain Text */
export function formatBoardItemToText(item: BoardItem): string {
  switch (item.kind) {
    case 'title':
      return `\n=== ${cleanMarkdown(item.text).toUpperCase()} ===\n`
    case 'text':
      return `${cleanMarkdown(item.text)}\n`
    case 'bullet':
      return `  • ${cleanMarkdown(item.text)}`
    case 'equation':
      return `\n  [EQ] ${plainMath(item.text)}\n`
    case 'highlight':
      return `\n  ★ KEY IDEA: ${cleanMarkdown(item.text)}\n`
    case 'example':
      return `\n  e.g. ${cleanMarkdown(item.text)}\n`
    case 'drawing':
      return `  [Drawing: ${item.shape}${item.label ? ' - ' + cleanMarkdown(item.label) : ''}]\n`
    case 'numberline':
      return `  [Number Line: ${item.from} -> ${item.to}${item.marks?.length ? ` (Marks: ${item.marks.join(', ')})` : ''}]\n`
    case 'fraction':
      return `  [Fraction: ${item.num}/${item.den}${item.label ? ` - ${cleanMarkdown(item.label)}` : ''}]\n`
    case 'chart':
      return `  [Chart: ${item.title || item.chart}] ` + item.labels.map((l, i) => `${l}: ${item.values[i] ?? 0}`).join(', ') + '\n'
    case 'table':
      return (item.rows || []).map(r => '  ' + r.join(' | ')).join('\n') + '\n'
    case 'diagram':
      return `  [Diagram: ${item.title || item.name}${item.labels?.length ? ` - ${item.labels.join(', ')}` : ''}]\n`
    case 'reaction': {
      const l = (item.left || []).map(t => (t.count > 1 ? t.count : '') + t.formula).join(' + ')
      const r = (item.right || []).map(t => (t.count > 1 ? t.count : '') + t.formula).join(' + ')
      return `  [Reaction: ${l} -> ${r}${item.label ? ` (${item.label})` : ''}]\n`
    }
    default:
      return ''
  }
}

/** Convert a single BoardItem to HTML */
export function formatBoardItemToHtml(item: BoardItem): string {
  switch (item.kind) {
    case 'title':
      return `<h3 class="nb-title">${renderInlineMathHtml(item.text)}</h3>`
    case 'text':
      return `<p class="nb-text">${renderInlineMathHtml(item.text)}</p>`
    case 'bullet':
      return `<li class="nb-bullet">${renderInlineMathHtml(item.text)}</li>`
    case 'equation': {
      const tex = stripWrap(item.text)
      let mathHtml = ''
      try {
        mathHtml = katex.renderToString(tex, { throwOnError: false, displayMode: true })
      } catch {
        mathHtml = `<div class="nb-eq-raw">${escapeHtml(plainMath(tex))}</div>`
      }
      return `<div class="nb-equation">${mathHtml}</div>`
    }
    case 'highlight':
      return `
        <div class="nb-highlight">
          <span class="nb-hl-badge">💡 KEY CONCEPT</span>
          <div class="nb-hl-body">${renderInlineMathHtml(item.text)}</div>
        </div>
      `
    case 'example':
      return `
        <div class="nb-example">
          <span class="nb-eg-badge">e.g.</span>
          <span class="nb-eg-body">${renderInlineMathHtml(item.text)}</span>
        </div>
      `
    case 'drawing':
      return `
        <div class="nb-drawing">
          <span class="nb-draw-badge">🎨 ${escapeHtml(item.shape)}</span>
          ${item.label ? `<span class="nb-draw-label">${escapeHtml(item.label)}</span>` : ''}
        </div>
      `
    case 'numberline':
      return `
        <div class="nb-vis-card">
          <div class="nb-vis-header">📏 Number Line: ${item.from} to ${item.to}</div>
          ${item.marks?.length ? `<div class="nb-vis-sub">Points marked: <b>${item.marks.join(', ')}</b></div>` : ''}
          ${item.label ? `<div class="nb-vis-note">${escapeHtml(item.label)}</div>` : ''}
        </div>
      `
    case 'fraction':
      return `
        <div class="nb-vis-card">
          <div class="nb-vis-header">🥧 Fraction: <b>${item.num}/${item.den}</b></div>
          ${item.label ? `<div class="nb-vis-note">${escapeHtml(item.label)}</div>` : ''}
        </div>
      `
    case 'chart':
      return `
        <div class="nb-vis-card">
          <div class="nb-vis-header">📊 ${escapeHtml(item.title || `${item.chart} Chart`)}</div>
          <ul class="nb-chart-list">
            ${item.labels.map((l, i) => `<li>${escapeHtml(l)}: <b>${item.values[i] ?? 0}</b></li>`).join('')}
          </ul>
        </div>
      `
    case 'table': {
      const rows = item.rows || []
      if (!rows.length) return ''
      const head = rows[0] || []
      const body = rows.slice(1)
      return `
        <div class="nb-table-wrap">
          <table class="nb-table">
            <thead>
              <tr>${head.map(c => `<th>${renderInlineMathHtml(c)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${body.map(r => `<tr>${r.map(c => `<td>${renderInlineMathHtml(c)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        </div>
      `
    }
    case 'diagram':
      return `
        <div class="nb-vis-card">
          <div class="nb-vis-header">🔬 Diagram: <b>${escapeHtml(item.title || item.name)}</b></div>
          ${item.labels?.length ? `<div class="nb-vis-sub">Key parts: ${item.labels.map(l => `<span class="nb-pill">${escapeHtml(l)}</span>`).join(' ')}</div>` : ''}
        </div>
      `
    case 'reaction': {
      const l = (item.left || []).map(t => (t.count > 1 ? t.count : '') + t.formula).join(' + ')
      const r = (item.right || []).map(t => (t.count > 1 ? t.count : '') + t.formula).join(' + ')
      return `
        <div class="nb-vis-card nb-reaction-card">
          <div class="nb-vis-header">⚗️ Chemical Reaction</div>
          <div class="nb-reaction-formula">
            <code>${escapeHtml(l)} → ${escapeHtml(r)}</code>
          </div>
          ${item.label ? `<div class="nb-vis-note">${escapeHtml(item.label)}</div>` : ''}
        </div>
      `
    }
    default:
      return ''
  }
}

/** Generate full Markdown document */
export function generateBoardNotesMarkdown({
  steps,
  uptoStep,
  topic,
  subject,
  characterName = 'Teacher',
  grade,
  includeNarration = true,
}: GenerateNotesOptions): string {
  const maxIdx = Math.min(uptoStep ?? steps.length - 1, steps.length - 1)
  const lines: string[] = []

  lines.push(`# ${topic}`)
  lines.push(`> **Teacher:** ${characterName} ${subject ? `| **Subject:** ${subject}` : ''} ${grade ? `| **Grade:** ${grade}` : ''}`)
  lines.push(`> *Classroom Blackboard Notes • Doodle Class* — ${new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}`)
  lines.push('\n---\n')

  for (let s = 0; s <= maxIdx; s++) {
    const step = steps[s]
    if (!step) continue

    lines.push(`## Section ${s + 1}`)

    const bullets: string[] = []
    for (const item of step.board) {
      if (item.kind === 'bullet') {
        bullets.push(formatBoardItemToMarkdown(item))
      } else {
        if (bullets.length) {
          lines.push(bullets.join('\n'))
          bullets.length = 0
        }
        lines.push(formatBoardItemToMarkdown(item))
      }
    }
    if (bullets.length) {
      lines.push(bullets.join('\n'))
    }

    if (includeNarration && step.say) {
      lines.push(`\n> 🎙️ **${characterName}'s Explanation:**  \n> "${step.say.trim()}"\n`)
    }

    if (s < maxIdx) {
      lines.push('\n---\n')
    }
  }

  return lines.join('\n')
}

/** Generate full Plain Text document */
export function generateBoardNotesText({
  steps,
  uptoStep,
  topic,
  subject,
  characterName = 'Teacher',
  grade,
  includeNarration = true,
}: GenerateNotesOptions): string {
  const maxIdx = Math.min(uptoStep ?? steps.length - 1, steps.length - 1)
  const lines: string[] = []

  lines.push('====================================================')
  lines.push(`  ${topic.toUpperCase()}`)
  lines.push(`  Teacher: ${characterName} ${subject ? `| Subject: ${subject}` : ''} ${grade ? `| Grade: ${grade}` : ''}`)
  lines.push(`  Date: ${new Date().toLocaleDateString(undefined, { dateStyle: 'medium' })}`)
  lines.push('====================================================\n')

  for (let s = 0; s <= maxIdx; s++) {
    const step = steps[s]
    if (!step) continue

    lines.push(`[ SECTION ${s + 1} ]`)
    for (const item of step.board) {
      lines.push(formatBoardItemToText(item))
    }

    if (includeNarration && step.say) {
      lines.push(`\n  >> Teacher Note: "${step.say.trim()}"\n`)
    }

    lines.push('----------------------------------------------------\n')
  }

  return lines.join('\n')
}

/** Generate full standalone HTML document for print / save as PDF */
export function generateBoardNotesHtml({
  steps,
  uptoStep,
  topic,
  subject,
  characterName = 'Teacher',
  grade,
  includeNarration = true,
}: GenerateNotesOptions): string {
  const maxIdx = Math.min(uptoStep ?? steps.length - 1, steps.length - 1)
  const dateStr = new Date().toLocaleDateString(undefined, { dateStyle: 'full' })

  let contentHtml = ''

  for (let s = 0; s <= maxIdx; s++) {
    const step = steps[s]
    if (!step) continue

    let itemsHtml = ''
    let inList = false

    for (const item of step.board) {
      if (item.kind === 'bullet') {
        if (!inList) {
          itemsHtml += '<ul class="nb-list">'
          inList = true
        }
        itemsHtml += formatBoardItemToHtml(item)
      } else {
        if (inList) {
          itemsHtml += '</ul>'
          inList = false
        }
        itemsHtml += formatBoardItemToHtml(item)
      }
    }
    if (inList) {
      itemsHtml += '</ul>'
    }

    const narrationHtml =
      includeNarration && step.say
        ? `
          <div class="nb-narration">
            <div class="nb-narr-header">🎙️ <b>${escapeHtml(characterName)}</b> explained:</div>
            <div class="nb-narr-body">"${escapeHtml(step.say)}"</div>
          </div>
        `
        : ''

    contentHtml += `
      <section class="nb-step-section">
        <div class="nb-step-badge">Section ${s + 1}</div>
        <div class="nb-step-content">
          ${itemsHtml}
          ${narrationHtml}
        </div>
      </section>
    `
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(topic)} - Blackboard Notes</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&family=Nunito:wght@400;600;700;800&display=swap');

    :root {
      --bg: #faf7ee;
      --paper: #ffffff;
      --ink: #23211e;
      --ink-soft: #635f58;
      --line: #e3ded2;
      --accent: #2f5fd0;
      --highlight: #ffe066;
      --green: #2f8a4c;
      --red: #d9472b;
      --orange: #d9822b;
      --font-hand: 'Caveat', cursive, sans-serif;
      --font-body: 'Nunito', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: var(--font-body);
      font-size: 16px;
      line-height: 1.6;
      padding: 24px 16px;
    }

    .nb-container {
      max-width: 820px;
      margin: 0 auto;
      background: var(--paper);
      border: 3px solid var(--ink);
      border-radius: 16px;
      box-shadow: 6px 8px 0 rgba(35, 33, 30, 0.12);
      overflow: hidden;
    }

    /* Top Action Bar (No Print) */
    .nb-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #f1ebd8;
      border-bottom: 2px solid var(--ink);
      padding: 12px 24px;
      gap: 12px;
      flex-wrap: wrap;
    }

    .nb-actions-title {
      font-family: var(--font-hand);
      font-size: 1.4rem;
      font-weight: 700;
      color: var(--ink);
    }

    .nb-btn-group {
      display: flex;
      gap: 8px;
    }

    .nb-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--paper);
      color: var(--ink);
      border: 2px solid var(--ink);
      border-radius: 8px;
      padding: 6px 14px;
      font-family: var(--font-body);
      font-size: 0.95rem;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: transform 0.1s ease, background 0.15s ease;
    }

    .nb-btn:hover {
      background: var(--highlight);
      transform: translateY(-1px);
    }

    .nb-btn-primary {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--ink);
    }
    .nb-btn-primary:hover {
      background: #1f47a6;
      color: #ffffff;
    }

    /* Header */
    .nb-header {
      padding: 32px 36px 24px;
      border-bottom: 2px dashed var(--line);
      background: linear-gradient(180deg, #fffcf5 0%, #ffffff 100%);
    }

    .nb-topic-title {
      font-family: var(--font-hand);
      font-size: 2.8rem;
      line-height: 1.15;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 8px;
    }

    .nb-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px 18px;
      font-size: 0.95rem;
      color: var(--ink-soft);
      font-weight: 600;
    }

    .nb-meta-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bg);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 2px 10px;
    }

    /* Main Content */
    .nb-body {
      padding: 24px 36px 40px;
    }

    .nb-step-section {
      position: relative;
      margin-bottom: 32px;
      padding-bottom: 28px;
      border-bottom: 2px dashed var(--line);
    }
    .nb-step-section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .nb-step-badge {
      display: inline-block;
      font-family: var(--font-hand);
      font-size: 1.3rem;
      font-weight: 700;
      background: var(--ink);
      color: #fff;
      padding: 2px 12px;
      border-radius: 6px;
      margin-bottom: 16px;
      transform: rotate(-1deg);
    }

    .nb-title {
      font-family: var(--font-hand);
      font-size: 2.2rem;
      font-weight: 700;
      color: var(--accent);
      margin: 12px 0 8px;
      line-height: 1.2;
    }

    .nb-text {
      font-size: 1.15rem;
      margin-bottom: 10px;
      font-family: var(--font-body);
    }

    .nb-list {
      list-style-type: none;
      margin: 8px 0 14px;
      padding-left: 0;
    }

    .nb-bullet {
      position: relative;
      padding-left: 24px;
      font-size: 1.15rem;
      margin-bottom: 8px;
    }

    .nb-bullet::before {
      content: '•';
      position: absolute;
      left: 6px;
      top: -2px;
      font-size: 1.6rem;
      color: var(--accent);
    }

    .nb-equation {
      background: #f4f8ff;
      border: 2px solid #c9dcff;
      border-radius: 10px;
      padding: 16px;
      margin: 14px 0;
      text-align: center;
      overflow-x: auto;
    }

    .nb-highlight {
      background: #fff9db;
      border-left: 5px solid var(--orange);
      border-radius: 4px 10px 10px 4px;
      padding: 14px 18px;
      margin: 14px 0;
    }

    .nb-hl-badge {
      display: inline-block;
      font-family: var(--font-hand);
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--orange);
      margin-bottom: 4px;
    }

    .nb-hl-body {
      font-size: 1.15rem;
      font-weight: 600;
    }

    .nb-example {
      display: flex;
      align-items: baseline;
      gap: 10px;
      background: #f1f9f3;
      border: 1px solid #c3e6cd;
      border-radius: 8px;
      padding: 10px 16px;
      margin: 12px 0;
    }

    .nb-eg-badge {
      font-family: var(--font-hand);
      font-weight: 700;
      font-size: 1.2rem;
      color: var(--green);
    }

    .nb-eg-body {
      font-size: 1.1rem;
      color: #1b532c;
    }

    .nb-drawing {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #fdf2f0;
      border: 1px dashed var(--red);
      border-radius: 8px;
      padding: 6px 14px;
      margin: 8px 0;
    }

    .nb-draw-badge {
      font-size: 0.95rem;
      font-weight: 700;
      color: var(--red);
    }

    .nb-draw-label {
      font-family: var(--font-hand);
      font-size: 1.25rem;
      color: var(--ink);
    }

    .nb-vis-card {
      background: #faf8f5;
      border: 2px solid var(--line);
      border-radius: 10px;
      padding: 14px 18px;
      margin: 14px 0;
    }

    .nb-vis-header {
      font-family: var(--font-hand);
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 4px;
      color: var(--ink);
    }

    .nb-vis-sub {
      font-size: 0.95rem;
      color: var(--ink-soft);
      margin-top: 4px;
    }

    .nb-vis-note {
      font-size: 0.95rem;
      color: var(--ink-soft);
      font-style: italic;
      margin-top: 4px;
    }

    .nb-pill {
      display: inline-block;
      background: #eef2fa;
      border: 1px solid #d0dcf2;
      border-radius: 12px;
      padding: 2px 8px;
      font-size: 0.85rem;
      font-weight: 600;
    }

    .nb-reaction-formula {
      font-size: 1.3rem;
      margin: 8px 0;
      padding: 8px 12px;
      background: #ffffff;
      border: 1px solid #e0dbce;
      border-radius: 6px;
      display: inline-block;
    }

    .nb-table-wrap {
      overflow-x: auto;
      margin: 14px 0;
    }

    .nb-table {
      width: 100%;
      border-collapse: collapse;
      border: 2px solid var(--ink);
      font-size: 1rem;
    }

    .nb-table th, .nb-table td {
      border: 1px solid var(--ink);
      padding: 10px 14px;
      text-align: left;
    }

    .nb-table th {
      background: #f1ebd8;
      font-weight: 700;
    }

    .nb-narration {
      margin-top: 18px;
      background: #fbf9f4;
      border: 1px dashed #d5cdbf;
      border-radius: 8px;
      padding: 12px 16px;
    }

    .nb-narr-header {
      font-size: 0.9rem;
      color: var(--ink-soft);
      margin-bottom: 4px;
    }

    .nb-narr-body {
      font-size: 1.05rem;
      font-style: italic;
      color: var(--ink);
    }

    .nb-footer {
      padding: 18px 36px;
      background: #f7f3e8;
      border-top: 2px solid var(--line);
      text-align: center;
      font-size: 0.9rem;
      color: var(--ink-soft);
    }

    /* Print Specific Rules */
    @media print {
      body {
        background: #ffffff;
        padding: 0;
        font-size: 14px;
      }
      .no-print {
        display: none !important;
      }
      .nb-container {
        border: none;
        box-shadow: none;
        max-width: 100%;
      }
      .nb-step-section {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .nb-equation, .nb-highlight, .nb-vis-card {
        break-inside: avoid;
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="nb-container">
    <div class="nb-actions no-print">
      <div class="nb-actions-title">📝 Blackboard Study Sheet</div>
      <div class="nb-btn-group">
        <button class="nb-btn nb-btn-primary" onclick="window.print()">
          🖨️ Print / Save as PDF
        </button>
        <button class="nb-btn" onclick="window.close()">
          ✕ Close
        </button>
      </div>
    </div>

    <header class="nb-header">
      <h1 class="nb-topic-title">${escapeHtml(topic)}</h1>
      <div class="nb-meta-row">
        <span class="nb-meta-tag">👩‍🏫 Teacher: <b>${escapeHtml(characterName)}</b></span>
        ${subject ? `<span class="nb-meta-tag">📚 Subject: <b>${escapeHtml(subject)}</b></span>` : ''}
        ${grade ? `<span class="nb-meta-tag">🎒 Grade: <b>${grade}</b></span>` : ''}
        <span class="nb-meta-tag">📅 ${escapeHtml(dateStr)}</span>
      </div>
    </header>

    <main class="nb-body">
      ${contentHtml}
    </main>

    <footer class="nb-footer">
      Generated from Doodle Class • Blackboard Notes for Revision
    </footer>
  </div>
</body>
</html>`
}

/** Trigger browser download for a blob or string */
export function downloadFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

/** Open a printable popup with board notes HTML */
export function printBoardNotes(html: string): void {
  const printWindow = window.open('', '_blank', 'width=900,height=800,resizable=yes,scrollbars=yes')
  if (printWindow) {
    printWindow.document.open()
    printWindow.document.write(html)
    printWindow.document.close()
    // Wait for katex / styles to paint before triggering print
    printWindow.onload = () => {
      try {
        printWindow.focus()
        printWindow.print()
      } catch {
        /* ignore */
      }
    }
  } else {
    // If popup blocked, download HTML file as fallback
    downloadFile('board-notes.html', html, 'text/html;charset=utf-8')
  }
}

/** Save the teacher's board notes directly to the student's Doodle Notebook */
export async function saveBoardNotesToNotebook(opts: GenerateNotesOptions): Promise<{ notebookTitle: string; noteId: string }> {
  const md = generateBoardNotesMarkdown(opts)
  const safeTitle = opts.topic.trim() || 'Classroom Notes'
  const list = await listNotebooks()

  let targetNb = list.find(n => n.title.toLowerCase() === safeTitle.toLowerCase())
  const now = Date.now()

  if (!targetNb) {
    targetNb = {
      id: uid(),
      title: safeTitle,
      createdAt: now,
      updatedAt: now,
      language: opts.language || 'en-IN',
      grade: opts.grade || 5,
      characterId: opts.characterName?.toLowerCase() || 'tara',
      sources: [],
      notes: [],
      chat: [],
      outputs: [],
    }
  }

  const newNote: Note = {
    id: uid(),
    title: `${opts.characterName || 'Teacher'}'s Board Notes`,
    text: md,
    at: now,
  }

  const updated: Notebook = {
    ...targetNb,
    notes: [newNote, ...(targetNb.notes || [])],
    updatedAt: now,
  }

  await saveNotebook(updated)
  return { notebookTitle: updated.title, noteId: newNote.id }
}
