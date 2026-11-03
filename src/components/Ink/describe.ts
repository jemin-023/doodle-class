import type { BoardItem } from '../../types'

const clean = (s: string) => s.replace(/\*\*/g, '').replace(/\$/g, '').replace(/\\[a-zA-Z]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Plain-text description of a board item (what the teacher "reads" when the kid circles it). */
export function itemText(it: BoardItem): string {
  switch (it.kind) {
    case 'title': case 'text': case 'bullet': case 'equation': case 'highlight': case 'example':
      return clean(it.text)
    case 'drawing': return clean(`drawing: ${it.shape}${it.label ? ' ' + it.label : ''}`)
    case 'numberline': return `number line ${it.from} to ${it.to}`
    case 'fraction': return `fraction ${it.num}/${it.den}${it.label ? ' ' + clean(it.label) : ''}`
    case 'chart': return clean(`chart: ${it.title || it.chart + ' chart'}${it.labels?.length ? ' (' + it.labels.slice(0, 5).join(', ') + ')' : ''}`)
    case 'table': return clean(`table: ${(it.rows?.[0] || []).join(', ')}`)
    case 'diagram': return clean(`diagram: ${it.name}${it.labels?.length ? ' (' + it.labels.slice(0, 5).join(', ') + ')' : ''}`)
    default: return ''
  }
}
