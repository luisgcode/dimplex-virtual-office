# Office QA

How the office gets checked and fixed, round after round.

1. Serve locally (`python -m http.server 8765`) and open `index.html?time=HH:MM&guest=now` at 8:10, 10:30, 12:15, 15:00 and 17:30.
2. Inject `tools/qa.js` and run `await window.__qaRun(20)`. It reports, with numbers:
   feet below the floor or floating, bodies sunk into or hovering over the chair, hands under the desk while typing,
   people inside each other, people stuck while walking, heads turned too far, broken positions,
   speech bubbles covering each other or off screen, name tags piled up, JS errors, frame times.
3. Look at screenshots zoomed in on every person (hats, clothes, hands, chairs, screens).
4. Fix, re-run until the report is clean, then push.

Self-correcting at runtime: every avatar measures its own mesh once (seat on the cushion, shoes on the floor), see `calibrate()`.
Test params: `?time=`, `?day=fri`, `?guest=hana`, `?mishap=cat|book|spill|chair`, `?wx=snow|rain|cloud|clear`, `?outfit=3`, `?screen=dash` (or `?screen=all` to cycle every screen activity), `?fps=1`.
