# Architecture

## State ownership

The Zustand store in `src/features/math-editor/store/editor-store.ts` is the source of truth; `src/store.ts` re-exports it. React renders the same AST that editing commands mutate. There is no second display-only equation and no embedded legacy editor iframe.

| State | Owner | Persistence |
| --- | --- | --- |
| Exercises, ordered steps, original problem and final marker | `doc` in the app store | Local draft and JSON session |
| Leaf caret, structural selection or sequence gap | `doc.cursor` in the app store | Local draft, normalized on restore |
| Undo/Redo | `past` / `future`, up to 80 document snapshots | Current mount only |
| Compact mode, favorites, 4 recent symbols | `prefs` | Local draft and JSON session |
| Internal AST clipboard | `structureClipboard` | Current mount only |
| Last successfully copied review snapshot per exercise | `copies` | Current mount only |
| Lesson progress and reading position | `features/lessons/lesson-progress-store.ts`, `features/progress/*` | Learning storage, then server state |
| New-problem form, backup panel and manual-copy text | Local React state | Transient UI |

`src/model.ts` defines the AST, unique IDs, traversal, serialization and symbol catalog. `parser.ts` is a bounded, explicit notation importer. The store implements transactional editing and structural navigation and is reached through a typed action adapter. `Formula.tsx` recursively renders live input controls. `Keyboard.tsx` exposes editing commands; `App.tsx` owns the notebook and review flow. `persistence.ts` reconstructs only validated allowlisted session fields.

## Persistence and synchronization

Four layers are deliberately separate; none of them alone is "cloud sync":

| Layer | Module | Responsibility |
| --- | --- | --- |
| Local durable store | `sync/browser-db.ts`, `features/session/persistence/persistent-store.ts` | IndexedDB cache, allowlisted keys, per-tab recovery journal |
| Event outbox | `sync/events.ts`, `sync/runtime.ts` | Append-only learning events, cleared only after server acknowledgement |
| Authenticated server state | `sync/server-storage.ts`, `worker/src/event-store.ts` | Revisioned `/state` writes in a Cloudflare Durable Object |
| Mirrors | `worker/src/google-drive.ts`, `worker/src/notion-mirror.ts` | One-way verified snapshots to Drive and Notion |

Reading position is written through the same learning-storage facade under
`math-scratchpad-reading-position-v1` and restored from the latest location event, so a newer
scroll never overwrites mathematical work. Drive and Notion are mirrors, not a second source of
truth, and a successful write to one destination is not evidence for the other.

## Cursor invariants

- A leaf selection has a `nodeId` and a clamped character offset.
- A boundary selection has a `sequenceId` plus a child-array insertion index; it is not a denominator caret.
- A whole-structure selection has a `selected` ID. Parent selection walks the AST ancestors.
- Every cloned structure receives new IDs recursively, including sequence IDs.
- Math is stored in logical LTR order. Rendering follows child-array order. Tap coordinates are compared against digit spans measured in that same expression.

## Review snapshot

`reviewPayload` keeps the original problem and all ordered steps, sets `reviewThroughStep` from the active step and includes only an explicitly marked final answer. Student strings are enclosed as JSON content, not treated as executable code or application instructions.

`Check` captures the message and its serialized-payload fingerprint before awaiting clipboard access. `Copied` is committed only after browser success. Subsequent content or review-scope changes produce `Changed since copy`. Returning to the exact snapshot through Undo restores the matching state. Copy success means copied, never sent.

## Integration

The production build bundles all runtime dependencies. The standalone output makes no runtime network requests. The inline fragment is an integration target for a host with executable HTML support; it cannot grant itself ChatGPT APIs, message-send access or persistent storage permissions. No private exercise data is shipped in the source repository.
