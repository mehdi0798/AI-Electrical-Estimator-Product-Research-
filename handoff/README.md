# Handoff: real sheets and verified item lists

Six cropped sheet images and one verified item list per sheet. They replace the
placeholder sheets. The lists are the BASELINE (full truth, before any error is planted).

## Files
- `sheets/sheet1.png` ... `sheet6.png` -> copy to `public/sheets/` byte for byte.
  Never resize, re-crop or re-encode: every x,y is tied to these exact pixels.
- `baseline_lists/sheetN.items.csv` -> source for `baseline/sheetN.baseline.json`.
  Full truth. Must NEVER be in `public/` or `src/` (Hard rule 6). Same for this folder.
- `catalog.csv` -> every item name with its type and unit price (EUR, installed: item + labour).
  The prices are fixed study prices chosen by the researcher. Use them as given.
- `sheets_summary.csv` -> item count, image size and sha256 per sheet.

## Item list columns
`id, name, type, description, label, where, x, y, status`
- `id`    B001... unique inside one sheet. Internal. Never shown to a participant.
- `name`  what the row is called in the tool. It is the tag printed on the drawing
          (E2, D8, H...) or, when the drawing prints no tag, the legend name
          (Duplex receptacle, Junction box...).
- `type`  the family the name belongs to (Light fixture, Receptacle, Track light head,
          Exit sign, Ceiling fan, Switch, Sensor, Junction box, Panelboard).
- `description`, `label`, `where`  for the researcher only. Not shown to a participant.
- `x, y`  centre of the symbol in ORIGINAL IMAGE PIXELS of that sheet's PNG (Hard rule 7).
- `status` `sure`, or what is still to confirm (always the name, never the position).

## Counts and sizes
| sheet | items | image |
|---|---|---|
| 1 | 52 | 1100 x 433 |
| 2 | 45 | 1100 x 542 |
| 3 | 55 | 2019 x 719 |
| 4 | 54 | 1100 x 683 |
| 5 | 59 | 1302 x 706 |
| 6 | 47 | 1100 x 1148 |

312 items, 38 names, 9 types. All sheets are at the same drawing scale. Sheets 3 and 5
are wider than the review pane and sheet 6 is taller, so the drawing scrolls. Expected.

## Rules used for the count
- One row = one physical symbol.
- Counted: a symbol with a tag, or a symbol that is in the electrical legend.
- Not counted: note hexagons, equipment ovals, circuit text, wiring lines, furniture,
  black wall-screen bars, any unlabelled mark.
- Track lights: each head (H or K) is one row. The track itself is not a row.
- Grey areas on an image are outside the review zone.

## Still open (names only; positions are final)
- Sheet 1: FE and G (B018, B019) are not confirmed; likely panelboards.
- "NL" is read as night light; not confirmed on the lighting schedule.
- Sheet 3: which quad of each pair is isolated ground (given to the C2 circuit one).
- Sheet 4: CL4 counted as two fixtures; the four "M" lights read as fixture name M.
- Sheet 5: name L on the ten black bars (the letter is very small).
- Sheet 6: AC / GFI / WP-GFI tags on the crowded wall are not assigned; those rows are
  plain "Duplex receptacle".
