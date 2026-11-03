import { useState, useMemo } from 'react'
import type { ChangeEvent } from 'react'
import type { Source, SourceKind, Notebook } from '../../lib/notebook/types'
import type { CatalogClass, NcertCatalog } from '../../types'
import catalogJson from '../../data/ncert/catalog.json'
import {
  addNcertSource,
  addPdfSource,
  addPhotoSource,
  addTextSource,
  addUrlSource,
  addWikiSource,
} from '../../lib/notebook/sources'
import { sourceGuide } from '../../lib/notebook/ai'
import { SketchButton, Icon } from '../ui'

export interface SourcesProps {
  notebook: Notebook
  onUpdateNotebook: (updater: (prev: Notebook) => Notebook) => void
  onAsk: (question: string) => void
}

type AddTab = 'ncert' | 'pdf' | 'photo' | 'text' | 'url' | 'wiki'

export default function Sources({ notebook, onUpdateNotebook, onAsk }: SourcesProps) {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<AddTab>('ncert')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [loadingMsg, setLoadingMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // NCERT Tab Form State
  const catalog = catalogJson as unknown as NcertCatalog
  const classes = catalog.classes ?? []

  const [selectedGrade, setSelectedGrade] = useState<number>(() => {
    const found = classes.find(c => c.grade === notebook.grade)
    return found ? found.grade : classes[0]?.grade ?? 1
  })

  const currentClass: CatalogClass | undefined = useMemo(() => {
    return classes.find(c => c.grade === selectedGrade) ?? classes[0]
  }, [classes, selectedGrade])

  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('')
  const currentSubject = useMemo(() => {
    if (!currentClass?.subjects?.length) return undefined
    return currentClass.subjects.find(s => s.id === selectedSubjectId) ?? currentClass.subjects[0]
  }, [currentClass, selectedSubjectId])

  const [selectedBookCode, setSelectedBookCode] = useState<string>('')
  const currentBook = useMemo(() => {
    if (!currentSubject?.books?.length) return undefined
    return currentSubject.books.find(b => b.code === selectedBookCode) ?? currentSubject.books[0]
  }, [currentSubject, selectedBookCode])

  const [selectedChapterFile, setSelectedChapterFile] = useState<string>('')
  const currentChapter = useMemo(() => {
    if (!currentBook?.chapters?.length) return undefined
    return currentBook.chapters.find(ch => ch.file === selectedChapterFile) ?? currentBook.chapters[0]
  }, [currentBook, selectedChapterFile])

  const [selectedSectionId, setSelectedSectionId] = useState<string>('')

  // Text Tab Form State
  const [textTitle, setTextTitle] = useState('')
  const [textContent, setTextContent] = useState('')

  // URL Tab Form State
  const [webUrl, setWebUrl] = useState('')

  // Wiki Tab Form State
  const [wikiQuery, setWikiQuery] = useState('')

  const handleAddSourceSuccess = async (newSrc: Source) => {
    onUpdateNotebook(prev => ({
      ...prev,
      sources: [...prev.sources, newSrc],
      updatedAt: Date.now(),
    }))
    setIsModalOpen(false)
    setLoadingMsg(null)
    setErrorMsg(null)

    // Call sourceGuide right after adding a source, then save
    try {
      const guide = await sourceGuide(newSrc, notebook.language)
      onUpdateNotebook(prev => ({
        ...prev,
        sources: prev.sources.map(s => (s.id === newSrc.id ? { ...s, guide } : s)),
        updatedAt: Date.now(),
      }))
    } catch {
      /* guide is optional/graceful */
    }
  }

  const handleAddNcert = async () => {
    if (!currentChapter) return
    if (notebook.sources.length >= 20) {
      setErrorMsg('Maximum 20 sources reached.')
      return
    }

    setLoadingMsg('Adding NCERT chapter...')
    setErrorMsg(null)
    try {
      const src = await addNcertSource(currentChapter.file, selectedSectionId || undefined)
      await handleAddSourceSuccess(src)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add NCERT source')
      setLoadingMsg(null)
    }
  }

  const handleAddPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (notebook.sources.length >= 20) {
      setErrorMsg('Maximum 20 sources reached.')
      return
    }

    setLoadingMsg('Reading PDF...')
    setErrorMsg(null)
    try {
      const src = await addPdfSource(file)
      await handleAddSourceSuccess(src)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read PDF file')
      setLoadingMsg(null)
    } finally {
      e.target.value = ''
    }
  }

  const handleAddPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (notebook.sources.length >= 20) {
      setErrorMsg('Maximum 20 sources reached.')
      return
    }

    setLoadingMsg('Scanning photo of page...')
    setErrorMsg(null)
    try {
      const src = await addPhotoSource(file)
      await handleAddSourceSuccess(src)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to read photo')
      setLoadingMsg(null)
    } finally {
      e.target.value = ''
    }
  }

  const handleAddText = async () => {
    const trimmedTitle = textTitle.trim() || 'Pasted text'
    const trimmedText = textContent.trim()
    if (!trimmedText) return
    if (notebook.sources.length >= 20) {
      setErrorMsg('Maximum 20 sources reached.')
      return
    }

    setLoadingMsg('Adding text source...')
    setErrorMsg(null)
    try {
      const src = await addTextSource(trimmedTitle, trimmedText)
      setTextTitle('')
      setTextContent('')
      await handleAddSourceSuccess(src)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to add text source')
      setLoadingMsg(null)
    }
  }

  const handleAddUrl = async () => {
    const trimmedUrl = webUrl.trim()
    if (!trimmedUrl) return
    if (notebook.sources.length >= 20) {
      setErrorMsg('Maximum 20 sources reached.')
      return
    }

    setLoadingMsg('Fetching webpage content...')
    setErrorMsg(null)
    try {
      const src = await addUrlSource(trimmedUrl)
      setWebUrl('')
      await handleAddSourceSuccess(src)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to fetch webpage')
      setLoadingMsg(null)
    }
  }

  const handleAddWiki = async () => {
    const trimmedQuery = wikiQuery.trim()
    if (!trimmedQuery) return
    if (notebook.sources.length >= 20) {
      setErrorMsg('Maximum 20 sources reached.')
      return
    }

    setLoadingMsg(`Searching Wikipedia for "${trimmedQuery}"...`)
    setErrorMsg(null)
    try {
      const src = await addWikiSource(trimmedQuery, notebook.language)
      setWikiQuery('')
      await handleAddSourceSuccess(src)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'No Wikipedia article found')
      setLoadingMsg(null)
    }
  }

  const toggleSourceEnabled = (id: string) => {
    onUpdateNotebook(prev => ({
      ...prev,
      sources: prev.sources.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)),
      updatedAt: Date.now(),
    }))
  }

  const deleteSource = (id: string) => {
    onUpdateNotebook(prev => ({
      ...prev,
      sources: prev.sources.filter(s => s.id !== id),
      updatedAt: Date.now(),
    }))
  }

  const fetchGuideForSource = async (src: Source) => {
    setLoadingMsg('Generating guide...')
    try {
      const guide = await sourceGuide(src, notebook.language)
      onUpdateNotebook(prev => ({
        ...prev,
        sources: prev.sources.map(s => (s.id === src.id ? { ...s, guide } : s)),
        updatedAt: Date.now(),
      }))
    } catch {
      /* optional */
    } finally {
      setLoadingMsg(null)
    }
  }

  const getKindLabel = (kind: SourceKind) => {
    switch (kind) {
      case 'ncert':
        return 'NCERT'
      case 'pdf':
        return 'PDF'
      case 'photo':
        return 'Photo'
      case 'text':
        return 'Text'
      case 'url':
        return 'Web'
      case 'wiki':
        return 'Wiki'
      case 'note':
        return 'Note'
      default:
        return kind
    }
  }

  return (
    <div className="nb-panel-card">
      <div className="nb-panel-head">
        <h2>
          <span>Sources</span>
          <span className="nb-panel-badge">{notebook.sources.length}/20</span>
        </h2>
        <SketchButton
          variant="ghost"
          style={{ padding: '4px 10px', fontSize: '0.9rem' }}
          disabled={notebook.sources.length >= 20}
          onClick={() => {
            setErrorMsg(null)
            setIsModalOpen(true)
          }}
        >
          + Add source
        </SketchButton>
      </div>

      <div className="nb-sources-list">
        {notebook.sources.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink-soft)' }}>
            <p style={{ margin: 0, fontStyle: 'italic' }}>No sources added yet.</p>
            <p style={{ margin: '8px 0 0', fontSize: '0.9rem' }}>
              Add a textbook chapter, PDF, photo, or web page to begin chatting.
            </p>
          </div>
        ) : (
          notebook.sources.map(s => {
            const isExpanded = expandedId === s.id
            return (
              <div
                key={s.id}
                className={`nb-source-item ${!s.enabled ? 'is-disabled' : ''}`}
              >
                <div className="nb-source-top">
                  <input
                    type="checkbox"
                    className="nb-source-check"
                    checked={s.enabled}
                    onChange={() => toggleSourceEnabled(s.id)}
                    title={s.enabled ? 'Disable source' : 'Enable source'}
                  />
                  <div className="nb-source-info">
                    <span className={`nb-kind-tag nb-kind-${s.kind}`}>
                      {getKindLabel(s.kind)}
                    </span>
                    <div className="nb-source-title">{s.title}</div>
                  </div>
                  <div className="nb-source-actions">
                    <button
                      type="button"
                      className="nb-icon-btn"
                      onClick={() => setExpandedId(isExpanded ? null : s.id)}
                      title={isExpanded ? 'Hide guide' : 'Show guide'}
                    >
                      <Icon name={isExpanded ? 'back' : 'next'} size={14} />
                    </button>
                    <button
                      type="button"
                      className="nb-icon-btn is-danger"
                      onClick={() => deleteSource(s.id)}
                      title="Delete source"
                    >
                      <Icon name="cross" size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="nb-source-guide">
                    {s.guide ? (
                      <>
                        <div className="nb-guide-summary">{s.guide.summary}</div>
                        {s.guide.topics.length > 0 && (
                          <div className="nb-guide-topics">
                            {s.guide.topics.map(t => (
                              <span key={t} className="nb-topic-tag">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                        {s.guide.questions.length > 0 && (
                          <div className="nb-guide-questions">
                            {s.guide.questions.map(q => (
                              <button
                                key={q}
                                type="button"
                                className="nb-guide-q-btn"
                                onClick={() => onAsk(q)}
                              >
                                ? {q}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <SketchButton
                          variant="ghost"
                          style={{ fontSize: '0.82rem', padding: '3px 8px' }}
                          onClick={() => fetchGuideForSource(s)}
                        >
                          Generate source guide
                        </SketchButton>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add Source Modal / Sheet */}
      {isModalOpen && (
        <div className="nb-modal-backdrop" onClick={() => !loadingMsg && setIsModalOpen(false)}>
          <div className="nb-modal-card" onClick={e => e.stopPropagation()}>
            <div className="nb-modal-head">
              <h3>Add Study Source</h3>
              <button
                type="button"
                className="nb-icon-btn"
                disabled={!!loadingMsg}
                onClick={() => setIsModalOpen(false)}
              >
                <Icon name="cross" size={18} />
              </button>
            </div>
            <div className="nb-modal-body">
              {errorMsg && <div className="nb-alert nb-alert-error">{errorMsg}</div>}
              {loadingMsg && <div className="nb-alert nb-alert-info">{loadingMsg}</div>}

              <div className="nb-sheet-tabs">
                <button
                  type="button"
                  className={`nb-sheet-tab-btn ${activeTab === 'ncert' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('ncert')}
                  disabled={!!loadingMsg}
                >
                  NCERT book
                </button>
                <button
                  type="button"
                  className={`nb-sheet-tab-btn ${activeTab === 'pdf' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('pdf')}
                  disabled={!!loadingMsg}
                >
                  Upload PDF
                </button>
                <button
                  type="button"
                  className={`nb-sheet-tab-btn ${activeTab === 'photo' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('photo')}
                  disabled={!!loadingMsg}
                >
                  Photo of page
                </button>
                <button
                  type="button"
                  className={`nb-sheet-tab-btn ${activeTab === 'text' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('text')}
                  disabled={!!loadingMsg}
                >
                  Paste text
                </button>
                <button
                  type="button"
                  className={`nb-sheet-tab-btn ${activeTab === 'url' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('url')}
                  disabled={!!loadingMsg}
                >
                  Web link
                </button>
                <button
                  type="button"
                  className={`nb-sheet-tab-btn ${activeTab === 'wiki' ? 'is-active' : ''}`}
                  onClick={() => setActiveTab('wiki')}
                  disabled={!!loadingMsg}
                >
                  Discover
                </button>
              </div>

              {/* Tab: NCERT */}
              {activeTab === 'ncert' && (
                <div>
                  <div className="nb-form-field">
                    <label>Class / Grade</label>
                    <select
                      className="nb-form-select"
                      value={selectedGrade}
                      onChange={e => {
                        const g = Number(e.target.value)
                        setSelectedGrade(g)
                        setSelectedSubjectId('')
                        setSelectedBookCode('')
                        setSelectedChapterFile('')
                        setSelectedSectionId('')
                      }}
                    >
                      {classes.map(c => (
                        <option key={c.grade} value={c.grade}>
                          Class {c.grade}
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentClass && (
                    <div className="nb-form-field">
                      <label>Subject</label>
                      <select
                        className="nb-form-select"
                        value={currentSubject?.id || ''}
                        onChange={e => {
                          setSelectedSubjectId(e.target.value)
                          setSelectedBookCode('')
                          setSelectedChapterFile('')
                          setSelectedSectionId('')
                        }}
                      >
                        {currentClass.subjects.map(sub => (
                          <option key={sub.id} value={sub.id}>
                            {sub.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentSubject && (
                    <div className="nb-form-field">
                      <label>Book</label>
                      <select
                        className="nb-form-select"
                        value={currentBook?.code || ''}
                        onChange={e => {
                          setSelectedBookCode(e.target.value)
                          setSelectedChapterFile('')
                          setSelectedSectionId('')
                        }}
                      >
                        {currentSubject.books.map(b => (
                          <option key={b.code} value={b.code}>
                            {b.title} ({b.medium === 'hi' ? 'Hindi' : 'English'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentBook && (
                    <div className="nb-form-field">
                      <label>Chapter</label>
                      <select
                        className="nb-form-select"
                        value={currentChapter?.file || ''}
                        onChange={e => {
                          setSelectedChapterFile(e.target.value)
                          setSelectedSectionId('')
                        }}
                      >
                        {currentBook.chapters.map(ch => (
                          <option key={ch.file} value={ch.file}>
                            Ch {ch.n}: {ch.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {currentChapter && currentChapter.sections && currentChapter.sections.length > 0 && (
                    <div className="nb-form-field">
                      <label>Section (Optional)</label>
                      <select
                        className="nb-form-select"
                        value={selectedSectionId}
                        onChange={e => setSelectedSectionId(e.target.value)}
                      >
                        <option value="">Whole chapter</option>
                        {currentChapter.sections.map(sec => (
                          <option key={sec.id} value={sec.id}>
                            {sec.id} {sec.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ marginTop: 18, textAlign: 'right' }}>
                    <SketchButton onClick={handleAddNcert} disabled={!currentChapter || !!loadingMsg}>
                      Add NCERT Chapter
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Tab: Upload PDF */}
              {activeTab === 'pdf' && (
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <p style={{ margin: '0 0 16px', color: 'var(--ink-soft)' }}>
                    Upload any school or study PDF (up to ~10MB).
                  </p>
                  <label className="ui-btn ui-btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    Choose PDF file
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      style={{ display: 'none' }}
                      disabled={!!loadingMsg}
                      onChange={handleAddPdf}
                    />
                  </label>
                </div>
              )}

              {/* Tab: Photo of a page */}
              {activeTab === 'photo' && (
                <div style={{ textAlign: 'center', padding: '24px 12px' }}>
                  <p style={{ margin: '0 0 16px', color: 'var(--ink-soft)' }}>
                    Snap a photo of your textbook or notebook page.
                  </p>
                  <label className="ui-btn ui-btn-primary" style={{ cursor: 'pointer', display: 'inline-block' }}>
                    Take photo / Upload picture
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      disabled={!!loadingMsg}
                      onChange={handleAddPhoto}
                    />
                  </label>
                </div>
              )}

              {/* Tab: Paste text */}
              {activeTab === 'text' && (
                <div>
                  <div className="nb-form-field">
                    <label>Title</label>
                    <input
                      type="text"
                      className="nb-form-input"
                      placeholder="e.g. My History Notes"
                      value={textTitle}
                      onChange={e => setTextTitle(e.target.value)}
                    />
                  </div>
                  <div className="nb-form-field">
                    <label>Text Content</label>
                    <textarea
                      className="nb-form-textarea"
                      placeholder="Paste your text or notes here..."
                      rows={6}
                      value={textContent}
                      onChange={e => setTextContent(e.target.value)}
                    />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <SketchButton onClick={handleAddText} disabled={!textContent.trim() || !!loadingMsg}>
                      Add Text Source
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Tab: Web link */}
              {activeTab === 'url' && (
                <div>
                  <div className="nb-form-field">
                    <label>Article or Web URL</label>
                    <input
                      type="url"
                      className="nb-form-input"
                      placeholder="https://en.wikipedia.org/wiki/..."
                      value={webUrl}
                      onChange={e => setWebUrl(e.target.value)}
                    />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <SketchButton onClick={handleAddUrl} disabled={!webUrl.trim() || !!loadingMsg}>
                      Fetch Webpage
                    </SketchButton>
                  </div>
                </div>
              )}

              {/* Tab: Discover (Wikipedia) */}
              {activeTab === 'wiki' && (
                <div>
                  <div className="nb-form-field">
                    <label>Search Wikipedia</label>
                    <input
                      type="text"
                      className="nb-form-input"
                      placeholder="e.g. Chandrayaan-3, Mughal Empire, Photosynthesis"
                      value={wikiQuery}
                      onChange={e => setWikiQuery(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleAddWiki()
                      }}
                    />
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <SketchButton onClick={handleAddWiki} disabled={!wikiQuery.trim() || !!loadingMsg}>
                      Search &amp; Add
                    </SketchButton>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
