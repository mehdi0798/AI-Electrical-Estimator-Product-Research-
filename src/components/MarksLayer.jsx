// All marks on (Feature 1, flag allMarks): one ring per sheet row and one
// diamond per addition, all at once, in ONE svg over the drawing. Presentational
// only: no state, no logging. Positions come from ringCircle (geometry.js).
// The svg ignores the pointer; only an invisible band along each ring/diamond
// takes hover (tooltip) and, for rows, clicks. No bands while not interactive
// (placing), so every click reaches the drawing.

import { memo } from 'react'
import { ringCircle } from '../lib/geometry'
import { diamondPoints, drawOrder, markLabel, markTooltip } from '../lib/marks'
import {
  ADDED_COLOR,
  DIAMOND_FACTOR,
  HALO_COLOR,
  HALO_EXTRA,
  HIT_WIDTH,
  ICON_COLOR,
  ICON_SIZE,
  REJECTED_COLOR,
  RING_DIAMETER,
  RING_MIN_SCREEN,
  SELECTED_EXTRA,
  STATUS_STYLES,
  TYPE_COLORS,
} from '../config/markStyles'

function Mark({ mark, zoom, selected, interactive, onMarkClick }) {
  const c = ringCircle({ x: mark.x, y: mark.y, zoom, diameter: RING_DIAMETER, minScreen: RING_MIN_SCREEN })
  const label = markLabel(mark)
  const tip = <title>{markTooltip(mark)}</title>

  if (mark.kind === 'added') {
    const s = STATUS_STYLES.added
    const points = diamondPoints({ cx: c.cx, cy: c.cy, r: c.r * DIAMOND_FACTOR })
    return (
      <g role="img" aria-label={label}>
        {tip}
        <polygon points={points} fill="none" stroke={HALO_COLOR} strokeWidth={s.strokeWidth + HALO_EXTRA} />
        <polygon points={points} fill="none" stroke={ADDED_COLOR} strokeWidth={s.strokeWidth} />
        {/* Hover only: no click handler, the click goes on to the drawing. */}
        {interactive && (
          <polygon
            className="mark-hit added"
            points={points}
            fill="none"
            stroke="transparent"
            strokeWidth={HIT_WIDTH}
            pointerEvents="stroke"
          />
        )}
      </g>
    )
  }

  const s = STATUS_STYLES[mark.status]
  const width = s.strokeWidth + (selected ? SELECTED_EXTRA : 0)
  const color = mark.status === 'rejected' ? REJECTED_COLOR : TYPE_COLORS[mark.type] ?? REJECTED_COLOR
  // Icon at the ring's top-right (45°), outside the symbol.
  const ix = c.cx + c.r * Math.SQRT1_2
  const iy = c.cy - c.r * Math.SQRT1_2
  return (
    <g role="img" aria-label={label}>
      {tip}
      <circle cx={c.cx} cy={c.cy} r={c.r} fill="none" stroke={HALO_COLOR} strokeWidth={width + HALO_EXTRA} />
      <circle
        cx={c.cx}
        cy={c.cy}
        r={c.r}
        fill="none"
        stroke={color}
        strokeWidth={width}
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
      {interactive && (
        <circle
          className="mark-hit"
          cx={c.cx}
          cy={c.cy}
          r={c.r}
          fill="none"
          stroke="transparent"
          strokeWidth={HIT_WIDTH}
          pointerEvents="stroke"
          onClick={(e) => {
            e.stopPropagation()
            onMarkClick(mark.id)
          }}
        />
      )}
    </g>
  )
}

function MarksLayer({ marks, zoom, width, height, selectedId, onMarkClick, interactive }) {
  // The selected row's mark is painted last among the marks (App draws the jump box above).
  const ordered = drawOrder(marks)
  const i = ordered.findIndex((m) => m.kind === 'row' && m.id === selectedId)
  if (i >= 0) ordered.push(ordered.splice(i, 1)[0])
  return (
    <svg className="marks-layer" width={width} height={height} aria-label="Marks">
      {ordered.map((m) => (
        <Mark
          key={m.id}
          mark={m}
          zoom={zoom}
          selected={m.kind === 'row' && m.id === selectedId}
          interactive={interactive}
          onMarkClick={onMarkClick}
        />
      ))}
    </svg>
  )
}

export default memo(MarksLayer)
