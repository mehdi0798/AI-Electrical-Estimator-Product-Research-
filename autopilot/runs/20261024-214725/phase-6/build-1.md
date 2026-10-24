## Changed
- `src/components/MarksToggle.jsx` (new): the "Marks on / Marks off" button above the drawing, with an **M** key hint. It only shows the button and does no logging.
- `src/App.jsx`: adds the `marksOn` state, which starts on. One handler logs `marks_toggled` (`on`/`off`) and flips the state. The **M** key toggles marks, except while you type in a field, hold Ctrl/Alt/Cmd, or hold the key down. The button sits in one row with the type chips. Switching off hides every ring and diamond, but the blue jump box and the draft pin stay.
- `src/App.css`: layout for the new toolbar row (button on the left, chips wrapping beside it), the button's size and focus outline, and the M key hint.
- `src/config/markStyles.js`: the on/off colours of the button (`TOGGLE_STYLE`), the same calm tones as the chips.
- `src/lib/marks.js`: new `isTypingTarget(el)`, which tells whether a key was pressed inside an input, select, textarea or editable text.
- `scripts/marks.test.js`: tests for `isTypingTarget` and `TOGGLE_STYLE`. `npm test` passes (28 marks tests, plus the existing ones) and `npm run build` succeeds. `allMarks` is still `false`.

## What to click
1. To see anything, set `"allMarks": true` in `src/config/features.json` on your machine only (don't commit it). Then run `npm run dev`.
2. Start a session and open the practice sheet. Click **Analyse drawing** and wait for the list. A **Marks on [M]** button appears above the drawing, to the left of the type chips.
3. Click **Marks on**. Every ring and diamond disappears and the button reads **Marks off**. Click it again and the marks come back.
4. Click anywhere on the page that is not a text field, then press **M**. The marks hide. Press **M** again and they show.
5. Click a row so the blue jump box shows, then press **M**. The rings hide but the blue box stays.
6. Click **Add missing**, click the drawing, then open the item dropdown in the popover and type **m** there. The marks must not toggle. Do the same in the Edit dialog's dropdown.
7. Pick a type chip such as **Receptacle**, switch marks off, then on again. Only that type's marks come back.
8. Open the browser devtools (Application → Local Storage, the log queue). Each button click or **M** press adds exactly one `marks_toggled` event, with new_value `off` or `on`. Holding **M** down adds only one.
9. Set `allMarks` back to `false` and reload. There is no button and pressing **M** does nothing.