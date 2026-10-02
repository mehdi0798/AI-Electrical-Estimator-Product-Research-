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

// Zoom steps for the zoom buttons (features.zoom). 1 = native size, as in v0.1.
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export function nextZoom(current, direction) {
  if (direction > 0) return ZOOM_LEVELS.find((z) => z > current + 1e-9) ?? current
  return [...ZOOM_LEVELS].reverse().find((z) => z < current - 1e-9) ?? current
}
