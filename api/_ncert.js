// OWNED BY: Lane N1 (NCERT data). Route /api/v2/ncert. See docs/PLAN.md "Round 4".
/**
 * Contract (frozen):
 *   export async function getChapter(file) -> {
 *     file, grade, subject, book, title,
 *     sections: [{ id, title, text, examples: [{ title, text }], activities: [{ title, text }] }]
 *   }  throws if the chapter cannot be loaded.
 *   POST /api/v2/ncert {action:'chapter', file} -> { file, title, sections: [{ id, title, words, examples: number }] }
 */
export async function getChapter(file) { void file; throw new Error('ncert: not implemented yet') }
export default async function handler(req, res) { return res.status(501).json({ error: 'not implemented yet' }) }
