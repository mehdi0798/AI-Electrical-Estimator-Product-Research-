// French display text (branch `fr`). DISPLAY ONLY: every value the app keeps in
// state or logs to event_log stays the English one (names, types, statuses,
// actions), so score.js works unchanged. Drawing tags (E2, D8, B-NL, IN-FAN...)
// are shown as printed. Prices keep the same format (€19,760.00).

// The nine types.
export const TYPE_FR = {
  'Light fixture': 'Luminaire',
  'Track light head': 'Spot sur rail',
  'Exit sign': 'Panneau de sortie',
  'Ceiling fan': 'Ventilateur de plafond',
  Receptacle: 'Prise de courant',
  Switch: 'Interrupteur',
  Sensor: 'Détecteur',
  'Junction box': 'Boîte de dérivation',
  Panelboard: 'Tableau électrique',
}

// Catalog names that are words. Every other name is a drawing tag: unchanged.
export const NAME_FR = {
  'Junction box': 'Boîte de dérivation',
  'Surface mounted panelboard': 'Tableau électrique en saillie',
  'Duplex receptacle': 'Prise double',
  'Duplex receptacle, GFI': 'Prise double, différentielle',
  'Duplex receptacle, above counter': 'Prise double, au-dessus du plan de travail',
  'Duplex receptacle, isolated ground': 'Prise double, terre isolée',
  'Floor receptacle': 'Prise de sol',
  'Floor receptacle, isolated ground': 'Prise de sol, terre isolée',
  'Quad receptacle': 'Prise quadruple',
  'Quad receptacle, isolated ground': 'Prise quadruple, terre isolée',
  'Special purpose receptacle': 'Prise spécialisée',
  'Occupancy sensor': 'Détecteur de présence',
  'Single pole wall switch': 'Interrupteur simple',
}

export const typeLabel = (type) => TYPE_FR[type] ?? type
export const nameLabel = (name) => NAME_FR[name] ?? name

// Sheet names come from the sheet JSON (data, unchanged): "Sheet 3", "Practice Sheet".
export function sheetLabel(name) {
  if (name === 'Practice Sheet') return "Feuille d'entraînement"
  const m = /^Sheet (\d+)$/.exec(name ?? '')
  return m ? `Feuille ${m[1]}` : name
}

// "Sheet k of N" in the header and on the resume screen.
export const sheetOf = (k, n) => `Feuille ${k} sur ${n}`

// French spacing before ":" and "?" (non-breaking space).
const NB = ' '

export const T = {
  // Start screen
  sessionSetup: 'Configuration de la session',
  setupSub: "D'abord la feuille d'entraînement, puis les six feuilles de l'étude.",
  participant: 'Participant',
  optionA: 'A — feuilles 1 → 6',
  optionB: 'B — feuilles 6 → 1',
  sessionLabel: 'Libellé de la session',
  sessionPlaceholder: 'ex. pilot1, real',
  startSession: 'Démarrer la session',
  // Between and end screens
  sheetDone: 'Feuille terminée.',
  clickContinue: 'Cliquez sur Continuer quand vous êtes prêt(e).',
  continue: 'Continuer',
  sessionComplete: 'Session terminée.',
  thankYou: 'Merci.',
  // Resume screen (features.resume)
  unfinishedSession: 'Session inachevée',
  practiceSheet: "Feuille d'entraînement",
  session: 'Session',
  done: ' (terminée)',
  resumeSession: 'Reprendre la session',
  discardStartNew: 'Abandonner et recommencer',
  staysLogged: 'Tout ce qui a déjà été fait dans cette session reste enregistré.',
  // Analyse panel (features.analyseAnimation)
  detectingSymbols: 'Détection des symboles…',
  drawingLoaded: 'Plan chargé',
  runAnalysis: "Lancez l'analyse pour détecter les symboles électriques sur cette feuille.",
  analyseDrawing: 'Analyser le plan',
  // Review screen
  practice: 'Entraînement',
  loadingSheet: 'Chargement de la feuille…',
  couldNotLoad: `Impossible de charger la feuille${NB}:`,
  bidTotal: 'Total du devis',
  submitSheet: 'Soumettre la feuille',
  legend: 'Légende',
  legendAlt: 'Légende électrique',
  detected: (n) => `${n} éléments détectés · Triés par confiance`,
  colItemType: 'Élément · Type',
  colConf: 'Conf.',
  colUnitPrice: 'Prix unitaire',
  colReview: 'Vérification',
  accept: 'Accepter',
  reject: 'Rejeter',
  edit: 'Modifier',
  remove: 'Retirer',
  yourAdditions: 'Vos ajouts',
  added: 'Ajouté',
  placeHint: "Cliquez sur le plan pour placer l'élément manquant",
  cancel: 'Annuler',
  addMissingButton: '+ Ajouter un élément manquant',
  // Dialogs
  addMissingTitle: 'Ajouter un élément manquant',
  type: 'Type',
  name: 'Nom',
  confirm: 'Confirmer',
  editItem: "Modifier l'élément",
  now: `Actuel${NB}:`,
  unitPrice: `Prix unitaire${NB}:`,
  finalBid: (amount) => `Devis final${NB}: ${amount}. Confirmer${NB}?`,
  // Zoom toolbar
  zoomOut: 'Zoom arrière',
  zoomIn: 'Zoom avant',
  fitWidth: 'Ajuster à la largeur',
}
