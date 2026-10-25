# Goal overlay fix plan

## Root cause (confirmed)
- `js/storage.js` declared `function norm` twice (line 7 non-exported, line 86 exported) → `SyntaxError: Identifier 'norm' has already been declared`.
- Because `dashboard.js` imports from `storage.js`, the module graph failed to load → no click listeners attached → "Generate key" button did nothing.

## Changes
1. **storage.js**: removed duplicate non-exported `norm` declaration (kept the exported one used by dashboard.js/goal.js).
2. **dashboard.html**: Preview moved to a second row below controls (bigger shell); Goal settings reordered — Caption + overlay size first; tier points stacked one under the other; count/display groups; data source/start/manual at bottom.
3. **css/dashboard.css**: two-row flex layout (controls top, full-width preview row); bigger preview shell (440px tall).

## Verification
- `node --check` passes on storage.js, dashboard.js, goal.js
- Runtime button click / preview load: left to you (per your note)
