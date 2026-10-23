# Architecture

## State ownership

The Redux Toolkit store is the source of truth. React renders the same AST that editing commands mutate. There is no second display-only equation and no embedded legacy editor iframe.

| State | Owner | Persistence |
| --- | --- | --- |
| Exercises, ordered steps, original problem and final marker | `doc` in Redux | Local draft and JSON session |
| Leaf caret, structural selection or sequence gap | `doc.cursor` in Redux | Local draft, normalized on restore |
| Undo/Redo | Redux `past` / `future`, up to 80 document snapshots | Current mount only |
| Compact mode, favorites, 4 recent symbols | Redux `prefs` | Local draft and JSON session |
| Internal AST clipboard | Redux `structureClipboard` | Current mount only |
| Last successfully copied review snapshot per exercise | Redux `copies` | Current mount only |
| New-problem form, backup panel and manual-copy text | Local React state | Transient UI |

`src/model.ts` defines the AST, unique IDs, traversal, serialization and symbol catalog. `parser.ts` is a bounded, explicit notation importer. `store.ts` implements transactional editing and structural navigation. `Formula.tsx` recursively renders live input controls. `Keyboard.tsx` exposes editing commands; `App.tsx` owns the notebook and review flow. `persistence.ts` reconstructs only validated allowlisted session fields.

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
