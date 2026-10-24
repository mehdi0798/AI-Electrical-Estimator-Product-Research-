// All visual constants for the marks (Feature 1, allMarks). Colour is by type;
// status is by line style + small icon, so colour is never the only signal.
// Palette approved in Phase 1 (each colour >= 3:1 on white).

export const TYPE_COLORS = {
  'Light fixture': '#D55E00',
  Receptacle: '#009E73',
  'Track light head': '#5A2DA5',
  Panelboard: '#963C4B',
  Sensor: '#F05A78',
  Switch: '#5A4B00',
  'Exit sign': '#B478B4',
  'Ceiling fan': '#3C96D2',
  'Junction box': '#968700',
}

export const ADDED_COLOR = '#344054' // diamond, all additions
export const REJECTED_COLOR = '#667085' // dashed ring

export const RING_DIAMETER = 24 // image px
export const RING_MIN_SCREEN = 16 // screen px

// Line style and icon per status. dash = SVG stroke-dasharray (null = solid).
export const STATUS_STYLES = {
  undecided: { strokeWidth: 1.5, dash: null, icon: null },
  accepted: { strokeWidth: 3, dash: null, icon: '✓' },
  rejected: { strokeWidth: 1.5, dash: '4 3', icon: '×' },
  added: { strokeWidth: 1.5, dash: null, icon: 'diamond' },
}
