// Coordinate maths for the drawing. Every x,y the app stores or logs is in
// ORIGINAL IMAGE PIXELS (naturalWidth/naturalHeight), never screen pixels, at any
// zoom level or scroll position (Hard rule 7). Plain functions, tested in Node.

// A click at (clientX, clientY) on the rendered image -> image pixels.
// `rect` is the image's getBoundingClientRect(): it already reflects scroll and
// zoom (rect.width = naturalWidth * zoom), so the ratio converts any zoom.
export function clientToImage({ clientX, clientY, rect, naturalWidth, naturalHeight }) {
  const scaleX = naturalWidth / rect.width
  const scaleY = naturalHeight / rect.height
  return {
    x: Math.round((clientX - rect.left) * scaleX),
    y: Math.round((clientY - rect.top) * scaleY),
  }
}

// The image point at the centre of the scroll box's visible area.
export function viewportCenterImage({ scrollLeft, scrollTop, viewWidth, viewHeight, zoom }) {
  return {
    x: Math.round((scrollLeft + viewWidth / 2) / zoom),
    y: Math.round((scrollTop + viewHeight / 2) / zoom),
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Scroll offsets that put image point (x, y) in the centre of the view, clamped
// to what the scroll box can actually reach.
export function scrollToCenter({ x, y, zoom, naturalWidth, naturalHeight, viewWidth, viewHeight }) {
  const maxLeft = Math.max(0, naturalWidth * zoom - viewWidth)
  const maxTop = Math.max(0, naturalHeight * zoom - viewHeight)
  return {
    left: Math.round(clamp(x * zoom - viewWidth / 2, 0, maxLeft)),
    top: Math.round(clamp(y * zoom - viewHeight / 2, 0, maxTop)),
  }
}

export function isInsideImage(x, y, naturalWidth, naturalHeight) {
  return x >= 0 && y >= 0 && x < naturalWidth && y < naturalHeight
}

// A square box of `size` image px centred on (x, y), clipped to the image, as
// CSS percentages of the image box, so it stays on the item at any zoom.
// Returns null if the point is outside the image (nothing to box).
export function boxPercent({ x, y, size, naturalWidth, naturalHeight }) {
  if (!isInsideImage(x, y, naturalWidth, naturalHeight)) return null
  const left = clamp(x - size / 2, 0, naturalWidth)
  const top = clamp(y - size / 2, 0, naturalHeight)
  const right = clamp(x + size / 2, 0, naturalWidth)
  const bottom = clamp(y + size / 2, 0, naturalHeight)
  // Rounded to 4 decimals: drops float noise, far below a pixel.
  const pct = (v, total) => `${Math.round((v / total) * 1e6) / 1e4}%`
  return {
    left: pct(left, naturalWidth),
    top: pct(top, naturalHeight),
    width: pct(right - left, naturalWidth),
    height: pct(bottom - top, naturalHeight),
  }
}

// True if the scroll position is (within `tol` px) at a target the app scrolled
// to itself. Used to tell programmatic scrolls (zoom re-centre, jump) apart from
// participant pans, so only real pans are logged.
export function isAtScroll(pos, target, tol = 2) {
  return (
    !!target && Math.abs(pos.left - target.left) <= tol && Math.abs(pos.top - target.top) <= tol
  )
}

// --- Zoom (v0.3 step 8) -----------------------------------------------------------
// zoom = screen pixels per image pixel: 1 = 100% = native size. The <img> is drawn
// at naturalWidth x zoom, so image pixels never change (Hard rule 7).
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 4
export const ZOOM_STEP = 1.25

export const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

// Fit width: the image exactly fills the pane's inner width (no cap at 100%).
export function fitWidthZoom({ viewWidth, naturalWidth }) {
  return clampZoom(viewWidth / naturalWidth)
}

// The +/- buttons: one step of x1.25, clamped to 25%-400%.
export function stepZoom(zoom, direction) {
  return clampZoom(direction > 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP)
}

// Zoom around an anchor (the pointer, or the view centre): the image point under
// the anchor stays under it. offsetX/offsetY = anchor position inside the view
// (screen px from the view's top-left). Returns the new scroll offsets; the
// browser clamps them to what the scroll box can reach.
export function zoomAroundPoint({ scrollLeft, scrollTop, offsetX, offsetY, zoom, newZoom }) {
  const imgX = (scrollLeft + offsetX) / zoom
  const imgY = (scrollTop + offsetY) / zoom
  return { left: imgX * newZoom - offsetX, top: imgY * newZoom - offsetY }
}
