// Coordinate maths for the drawing. Every x,y the app stores or logs is in
// ORIGINAL IMAGE PIXELS (naturalWidth/naturalHeight), never screen pixels, at any
// zoom level or scroll position (Hard rule 7). Plain functions, tested in Node.
//
// THE shared conversion (v0.3 step 9). zoom = screen px per image px; the image
// is drawn at naturalWidth x zoom. "Screen" points are measured from the drawn
// image's top-left corner. Every other conversion below goes through this pair.
export function imageToScreen({ x, y, zoom }) {
  return { left: x * zoom, top: y * zoom }
}
export function screenToImage({ left, top, zoom }) {
  return { x: left / zoom, y: top / zoom }
}

// A click at (clientX, clientY) -> whole image pixels, as logged.
// `imageRect` is the drawn <img>'s getBoundingClientRect() (it already reflects
// scroll position and zoom).
export function clientToImage({ clientX, clientY, imageRect, zoom }) {
  const p = screenToImage({ left: clientX - imageRect.left, top: clientY - imageRect.top, zoom })
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

// The image point at the centre of the part of the image the participant can see
// (step 10: x,y of zoom_changed / panned). `viewRect` = the scroll box's visible
// area and `imageRect` = the drawn <img>, both in client px. The two are
// intersected first, so grey pane around a small or short image never moves the
// centre off the drawing. Goes through clientToImage (Hard rule 7).
export function visibleImageCenter({ viewRect, imageRect, zoom }) {
  const left = Math.max(viewRect.left, imageRect.left)
  const right = Math.min(viewRect.right, imageRect.right)
  const top = Math.max(viewRect.top, imageRect.top)
  const bottom = Math.min(viewRect.bottom, imageRect.bottom)
  return clientToImage({
    clientX: right > left ? (left + right) / 2 : imageRect.left + imageRect.width / 2,
    clientY: bottom > top ? (top + bottom) / 2 : imageRect.top + imageRect.height / 2,
    imageRect,
    zoom,
  })
}

// The image point at the centre of the scroll box's visible area.
export function viewportCenterImage({ scrollLeft, scrollTop, viewWidth, viewHeight, zoom }) {
  const p = screenToImage({ left: scrollLeft + viewWidth / 2, top: scrollTop + viewHeight / 2, zoom })
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

// Scroll offsets that put image point (x, y) in the centre of the view, clamped
// to what the scroll box can actually reach.
export function scrollToCenter({ x, y, zoom, naturalWidth, naturalHeight, viewWidth, viewHeight }) {
  const p = imageToScreen({ x, y, zoom })
  const size = imageToScreen({ x: naturalWidth, y: naturalHeight, zoom })
  return {
    left: Math.round(clamp(p.left - viewWidth / 2, 0, Math.max(0, size.left - viewWidth))),
    top: Math.round(clamp(p.top - viewHeight / 2, 0, Math.max(0, size.top - viewHeight))),
  }
}

export function isInsideImage(x, y, naturalWidth, naturalHeight) {
  return x >= 0 && y >= 0 && x < naturalWidth && y < naturalHeight
}

// The ONE click-to-jump box (Hard rule 3), in screen px inside the drawn image:
// a square of `size` image px centred on (x, y), so it scales with zoom, but
// never smaller than `minScreen` px on screen; clipped to the image.
// Returns null if the point is outside the image (nothing to box).
export function jumpBoxRect({ x, y, zoom, size, minScreen = 0, naturalWidth, naturalHeight }) {
  if (!isInsideImage(x, y, naturalWidth, naturalHeight)) return null
  const half = Math.max(size, screenToImage({ left: minScreen, top: 0, zoom }).x) / 2 // in image px
  const tl = imageToScreen({ x: clamp(x - half, 0, naturalWidth), y: clamp(y - half, 0, naturalHeight), zoom })
  const br = imageToScreen({ x: clamp(x + half, 0, naturalWidth), y: clamp(y + half, 0, naturalHeight), zoom })
  return { left: tl.left, top: tl.top, width: br.left - tl.left, height: br.top - tl.top }
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
  const p = screenToImage({ left: scrollLeft + offsetX, top: scrollTop + offsetY, zoom })
  const q = imageToScreen({ x: p.x, y: p.y, zoom: newZoom })
  return { left: q.left - offsetX, top: q.top - offsetY }
}
