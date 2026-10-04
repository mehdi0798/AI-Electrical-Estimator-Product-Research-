import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { ZOOM_MAX, ZOOM_MIN, clampZoom, fitWidthZoom, scrollToCenter, stepZoom, zoomAroundPoint } from './lib/geometry'

// A zoomable, pannable image (v0.3 step 8). Used for the drawing; step 12 reuses
// it for the legend. The <img> is drawn at naturalWidth x zoom (no CSS transform),
// so scroll sizes and click maths stay exact. Children are overlays (box, dots)
// positioned in % of the image box, so they follow every zoom.
//
//   - opens at FIT WIDTH; refits on resize until the participant zooms
//   - toolbar: - , % , + , Fit width (x1.25 steps, 25%-400%)
//   - ctrl + wheel / trackpad pinch zooms around the pointer; plain wheel scrolls
//   - click-and-drag pans (grab cursor); a move under 4 px is still a click
//
// Nothing is logged here (zoom and pan logging is step 10).
const DRAG_THRESHOLD = 4

const ZoomableImage = forwardRef(function ZoomableImage(
  { src, alt, imgRef, panDisabled = false, onImageClick, onLoad, className = '', children },
  ref,
) {
  const scrollRef = useRef(null)
  const [zoom, setZoom] = useState(null) // null until the image is loaded and fitted
  const zoomRef = useRef(null) // current zoom for event handlers between renders
  const userZoomed = useRef(false) // after the first zoom, resize keeps the zoom
  const pendingScroll = useRef(null) // scroll to apply after the new size renders
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)

  const img = () => imgRef.current
  const box = () => scrollRef.current

  const applyZoom = (newZoom, scroll) => {
    zoomRef.current = newZoom
    pendingScroll.current = scroll ?? null
    setZoom(newZoom)
  }

  const fit = () => {
    const b = box()
    const i = img()
    if (!b || !i?.naturalWidth) return
    userZoomed.current = false
    applyZoom(fitWidthZoom({ viewWidth: b.clientWidth, naturalWidth: i.naturalWidth }), { left: 0, top: 0 })
  }

  // Zoom keeping the image point under (offsetX, offsetY) in the view fixed.
  const zoomTo = (target, offsetX, offsetY) => {
    const b = box()
    const z = zoomRef.current
    if (!b || !z) return
    const newZoom = clampZoom(target)
    if (newZoom === z) return
    userZoomed.current = true
    const ox = offsetX ?? b.clientWidth / 2
    const oy = offsetY ?? b.clientHeight / 2
    applyZoom(newZoom, zoomAroundPoint({ scrollLeft: b.scrollLeft, scrollTop: b.scrollTop, offsetX: ox, offsetY: oy, zoom: z, newZoom }))
  }

  useLayoutEffect(() => {
    const b = box()
    const s = pendingScroll.current
    if (!b || !s) return
    pendingScroll.current = null
    b.scrollLeft = s.left
    b.scrollTop = s.top
  }, [zoom])

  // An image served from cache can finish loading before onLoad is attached.
  useEffect(() => {
    if (img()?.complete && img().naturalWidth && zoomRef.current === null) {
      fit()
      onLoad?.()
    }
  }, [])

  // Refit to width when the pane changes size, until the participant zooms.
  useEffect(() => {
    const b = box()
    if (!b || typeof ResizeObserver === 'undefined') return
    let lastWidth = b.clientWidth
    const ro = new ResizeObserver(() => {
      if (b.clientWidth === lastWidth) return
      lastWidth = b.clientWidth
      if (!userZoomed.current) fit()
    })
    ro.observe(b)
    return () => ro.disconnect()
  }, [])

  // ctrl + wheel (and trackpad pinch, which arrives as ctrl + wheel) zooms around
  // the pointer. A non-passive listener, so the browser page itself does not zoom.
  useEffect(() => {
    const b = box()
    if (!b) return
    const onWheel = (e) => {
      if (!e.ctrlKey) return // plain wheel scrolls
      e.preventDefault()
      const z = zoomRef.current
      if (!z) return
      const r = b.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.002)
      zoomTo(z * factor, e.clientX - r.left - b.clientLeft, e.clientY - r.top - b.clientTop)
    }
    b.addEventListener('wheel', onWheel, { passive: false })
    return () => b.removeEventListener('wheel', onWheel)
  }, [])

  // Click-and-drag to pan. Off while the parent needs plain clicks (Add missing).
  const onPointerDown = (e) => {
    if (panDisabled || e.button !== 0) return
    const b = box()
    drag.current = { x: e.clientX, y: e.clientY, left: b.scrollLeft, top: b.scrollTop, moved: false, id: e.pointerId }
  }
  const onPointerMove = (e) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!d.moved) {
      d.moved = true
      box().setPointerCapture?.(d.id)
      setDragging(true)
    }
    box().scrollLeft = d.left - dx
    box().scrollTop = d.top - dy
  }
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (d?.moved) {
      suppressClick.current = true // the click that ends a drag is not a click
      setDragging(false)
    }
  }
  const onClickCapture = (e) => {
    if (suppressClick.current) {
      suppressClick.current = false
      e.stopPropagation()
      e.preventDefault()
    }
  }

  useImperativeHandle(ref, () => ({
    getZoom: () => zoomRef.current,
    // Centre image point (x, y) in the view at the current zoom.
    centerOn: (x, y) => {
      const b = box()
      const i = img()
      const z = zoomRef.current
      if (!b || !i?.naturalWidth || !z) return
      const { left, top } = scrollToCenter({
        x, y, zoom: z, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight,
        viewWidth: b.clientWidth, viewHeight: b.clientHeight,
      })
      b.scrollTo({ left, top, behavior: 'smooth' })
    },
  }))

  const natural = img()?.naturalWidth
  const pct = zoom ? Math.round(zoom * 100) : null

  return (
    <div className={'zi ' + className}>
      <div
        ref={scrollRef}
        className={'zi-scroll' + (panDisabled ? ' no-pan' : dragging ? ' dragging' : '')}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        <div className="zi-canvas">
          <img
            ref={imgRef}
            className="zi-img"
            src={src}
            alt={alt}
            draggable={false}
            onClick={onImageClick}
            onLoad={() => {
              fit()
              onLoad?.()
            }}
            style={zoom && natural ? { width: `${natural * zoom}px` } : { visibility: 'hidden' }}
          />
          {zoom && children}
        </div>
      </div>
      <div className="zi-toolbar" role="toolbar" aria-label="Zoom">
        <button type="button" className="zi-btn" title="Zoom out" aria-label="Zoom out"
          onClick={() => zoomTo(stepZoom(zoomRef.current, -1))} disabled={!zoom || zoom <= ZOOM_MIN}>
          −
        </button>
        <span className="zi-level" aria-live="polite">{pct === null ? '' : `${pct}%`}</span>
        <button type="button" className="zi-btn" title="Zoom in" aria-label="Zoom in"
          onClick={() => zoomTo(stepZoom(zoomRef.current, 1))} disabled={!zoom || zoom >= ZOOM_MAX}>
          +
        </button>
        <button type="button" className="zi-btn zi-fit" onClick={fit} disabled={!zoom}>
          Fit width
        </button>
      </div>
    </div>
  )
})

export default ZoomableImage
