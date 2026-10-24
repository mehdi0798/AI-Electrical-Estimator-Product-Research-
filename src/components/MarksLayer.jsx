// All marks on (Feature 1, flag allMarks): one ring per sheet row and one
// diamond per addition, all at once, in ONE svg over the drawing. Presentational
// only: no state, no logging. Positions come from ringCircle (geometry.js).

import { memo } from 'react'
import { ringCircle } from '../lib/geometry'
import { diamondPoints, drawOrder, markLabel } from '../lib/marks'
import {
  ADDED_COLOR,
  DIAMOND_FACTOR,
  HALO_COLOR,
  HALO_EXTRA,
  ICON_COLOR,
  ICON_SIZE,
  REJECTED_COLOR,
  RING_DIAMETER,
  RING_MIN_SCREEN,
  STATUS_STYLES,
  TYPE_COLORS,
} from '../config/markStyles'

function Mark({ mark, zoom }) {
  const c = ringCircle({ x: mark.x, y: mark.y, zoom, diameter: RING_DIAMETER, minScreen: RING_MIN_SCREEN })
  const label = markLabel(mark)

  if (mark.kind === 'added') {
    const s = STATUS_STYLES.added
    const points = diamondPoints({ cx: c.cx, cy: c.cy, r: c.r * DIAMOND_FACTOR })
    return (
      <g role="img" aria-label={label}>
        <polygon points={points} fill="none" stroke={HALO_COLOR} strokeWidth={s.strokeWidth + HALO_EXTRA} />
        <polygon points={points} fill="none" stroke={ADDED_COLOR} strokeWidth={s.strokeWidth} />
      </g>
    )
  }

  const s = STATUS_STYLES[mark.status]
  const color = mark.status === 'rejected' ? REJECTED_COLOR : TYPE_COLORS[mark.type] ?? REJECTED_COLOR
  // Icon at the ring's top-right (45°), outside the symbol.
  const ix = c.cx + c.r * Math.SQRT1_2
  const iy = c.cy - c.r * Math.SQRT1_2
  return (
    <g role="img" aria-label={label}>
      <circle cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke={HALO_COLOR} strokeWidth={s.strokeWidth + HALO_EXTRA} />
      <circle
        cx={c.cx}
        cy={c.cy}
        r={c.r}
        fill="none"
        stroke={color}
        strokeWidth={s.strokeWidth}
        strokeDasharray={s.dash ?? undefined}
      />
      {s.icon && (
        <text
          x={ix}
          y={iy}
          fontSize={ICON_SIZE}
          fontWeight="700"
          fill={ICON_COLOR}
          stroke={HALO_COLOR}
          strokeWidth={HALO_EXTRA}
          paintOrder="stroke"
          textAnchor="middle"
          dominantBaseline="central"
          aria-hidden="true"
        >
          {s.icon}
        </text>
      )}
    </g>
  )
}

function MarksLayer({ marks, zoom, width, height }) {
  return (
    <svg className="marks-layer" width={width} height={height} aria-label="Marks">
      {drawOrder(marks).map((m) => (
        <Mark key={m.id} mark={m} zoom={zoom} />
      ))}
    </svg>
  )
}

export default memo(MarksLayer)
