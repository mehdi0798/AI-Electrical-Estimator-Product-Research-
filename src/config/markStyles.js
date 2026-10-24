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

// White halo drawn under every ring/diamond so it reads on black linework.
export const HALO_COLOR = 'rgba(255, 255, 255, 0.9)'
export const HALO_EXTRA = 2 // halo stroke = mark stroke + this (screen px)

// Status icon (✓ / ×): font size in screen px, placed at the ring's top-right.
export const ICON_SIZE = 10
export const ICON_COLOR = '#101828'

// Diamond for additions: half-diagonal = ring r x this factor.
export const DIAMOND_FACTOR = 0.75

// Invisible band along each ring / diamond that takes hover (and, for rows,
// clicks): stroke width in screen px. The symbol inside stays click-through.
export const HIT_WIDTH = 8

// The selected row's mark: stroke and halo this much wider (screen px).
export const SELECTED_EXTRA = 1.5

// Line style and icon per status. dash = SVG stroke-dasharray (null = solid).
export const STATUS_STYLES = {
  undecided: { strokeWidth: 1.5, dash: null, icon: null },
  accepted: { strokeWidth: 3, dash: null, icon: '✓' },
  rejected: { strokeWidth: 1.5, dash: '4 3', icon: '×' },
  added: { strokeWidth: 1.5, dash: null, icon: 'diamond' },
}

// Type chips above the drawing: rest and active colours (text >= 4.5:1 on its
// background), and the type dot's diameter (screen px). Dot colour = TYPE_COLORS.
export const CHIP_STYLE = {
  rest: { background: '#ffffff', border: '#d0d5dd', text: '#344054' },
  active: { background: '#344054', border: '#344054', text: '#ffffff' },
  dotSize: 8,
}
