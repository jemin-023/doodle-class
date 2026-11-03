import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import rough from 'roughjs'
import type { StudioTool, StudioToolProps } from '../types'
import { spreadChunks } from '../../../lib/notebook/retrieve'
import { nbPost } from '../../../lib/notebook/ai'
import { SketchButton, Icon } from '../../ui'
import './mindmap.css'

export interface MindMapRawNode {
  label: string
  children?: MindMapRawNode[]
}

export interface MindMapData {
  root: MindMapRawNode
}

interface LayoutNode {
  id: string
  label: string
  depth: number
  branchIndex: number
  color: string
  children: LayoutNode[]
  isCollapsed: boolean
  hasChildren: boolean
  isLeaf: boolean
  x: number
  y: number
  width: number
  height: number
  subtreeHeight: number
}

interface Connector {
  id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
  color: string
}

const BRANCH_COLORS = [
  '#2f5fd0', // marker-blue
  '#2f8a4c', // marker-green
  '#d9822b', // marker-orange
  '#d9472b', // marker-red
  '#1f6f78', // peacock
  '#e8892b', // saffron
]

function getInitialCollapsed(root: MindMapRawNode): Set<string> {
  const collapsed = new Set<string>()
  function walk(node: MindMapRawNode, id: string, depth: number) {
    if (node.children && node.children.length > 0) {
      if (depth >= 2) {
        collapsed.add(id)
      }
      node.children.forEach((c, i) => walk(c, `${id}-${i}`, depth + 1))
    }
  }
  walk(root, '0', 0)
  return collapsed
}

function buildLayoutTree(
  raw: MindMapRawNode,
  collapsed: Set<string>,
  id = '0',
  depth = 0,
  branchIndex = 0
): LayoutNode {
  const isRoot = depth === 0
  const color = isRoot
    ? '#23211e'
    : BRANCH_COLORS[branchIndex % BRANCH_COLORS.length]

  const rawChildren = Array.isArray(raw.children) ? raw.children : []
  const hasChildren = rawChildren.length > 0
  const isCollapsed = hasChildren && collapsed.has(id)
  const isLeaf = !hasChildren

  const width = isRoot ? 175 : (depth === 1 ? 160 : 150)
  const height = isRoot ? 54 : (depth === 1 ? 48 : 44)

  const children: LayoutNode[] = []
  if (hasChildren && !isCollapsed) {
    rawChildren.forEach((child, idx) => {
      const childBranch = isRoot ? idx : branchIndex
      children.push(buildLayoutTree(child, collapsed, `${id}-${idx}`, depth + 1, childBranch))
    })
  }

  return {
    id,
    label: raw.label || (isRoot ? 'Mind Map' : 'Topic'),
    depth,
    branchIndex,
    color,
    children,
    isCollapsed,
    hasChildren,
    isLeaf,
    x: 0,
    y: 0,
    width,
    height,
    subtreeHeight: 0,
  }
}

const V_GAP = 18

function computeHeights(node: LayoutNode) {
  if (node.children.length === 0) {
    node.subtreeHeight = node.height
  } else {
    let sum = 0
    for (let i = 0; i < node.children.length; i++) {
      computeHeights(node.children[i])
      sum += node.children[i].subtreeHeight
      if (i > 0) sum += V_GAP
    }
    node.subtreeHeight = Math.max(node.height, sum)
  }
}

function assignPositions(node: LayoutNode, startY: number, x: number) {
  node.x = x

  if (node.children.length === 0) {
    node.y = startY + (node.subtreeHeight - node.height) / 2
  } else {
    let curY = startY
    const colGap = node.depth === 0 ? 80 : (node.depth === 1 ? 75 : 70)
    const childX = node.x + node.width + colGap

    for (const child of node.children) {
      assignPositions(child, curY, childX)
      curY += child.subtreeHeight + V_GAP
    }

    const firstChild = node.children[0]
    const lastChild = node.children[node.children.length - 1]
    const firstCenter = firstChild.y + firstChild.height / 2
    const lastCenter = lastChild.y + lastChild.height / 2
    node.y = (firstCenter + lastCenter) / 2 - node.height / 2
  }
}

function flattenTree(root: LayoutNode): { nodes: LayoutNode[]; connectors: Connector[] } {
  const nodes: LayoutNode[] = []
  const connectors: Connector[] = []

  function walk(node: LayoutNode) {
    nodes.push(node)
    for (const child of node.children) {
      connectors.push({
        id: `${node.id}->${child.id}`,
        fromX: node.x + node.width,
        fromY: node.y + node.height / 2,
        toX: child.x,
        toY: child.y + child.height / 2,
        color: child.color,
      })
      walk(child)
    }
  }

  walk(root)
  return { nodes, connectors }
}

function wrapLabel(label: string, maxLineLen = 16): string[] {
  const words = label.split(/\s+/).filter(Boolean)
  if (words.length <= 2 || label.length <= maxLineLen) {
    return [label]
  }
  const mid = Math.ceil(words.length / 2)
  const line1 = words.slice(0, mid).join(' ')
  const line2 = words.slice(mid).join(' ')
  return [line1, line2]
}

function MindMapComponent({
  notebook,
  saveOutput,
  output,
  ask,
}: StudioToolProps) {
  const savedData = output?.data as MindMapData | undefined
  const [data, setData] = useState<MindMapData | null>(savedData?.root ? savedData : null)
  const [loading, setLoading] = useState<boolean>(!savedData?.root)
  const [error, setError] = useState<string | null>(null)

  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (savedData?.root) {
      return getInitialCollapsed(savedData.root)
    }
    return new Set<string>()
  })

  const [scale, setScale] = useState<number>(1)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 40 })
  const [isDragging, setIsDragging] = useState<boolean>(false)

  const containerRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const roughGroupRef = useRef<SVGGElement | null>(null)

  const isDraggingRef = useRef<boolean>(false)
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const initialFitDoneRef = useRef<boolean>(false)
  const hasSavedRef = useRef<boolean>(!!output)

  const loadMindMap = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const chunks = spreadChunks(notebook, 24000)
      const res = await nbPost<MindMapData>('mindmap', {
        chunks,
        language: notebook.language,
        boardLanguage: notebook.boardLanguage ?? notebook.language,
        grade: notebook.grade,
      })

      if (res && res.root) {
        setData(res)
        setCollapsed(getInitialCollapsed(res.root))
        initialFitDoneRef.current = false

        if (!hasSavedRef.current) {
          hasSavedRef.current = true
          const title = res.root.label ? `Mind map: ${res.root.label}` : `Mind map: ${notebook.title}`
          saveOutput({
            tool: 'mindmap',
            title,
            data: res,
          })
        }
      } else {
        setError('Could not build the mind map tree.')
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [notebook, saveOutput])

  useEffect(() => {
    if (!output && !data && !hasSavedRef.current) {
      loadMindMap()
    }
  }, [output, data, loadMindMap])

  // Layout calculation
  const { nodes, connectors } = useMemo(() => {
    if (!data?.root) return { nodes: [], connectors: [] }
    const rootLayout = buildLayoutTree(data.root, collapsed)
    computeHeights(rootLayout)
    assignPositions(rootLayout, 30, 30)
    return flattenTree(rootLayout)
  }, [data, collapsed])

  // Roughjs drawing of shapes and connectors
  useEffect(() => {
    const g = roughGroupRef.current
    const svg = svgRef.current
    if (!g || !svg) return

    while (g.firstChild) {
      g.removeChild(g.firstChild)
    }

    const rc = rough.svg(svg)

    // 1. Draw curved rough connectors
    for (const conn of connectors) {
      const { fromX, fromY, toX, toY, color } = conn
      const midX = (fromX + toX) / 2
      const d = `M ${fromX} ${fromY} C ${midX} ${fromY}, ${midX} ${toY}, ${toX} ${toY}`
      const pathEl = rc.path(d, {
        stroke: color,
        strokeWidth: 2.2,
        roughness: 1.2,
        bowing: 1.1,
      })
      g.appendChild(pathEl)
    }

    // 2. Draw rounded boxes
    for (const node of nodes) {
      const r = 8
      const { x, y, width: w, height: h, color, depth } = node
      const d = `M ${x + r} ${y} H ${x + w - r} Q ${x + w} ${y} ${x + w} ${y + r} V ${y + h - r} Q ${x + w} ${y + h} ${x + w - r} ${y + h} H ${x + r} Q ${x} ${y + h} ${x} ${y + h - r} V ${y + r} Q ${x} ${y} ${x + r} ${y} Z`
      const boxEl = rc.path(d, {
        stroke: color,
        strokeWidth: depth === 0 ? 2.6 : 1.9,
        roughness: 1.2,
        bowing: 1.1,
        fill: depth === 0 ? '#fffdf5' : '#ffffff',
        fillStyle: 'solid',
      })
      g.appendChild(boxEl)
    }
  }, [nodes, connectors])

  // Fit to screen helper
  const fitToScreen = useCallback(() => {
    if (!containerRef.current || nodes.length === 0) return

    const rect = containerRef.current.getBoundingClientRect()
    const containerW = rect.width || 390
    const containerH = rect.height || 420

    const minX = Math.min(...nodes.map(n => n.x))
    const maxX = Math.max(...nodes.map(n => n.x + n.width))
    const minY = Math.min(...nodes.map(n => n.y))
    const maxY = Math.max(...nodes.map(n => n.y + n.height))

    const padding = 30
    const treeW = maxX - minX + padding * 2
    const treeH = maxY - minY + padding * 2

    const scaleX = containerW / (treeW || 1)
    const scaleY = containerH / (treeH || 1)
    const fittedScale = Math.min(scaleX, scaleY, 1.0)
    const clampedScale = Math.max(0.35, Math.min(1.2, +fittedScale.toFixed(2)))

    const panX = (containerW - treeW * clampedScale) / 2 - (minX - padding) * clampedScale
    const panY = (containerH - treeH * clampedScale) / 2 - (minY - padding) * clampedScale

    setScale(clampedScale)
    setPan({ x: Math.round(panX), y: Math.round(panY) })
  }, [nodes])

  // Fit to screen on initial data load
  useEffect(() => {
    if (!initialFitDoneRef.current && nodes.length > 0) {
      initialFitDoneRef.current = true
      const frame = requestAnimationFrame(() => {
        fitToScreen()
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [nodes, fitToScreen])

  // Prevent default scroll during wheel zoom
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.12 : 0.88
      setScale(s => Math.max(0.3, Math.min(2.5, +(s * factor).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Pan handlers
  const handlePointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const target = e.target as Element | null
    if (target?.closest('.mm-interactive')) return

    isDraggingRef.current = true
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    panStartRef.current = { ...pan }

    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setPan({
      x: Math.round(panStartRef.current.x + dx),
      y: Math.round(panStartRef.current.y + dy),
    })
  }

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      setIsDragging(false)
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
    }
  }

  const toggleCollapse = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleExpandAll = () => {
    setCollapsed(new Set())
  }

  const handleCollapseAll = () => {
    if (!data?.root) return
    const all = new Set<string>()
    function collect(n: MindMapRawNode, id: string, depth: number) {
      if (n.children && n.children.length > 0) {
        if (depth >= 1) all.add(id)
        n.children.forEach((c, i) => collect(c, `${id}-${i}`, depth + 1))
      }
    }
    collect(data.root, '0', 0)
    setCollapsed(all)
  }

  // PNG Export
  const handleExportPng = () => {
    if (!svgRef.current || nodes.length === 0) return
    try {
      const minX = Math.min(...nodes.map(n => n.x)) - 40
      const minY = Math.min(...nodes.map(n => n.y)) - 40
      const maxX = Math.max(...nodes.map(n => n.x + n.width)) + 40
      const maxY = Math.max(...nodes.map(n => n.y + n.height)) + 40
      const w = Math.max(400, Math.ceil(maxX - minX))
      const h = Math.max(300, Math.ceil(maxY - minY))

      const clone = svgRef.current.cloneNode(true) as SVGSVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('viewBox', `${minX} ${minY} ${w} ${h}`)
      clone.setAttribute('width', String(w))
      clone.setAttribute('height', String(h))

      const viewportGroup = clone.querySelector('.mm-viewport-group')
      if (viewportGroup) {
        viewportGroup.removeAttribute('transform')
      }

      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
      bg.setAttribute('x', String(minX))
      bg.setAttribute('y', String(minY))
      bg.setAttribute('width', String(w))
      bg.setAttribute('height', String(h))
      bg.setAttribute('fill', '#ffffff')
      clone.insertBefore(bg, clone.firstChild)

      const xml = new XMLSerializer().serializeToString(clone)
      const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(svgBlob)

      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const scaleFactor = 2
        canvas.width = w * scaleFactor
        canvas.height = h * scaleFactor
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          const a = document.createElement('a')
          const rawTitle = data?.root?.label || notebook.title || 'mindmap'
          const cleanName = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'mindmap'
          a.download = `${cleanName}.png`
          a.href = canvas.toDataURL('image/png')
          a.click()
        }
        URL.revokeObjectURL(url)
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
      }
      img.src = url
    } catch (err) {
      console.error('[mindmap] Export failed:', err)
    }
  }

  if (loading) {
    return (
      <div className="mm-loading-state">
        <div className="mm-doodle-icon">✏️</div>
        <div className="mm-loading-title">Drawing your mind map...</div>
        <div className="mm-loading-blurb">
          Connecting ideas and topics from your study notebook.
        </div>
      </div>
    )
  }

  if (error || !data?.root) {
    return (
      <div className="mm-empty-state">
        <div className="mm-doodle-icon">🌱</div>
        <div className="mm-loading-title">Couldn't draw mind map</div>
        <div className="mm-loading-blurb" style={{ marginBottom: 16 }}>
          {error || 'Make sure you have added sources to your study notebook.'}
        </div>
        <SketchButton onClick={loadMindMap}>
          Try again
        </SketchButton>
      </div>
    )
  }

  return (
    <div className="mm-wrap">
      {/* Controls toolbar */}
      <div className="mm-toolbar">
        <div className="mm-btn-group">
          <button
            type="button"
            className="mm-btn"
            onClick={() => setScale(s => Math.min(2.5, +(s * 1.2).toFixed(2)))}
            title="Zoom in"
          >
            +
          </button>
          <button
            type="button"
            className="mm-btn"
            onClick={() => setScale(s => Math.max(0.3, +(s / 1.2).toFixed(2)))}
            title="Zoom out"
          >
            −
          </button>
          <button
            type="button"
            className="mm-btn"
            onClick={fitToScreen}
            title="Fit to screen"
          >
            Fit
          </button>
          <button
            type="button"
            className="mm-btn"
            onClick={handleExpandAll}
            title="Expand all branches"
          >
            Expand
          </button>
          <button
            type="button"
            className="mm-btn"
            onClick={handleCollapseAll}
            title="Collapse branches"
          >
            Collapse
          </button>
        </div>

        <div className="mm-btn-group">
          <button
            type="button"
            className="mm-btn is-export"
            onClick={handleExportPng}
            title="Download mind map as PNG image"
          >
            Export PNG
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div
        ref={containerRef}
        className={`mm-canvas-card ${isDragging ? 'is-dragging' : ''}`}
      >
        <svg
          ref={svgRef}
          className="mm-svg"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <g
            className="mm-viewport-group"
            transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`}
          >
            {/* Roughjs connectors and boxes */}
            <g ref={roughGroupRef} pointerEvents="none" />

            {/* Interactive labels, badges, and ? buttons */}
            <g className="mm-nodes-layer">
              {nodes.map(node => {
                const lines = wrapLabel(node.label)
                return (
                  <g
                    key={node.id}
                    className={`mm-node-g ${node.isLeaf ? 'is-leaf' : ''}`}
                    onClick={() => {
                      if (node.isLeaf) {
                        ask(`Explain "${node.label}" from my sources`)
                      } else {
                        toggleCollapse(node.id)
                      }
                    }}
                  >
                    {/* Click area */}
                    <rect
                      x={node.x}
                      y={node.y}
                      width={node.width}
                      height={node.height}
                      fill="transparent"
                    />

                    {/* Node text */}
                    <text
                      x={node.x + (node.hasChildren ? (node.width - 12) / 2 : node.width / 2)}
                      y={node.y + node.height / 2}
                      className={`mm-node-text ${node.depth === 0 ? 'mm-node-root-text' : ''}`}
                    >
                      {lines.length === 1 ? (
                        lines[0]
                      ) : (
                        <>
                          <tspan
                            x={node.x + (node.hasChildren ? (node.width - 12) / 2 : node.width / 2)}
                            dy="-0.55em"
                          >
                            {lines[0]}
                          </tspan>
                          <tspan
                            x={node.x + (node.hasChildren ? (node.width - 12) / 2 : node.width / 2)}
                            dy="1.15em"
                          >
                            {lines[1]}
                          </tspan>
                        </>
                      )}
                    </text>

                    {/* Expand/Collapse badge */}
                    {node.hasChildren && (
                      <g
                        className="mm-node-badge mm-interactive"
                        transform={`translate(${node.x + node.width - 12}, ${node.y + node.height / 2})`}
                        onClick={e => {
                          e.stopPropagation()
                          toggleCollapse(node.id)
                        }}
                        aria-label={node.isCollapsed ? 'Expand node' : 'Collapse node'}
                      >
                        <circle r={10} fill="#fbf8f1" stroke={node.color} strokeWidth={1.5} />
                        <text dy="0.5px">
                          {node.isCollapsed ? '+' : '−'}
                        </text>
                      </g>
                    )}

                    {/* Ask teacher button (?) */}
                    <g
                      className="mm-ask-btn mm-interactive"
                      transform={`translate(${node.x + node.width - 6}, ${node.y + 6})`}
                      onClick={e => {
                        e.stopPropagation()
                        ask(`Explain "${node.label}" from my sources`)
                      }}
                      aria-label={`Explain "${node.label}" from sources`}
                    >
                      <circle r={8} />
                      <text dy="0.5px">?</text>
                    </g>
                  </g>
                )
              })}
            </g>
          </g>
        </svg>
      </div>

      {/* Footer hint */}
      <div className="mm-foot-hint">
        <span>
          <Icon name="pencil" size={18} />
          Tap a branch to open or close it • Drag to pan • Scroll or buttons to zoom
        </span>
        <span>
          Tap ? or a leaf to ask teacher in chat
        </span>
      </div>
    </div>
  )
}

const mindmapTool: StudioTool = {
  id: 'mindmap',
  title: 'Mind map',
  blurb: 'See how the ideas connect',
  icon: 'star',
  order: 2,
  Component: MindMapComponent,
}

export default mindmapTool
