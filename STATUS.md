# STATUS — thinking-app

_Snapshot: 2026-08-18_

## Deployed

- **Live:** https://mattgpt138.github.io/thinking-app/ (GitHub Pages, HTTPS)
- **Repo:** github.com/mattgpt138/thinking-app (public, `main`)
- **Cache version:** `thinking-app-v8` — bump in `sw.js` on any shell/data change
- **Default model:** `claude-sonnet-5`. API optional; every path degrades to
  bundled content and never blocks a session.
- **Installed** to the user's iPhone home screen.

### Known issues

- Interrogation prompt tested only against mocked API responses; unverified live.
- Calibration bank (395) cycles after roughly 33 weekly sessions.
- No automated test suite; verification is ad-hoc, in-browser.

## Last completed phase

**Phase 7** — a session in progress now survives a reload; the passage is no
longer consumed and nothing written is lost.

## Next priorities

1. Run several real argument days with the live key and judge whether the
   interrogation actually engages or drifts back to agreeable.
2. Same for steelman day: does it find weak constructions or just praise them.
3. Grow the calibration bank before it cycles; keep the true/false split even.
4. Consider the update-rate metric (revisions that reverse vs elaborate).
5. Add a minimal regression harness so the browser checks are repeatable.

## Pending user actions

- None blocking. User was mid-testing the seven day types on device.
- Reminder: **Export JSON** occasionally. iOS clears storage for unused web
  apps, and sessions/positions live only on the phone.

## Files modified this session

- `index.html`
- `style.css`
- `app.js`
- `sw.js`
- `manifest.webmanifest`
- `README.md`
- `data/corpus.json`
- `data/reasoning.json`
- `data/propositions.json`
- `icons/` (svg, 192, 512, maskable-512, apple-touch-icon)
