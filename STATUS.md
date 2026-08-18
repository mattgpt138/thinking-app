# STATUS — thinking-app

_Snapshot: 2026-08-18_

## Deployed

- **Live:** https://mattgpt138.github.io/thinking-app/ (GitHub Pages, HTTPS)
- **Cache version:** `thinking-app-v10` — bump in `sw.js` on any shell/data change
- **Model:** `claude-sonnet-5`. Key is now entered on the phone, so argument day
  runs live there. Every path still degrades to bundled content offline.
- **Tests:** open `test.html` through a web server. 166 tests, all green.

### Known issues

- Header nav wraps to a second line on an iPhone and crowds the top of the page.
- Steelman day's live evaluation has only ever been checked against mocks.
- Calibration bank (395) cycles after roughly 33 weekly sessions.

## Last completed phase

**Phase 9** — live interrogation fixed and verified against real Sonnet 5. Calls
were budgeted for a model that does not reason, so the allowance went on the
reasoning and replies came back truncated or missing; the session then fell back
to the fixed bundled questions. That was the "not personalized" complaint.

## Next priorities

1. Run steelman day live and judge whether it finds weak constructions or just
   praises them. Same job Phase 9 did for argument day.
2. Fix the header nav wrapping on a phone.
3. Grow the calibration bank before it cycles; keep the true/false split even.
4. Consider the update-rate metric (revisions that reverse vs elaborate).

## Pending user actions

- None blocking. Key is on the phone.
- Reminder: **Export JSON** occasionally. iOS clears storage for unused web
  apps, and sessions/positions live only on the phone.
- Local key: `.env.local` (gitignored); `python3 make-local-key.py` rebuilds
  `local-key.js`, loaded on localhost only. Nothing deployed carries a key.

## Files modified this session

- `app.js`
- `sw.js`
- `test.html`
- `tests.js`
- `make-local-key.py`
- `.gitignore`
- `README.md`
