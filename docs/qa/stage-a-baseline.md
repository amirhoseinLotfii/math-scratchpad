# Stage A baseline

GitHub main: `ba35c17b4ad271cac717fd450272036857e9dd1e`.

| Finding | Confirmed source at baseline |
| --- | --- |
| F1 | `persistent-store.ts`: `flush` resets the timer handle, but the cancellation paths in `applyRemote`, `applyRemoteRemoval`, and `storageEvent` do not. |
| F2 | `runtime.ts`: `EVENT_DEBOUNCE_MS` is 5,000 ms. `ServerBackedStorage.setItem` enqueues immediately. |
| F3 | `model.ts`: `MAX_SESSION_EXERCISES` is 100. `validateSession` permits 40 steps. `writeAppState` imposes a 1,000,000-byte ceiling. |
| F4 | `use-reading-position.ts`: `trackScrollPosition` nests an effect. `useReadingPosition` is exported through the progress barrel. |
| F5 | `persistent-store.ts`: `queue` serializes the recovery journal synchronously. Cost measurement is pending. |
| F6 | Whole-state subscriptions appear in `App`, `Keyboard`, and `LessonMathCheck`. Render measurement is pending. |
| F7 | `editor-store.ts`: `EditorAction` accepts `unknown` payloads. `persistence.ts` declares a bag with `any` values. |
| F8 | 24 tracked handwritten files exceed 300 lines. The Worker imports event and reset contracts from browser source. |
| F9 | The sync architecture document describes the prior 409 path. `ServerBackedStorage` already invokes `mergeServerStateValues`. The deployment config includes the owner identity in vars. |

Executed with installed dependencies from the release-validation checkout. The seven changed files
between the common parent and main were checked against their GitHub blob SHAs and matched.

| Command | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run test:typecheck` | PASS |
| `npm run test:unit` | PASS, 364 tests |
| `npm run test:integration` | PASS, 183 tests |
| `npm run test:worker` | PASS, 125 tests |
| `npm run test:architecture` | PASS, 5 tests |
| `npm run test:release-metadata` | PASS |
| `npm run build` | PASS, Worker dry run |
| `npm run test:audit` | Vitest checks ran. Browser checks blocked by missing pinned Chromium. |
| `npm run test:e2e -- --workers=3` | System Chromium run in progress. |
