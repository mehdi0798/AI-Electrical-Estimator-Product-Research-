import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  ZOOM_MAX, ZOOM_MIN, clampZoom, fitWidthZoom, imageToScreen, scrollToCenter, stepZoom, visibleImageCenter, zoomAroundPoint,
} from './lib/geometry'
import { createGesture, createScrollFilter, zoomPercent } from './lib/gestures'
import { T } from './lib/fr'

// A zoomable, pannable image (v0.3 step 8). Used for the drawing; step 12 reuses
// it for the legend. The <img> is drawn at naturalWidth x zoom (no CSS transform),
// so scroll sizes and click maths stay exact. `children` is a function of the
// current zoom that returns the overlays (box, dots), placed at (x*zoom, y*zoom)
// through the shared conversion in lib/geometry (Hard rule 7).
//
//   - opens at `startZoom`, or at fit width if that would be wider than the pane
//     (or if no startZoom is given); same rule on resize until the participant
//     zooms. After the Fit width button, resize refits to width.
//   - toolbar: - , % , + , Fit width (x1.25 steps, 25%-400%)
//   - ctrl + wheel / trackpad pinch zooms around the pointer; plain wheel scrolls
//   - click-and-drag pans (grab cursor); a move under 4 px is still a click
//
// Step 10: the participant's zoom and pan gestures are reported through the
// optional onZoomChange / onPan callbacks (the legend passes neither), ONE call
// per gesture, with x,y = the centre of the visible image in image pixels:
//   onZoomChange({ how: 'button'|'wheel'|'fit', oldPct, newPct, center, ts })
//   onPan({ how: 'drag'|'scroll', pct, center, ts })
// A wheel or scroll burst ends after 300 ms without a tick. Fits the app does by
// itself (sheet open, window resize) and scrolls the app makes (re-anchoring a
// zoom, click-to-jump, fit) or the layout causes (resize, legend toggle) are not
// reported.
const DRAG_THRESHOLD = 4
const GESTURE_QUIET_MS = 300
const INSTANT_SCROLL_MS = 300 // an instant app scroll: its scroll event comes next frame
const SMOOTH_SCROLL_MS = 1500 // click-to-jump's smooth scroll
const DRAG_TAIL_MS = 100 // the scroll event of a drag's last move can land after pointerup

const ZoomableImage = forwardRef(function ZoomableImage(
  { src, alt, imgRef, startZoom, panDisabled = false, onImageClick, onLoad, onZoomChange, onPan, className = '', children },
  ref,
) {
  const scrollRef = useRef(null)
  const [zoom, setZoom] = useState(null) // null until the image is loaded and fitted
  const zoomRef = useRef(null) // current zoom for event handlers between renders
  const userZoomed = useRef(false) // after the first zoom, resize keeps the zoom
  const startMode = useRef(true) // until Fit width is pressed, automatic fits use startZoom
  const pendingScroll = useRef(null) // scroll to apply after the new size renders
  const pendingZoomLog = useRef(null) // { how, oldZoom } to report once it renders
  const drag = useRef(null)
  const suppressClick = useRef(false)
  const [dragging, setDragging] = useState(false)

  const img = () => imgRef.current
  const box = () => scrollRef.current

  // Latest callbacks, so long-lived handlers and timers never call stale ones.
  const cb = useRef({})
  cb.current = { onZoomChange, onPan }

  // Centre of the visible image in image px. Remembered, so a gesture flushed
  // after the viewer is gone (unmount) still reports where the view was.
  const lastCenter = useRef(null)
  const viewCenter = () => {
    const b = box()
    const i = img()
    const z = zoomRef.current
    if (b && i?.naturalWidth && z) {
      const r = b.getBoundingClientRect()
      const left = r.left + b.clientLeft
      const top = r.top + b.clientTop
      const viewRect = { left, top, right: left + b.clientWidth, bottom: top + b.clientHeight }
      lastCenter.current = visibleImageCenter({ viewRect, imageRect: i.getBoundingClientRect(), zoom: z })
    }
    return lastCenter.current
  }

  // One zoom_changed per change of the logged (integer) %.
  const reportZoom = (how, oldZoom, ts = Date.now()) => {
    const oldPct = zoomPercent(oldZoom)
    const newPct = zoomPercent(zoomRef.current)
    if (oldPct === newPct) return
    cb.current.onZoomChange?.({ how, oldPct, newPct, center: viewCenter(), ts })
  }
  const reportPan = (how, ts = Date.now()) =>
    cb.current.onPan?.({ how, pct: zoomPercent(zoomRef.current), center: viewCenter(), ts })

  // Debounced gestures: a ctrl+wheel zoom burst, and a wheel / scrollbar / key
  // scroll burst. Created once; their callbacks only read refs.
  const lazy = (r, make) => r.current ?? (r.current = make())
  const wheelZoomRef = useRef(null)
  const wheelZoom = lazy(wheelZoomRef, () =>
    createGesture({ quietMs: GESTURE_QUIET_MS, onEnd: (oldZoom, ts) => reportZoom('wheel', oldZoom, ts) }))
  const scrollPanRef = useRef(null)
  const scrollPan = lazy(scrollPanRef, () =>
    createGesture({ quietMs: GESTURE_QUIET_MS, onEnd: (_, ts) => reportPan('scroll', ts) }))
  const filterRef = useRef(null)
  const scrollFilter = lazy(filterRef, () => createScrollFilter())
  // The view's size as last seen. A scroll that comes with a new size is the
  // browser clamping the position after a layout change (window resize, legend
  // opened or closed), never the participant. Updated here AND by the resize
  // observer, so it works whichever of the two the browser reports first.
  const viewSize = useRef(null)
  const sizeChanged = () => {
    const b = box()
    const now = `${b.clientWidth}x${b.clientHeight}`
    const changed = viewSize.current !== null && viewSize.current !== now
    viewSize.current = now
    return changed
  }
  // Before the app or another gesture moves the view, close the open gestures,
  // so each reports the view as the participant left it.
  const endGestures = () => {
    wheelZoom.flush()
    scrollPan.flush()
  }

  // Set the scroll position from code; the scroll events it causes are not pans.
  const appScroll = (pos, ms = INSTANT_SCROLL_MS) => {
    const b = box()
    b.scrollLeft = pos.left
    b.scrollTop = pos.top
    scrollFilter.expect({ left: b.scrollLeft, top: b.scrollTop }, ms) // as clamped
  }

  const applyZoom = (newZoom, scroll) => {
    zoomRef.current = newZoom
    pendingScroll.current = scroll ?? null
    setZoom(newZoom)
  }

  // how = 'fit' for the Fit width button (logged, always fit width); automatic
  // fits (sheet open, resize) pass nothing.
  const fit = (how) => {
    const b = box()
    const i = img()
    if (!b || !i?.naturalWidth) return
    endGestures()
    userZoomed.current = false
    if (how) startMode.current = false
    const oldZoom = zoomRef.current
    const fitZoom = fitWidthZoom({ viewWidth: b.clientWidth, naturalWidth: i.naturalWidth })
    // Sheet open, and resize before the first zoom: startZoom, but never wider
    // than the pane (no sideways scrollbar at the start).
    const newZoom = startMode.current && startZoom ? Math.min(clampZoom(startZoom), fitZoom) : fitZoom
    if (newZoom === oldZoom) {
      appScroll({ left: 0, top: 0 }) // same size: no re-render, scroll directly
      return
    }
    if (how && oldZoom) pendingZoomLog.current = { how, oldZoom }
    applyZoom(newZoom, { left: 0, top: 0 })
  }

  // Zoom keeping the image point under (offsetX, offsetY) in the view fixed.
  // Returns true if the zoom changed.
  const zoomTo = (target, offsetX, offsetY) => {
    const b = box()
    const z = zoomRef.current
    if (!b || !z) return false
    const newZoom = clampZoom(target)
    if (newZoom === z) return false
    userZoomed.current = true
    const ox = offsetX ?? b.clientWidth / 2
    const oy = offsetY ?? b.clientHeight / 2
    applyZoom(newZoom, zoomAroundPoint({ scrollLeft: b.scrollLeft, scrollTop: b.scrollTop, offsetX: ox, offsetY: oy, zoom: z, newZoom }))
    return true
  }

  // The - / + buttons: one zoom_changed per click that changes the zoom.
  const zoomButton = (direction) => {
    endGestures()
    const oldZoom = zoomRef.current
    if (zoomTo(stepZoom(oldZoom, direction))) pendingZoomLog.current = { how: 'button', oldZoom }
  }

  useLayoutEffect(() => {
    const b = box()
    const s = pendingScroll.current
    if (b && s) {
      pendingScroll.current = null
      appScroll(s)
    }
    const log = pendingZoomLog.current
    pendingZoomLog.current = null
    if (log) reportZoom(log.how, log.oldZoom)
    else viewCenter()
  }, [zoom])

  // An image served from cache can finish loading before onLoad is attached.
  useEffect(() => {
    if (img()?.complete && img().naturalWidth && zoomRef.current === null) {
      fit()
      onLoad?.()
    }
  }, [])

  // Refit to width when the pane changes size, until the participant zooms.
  // A resize can also clamp the scroll position: that is not a pan.
  useEffect(() => {
    const b = box()
    if (!b || typeof ResizeObserver === 'undefined') return
    let lastWidth = b.clientWidth
    const ro = new ResizeObserver(() => {
      endGestures()
      sizeChanged()
      scrollFilter.expect({ left: b.scrollLeft, top: b.scrollTop }, INSTANT_SCROLL_MS)
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
      if (!e.ctrlKey) {
        scrollFilter.clear() // plain wheel scrolls: the participant's own scroll
        return
      }
      e.preventDefault()
      const z = zoomRef.current
      if (!z) return
      if (!wheelZoom.active) scrollPan.flush()
      wheelZoom.tick(z) // the zoom at the first tick is the gesture's old value
      const r = b.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.002)
      zoomTo(z * factor, e.clientX - r.left - b.clientLeft, e.clientY - r.top - b.clientTop)
    }
    b.addEventListener('wheel', onWheel, { passive: false })
    return () => b.removeEventListener('wheel', onWheel)
  }, [])

  // Never lose a gesture (Hard rule 5): report an open one when the viewer goes
  // away (next sheet) or the page is closed.
  useEffect(() => {
    window.addEventListener('pagehide', endGestures)
    return () => {
      window.removeEventListener('pagehide', endGestures)
      endGestures()
    }
  }, [])

  // Wheel, scrollbar and keyboard scrolling: one 'scroll' pan per burst.
  const onScroll = () => {
    const b = box()
    if (!b || drag.current?.moved) return // a drag reports itself
    if (sizeChanged()) return // layout clamped the position
    if (scrollFilter.isProgrammatic({ left: b.scrollLeft, top: b.scrollTop })) return
    if (!scrollPan.active) wheelZoom.flush()
    viewCenter()
    scrollPan.tick()
  }

  // Click-and-drag to pan. Off while the parent needs plain clicks (Add missing).
  const onPointerDown = (e) => {
    if (e.target === box()) scrollFilter.clear() // scrollbar / pane press: participant intent
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
      endGestures()
      box().setPointerCapture?.(d.id)
      setDragging(true)
    }
    box().scrollLeft = d.left - dx
    box().scrollTop = d.top - dy
  }
  // One 'drag' pan per drag that moved the view; a click (under 4 px) is none.
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (d?.moved) {
      suppressClick.current = true // the click that ends a drag is not a click
      setDragging(false)
      const b = box()
      scrollFilter.expect({ left: b.scrollLeft, top: b.scrollTop }, DRAG_TAIL_MS)
      if (b.scrollLeft !== d.left || b.scrollTop !== d.top) reportPan('drag')
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
    // Centre image point (x, y) in the view at the current zoom (not a pan).
    centerOn: (x, y) => {
      const b = box()
      const i = img()
      const z = zoomRef.current
      if (!b || !i?.naturalWidth || !z) return
      endGestures()
      const target = scrollToCenter({
        x, y, zoom: z, naturalWidth: i.naturalWidth, naturalHeight: i.naturalHeight,
        viewWidth: b.clientWidth, viewHeight: b.clientHeight,
      })
      if (target.left === b.scrollLeft && target.top === b.scrollTop) return
      scrollFilter.expect(target, SMOOTH_SCROLL_MS)
      b.scrollTo({ ...target, behavior: 'smooth' })
    },
  }))

  const natural = img()?.naturalWidth
  const pct = zoom ? zoomPercent(zoom) : null

  return (
    <div className={'zi ' + className}>
      <div
        ref={scrollRef}
        className={'zi-scroll' + (panDisabled ? ' no-pan' : dragging ? ' dragging' : '')}
        onScroll={onScroll}
        onKeyDown={() => scrollFilter.clear()}
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
            style={zoom && natural ? { width: `${imageToScreen({ x: natural, y: 0, zoom }).left}px` } : { visibility: 'hidden' }}
          />
          {zoom && children?.(zoom)}
        </div>
      </div>
      <div className="zi-toolbar" role="toolbar" aria-label="Zoom">
        <button type="button" className="zi-btn" title={T.zoomOut} aria-label={T.zoomOut}
          onClick={() => zoomButton(-1)} disabled={!zoom || zoom <= ZOOM_MIN}>
          −
        </button>
        <span className="zi-level" aria-live="polite">{pct === null ? '' : `${pct}%`}</span>
        <button type="button" className="zi-btn" title={T.zoomIn} aria-label={T.zoomIn}
          onClick={() => zoomButton(1)} disabled={!zoom || zoom >= ZOOM_MAX}>
          +
        </button>
        <button type="button" className="zi-btn zi-fit" onClick={() => fit('fit')} disabled={!zoom}>
          {T.fitWidth}
        </button>
      </div>
    </div>
  )
})

export default ZoomableImage
