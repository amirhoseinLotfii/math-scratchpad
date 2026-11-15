# Stage B O0 — Offline baseline

The starting point is the Stage A draft, stacked above PR #96. Browser checks used
bundled Chromium at 390 × 844 and a static production build mounted at
`/math-scratchpad/`. All fixtures were synthetic, and browser requests outside the
local origin were blocked.

## Findings

| Area | Observation |
|---|---|
| App shell | No service worker registrations or web app manifest. A reload offline failed with `net::ERR_INTERNET_DISCONNECTED`. |
| In-page work | An offline edit updated the synchronous recovery journal and the IndexedDB cache. After a disconnected reload failed, returning online and navigating back restored the exact test value `2468`. |
| Paths and deployment | Vite uses `base: './'`. The Pages workflow builds and serves `dist` under the repository prefix, writes release identity, copies the shell to `404.html`, and adds `.nojekyll`. Actual production cache headers were not measured. |
| Fonts | Vite emitted local Inter and Vazirmatn WOFF files and hashed MathLive fonts. No sound request appeared during the tested initialization or edit. Interactive sounds beyond this flow are NOT_TESTED. |
| Standalone | The independent Stage A test passed with network blocked and loaded the embedded Vazirmatn font. |
| Verified bank | `src/features/drive-bank/drive-bank.ts` checks the version and read-back before reporting a cache saved. `use-drive-bank-connection.ts` restores the selected file's cache on mount. The cache is already routed to IndexedDB when initialized. |
| Lesson images | The renderer supports alternative text after image failure. Image bytes are not yet collected for offline use. |
| Persistence | Session writes use the 800 ms local cadence. `src/sync/idb/schema.ts` defines the current learning-cache database and stores. |
| Event outbox | The Stage A mock-Worker tests verified offline enqueue, reconnect, acknowledged delivery and retention on failure. Offline send/reconnect against production was not executed. |
| Auth and isolation | The Google credential cache and Worker session DB remain separate from the learning export. The anonymous reset status check can attempt a network request while the app remains locally usable. |
| Service worker probe | A temporary local-only worker confirmed that Chromium allows its no-store fetch when online and blocks it after `context.setOffline(true)`. The probe was removed after measurement. |
| Installability | DevTools installability checks will run against the new manifest and service worker in O2. The baseline has neither. |

## Network inventory

The first production visit fetched the document, entry modules, CSS, Inter and the
first MathLive font. The Worker request was intentionally aborted. The repeated
entries below are the offline reload and online recovery attempts.

| Origin | Path | Type | Result | Bytes |
|---|---|---|---|---|
| http://127.0.0.1:5187 | /math-scratchpad/ | document | 200 | 973 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/index-CYIPSF80.js | script | 200 | 1489335 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/rolldown-runtime-XKyaHtl9.js | script | 200 | 726 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/drive-bank-CHyAdQyk.js | script | 200 | 144197 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/index-Dv7-n0aQ.css | stylesheet | 200 | 169412 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/inter-400-600-DEokMHRo.woff | font | 200 | 25360 |
| https://math-scratchpad-sync.math-scratchpad-redux.workers.dev | /reset/status | fetch | net::ERR_FAILED | — |
| http://127.0.0.1:5187 | /math-scratchpad/assets/KaTeX_Main-Regular-B22Nviop.woff2 | font | 200 | 26272 |
| https://math-scratchpad-sync.math-scratchpad-redux.workers.dev | /reset/status | fetch | net::ERR_FAILED | — |
| http://127.0.0.1:5187 | /math-scratchpad/ | document | net::ERR_INTERNET_DISCONNECTED | — |
| http://127.0.0.1:5187 | /math-scratchpad/ | document | 200 | 973 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/index-CYIPSF80.js | script | 200 | 1489335 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/rolldown-runtime-XKyaHtl9.js | script | 200 | 726 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/drive-bank-CHyAdQyk.js | script | 200 | 144197 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/index-Dv7-n0aQ.css | stylesheet | 200 | 169412 |
| http://127.0.0.1:5187 | /math-scratchpad/assets/inter-400-600-DEokMHRo.woff | font | 200 | 25360 |
| https://math-scratchpad-sync.math-scratchpad-redux.workers.dev | /reset/status | fetch | net::ERR_FAILED | — |
| http://127.0.0.1:5187 | /math-scratchpad/assets/KaTeX_Main-Regular-B22Nviop.woff2 | font | 200 | 26272 |
