import { useState, useMemo } from 'react'
import type { StudioTool, StudioToolProps } from '../types'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { SketchButton, Icon } from '../../ui'
import './studio.css'

interface TableData {
  title: string
  columns: string[]
  rows: string[][]
}

function exportCsv(title: string, columns: string[], rows: string[][]): void {
  const escapeCol = (val: string) => {
    const s = String(val ?? '').replace(/"/g, '""')
    return `"${s}"`
  }

  const lines = [
    columns.map(escapeCol).join(','),
    ...rows.map(row => columns.map((_, i) => escapeCol(row[i] ?? '')).join(',')),
  ]

  // Add UTF-8 BOM so spreadsheet apps (Excel, Sheets) render Indic scripts correctly
  const csvContent = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeTitle = (title || 'notebook-table').replace(/[^\p{L}\p{N}_\- ]+/gu, '_').trim() || 'data-table'
  a.download = `${safeTitle}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function TableToolComponent({ notebook, saveOutput, output }: StudioToolProps) {
  const initialData = output?.data ? (output.data as TableData) : null

  const [data, setData] = useState<TableData | null>(initialData)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exported, setExported] = useState(false)

  const chunks = useMemo(() => {
    try {
      return spreadChunks(notebook, 24000)
    } catch {
      return []
    }
  }, [notebook])

  const handleGenerate = async () => {
    if (chunks.length === 0) {
      setError('Please enable at least one notebook source to generate a comparison table.')
      return
    }

    setLoading(true)
    setError(null)
    setExported(false)

    try {
      const res = await nbPost<TableData>('studio', {
        kind: 'table',
        chunks,
        language: notebook.language,
        boardLanguage: notebook.boardLanguage ?? notebook.language,
        grade: notebook.grade,
      })

      const cols = Array.isArray(res.columns) ? res.columns : ['Entity', 'Feature', 'Details']
      const rows = Array.isArray(res.rows) ? res.rows : []

      const dataToSave: TableData = {
        title: res.title || 'Comparison Table',
        columns: cols,
        rows,
      }

      setData(dataToSave)
      saveOutput({
        tool: 'table',
        title: dataToSave.title,
        data: dataToSave,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to generate table'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleExportCsv = () => {
    if (!data) return
    exportCsv(data.title, data.columns, data.rows)
    setExported(true)
    setTimeout(() => setExported(false), 3000)
  }

  return (
    <div className="studio-tool-wrap">
      {data && !loading ? (
        <>
          <div className="studio-header">
            <h3 className="studio-title">{data.title}</h3>
            <p className="studio-blurb">
              Comparing {data.rows.length} items across {data.columns.length} columns.
            </p>
          </div>

          <div className="studio-actions-bar">
            <div className="studio-btn-group">
              <SketchButton variant="primary" onClick={handleExportCsv}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name={exported ? 'check' : 'pencil'} size={16} />
                  <span>{exported ? 'Downloaded CSV!' : 'Export to CSV'}</span>
                </span>
              </SketchButton>
            </div>

            <SketchButton variant="ghost" onClick={() => setData(null)}>
              Generate another table
            </SketchButton>
          </div>

          <div className="studio-table-scroll">
            <table className="studio-table">
              <thead>
                <tr>
                  {data.columns.map((col, idx) => (
                    <th key={idx}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {data.columns.map((_, cIdx) => (
                      <td key={cIdx}>{row[cIdx] ?? '-'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : loading ? (
        <div className="studio-loading">
          <div className="studio-doodle-spin" />
          <div className="studio-loading-text">Analyzing comparison entities...</div>
          <div className="studio-loading-sub">
            Building structured comparison data table in {notebook.boardLanguage ?? notebook.language}
          </div>
        </div>
      ) : (
        <>
          <div className="studio-header">
            <h3 className="studio-title">Data Table & Entity Comparison</h3>
            <p className="studio-blurb">
              Extract and compare core entities, properties, and facts from your study notebook in a clean sketch table.
            </p>
          </div>

          {chunks.length === 0 && (
            <div className="studio-empty-card">
              <div className="studio-empty-title">No notebook sources active</div>
              <div className="studio-empty-desc">
                Enable at least one source in the Sources panel so we can compare facts and entities.
              </div>
            </div>
          )}

          {error && (
            <div className="studio-error-card">
              <div>⚠️ {error}</div>
              <SketchButton variant="ghost" onClick={handleGenerate}>
                Try again
              </SketchButton>
            </div>
          )}

          <div
            style={{
              padding: '16px 20px',
              background: 'var(--paper-2)',
              borderRadius: 'var(--radius)',
              border: '1.5px dashed var(--ink-faint)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: '1.4rem' }}>📊</span>
              <span style={{ fontFamily: 'var(--font-hand)', fontSize: '1.25rem', fontWeight: 700 }}>
                Data Table Features:
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.92rem', color: 'var(--ink-soft)' }}>
              <li>Compares entities and concepts side-by-side (up to 8 columns, 20 rows)</li>
              <li>Sketchbook paper-and-ink styling with clean mobile scrolling</li>
              <li>One-click CSV download with Unicode support for Indian languages</li>
            </ul>
          </div>

          <div className="studio-actions-bar">
            <div style={{ fontSize: '0.9rem', color: 'var(--ink-soft)' }}>
              Sources enabled: <strong>{chunks.length} chunks</strong>
            </div>

            <SketchButton
              variant="primary"
              onClick={handleGenerate}
              disabled={chunks.length === 0}
            >
              Generate Data Table
            </SketchButton>
          </div>
        </>
      )}
    </div>
  )
}

const tool: StudioTool = {
  id: 'table',
  title: 'Data table',
  blurb: 'Compare entities and facts in a sketch table',
  icon: 'pencil',
  order: 5,
  Component: TableToolComponent,
}

export default tool
