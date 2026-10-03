// Participant edits (v0.2 step 6). The sheet's items are never changed: an edit
// is an overlay { [item.id]: name } on top of them, like the status map. The row
// shown is the original item with the edited name's catalog type and price, so
// its id, x, y and confidence (and therefore its place in the list and its jump
// target) can never change. An edit never touches the row's review status.
// Plain functions, tested in Node.

// Catalog lookups, in catalog order: types for the Type select, names per type
// for the Name select, and name -> entry for type and price.
export function catalogIndex(catalog) {
  const byName = new Map(catalog.map((e) => [e.name, e]))
  const namesByType = new Map()
  for (const e of catalog) {
    if (!namesByType.has(e.type)) namesByType.set(e.type, [])
    namesByType.get(e.type).push(e.name)
  }
  return { byName, types: [...namesByType.keys()], namesByType }
}

// The row as the participant sees it: the original item, or the original item
// with the edited name's catalog name, type and unit_price.
export function displayItem(item, edits, byName) {
  const name = edits[item.id]
  if (name === undefined) return item
  const entry = byName.get(name)
  return { ...item, name: entry.name, type: entry.type, unit_price: entry.unit_price }
}

// Change a row's name. Returns { edits, event } for a real change, or null when
// the name is the one already shown (a no-op: nothing changes, nothing is logged).
// old_value is the name shown just before this edit, so a chain of edits replays.
// Editing back to the item's original name removes its overlay entry.
export function applyEdit({ edits, item, newName, byName }) {
  if (!byName.has(newName)) throw new Error(`"${newName}" is not in the catalog`)
  const current = displayItem(item, edits, byName).name
  if (newName === current) return null
  const next = { ...edits }
  if (newName === item.name) delete next[item.id]
  else next[item.id] = newName
  return {
    edits: next,
    event: { action: 'edited', item_id: item.id, old_value: current, new_value: newName },
  }
}

// Live bid: unit_price of every shown row that is not rejected (edited rows at
// their edited price), plus every participant addition.
export function bidTotal(rows, statuses, additions) {
  return (
    rows.reduce((sum, r) => (statuses[r.id] === 'rejected' ? sum : sum + r.unit_price), 0) +
    additions.reduce((sum, a) => sum + a.unit_price, 0)
  )
}
