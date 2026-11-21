# Math Scratchpad Technical Specification for Offline-First Sync, Bilingual MathLive Editing, and Google Drive Integration

This specification defines the complete frontend architecture, JSON Schema Draft 2020-12 data contracts, offline-first synchronization engine, Google Drive and Notion integrations, bilingual Persian/English MathLive editing layer, design system, and verification strategy for Math Scratchpad, a desktop-only React and TypeScript application hosted on GitHub Pages with a minimal Cloudflare Worker proxy. The core architectural decision is to treat **Dexie.js over IndexedDB** as the single local source of truth in both offline and online storage modes, isolating UI responsiveness from network state while enforcing a strict Mode Gate that guarantees zero outbound network calls in offline mode. Conflict resolution relies on **Hybrid Logical Clocks (HLC)** paired with field-level merges and immutable append-only attempt records rather than timestamps alone.

Two empirical constraints shape the design and carry explicit NEEDS TESTING verification gates. First, MathLive maintainers state that <math-field> does not support RTL layout (arnog/mathlive\#2544)1, math mode ignores ordinary whitespace (mathModeSpace2), Arabic/Persian cursive characters require contextual glyph shaping that conflicts with single-metric TeX math rendering (KaTeX\#729)3, and Chromium Shadow DOM contenteditable regressions cause .ML\_\_keyboard-sink focus drops (\#2588, \#2644)4. Therefore, resolving the Persian typing bugs requires upgrading MathLive to >=0.111.4 (picking up the CVE-2026-54705 XSS fix from >=0.110.06) and wrapping math fields inside a **Segmented Bilingual Step Editor** that keeps Persian RTL prose in native dir="auto" elements. Second, Google Drive API v3 omits the etag JSON field7 and developer tests indicate Drive ignores HTTP If-Match headers on file replacements (NEEDS TESTING across multipart and resumable endpoints)8; optimistic concurrency therefore uses preflight headRevisionId checks10, postflight revisions.list inspection, and deterministic HLC merges.

## 1. Project Structure, Architecture, and Data Flows

To prevent storage mode leakage and keep sync logic testable in Node without a browser, the codebase follows a hexagonal boundary layout. UI components read reactive queries from Dexie and invoke pure domain or storage repository functions; React components never import Google Drive, Google Identity Services (GIS), or Cloudflare Worker clients directly.


| **Folder Path** | **Module Responsibility** | **Strict Boundary Rules** |
| --- | --- | --- |
| src/app/ | App bootstrap, React error boundaries, mode context, layout shell | Imports features/, storage/, sync/, design-system/; contains zero Drive/Notion HTTP logic |
| src/domain/ | Entities, JSON Schema Draft 2020-12 validators, HLC clock, 3-way LWW merge, bank upgrade reconciler, completion evaluator | Pure TypeScript only; zero imports from react, dexie, mathlive, window, fetch, or navigator |
| src/storage/ | MathScratchpadDB Dexie schema, atomic mutation + outbox repositories, StorageManager eviction guard, JSON import/export | Imports domain/ and dexie; never imports auth/ or network adapters in sync/ |
| src/sync/ | Mode Gate (offline vs online), OutboxWorker, ReachabilityProber, Web Locks + BroadcastChannel leader bus, Drive & Notion adapters, LegacyDriveMigrator | Network adapters remain uninstantiated when storageMode === 'offline' |
| src/auth/ | GIS initTokenClient wrapper, Google Picker loader, in-memory Bearer token holder | Imports only GIS script globals; tokens never touch localStorage or IndexedDB |
| src/editor/ | MathLive >=0.111.4 wrapper, Compute Engine MathJSON bridge, Segmented Persian/LTR Step controller, "/" tool palette, ± branch manager | Imports mathlive, @cortex-js/compute-engine, domain/; emits normalized Step mutations |
| src/features/ | Unified Lesson + Practice Workspace, Styled Exercise Picker, Resume Dropdown, Collapsible References, Timers & Pomodoro, Mode Switch Wizard, Custom JSON Importer | Imports editor/, storage/, design-system/, and sync/ status observables |
| src/design-system/ | CSS logical property tokens, self-hosted Vazirmatn + Computer Modern fonts, BiDi primitives, banners, save indicator | Imports react and CSS only; zero domain or storage knowledge |
| worker/ | Cloudflare Worker TypeScript proxy (/api/notion/timer-sessions, Notion OAuth callback, /api/health) | Separate deployment package; holds Notion client secret and attaches Notion-Version: 2026-03-1111 |
| tests/ | Vitest + fake-indexeddb + fast-check property suites; Playwright E2E with stateful Drive/Notion route simulators | Mirrors src/ layers; exercises fault injection, clock skew, and multi-tab races |

All writes enter Dexie first and branch at the Mode Gate inside the Sync Coordinator, as shown in the architecture diagram below.




Code snippet

flowchart TB    UI\[React Unified Lesson & Practice UI + Bilingual Step Editor\]    Domain\[Pure Domain Layer: Schemas, HLC, LWW Merge, Completion Evaluator\]    DB\[(Dexie / IndexedDB: bank, progress, history, timers, outbox, meta)\]    Coord\[Multi-Tab Coordinator: Web Locks Leader + BroadcastChannel\]    Gate{Storage Mode Gate}    Offline\[Offline Guard: Zero Network Calls + Eviction Warning + JSON Import/Export\]    Outbox\[Online Outbox Worker: Coalescing + Backoff + Preflight/Postflight Sync\]    GIS\[GIS initTokenClient + Google Picker API\]    Drive\[(Google Drive API v3: Math Scratchpad/bank, progress, history, exports)\]    Worker\[Cloudflare Worker Notion Proxy\]    Notion\[(Notion API 2026-03-11 Data Source)\]    UI -->|Read via useLiveQuery / Write atomic rw tx| DB    UI <-->|Validate & convert AST| Domain    DB -->|Transactional Outbox Records| Coord    Coord --> Gate    Gate -->|mode = offline| Offline    Gate -->|mode = online| Outbox    Outbox <-->|In-memory Access Token| GIS    Outbox <-->|Multipart / Resumable / Metadata| Drive    Outbox -->|Completed Timer Sessions| Worker    Worker <-->|Dedup Query + POST /v1/pages| Notion

In **Offline / Local Mode**, setting storageMode = 'offline' in app\_meta disables GIS script injection, Drive polling, reachability probing, and Notion synchronization at the Mode Gate so zero external network requests are ever dispatched. Users import one JSON file per chapter via <input type="file"> (avoiding showOpenFilePicker, which is unsupported in Firefox and Safari12). The importer validates the bundle against Draft 2020-12 schemas, merges pre-existing progress using HLC field rules so re-importing an older or alternate chapter export never overwrites newer local steps or attempts, and saves everything into IndexedDB. Every edit updates IndexedDB locally and sets the top indicator to Saved locally, while monitoring navigator.storage.persisted() to display a backup warning whenever browser storage is best-effort. Clicking Export serializes a chapter bundle containing the exact schemas stored on Drive.

In **Online / Cloud Mode**, every local edit still commits to IndexedDB first for instantaneous responsiveness (target <16 ms perceived save) while atomically upserting a coalesced dirty entry in sync\_outbox. The Web Locks-elected leader tab debounces typing (1500 ms target, NEEDS TESTING for typing cadence; flushing immediately on step blur, Final submit, or pagehide), checks endpoint reachability, attaches the in-memory GIS Bearer token, verifies the Drive file's headRevisionId10, merges any remote updates locally, and uploads via uploadType=multipart (or uploadType=resumable above 5 MB13). If the network drops or the GIS token expires, edits remain safely persisted in IndexedDB, and the UI transitions cleanly to Queued (Offline) or displays a non-blocking **Re-sign-in Banner** without interrupting work. Switching between modes invokes the Mode Transfer Wizard offering three explicit paths: **Move local data to Drive** (one-click merge of local chapters into the outbox), overwrite local cache from Drive after an automatic safety export, or switch without copying.

## 2. Versioned JSON Schemas, Migration Rules, and Stable IDs

Every document persisted on Drive, stored in IndexedDB, or exchanged through Offline import/export bundles validates against identical JSON Schema Draft 2020-12 definitions. Array indices are never used as identifiers because inserting steps between existing steps, branching equations with ±, or adding questions in a bank update would break historical references.

| **Entity** | **Identifier Format** | **Stability & Ordering Guarantees** |
| --- | --- | --- |
| Bank Version (bankVersion) | Author SemVer/release tag (e.g. "2026.11.0") | Read-only bank snapshot tag recorded on every historical attempt |
| Chapter (chapterId) | Immutable author slug (e.g. "ch-03-functions") | Maps 1:1 to progress/<chapterId>.json and Offline chapter bundles |
| Question / Lesson (itemId) | Immutable author ID (e.g. "q\_fn\_0142") | Never reassigned if a question is deleted; protects progress across bank upgrades |
| Step (stepId) | Client-generated UUIDv4 | Remains constant through edits, reordering, and step insertions |
| Step Position (orderKey) | Lexicographic fractional string ("a0", "a0V", "a1") | Midpoint key insertion avoids rewriting sibling steps' HLC timestamps |
| Branch (branchId) | "main" or UUIDv4 + parentStepId + branchSign | Models ± equation splits cleanly as child tracks without duplicating prior steps |
| Attempt / Version (recordId) | Client-generated UUIDv4 | Strictly immutable; merged across devices via set union on ID |
| Device (deviceId) | Random UUIDv4 generated once per browser profile | Deterministic tie-breaker inside HLC strings (<ms13>:<counter4>:<deviceId>) |

Each top-level document carries "schemaVersion": "1.0.0". Every JSON loader invokes a pure migrateDocument() pipeline keyed on major version increments (1.x to 2.x) before schema validation, and schemas enable additionalProperties: true at object boundaries so an older client preserves unknown additive minor-version fields rather than stripping them during round-trips (NEEDS TESTING across future minor bumps). When Drive publishes a newer bankVersion, the reconciler keeps all existing ItemProgress records keyed by itemId, initializes newly added itemIds with status: "not\_started", and moves any itemId removed from the new bank into orphanedItems inside progress/<chapterId>.json so prior solved work and attempt histories are never lost.

Lesson items (درسنامه) and practice exercises share a single unified item model and **one completion definition**: every required item tracks status: "not\_started" | "in\_progress" | "solved". Worked examples (worked\_example) reach solved when the learner clicks **Mark Completed / Final Submit**, while interactive exercises reach solved upon triggering **Final Submit**. Post-submit edits remain permitted (editedAfterSubmit: true) and retain the solved milestone while appending new step\_version and post\_submit\_revision snapshots into immutable history records.

### Bank and Lesson Schema

This Draft 2020-12 schema covers read-only chapter files authored in Google Drive (bank/<chapterId>.json), embedded bank payloads inside Offline chapter bundles, and custom exercise JSON imports (isCustomImport: true).




JSON

{  "$schema": "https://json-schema.org/draft/2020-12/schema",  "$id": "https://math-scratchpad.app/schemas/v1/bank.schema.json",  "title": "MathScratchpadBankChapter",  "type": "object",  "required": \["schemaVersion", "kind", "bankVersion", "chapterId", "title", "items"\],  "additionalProperties": true,  "properties": {    "schemaVersion": { "type": "string", "pattern": "^1\\.\[0-9\]+\\.\[0-9\]+$" },    "kind": { "const": "bank\_chapter" },    "bankVersion": { "type": "string", "minLength": 1 },    "chapterId": { "type": "string", "pattern": "^\[a-z0-9\]\[a-z0-9-\_\]{1,63}$" },    "authoredAt": { "type": "string", "format": "date-time" },    "isCustomImport": { "type": "boolean", "default": false },    "title": {      "type": "object",      "required": \["fa", "en"\],      "properties": {        "fa": { "type": "string" },        "en": { "type": "string" }      }    },    "items": {      "type": "array",      "items": { "$ref": "\#/$defs/BankItem" }    }  },  "$defs": {    "LocalizedText": {      "type": "object",      "properties": {        "fa": { "type": "string" },        "en": { "type": "string" }      }    },    "ReferenceSource": {      "type": "object",      "required": \["book", "page"\],      "properties": {        "book": { "type": "string" },        "section": { "type": "string" },        "page": { "type": "string" },        "note": { "type": "string" }      }    },    "MathExpressionBlock": {      "type": "object",      "required": \["latex"\],      "properties": {        "latex": { "type": "string" },        "mathJson": { "description": "Optional pre-parsed MathJSON AST" }      }    },    "BankItem": {      "type": "object",      "required": \["itemId", "orderIndex", "itemType", "requiredForCompletion", "prompt"\],      "properties": {        "itemId": { "type": "string", "minLength": 3, "maxLength": 80 },        "orderIndex": { "type": "integer", "minimum": 0 },        "lessonGroupId": { "type": "string" },        "requiredForCompletion": { "type": "boolean", "default": true },        "itemType": {          "enum": \[            "worked\_example",            "guided\_example",            "short\_exercise",            "section\_exercise",            "yes\_no\_function",            "domain\_range",            "table",            "set",            "equation\_pm\_branch",            "persian\_text"          \]        },        "prompt": {          "type": "object",          "required": \["segments"\],          "properties": {            "segments": {              "type": "array",              "items": {                "type": "object",                "required": \["type", "content"\],                "properties": {                  "type": { "enum": \["persian\_text", "ltr\_text", "math"\] },                  "content": { "type": "string" },                  "mathJson": {}                }              }            }          }        },        "prefillStep1": { "$ref": "\#/$defs/MathExpressionBlock" },        "typeConfig": {          "type": "object",          "properties": {            "guidedHints": { "type": "array", "items": { "$ref": "\#/$defs/LocalizedText" } },            "workedSolutionSteps": { "type": "array", "items": { "$ref": "\#/$defs/MathExpressionBlock" } },            "tableSchema": {              "type": "object",              "properties": {                "headers": { "type": "array", "items": { "type": "string" } },                "rows": { "type": "integer", "minimum": 1 },                "prefilledCells": { "type": "object", "additionalProperties": { "type": "string" } }              }            },            "supportsPmBranching": { "type": "boolean" },            "setNotationKind": { "enum": \["roster", "interval", "set\_builder"\] },            "yesNoReasonRequired": { "type": "boolean" }          }        },        "sources": {          "type": "array",          "items": { "$ref": "\#/$defs/ReferenceSource" }        }      }    }  }}

### Progress Schema

One progress JSON file lives per chapter (progress/<chapterId>.json). Storing steps as a stepId-keyed map with deleted: true tombstones rather than an array makes step insertions and concurrent step deletions conflict-free under field-level LWW merges.




JSON

{  "$schema": "https://json-schema.org/draft/2020-12/schema",  "$id": "https://math-scratchpad.app/schemas/v1/progress.schema.json",  "title": "MathScratchpadChapterProgress",  "type": "object",  "required": \["schemaVersion", "kind", "chapterId", "bankVersion", "updatedHlc", "items"\],  "additionalProperties": true,  "properties": {    "schemaVersion": { "type": "string", "pattern": "^1\\.\[0-9\]+\\.\[0-9\]+$" },    "kind": { "const": "chapter\_progress" },    "chapterId": { "type": "string" },    "bankVersion": { "type": "string" },    "updatedHlc": { "type": "string", "pattern": "^\[0-9\]{13}:\[0-9\]{4}:\[a-zA-Z0-9\_-\]+$" },    "resumeState": {      "type": "object",      "properties": {        "lastVisitedItemId": { "type": \["string", "null"\] },        "lastVisitedHlc": { "type": "string" },        "recentItemIds": { "type": "array", "maxItems": 15, "items": { "type": "string" } }      }    },    "items": {      "type": "object",      "additionalProperties": { "$ref": "\#/$defs/ItemProgress" }    },    "orphanedItems": {      "type": "object",      "additionalProperties": { "$ref": "\#/$defs/ItemProgress" }    }  },  "$defs": {    "HlcField": { "type": "string", "pattern": "^\[0-9\]{13}:\[0-9\]{4}:\[a-zA-Z0-9\_-\]+$" },    "StepSegment": {      "type": "object",      "required": \["segmentId", "type", "content"\],      "properties": {        "segmentId": { "type": "string" },        "type": { "enum": \["persian\_text", "ltr\_text", "math"\] },        "content": { "type": "string" },        "mathJson": { "description": "Unboxed MathJSON AST from ComputeEngine.parse(latex).json" }      }    },    "StepRecord": {      "type": "object",      "required": \["stepId", "orderKey", "branchId", "updatedHlc", "deleted", "segments"\],      "properties": {        "stepId": { "type": "string" },        "orderKey": { "type": "string", "minLength": 1 },        "branchId": { "type": "string" },        "parentStepId": { "type": \["string", "null"\] },        "branchSign": { "enum": \["main", "plus", "minus", "case"\] },        "isPrefilledFromQuestion": { "type": "boolean" },        "updatedHlc": { "$ref": "\#/$defs/HlcField" },        "deleted": { "type": "boolean" },        "segments": { "type": "array", "items": { "$ref": "\#/$defs/StepSegment" } },        "combinedLatex": { "type": "string" }      }    },    "FinalAnswer": {      "type": "object",      "required": \["answerType", "updatedHlc"\],      "properties": {        "answerType": {          "enum": \["math\_expr", "yes\_no", "domain\_range", "table", "set", "pm\_branches", "persian\_text"\]        },        "updatedHlc": { "$ref": "\#/$defs/HlcField" },        "yesNoValue": { "type": \["boolean", "null"\] },        "persianExplanation": { "type": "string" },        "latex": { "type": "string" },        "mathJson": {},        "domainLatex": { "type": "string" },        "rangeLatex": { "type": "string" },        "tableCells": { "type": "object", "additionalProperties": { "type": "string" } },        "branchResults": {          "type": "array",          "items": {            "type": "object",            "required": \["branchId", "branchSign", "latex"\],            "properties": {              "branchId": { "type": "string" },              "branchSign": { "enum": \["plus", "minus", "case"\] },              "latex": { "type": "string" },              "mathJson": {}            }          }        }      }    },    "ItemProgress": {      "type": "object",      "required": \["itemId", "status", "statusHlc", "steps", "attemptCount"\],      "properties": {        "itemId": { "type": "string" },        "status": { "enum": \["not\_started", "in\_progress", "solved"\] },        "statusHlc": { "$ref": "\#/$defs/HlcField" },        "finalSubmittedAt": { "type": \["string", "null"\], "format": "date-time" },        "finalSubmitHlc": { "type": \["string", "null"\] },        "editedAfterSubmit": { "type": "boolean", "default": false },        "attemptCount": { "type": "integer", "minimum": 0 },        "steps": {          "type": "object",          "additionalProperties": { "$ref": "\#/$defs/StepRecord" }        },        "finalAnswer": { "$ref": "\#/$defs/FinalAnswer" }      }    }  }}

### Attempts and History Schema

All step versions and submitted attempts persist permanently in append-only chunks stored in Dexie and uploaded under history/<chapterId>-<yyyymm>-<deviceId>-<seq>.json. Scoping history files per deviceId and month ensures two devices never overwrite one another's history logs.




JSON

{  "$schema": "https://json-schema.org/draft/2020-12/schema",  "$id": "https://math-scratchpad.app/schemas/v1/history.schema.json",  "title": "MathScratchpadHistoryChunk",  "type": "object",  "required": \["schemaVersion", "kind", "chunkId", "chapterId", "deviceId", "records"\],  "additionalProperties": true,  "properties": {    "schemaVersion": { "type": "string", "pattern": "^1\\.\[0-9\]+\\.\[0-9\]+$" },    "kind": { "const": "history\_chunk" },    "chunkId": { "type": "string" },    "chapterId": { "type": "string" },    "deviceId": { "type": "string" },    "records": {      "type": "array",      "items": {        "type": "object",        "required": \["recordId", "recordType", "itemId", "bankVersion", "createdHlc", "createdAtIso", "snapshot"\],        "properties": {          "recordId": { "type": "string" },          "recordType": { "enum": \["step\_version", "final\_submit\_attempt", "post\_submit\_revision"\] },          "itemId": { "type": "string" },          "attemptNumber": { "type": "integer", "minimum": 1 },          "bankVersion": { "type": "string" },          "createdHlc": { "type": "string" },          "createdAtIso": { "type": "string", "format": "date-time" },          "elapsedMs": { "type": "integer", "minimum": 0 },          "snapshot": {            "type": "object",            "required": \["steps", "finalAnswer"\],            "properties": {              "steps": { "type": "array", "items": { "type": "object" } },              "finalAnswer": { "type": "object" }            }          }        }      }    }  }}

### Timers and Unified Chapter Bundle Schema

Timers store lesson focus intervals, session totals, and 25/5 Pomodoro sessions (timers/timers.json on Drive), carrying sessionId as an idempotency key for Notion sync. To satisfy both single-file Offline import/export and Drive's exact folder schema parity, the chapter export bundle embeds the exact bank, progress, history, and optional timers schema objects without altering their structure.




JSON

{  "$schema": "https://json-schema.org/draft/2020-12/schema",  "$id": "https://math-scratchpad.app/schemas/v1/timers.schema.json",  "title": "MathScratchpadTimers",  "type": "object",  "required": \["schemaVersion", "kind", "updatedHlc", "sessions"\],  "additionalProperties": true,  "properties": {    "schemaVersion": { "type": "string", "pattern": "^1\\.\[0-9\]+\\.\[0-9\]+$" },    "kind": { "const": "timer\_log" },    "updatedHlc": { "type": "string" },    "pomodoroConfig": {      "type": "object",      "properties": {        "workMinutes": { "type": "integer", "default": 25 },        "breakMinutes": { "type": "integer", "default": 5 }      }    },    "sessions": {      "type": "object",      "additionalProperties": {        "type": "object",        "required": \[          "sessionId",          "mode",          "startedAtIso",          "endedAtIso",          "activeDurationSeconds",          "status",          "updatedHlc",          "notionSyncState"        \],        "properties": {          "sessionId": { "type": "string" },          "mode": { "enum": \["lesson", "session", "pomodoro\_work", "pomodoro\_break"\] },          "chapterId": { "type": \["string", "null"\] },          "itemId": { "type": \["string", "null"\] },          "startedAtIso": { "type": "string", "format": "date-time" },          "endedAtIso": { "type": \["string", "null"\], "format": "date-time" },          "activeDurationSeconds": { "type": "integer", "minimum": 0 },          "pomodoroCycleIndex": { "type": "integer", "minimum": 0 },          "status": { "enum": \["running", "paused", "completed", "aborted"\] },          "updatedHlc": { "type": "string" },          "notionSyncState": { "enum": \["pending", "synced", "disabled", "failed"\] },          "notionPageId": { "type": \["string", "null"\] }        }      }    }  }}




JSON

{  "$schema": "https://json-schema.org/draft/2020-12/schema",  "$id": "https://math-scratchpad.app/schemas/v1/chapter-bundle.schema.json",  "title": "MathScratchpadChapterBundle",  "type": "object",  "required": \["schemaVersion", "kind", "exportedAtIso", "bank", "progress", "historyChunks"\],  "additionalProperties": true,  "properties": {    "schemaVersion": { "type": "string", "pattern": "^1\\.\[0-9\]+\\.\[0-9\]+$" },    "kind": { "const": "chapter\_bundle" },    "exportedAtIso": { "type": "string", "format": "date-time" },    "bank": { "$ref": "https://math-scratchpad.app/schemas/v1/bank.schema.json" },    "progress": { "$ref": "https://math-scratchpad.app/schemas/v1/progress.schema.json" },    "historyChunks": {      "type": "array",      "items": { "$ref": "https://math-scratchpad.app/schemas/v1/history.schema.json" }    },    "timers": { "$ref": "https://math-scratchpad.app/schemas/v1/timers.schema.json" }  }}

## 3. Browser Storage Layer Evaluation and Recommendation

With \~700 questions per bank version, MathJSON expression trees, and complete attempt histories across chapters, local storage choices govern durability, query performance, and eviction behavior.


| **Storage Mechanism** | **Desktop Browser Quotas** | **Transaction & Query Capabilities** | **Eviction & Persistence Behavior** | **Architectural Fit** |
| --- | --- | --- | --- | --- |
| localStorage | Hard **5 MiB** per origin; throws QuotaExceededError15 | Synchronous main-thread string key-value only; zero secondary indexes | Subject to best-effort clearing and Safari 7-day cap15 | **Rejected**: 700 questions + history risks hitting 5 MiB and blocks typing |
| IndexedDB | Chrome: up to **60% of disk** (e.g., 600 GiB on 1 TiB)12; Firefox: min(10% disk, 10 GiB) best-effort or **50% disk** persistent15; Safari: dynamic initial pool12 | Asynchronous ACID transactions across object stores; compound indexes (\[chapterId+synced\]); main thread + Workers | Shares origin bucket evicted atomically as a whole17; protected from storage-pressure eviction if persist() granted15 | **Selected**: ACID local mutations + outbox atomicity and fast queries |
| OPFS (Origin Private File System) | Shares the exact same per-origin quota bucket as IndexedDB12 | File stream API; synchronous FileSystemSyncAccessHandle requires a dedicated Web Worker12 | Identical bucket eviction and Safari 7-day ITP rules as IndexedDB12 | **Rejected as primary**: No native structured queries without bundling SQLite WASM |

All browser origins begin in best-effort storage mode15. When storage pressure occurs—either on the device or across combined browser origins—the browser evicts the entire storage bucket for an origin atomically, deleting IndexedDB, localStorage, OPFS, Cache Storage, and Service Worker registrations together15. Calling navigator.storage.persist() (which is window-only, whereas persisted() and estimate() work in both windows and Workers17) depends heavily on browser engine behavior: Chromium grants persistence silently via heuristics such as PWA installation, high engagement, bookmarks, or notification permissions12; Firefox displays a permission dialog to the user, so persist() should only run after an explicit user click such as "Protect Offline Data"12; and Safari evaluates heuristics favoring Home Screen web apps while enforcing WebKit's **7-day ITP script-writable storage cap**, which wipes all script-created data if the user uses Safari across 7 active Safari-use days without interacting with the site (Home Screen apps run under an exempt/separate counter)16. Furthermore, a developer report on Hacker News notes that heuristic-granted persistence does not block manual cache clearing or third-party cleaners and can revert over time21. Therefore, the app checks navigator.storage.persisted() and navigator.storage.estimate() on startup, displays a prominent backup warning banner whenever persisted === false or >7 days pass without an export in Offline mode, and uses <input type="file"> / <a download> for exports since showOpenFilePicker and showSaveFilePicker lack support in Firefox and Safari12.

### Client Database Library Comparison


| **Library** | **Bundle Size (Min + Gzip)** | **Query, Reactivity & Transaction Model** | **Alignment With Drive JSON & Sync Rules** | **Verdict** |
| --- | --- | --- | --- | --- |
| **Dexie.js** | 30.37 kB min+gzip per Bundlephobia22 (31.4 kB cited by opfs-lsm23; a 2026 blog cites 48 KB min / 14 KB gzip24) | Promise API, compound indexes, WhereClause, ACID multi-store rw transactions, React useLiveQuery24 | Stores exact Drive-shaped JSON documents alongside an atomic outbox in one transaction | **Recommended** |
| **idb** | 1.1 kB gzip (3.2 KB min) per docs.bswen.com24 | Minimalist Promise wrapper over raw IDB cursors and object stores24 | Lacks compound query builders and reactive React hooks; increases boilerplate | Runner-up |
| **RxDB** | 62 kB gzip (210 KB min) per docs.bswen.com24; RxDB docs cite 73,103 B Dexie core without validator25 | RxJS observable streams + schema-validation plugins24 | Overweight bundle and RxJS/replication abstractions misaligned with per-chapter Drive files24 | Rejected |
| **PouchDB** | \~46 KB gzip core per selfstore.dev27 | Document store with CouchDB revision trees and views27 | Coupled to a **CouchDB-compatible server**27; complicates clean Drive JSON parity | Rejected |
| **Yjs / Automerge CRDT** | Yjs + lib0 + y-indexeddb (1.2 kB adapter23; no unified Automerge figure in current benchmarks) | Binary CRDT state vectors and delta logs | Opaque binary blobs conflict with human-readable Drive JSON and bank version upgrades | Rejected |
| **TanStack Query Offline** | @tanstack/react-query cache persister28 | Async HTTP query cache persisted to storage | Not an indexed transactional database; unsuitable for pure zero-network offline authoring | Rejected as primary store |

**Recommendation**: Use **Dexie.js (v4.x)**24. Atomic db.transaction('rw', \[db.progress\_docs, db.history\_chunks, db.sync\_outbox\], ...) guarantees that saving a step edit, appending an immutable history version, and queueing a Drive upload either commit together or roll back cleanly. Its useLiveQuery hook updates React views automatically across multi-tab BroadcastChannel notifications without RxDB's bundle weight (73 kB+) or PouchDB's CouchDB coupling.

## 4. Sync Engine Architecture and Distributed Edge Cases

The sync engine guarantees eventual consistency across tabs, sessions, and devices without dropping edits on flaky networks, expired tokens, clock skew, or concurrent writes.

### Outbox Queue, Coalescing, and Idempotency

Every write transaction that mutates progress\_docs, history\_chunks, or timer\_logs while storageMode === 'online' upserts an item in sync\_outbox. To avoid spamming Google Drive during active typing, outbox items coalesce by Drive target (outboxKey = "progress:" + chapterId): consecutive keystrokes overwrite dirtySinceHlc on the single pending row rather than creating multiple upload jobs, flushing after a 1500 ms debounce (or immediately on step blur, Final submit, or pagehide—NEEDS TESTING on desktop unload reliability). Each outbox entry generates a persistent clientMutationId (UUIDv4)30. Before sending POST /upload/drive/v3/files to create a new progress or history file, the leader tab queries Drive files.list by appProperties (ms\_kind + ms\_ch + ms\_chunk) so a dropped response after a successful Drive creation never creates duplicate files on retry. Similarly, Notion timer sync queries by sessionId before issuing POST /v1/pages32.

### Exponential Backoff and True Online/Offline Detection

Because navigator.onLine only reflects local OS network adapter status and returns true behind captive portals, dead routers, or blocked Google endpoints, ReachabilityProber treats online/offline window events and visibilitychange solely as probe triggers (NEEDS TESTING under proxy/VPN drops). Before draining the outbox, the worker sends GET https://www.googleapis.com/drive/v3/about?fields=user(emailAddress) with a 5000 ms AbortController timeout.

Retries follow Google Drive API's exponential backoff formula: waitMs = Math.min((2 \*\* attempt) \* 1000 + Math.floor(Math.random() \* 1000), 64000), capped at a 64 s maximum delay and a bounded retry ceiling (attempt <= 8 before transitioning to manual retry / Paused)33. Response handling branches strictly by HTTP error semantics:

- **Transient Network & Server Limits**: HTTP 429, 403 with rateLimitExceeded or userRateLimitExceeded, 500, 502, 503, 504, and fetch timeouts trigger exponential backoff14.
- **Project Daily Quota Exhaustion**: HTTP 403 with dailyLimitExceeded pauses Drive sync for 15 minutes and alerts the user rather than burning retries34.
- **Expired Google Sign-In (401)**: Transitions sync status to AUTH\_EXPIRED, leaves all queued edits intact in sync\_outbox, and opens the non-blocking Re-sign-in banner while offline practice continues unimpeded.
- **Malformed Payload (400) or Missing File (404)**: On 404 for an existing fileId, the worker invalidates drive\_file\_index and re-searches by appProperties; on repeated 400, it quarantines the item with a diagnostic JSON download so other chapters are never head-of-line blocked.

### Multi-Tab Coordination

Multiple open tabs sharing IndexedDB and a single Google account coordinate using two browser APIs (NEEDS TESTING in Firefox/Safari private contexts):

- **Web Locks Leader Election**: Every tab invokes navigator.locks.request('math\_scratchpad\_sync\_leader', { ifAvailable: true }, async (lock) => ...). Only the lock holder runs OutboxWorker, LegacyDriveMigrator, and Notion queue drains. If the leader tab closes or crashes, the browser immediately releases the lock and another tab promotes itself on the next 5000 ms heartbeat.
- **BroadcastChannel Bus**: Tabs publish compact events (MUTATION\_COMMITTED, SYNC\_COMPLETED, TOKEN\_STATE\_CHANGED, MODE\_CHANGED) over new BroadcastChannel('math-scratchpad-v1') so sibling tabs refresh Dexie queries, share auth banner state, and lock editing during destructive mode transfers.

### Conflict Detection Without Drive If-Match and Hybrid Logical Clocks

Standard HTTP optimistic locking retrieves an ETag and submits If-Match so concurrent edits fail with 412 Precondition Failed8. However, Google Drive API v3 removed the etag JSON property from files7, a Google Developer Forum discussion confirms Drive v3 documentation does not specify an If-Match concurrency contract for media uploads9, and developer curl testing reported in January 2026 observed Drive v3 ignoring If-Match headers on PATCH uploads and DELETE, concluding Drive offers no server-enforced file lock or multi-file transaction (NEEDS TESTING on live Drive endpoints)8.

To guarantee conflict-safe "newest wins" synchronization under Drive's constraints, the sync engine combines **Hybrid Logical Clocks (HLC)** with a **Preflight-Merge-Postflight Protocol**:

- **Hybrid Logical Clock (hlc) Format**: Every mutable field (statusHlc, step.updatedHlc, finalAnswer.updatedHlc, resumeState.lastVisitedHlc) stores a fixed-width lexicographically sortable string "<13-digit-wall-ms>:<4-digit-counter>:<deviceId>" (e.g., "1795152300123:0001:dev\_9a4f"). On local mutation, wall = Math.max(Date.now(), lastHlc.wall); if wall === lastHlc.wall, counter = lastHlc.counter + 1, else counter = 0. Upon ingesting remote JSON from Drive or a manual import, the local HLC advances past the remote maximum: wall = Math.max(Date.now(), local.wall, remote.wall). This ensures a computer whose clock lags hours in the past never loses edits made after pulling from a clock skewed ahead, while deviceId breaks ties deterministically.
- **Preflight Revision Check & Deterministic Merge**: Before uploading progress/<chapterId>.json, the leader calls GET /drive/v3/files/{fileId}?fields=id,headRevisionId,modifiedTime,md5Checksum,appProperties10. Note that headRevisionId is omitted on Shared Drives10, so the check falls back to md5Checksum + modifiedTime whenever headRevisionId is absent. If the remote revision differs from lastSyncedHeadRevisionId, the engine downloads the remote file, executes pure mergeChapterProgress(local, remote) (max HLC per stepId keeping deleted: true tombstones, max statusHlc for status, max attemptCount, and set union on orphanedItems), saves the merged document locally, and uploads the unified result.
- **Postflight Race Recovery**: Immediately after receiving the PATCH response (newRevisionId), the worker queries GET /drive/v3/files/{fileId}/revisions8. If an unexpected intermediate revision ID exists between preflightRevisionId and newRevisionId, another device won a sub-second race; the worker fetches that intervening revision (alt=media), runs mergeChapterProgress, and performs an immediate follow-up upload so neither edit is silently lost.

### Partial-Failure Recovery and Data-Loss Prevention

Four structural invariants protect user work against mid-sync crashes or storage errors: an outbox entry is deleted ONLY if entry.dirtySinceHlc <= uploadedHlc (preserving any keystrokes typed while the HTTP PATCH was in flight); history records live in per-device immutable files so concurrent devices never truncate each other's attempts; legacy migration and destructive mode overwrites always write a backup under exports/ before touching existing files; and every Dexie write catches QuotaExceededError15 to offer one-click JSON export and safe trimming of already-synced history caches.

## 5. Google Drive API and OAuth Specifics

### GIS OAuth in a Static GitHub Pages SPA

Google Identity Services (https://accounts.google.com/gsi/client) separates browser flows into the **Code Model (initCodeClient)**, which exchanges an authorization code on a backend server storing client\_secret and refresh tokens36, and the **Token Model (initTokenClient)**, which operates purely in the browser without storing per-user refresh tokens on any backend server37. Because Math Scratchpad authenticates directly from GitHub Pages to Google Drive with no Drive backend, it uses **google.accounts.oauth2.initTokenClient**.

Under the Token Model, the OAuth access\_token lives strictly in JavaScript heap memory and lasts for expires\_in seconds39 (commonly 1 hour, NEEDS TESTING under browser FedCM behavior). Because the user must be present38 and third-party cookie restrictions or background tab throttling can block silent prompt: '' re-authorization (NEEDS TESTING across Chrome, Firefox ETP, and Safari), the architecture treats token expiry as a routine non-fatal state: when expires\_at - 60 s is reached or Drive returns 401, the outbox pauses cleanly, user edits continue landing in IndexedDB, and the **Re-sign-in Banner** triggers tokenClient.requestAccessToken({ prompt: '' }) inside a direct user click (falling back to prompt: 'select\_account' if consent/session expired).

### Scope Selection Strategy


| **Drive OAuth Scope** | **Google Verification Tier** | **Access Boundaries** | **Engineering & Launch Impact** |
| --- | --- | --- | --- |
| https://www.googleapis.com/auth/drive.file | **Non-sensitive**40 | Accesses files/folders created by this app plus files/folders selected by the user via Google Picker API40 | Avoids unverified-app screen, avoids the **100-user cap**, avoids \~6-week restricted review, and avoids annual **CASA security audits**41 |
| drive.appdata (appDataFolder) | Non-sensitive | Hidden app-only folder invisible in the user's Google Drive UI | **Unsuitable**: Authors cannot open/author bank/ files or retrieve exports/ manually |
| drive / drive.readonly | **Restricted**40 | Broad access across user's entire Google Drive | Triggers unverified warning + 100-user cap until passing restricted verification (\~6 weeks per vendor blog citing Google FAQ) and annual CASA assessment if data reaches a server40 |

**Recommendation**: Request only **https://www.googleapis.com/auth/drive.file**. On first sign-in, the app creates Math Scratchpad/ (application/vnd.google-apps.folder43) and subfolders progress/, history/, and exports/ directly (making them app-owned under drive.file), while opening the **Google Picker API** modal for the user to select their author-created bank/ folder/files40. Importantly, a 2026 Google Developer Forum discussion warns there is no documented guarantee that picking a shared parent folder under drive.file automatically exposes all existing or future descendant files created outside the app (NEEDS TESTING)44; therefore, the Bank Settings panel exposes a 1-click "Select / Refresh Bank Files via Google Picker" fallback alongside folder listing.

### Rate Limits, Uploads, and appProperties Indexing

Google Drive API limits are measured in quota units: **1,000,000 units/minute/project**, **325,000 units/minute/user/project**, and **1 TB/day/project** egress (with method weights: Read = 5, Other = 5, Edit = 50, List = 100, Download = 200)33. Because List costs 20x more than Read, discovered Drive fileIds are cached in Dexie's app\_meta store (drive\_file\_index) so steady-state saves consume only 5 units (GET preflight) + 50 units (PATCH upload).

Uploads <= 5 MB (all single-chapter progress/ and history/ JSONs) use **uploadType=multipart** (Content-Type: multipart/related; boundary=...) to send metadata and JSON content in one HTTP request13. Full-archive exports > 5 MB switch automatically to **uploadType=resumable** (sessions survive dropped connections for up to 1 week of inactivity; any 4xx during chunked PUT requires restarting the session URI14). Private file metadata uses appProperties, which is hidden from Drive UI, inaccessible via API keys, cleared with null values, and constrained to 100 total custom properties per file, 30 private appProperties per app, and **124 UTF-8 bytes maximum per key + value pair**10. Compact keys (ms\_kind, ms\_ch, ms\_bv, ms\_hlc, ms\_migrated) remain comfortably within 124 bytes.

### Safe Migration of Messy Existing Drive Files

- **Discover Candidates**: Query files.list for existing app-created files lacking appProperties.ms\_migrated='v1', and allow optional Google Picker multi-selection if earlier files were created outside the current OAuth Client ID (NEEDS TESTING on legacy file ownership).
- **Create Immutable Raw Backup**: Copy every discovered file unchanged into Math Scratchpad/exports/legacy-backup-<timestamp>/ using files.copy before modifying anything.
- **Normalize and HLC-Merge**: Download each candidate (alt=media), transform legacy structures via migrateDocument(), assign deterministic fallback IDs if missing, merge duplicate chapter records by newest timestamp/HLC, and validate against Draft 2020-12 schemas.
- **Write Organized Outputs and Verify**: Upload normalized files into progress/ and history/ with appProperties, then verify parsed item counts and attemptCount sums match the raw backups.
- **Archive Originals Non-Destructively**: Move original messy files into exports/legacy-archive-<timestamp>/ via PATCH (addParents/removeParents) and stamp appProperties.ms\_migrated = 'v1' rather than issuing permanent deletes.

## 6. Full Request and Response Catalog

### Part A: Local Storage (Dexie / IndexedDB) Catalog

Database MathScratchpadDB defines six object stores: chapters\_bank (chapterId, indexes bankVersion, isCustomImport), progress\_docs (chapterId, index updatedHlc), history\_chunks (chunkId, indexes chapterId, \[chapterId+synced\]), timer\_logs (sessionId, indexes status, notionSyncState, chapterId), sync\_outbox (outboxKey, indexes status, nextRetryAt, priority), and app\_meta (key). Every mutation catches QuotaExceededError15 and SchemaValidationError.

#### 1. Read Chapter Workspace (readChapterWorkspace)

- **Stores (Tx)**: chapters\_bank, progress\_docs (r)
- **Request**: { "chapterId": "ch-03-functions" }
- **Response**: { "bank": { "chapterId": "ch-03-functions", "items": \[ ... \] }, "progress": { "items": { ... } }, "completion": { "solved": 4, "total": 12 } }
- **Error Case**: { "code": "CHAPTER\_NOT\_FOUND\_LOCAL", "recovery": "Prompt offline JSON import or fetch from Drive bank/" }

#### 2. Read Picker & Per-Lesson Resume Index (readPickerAndResumeIndex)

- **Stores (Tx)**: chapters\_bank, progress\_docs, app\_meta (r)
- **Request**: { "chapterId": "ch-03-functions" }
- **Response**: { "items": \[{ "itemId": "q\_fn\_0142", "itemType": "equation\_pm\_branch", "status": "in\_progress", "editedAfterSubmit": false }\], "resumeDropdown": \["q\_fn\_0142", "q\_fn\_0139"\] }
- **Error Case**: { "code": "IDB\_VERSION\_CHANGE\_BLOCKED", "recovery": "Notify user to reload stale tabs" }

#### 3. Save Step Mutation (saveStepMutation)

- **Stores (Tx)**: progress\_docs, history\_chunks, sync\_outbox (rw)
- **Request**: { "chapterId": "ch-03-functions", "itemId": "q\_fn\_0142", "stepId": "stp\_8812c4", "segments": \[{ "segmentId": "seg\_1", "type": "persian\_text", "content": "دامنه برابر است با:" }, { "segmentId": "seg\_2", "type": "math", "content": "D\_f = \\mathbb{R} \\setminus \\{2\\}", "mathJson": \["SetMinus", "Reals", \["Set", 2\]\] }\] }
- **Response**: { "updatedHlc": "1795152300123:0001:dev\_9a4f", "historyRecordId": "rec\_0091", "outboxQueued": true }
- **Error Case**: { "name": "QuotaExceededError", "code": "LOCAL\_STORAGE\_FULL", "recovery": "Trigger export modal and prune synced cache metadata" }

#### 4. Insert Step Between Steps or Split ± Branch (insertStepBetween)

- **Stores (Tx)**: progress\_docs, sync\_outbox (rw)
- **Request**: { "chapterId": "ch-03-functions", "itemId": "q\_fn\_0142", "prevOrderKey": "a0", "nextOrderKey": "a1", "branch": { "branchId": "br\_plus", "parentStepId": "stp\_8812c4", "branchSign": "plus" } }
- **Response**: { "stepId": "stp\_991a02", "orderKey": "a0V", "updatedHlc": "1795152300450:0000:dev\_9a4f" }
- **Error Case**: { "code": "ORDER\_KEY\_EXHAUSTION", "recovery": "Rebalance item step orderKeys deterministically inside rw tx" }

#### 5. Final Submit Item (finalSubmitItem)

- **Stores (Tx)**: progress\_docs, history\_chunks, sync\_outbox (rw)
- **Request**: { "chapterId": "ch-03-functions", "itemId": "q\_fn\_0142", "finalAnswer": { "answerType": "pm\_branches", "branchResults": \[{ "branchId": "br\_plus", "branchSign": "plus", "latex": "x=2" }, { "branchId": "br\_minus", "branchSign": "minus", "latex": "x=-2" }\] } }
- **Response**: { "status": "solved", "attemptNumber": 2, "recordType": "final\_submit\_attempt", "flushPriority": "immediate" }
- **Error Case**: { "code": "FINAL\_ANSWER\_INCOMPLETE", "field": "branchResults\[1\].latex", "recovery": "Highlight missing branch answer" }

#### 6. Import Chapter Bundle or Custom Exercises (importChapterBundle)

- **Stores (Tx)**: chapters\_bank, progress\_docs, history\_chunks, sync\_outbox (rw)
- **Request**: { "sourceKind": "offline\_chapter\_bundle", "payload": { "schemaVersion": "1.0.0", "kind": "chapter\_bundle", "bank": { ... }, "progress": { ... }, "historyChunks": \[ ... \] } }
- **Response**: { "chapterId": "ch-03-functions", "bankAction": "upgraded", "addedQuestions": 14, "orphanedQuestions": 1, "mergedSteps": 38, "addedHistoryRecords": 9 }
- **Error Case**: { "code": "SCHEMA\_VALIDATION\_ERROR", "pointer": "/bank/items/3/itemType", "recovery": "Abort transaction; display field error" }

#### 7. Export Chapter Bundle (exportChapterBundle)

- **Stores (Tx)**: chapters\_bank, progress\_docs, history\_chunks, timer\_logs (r), then app\_meta (rw)
- **Request**: { "chapterId": "ch-03-functions", "includeTimers": true }
- **Response**: { "filename": "ch-03-functions-2026-11-21.json", "byteLength": 148920, "sha256": "a9c1...44ef" }
- **Error Case**: { "code": "EXPORT\_SERIALIZATION\_FAILED", "recovery": "Chunk per-chapter export if memory exceeds limit" }

#### 8. Record Timer / Pomodoro Session (recordTimerSession)

- **Stores (Tx)**: timer\_logs, sync\_outbox (rw)
- **Request**: { "sessionId": "sess\_9f1e2c", "mode": "pomodoro\_work", "chapterId": "ch-03-functions", "itemId": "q\_fn\_0142", "activeDurationSeconds": 1500, "status": "completed" }
- **Response**: { "sessionId": "sess\_9f1e2c", "notionSyncState": "pending", "outboxKeys": \["timers:all", "notion:sess\_9f1e2c"\] }
- **Error Case**: { "code": "INVALID\_DURATION", "recovery": "Clamp negative drift when system clock steps backward" }

#### 9. Claim & Acknowledge Outbox Batch (claimAndAckOutbox)

- **Stores (Tx)**: sync\_outbox, app\_meta (rw)
- **Request (Claim)**: { "workerId": "tab\_7b1", "nowMs": 1795152305000 } -> **Response**: \[{ "outboxKey": "progress:ch-03-functions", "dirtySinceHlc": "1795152300123:0001:dev\_9a4f", "retryCount": 0 }\]
- **Request (Ack)**: { "outboxKey": "progress:ch-03-functions", "syncedHlc": "1795152300123:0001:dev\_9a4f", "headRevisionId": "0BwwA4oRev9" } -> **Response**: { "deletedOutboxEntry": true, "resyncNeeded": false } (if user edited mid-flight, dirtySinceHlc > syncedHlc, so deletedOutboxEntry: false, resyncNeeded: true)
- **Error Case**: { "code": "LEASE\_CONFLICT", "recovery": "Yield to Web Locks leader tab" }

#### 10. Switch Storage Mode & Transfer (setStorageModeAndTransfer)

- **Stores (Tx)**: app\_meta, progress\_docs, history\_chunks, timer\_logs, sync\_outbox (rw)
- **Request**: { "targetMode": "online", "transferStrategy": "move\_local\_to\_drive" }
- **Response**: { "storageMode": "online", "queuedChapters": \["ch-01-sets", "ch-03-functions"\], "queuedHistoryChunks": 4 }
- **Error Case**: { "code": "AUTH\_REQUIRED\_FOR\_ONLINE", "recovery": "Keep storageMode='offline' until GIS token acquired" }

#### 11. Check Persistence & Estimate Quota (checkStoragePersistence)

- **API**: navigator.storage.persisted(), navigator.storage.estimate(), navigator.storage.persist() (only on user click)17
- **Response**: { "persisted": false, "usageBytes": 4200000, "quotaBytes": 10737418240, "showEvictionBanner": true }
- **Error Case**: { "name": "TypeError", "reason": "Opaque origin or storage disabled" \[cite: 19, 48\], "recovery": "Show urgent export-only warning" }

### Part B: Google Drive API v3 Catalog

All Drive calls attach Authorization: Bearer <GIS\_ACCESS\_TOKEN> and execute strictly when storageMode === 'online'.

#### 1. Reachability & Identity Probe (GET /drive/v3/about)




HTTP

GET https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress),storageQuota(limit,usage) HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...




JSON

{  "200\_OK": {    "user": { "displayName": "Sara M.", "emailAddress": "sara@example.com" },    "storageQuota": { "limit": "16106127360", "usage": "4294967296" }  },  "401\_UNAUTHORIZED": {    "error": { "code": 401, "message": "Invalid Credentials", "errors": \[{ "reason": "authError" }\] }  }}

#### 2. Search Folders & Files by appProperties (GET /drive/v3/files)




HTTP

GET https://www.googleapis.com/drive/v3/files?q=appProperties%20has%20%7B%20key%3D'ms\_kind'%20and%20value%3D'progress'%20%7D%20and%20trashed%3Dfalse&fields=nextPageToken,files(id,name,parents,modifiedTime,headRevisionId,md5Checksum,appProperties,size)&pageSize=100 HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...




JSON

{  "200\_OK": {    "files": \[      {        "id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",        "name": "ch-03-functions.json",        "parents": \["1FolderProgressId"\],        "modifiedTime": "2026-11-21T04:10:12.000Z",        "headRevisionId": "0BwwA4oUTeiV1TGRPeTV3",        "md5Checksum": "9a0364b9e99bb480dd25e1f0284c8555",        "size": "48210",        "appProperties": {          "ms\_kind": "progress",          "ms\_ch": "ch-03-functions",          "ms\_hlc": "1795152300123:0001:dev\_9a4f"        }      }    \]  },  "403\_RATE\_LIMIT": {    "error": {      "code": 403,      "message": "User Rate Limit Exceeded",      "errors": \[{ "domain": "usageLimits", "reason": "userRateLimitExceeded" }\]    }  }}

#### 3. Create Folder (POST /drive/v3/files)




HTTP

POST https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,appProperties HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...Content-Type: application/json{  "name": "progress",  "mimeType": "application/vnd.google-apps.folder",  "parents": \["1RootMathScratchpadFolderId"\],  "appProperties": { "ms\_kind": "folder\_progress" }}




JSON

{  "200\_OK": {    "id": "1FolderProgressId",    "name": "progress",    "mimeType": "application/vnd.google-apps.folder",    "appProperties": { "ms\_kind": "folder\_progress" }  },  "403\_INSUFFICIENT\_SCOPE": {    "error": { "code": 403, "message": "Insufficient Permission", "errors": \[{ "reason": "insufficientPermissions" }\] }  }}

#### 4. Download File Media (GET /drive/v3/files/{fileId}?alt=media)




HTTP

GET https://www.googleapis.com/drive/v3/files/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs?alt=media HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...




JSON

{  "200\_OK": {    "schemaVersion": "1.0.0",    "kind": "chapter\_progress",    "chapterId": "ch-03-functions",    "bankVersion": "2026.11.0",    "updatedHlc": "1795152300123:0001:dev\_9a4f",    "items": {}  },  "404\_NOT\_FOUND": {    "error": { "code": 404, "message": "File not found: 1BxiMVs...", "errors": \[{ "reason": "notFound" }\] }  }}

#### 5. Preflight Metadata & Revision Check (GET /drive/v3/files/{fileId})




HTTP

GET https://www.googleapis.com/drive/v3/files/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs?fields=id,headRevisionId,modifiedTime,md5Checksum,appProperties HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...




JSON

{  "200\_OK": {    "id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs",    "headRevisionId": "0BwwA4oUTeiV1TGRPeTV3",    "modifiedTime": "2026-11-21T04:10:12.000Z",    "md5Checksum": "9a0364b9e99bb480dd25e1f0284c8555",    "appProperties": { "ms\_hlc": "1795152300123:0001:dev\_9a4f" }  },  "429\_TOO\_MANY\_REQUESTS": {    "error": { "code": 429, "message": "Rate Limit Exceeded", "errors": \[{ "domain": "usageLimits", "reason": "rateLimitExceeded" }\] }  }}

#### 6. Multipart Create New File (POST /upload/drive/v3/files?uploadType=multipart)




HTTP

POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId,modifiedTime,md5Checksum,appProperties HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...Content-Type: multipart/related; boundary=ms\_boundary\_01--ms\_boundary\_01Content-Type: application/json; charset=UTF-8{"name":"ch-03-functions.json","parents":\["1FolderProgressId"\],"mimeType":"application/json","appProperties":{"ms\_kind":"progress","ms\_ch":"ch-03-functions","ms\_hlc":"1795152300123:0001:dev\_9a4f"}}--ms\_boundary\_01Content-Type: application/json; charset=UTF-8{"schemaVersion":"1.0.0","kind":"chapter\_progress","chapterId":"ch-03-functions","bankVersion":"2026.11.0","updatedHlc":"1795152300123:0001:dev\_9a4f","items":{}}--ms\_boundary\_01--




JSON

{  "200\_OK": {    "id": "1NewFileId890",    "headRevisionId": "0BwwA4oUTeiV1Rev1",    "modifiedTime": "2026-11-21T04:12:00.000Z",    "md5Checksum": "d41d8cd98f00b204e9800998ecf8427e",    "appProperties": { "ms\_kind": "progress", "ms\_ch": "ch-03-functions", "ms\_hlc": "1795152300123:0001:dev\_9a4f" }  },  "403\_DAILY\_LIMIT": {    "error": { "code": 403, "message": "Daily Limit Exceeded", "errors": \[{ "domain": "usageLimits", "reason": "dailyLimitExceeded" }\] }  }}

#### 7. Multipart Update Existing File (PATCH /upload/drive/v3/files/{fileId}?uploadType=multipart)




HTTP

PATCH https://www.googleapis.com/upload/drive/v3/files/1NewFileId890?uploadType=multipart&fields=id,headRevisionId,modifiedTime,md5Checksum,appProperties HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...Content-Type: multipart/related; boundary=ms\_boundary\_02--ms\_boundary\_02Content-Type: application/json; charset=UTF-8{"appProperties":{"ms\_hlc":"1795152399900:0001:dev\_9a4f"}}--ms\_boundary\_02Content-Type: application/json; charset=UTF-8{"schemaVersion":"1.0.0","kind":"chapter\_progress","chapterId":"ch-03-functions","bankVersion":"2026.11.0","updatedHlc":"1795152399900:0001:dev\_9a4f","items":{}}--ms\_boundary\_02--




JSON

{  "200\_OK": {    "id": "1NewFileId890",    "headRevisionId": "0BwwA4oUTeiV1Rev2",    "modifiedTime": "2026-11-21T04:14:10.000Z"  },  "503\_BACKEND\_ERROR": {    "error": { "code": 503, "message": "Backend Error" }  }}

#### 8. Resumable Upload for Large Archives Over 5 MB (uploadType=resumable)




HTTP

POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,headRevisionId,size HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...Content-Type: application/json; charset=UTF-8X-Upload-Content-Type: application/jsonX-Upload-Content-Length: 7340032{"name":"full-export-2026-11-21.json","parents":\["1FolderExportsId"\],"appProperties":{"ms\_kind":"export"}}




HTTP

PUT https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload\_id=AAANsUn... HTTP/1.1Content-Length: 2097152Content-Range: bytes 0-2097151/7340032<chunk bytes>

Initiation returns HTTP 200 OK with Location: https://www.googleapis.com/...upload\_id=...; intermediate chunks return HTTP 308 with Range: bytes=0-2097151; the final chunk returns 200 OK with file metadata; and any 4xx response (including 403 or 410) restarts the upload session URI14.

#### 9. Postflight Revisions List & Race-Recovery Fetch (GET /revisions)




HTTP

GET https://www.googleapis.com/drive/v3/files/1NewFileId890/revisions?fields=revisions(id,modifiedTime,size)&pageSize=20 HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...




JSON

{  "200\_OK": {    "revisions": \[      { "id": "0BwwA4oUTeiV1Rev1", "modifiedTime": "2026-11-21T04:12:00.000Z", "size": "48210" },      { "id": "0BwwA4oUTeiV1Rev2", "modifiedTime": "2026-11-21T04:14:10.000Z", "size": "49104" }    \]  },  "403\_FORBIDDEN": {    "error": { "code": 403, "message": "Revisions unavailable", "errors": \[{ "reason": "cannotReadRevisions" }\] }  }}

If an intervening revision (Rev1b) is detected between preflight and Rev2, the worker downloads GET /drive/v3/files/1NewFileId890/revisions/Rev1b?alt=media, merges it locally, and re-uploads.

#### 10. Migration Backup Copy & Non-Destructive Move (POST copy & PATCH parents)




HTTP

POST https://www.googleapis.com/drive/v3/files/1LegacyFileId/copy?fields=id,name,parents HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...Content-Type: application/json{"name":"legacy-raw-1LegacyFileId.json","parents":\["1LegacyBackupSubfolderId"\],"appProperties":{"ms\_kind":"legacy\_backup"}}




HTTP

PATCH https://www.googleapis.com/drive/v3/files/1LegacyFileId?addParents=1LegacyArchiveFolderId&removeParents=1OldParentId&fields=id,parents,appProperties HTTP/1.1Authorization: Bearer ya29.a0AfH6SM...Content-Type: application/json{"appProperties":{"ms\_migrated":"v1"}}

If copy fails (for instance on a 403 permission denial or 404), migration halts safely before moving or rewriting any legacy file.

### Part C: Cloudflare Worker Proxy Catalog




HTTP

POST https://api.math-scratchpad-proxy.workers.dev/api/notion/timer-sessions HTTP/1.1Authorization: Bearer <WorkerSessionJwt>Content-Type: application/json{  "sessionId": "sess\_9f1e2c",  "mode": "pomodoro\_work",  "chapterId": "ch-03-functions",  "itemId": "q\_fn\_0142",  "startedAtIso": "2026-11-21T04:00:00.000Z",  "endedAtIso": "2026-11-21T04:25:00.000Z",  "activeDurationSeconds": 1500,  "pomodoroCycleIndex": 1,  "updatedHlc": "1795152300123:0000:dev\_9a4f"}

The Worker queries POST https://api.notion.com/v1/data\_sources/{data\_source\_id}/query by Session ID (Notion-Version: 2026-03-11)11, creates the page via POST /v1/pages only if missing11, returns { "synced": true, "notionPageId": "..." }, and forwards 429 Retry-After seconds cleanly to the client outbox32.

## 7. Sync-Heavy Testing Strategy and Concrete Test Case Matrix

Unit and property-based fuzz tests run in **Vitest** backed by **fake-indexeddb (v6.x)** inside Node53, while **fast-check** fuzzes arbitrary concurrent offline histories across simulated devices and clock offsets to verify commutativity (merge(A, B) === merge(B, A)), associativity, idempotency, and zero attempt loss. End-to-end verification runs in **Playwright** against a stateful in-memory Drive and Notion simulator attached via browserContext.route() / page.route()57. The simulator tracks Drive revision trees, quota unit burn, and fault rules (401, 403 userRateLimitExceeded, 409/412 simulated conflict, 429 Retry-After, 500/503, ECONNRESET aborts, and ghost Device B races). Playwright's browserContext.setOffline() tests disconnect queues60, while page.clock (install, setFixedTime, fastForward, setSystemTime) validates Pomodoro intervals, token expiry, exponential backoff, and negative clock skew61. Because MathLive >=0.110.0 sets role="group" on <math-field> and role="textbox" on its internal keyboard sink (\#3081)64, Playwright tests target getByRole('textbox') inside <math-field> rather than getByRole('math').

| **Test ID** | **Layer & Runner** | **Scenario & Injected Fault** | **Concrete Pass Criteria** |
| --- | --- | --- | --- |
| UT-01 | Vitest + fake-indexeddb | Transaction abort mid-write during saveStepMutation | Both progress\_docs and sync\_outbox roll back atomically; zero orphan outbox keys |
| UT-02 | Vitest + fast-check | 1,000 fuzzed merge traces across 3 devices with inserts, tombstones, ±48h skew | Merge satisfies commutativity, associativity, idempotency; all attempts retained |
| UT-03 | Vitest | 500 consecutive fractional orderKey midpoint inserts between two steps | Strict lexicographic sort preserved; neighboring step HLC timestamps unchanged |
| UT-04 | Vitest | Bank upgrade (2026.10 to 2026.11) with 50 kept, 10 new, 5 removed items | 50 keep progress & attempts; 10 added not\_started; 5 moved to orphanedItems |
| UT-05 | Vitest | Legacy messy JSON passed through migrateDocument() to Draft 2020-12 | Zero lost steps or attempts; unknown minor fields survive round-trip intact |
| IT-01 | Vitest + Drive Sim | 40 rapid step mutations inside 800 ms window | Outbox coalesces edits into 1 Drive PATCH after 1500 ms debounce |
| IT-02 | Vitest + Drive Sim | Drive returns 401 mid-flush | Sync status switches to AUTH\_EXPIRED; queue retained and flushed after token refresh |
| IT-03 | Vitest + Drive Sim | Drive returns 403 userRateLimitExceeded -> 429 -> 503 -> 200 | Exponential backoff waits respect min(2^n \* 1000 + jitter, 64000); succeeds cleanly |
| IT-04 | Vitest + Drive Sim | Simulated 409/412 conflict response or remote headRevisionId advance | Worker downloads remote file, runs HLC merge locally, and uploads merged state |
| IT-05 | Vitest + Drive Sim | Ghost Device B writes between client preflight GET and PATCH | Postflight revisions.list catches intervening revision, merges it, and re-uploads |
| IT-06 | Vitest + Notion Sim | Notion 429 (Retry-After: 4), then socket drop after POST /v1/pages | Worker waits >= 4 s, queries by Session ID before retry, creates 1 Notion page total |
| IT-07 | Vitest + fake-indexeddb | Inject QuotaExceededError on history\_chunks.put | Active progress stays intact; app raises export + cache-prune prompt |
| E2E-01 | Playwright | **Offline Zero-Network Proof**: import chapter, solve steps, submit, Pomodoro | page.on('request') records **0** external HTTP calls (0 Google, 0 Notion, 0 external CDNs) |
| E2E-02 | Playwright | Offline export -> edit steps newer locally -> re-import older export JSON | Newest HLC steps win; older export's distinct history records merge by union |
| E2E-03 | Playwright (setOffline) | Online mode: drop connection (setOffline(true)), edit & Final submit, reconnect | Top pill cycles Saved -> Queued (Offline) -> Saved; all mutations flush |
| E2E-04 | Playwright (page.route) | Captive portal: OS online, Drive /about probe times out (> 5 s) | App detects unreachability despite navigator.onLine === true, queues edits safely |
| E2E-05 | Playwright (page.clock) | Fast-forward 61:00 past GIS token lifetime while typing steps | Re-sign-in banner renders; typing continues offline-queued; 1-click re-auth flushes |
| E2E-06 | Playwright (Multi-tab) | Open Tab A + Tab B, edit different chapters offline, reconnect together | Web Locks elects 1 leader; Drive mock sees 1 flush loop; both tabs sync via BroadcastChannel |
| E2E-07 | Playwright (page.clock) | **Clock Skew**: Tab A setSystemTime 3h behind Tab B; sync via Drive mock | Tab A pulls Tab B's HLC, advances logical clock past Tab B, and Tab A's next edit wins |
| E2E-08 | Playwright (Reload) | Delay PATCH /upload/drive 1500 ms; call page.reload() at 300 ms | Stale inflight lease reclaims after reload and completes upload without losing the edit |
| E2E-09 | Playwright (Eviction) | Stub navigator.storage.persisted() as false in Offline mode; clear IDB | Eviction warning banner renders with Export button; cleared IDB prompts re-import cleanly |
| E2E-10 | Playwright (Large Data) | Seed 700 questions + 5,000 history records; export > 5 MB snapshot to Drive | Exercise picker filters < 100 ms; Drive export uses uploadType=resumable chunked PUT |
| E2E-11 | Playwright (Migration) | Drive mock seeded with 15 unorganized legacy files | Migrator copies all 15 to exports/legacy-backup-\*, migrates to progress/, moves originals |
| E2E-12 | Playwright (Mode Switch) | Complete 2 chapters offline -> click "Move local data to Drive" | Switches mode cleanly, merges/pushes both chapters and histories to Drive mock |
| E2E-13 | Playwright (MathLive) | Focus step, type "اگر " + Space + math + Shift+Enter + "//" + ± branch | First-click focus succeeds; cursive Persian renders; Space works; Shift+Enter wraps line; "//" opens tools |

## 8. MathLive Integration for Mixed Persian Text and Math

Supporting mixed Persian prose and LaTeX inside a single step requires addressing the root causes of every reported typing failure rather than patching symptoms on top of a locked math input.

### Root Causes of the Reported Bugs

First, **Persian text garbling** occurs because MathLive renders math-mode expressions into discrete child atoms inside .ML\_\_base (arnog/mathlive\#224)65, uses Computer Modern TeX fonts that lack Persian glyphs66, and enforces single-metric glyph rules that clash with Arabic/Persian contextual cursive joining (KaTeX\#729)3. Crucially, MathLive's maintainer confirmed in arnog/mathlive\#2544 that **<math-field> does not support RTL layout**: applying CSS direction: rtl causes caret misplacement and inverted sign placement1. Second, **needing multiple clicks before Persian typing works** stems from MathLive routing physical keyboard and IME events through a hidden Shadow DOM contenteditable element (.ML\_\_keyboard-sink) rather than a standard <input>5. Issues \#2644 (keyboard sink appearing disabled), \#2300 (sink losing focus), \#1439 (non-propagating clicks), and \#2588 (Chrome/Edge 133+ leaving .ML\_\_keyboard-sink in a ghost-blurred state where keydown fires without input events) cause initial keystrokes and OS IME compositions to drop4, while non-US keyboard layouts frequently confuse MathLive's keybinding detector69. Third, **Space failing** happens because LaTeX math mode strips ordinary whitespace, so mathModeSpace does nothing unless configured to "\;", "\:", or "\,"2, and non-empty mathModeSpace exits style scopes (\#2208)70 instead of typing natural word spaces. Fourth, **Shift+Enter failing** occurs because <math-field> defaults to single-line mode (entering multiline via Ctrl+Enter or \displaylines{...} using addRowAfter, \#2650 and \#2551)71 and Shift+Enter is unbound by default.

### Architectural Choice: Option A vs Option B


| **Approach** | **How Mixed Text + Math Works** | **Pros** | **Cons & Risks** |
| --- | --- | --- | --- |
| **Option A: Single <math-field defaultMode="text">** | Entire step lives inside one <math-field> toggling \text{} and  (Shift+Alt+T / Alt+=73) | Single DOM control; MathLive \#3079 and recent changelogs improved \text{} +  serialization64 | <math-field> still lacks RTL layout (\#25441); multiline \displaylines{} placeholder click bugs (\#261976); .ML\_\_keyboard-sink Chrome IME/focus bugs persist (\#2588, \#26444) |
| **Option B: Segmented Bilingual Step Card (Recommended)** | Each step is an ordered flex-wrap flow of native dir="auto" Persian/English text segments paired with isolated LTR <math-field> islands (segments: StepSegment\[\]) | **100% native OS Persian IME**, native Spacebar, native Shift+Enter newlines, true RTL cursive shaping with Vazirmatn, zero RTL caret bugs, and clean mathJson extraction per math island | Requires seamless arrow-key/Backspace focus handoff between adjacent text segments and <math-field> islands (NEEDS TESTING) |

**Recommendation**: Adopt **Option B (Segmented Bilingual Step Card)** while pinning **mathlive >= 0.111.4** (>=0.110.0 closes CVE-2026-54705 XSS in \text{}/\mbox{}6; 0.108+ fixes \#3075 multiline copy separator loss64). Because MathLive 0.111.x removed mf.expression and mf.getValue('math-json')64, read MathJSON ASTs via MathfieldElement.computeEngine.parse(mf.getValue()).json and hydrate via ce.box(json).latex64. Whenever a user enters a <math-field> island and presses Space, Shift+Enter, "//", or Shift+Alt+T, the hardened bridge configures the element safely:




TypeScript

// src/editor/configureMathField.tsimport { MathfieldElement } from 'mathlive';import { ComputeEngine } from '@cortex-js/compute-engine';// Pin mathlive >= 0.111.4 (includes >= 0.110.0 CVE-2026-54705 XSS fix)export function configureMathField(  mf: MathfieldElement,  locale: 'fa' | 'en',  callbacks: {    onOpenAllTools: () => void;    onShiftEnterNewline: () => void;  }) {  if (!MathfieldElement.computeEngine) {    MathfieldElement.computeEngine = new ComputeEngine();  }  MathfieldElement.locale = locale === 'fa' ? 'farsi' : 'english';  mf.defaultMode = 'math';  mf.smartMode = false; // Prevent English-centric heuristic from misparsing Persian input  mf.mathModeSpace = '\\;'; // Regular " " is skipped in LaTeX math mode  mf.smartFence = true;  // Bind layout-independent Shift+Alt+T for manual inline text-mode escape (\#1830)  mf.keybindings = \[    ...mf.keybindings,    { key: 'shift+alt+\[KeyT\]', ifMode: 'math', command: \['switchMode', 'text'\] },    { key: 'shift+alt+\[KeyT\]', ifMode: 'text', command: \['switchMode', 'math'\] },  \];  let lastSlashTs = 0;  mf.addEventListener('keydown', (ev: KeyboardEvent) => {    if (ev.key === 'Enter' && ev.shiftKey) {      ev.preventDefault();      ev.stopPropagation();      // Option B inserts a newline/new segment; within displaylines math islands use addRowAfter      callbacks.onShiftEnterNewline();      return;    }    // Double-tap "/" within 350 ms opens All Math Tools palette (NEEDS TESTING on Persian layout)    if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {      const now = performance.now();      if (now - lastSlashTs < 350) {        ev.preventDefault();        mf.executeCommand('undo'); // Undo initial '/' fraction atom (NEEDS TESTING)        callbacks.onOpenAllTools();        lastSlashTs = 0;        return;      }      lastSlashTs = now;    }  });  // Mitigation for Chromium Shadow DOM .ML\_\_keyboard-sink focus drop (\#2588, \#2644)  mf.addEventListener('pointerdown', () => {    requestAnimationFrame(() => {      const sink = mf.shadowRoot?.querySelector('.ML\_\_keyboard-sink') as HTMLElement | null;      if (sink && document.activeElement !== mf) {        sink.blur();        sink.focus();      }    });  });}

Each requested editor workflow integrates cleanly into this Step Card controller: **Prefill Step 1** seeds orderKey: "a0" with bankItem.prefillStep1 when an item initializes; **Insert Step Between** places an inline + Insert Step divider between cards using fractional orderKey midpoints; **± Branching** spawns paired branchSign: "plus" and "minus" sub-tracks anchored to parentStepId with independent finalAnswer.branchResults; and typing **"//"** (NEEDS TESTING on Windows/macOS Persian keyboard mappings for /) opens the searchable All Math Tools palette calling mf.insert(template, { focus: true }).

## 9. Design System, Typography, Flows, and Accessibility

The desktop UI flips between Persian (dir="rtl", lang="fa") and English (dir="ltr", lang="en") dynamically using **CSS Logical Properties** (margin-inline-start, padding-inline-end, border-inline-start) so layouts mirror cleanly without duplicating stylesheets.


| **Design Token / Standard** | **Specification** | **Rationale & Evidence** |
| --- | --- | --- |
| Persian Font Family | 'Vazirmatn', system-ui, sans-serif (self-hosted WOFF2 in public/fonts/) | Open-source variable Persian typeface79; self-hosting guarantees zero external network calls in Offline mode |
| Math Typography | MathLive Computer Modern fonts bundled in public/mathlive-fonts/ | MathLive requires its own font directory alongside the JS bundle66 |
| Line Heights | Persian body: 1.85; headings: 1.35; math islands: 1.4 | Persian community rules and RTL extensions recommend 1.7–1.9 (1.85) to prevent diacritic/ascender clipping81 |
| BiDi Isolation | Wrap math islands in <bdi dir="ltr" style="unicode-bidi: isolate"> | Keeps =, -, ±, and parentheses correctly ordered inside RTL prose79 |
| Status Palette | --ms-saved: \#15803d; --ms-queued: \#b45309; --ms-offline: \#475569; --ms-error: \#b91c1c | High-contrast semantic tokens (>= 4.5:1) for save indicator & picker badges |
| Layout-Safe Hotkeys | Avoid Shift+2 and Shift+' global shortcuts | Persian keyboards map Shift+2 to ٬82 and non-US dead keys break Shift+' (\#1830)73 |

### Core Components and Accessibility Rules

The workspace merges lesson reading (درسنامه) and exercise practice into a single sequential chapter stream inside the **Unified Workspace**. The **Styled Exercise Picker** sidebar displays item type chips (Worked, Guided, Short, ± Branch, Function?, Domain/Range, Table, Set, Persian) alongside status indicators (not\_started, in\_progress, solved, and editedAfterSubmit). A **Per-Lesson Resume Dropdown** in the header surfaces recent and in\_progress items from resumeState.recentItemIds for 1-click navigation. Under each prompt, a native <details> element renders **Collapsible Source / Page References** (bankItem.sources) collapsed by default. At the top bar, an aria-live="polite" **Save-Status Indicator** reports Saved to Drive, Saved locally, Queued (Offline), or Syncing..., accompanied by contextual banners for **Re-sign-in required (401)**, **Browser Storage Eviction Risk (Export JSON)**, and **Mode Transfer / Move Local Data to Drive**.

Keyboard accessibility strictly obeys MathLive \#3081, where <math-field> carries role="group" and its internal keyboard sink exposes role="textbox" with aria-label and aria-readonly attributes64. Tab moves linearly across each Step Card's Persian segment, math island, + Insert Step control, Split ± Branch button, and Final Submit action. Modals (All Math Tools, Custom JSON Importer, Mode Transfer Wizard) enforce role="dialog", aria-modal="true", strict Tab focus traps, Escape dismissal, and focus restoration to the triggering step or button (NEEDS TESTING to ensure Escape inside <math-field> handles MathLive's built-in ESC LaTeX-mode shortcut cleanly without trapping keyboard-only navigation).

## 10. Notion Sync for Timer and Pomodoro

### Cloudflare Worker Proxy Architecture

Notion API authentication relies on private OAuth tokens and integration secrets, and Notion's developer documentation explicitly warns that tokens must never appear in browser page source, client bundles, or public repositories11. Consequently, a thin **Cloudflare Worker** proxies timer-log requests from the GitHub Pages SPA to https://api.notion.com/v1/\*, holding NOTION\_OAUTH\_CLIENT\_SECRET inside Worker secrets and injecting Notion-Version: 2026-03-1111. During Notion OAuth onboarding, the Worker exchanges the auth code and issues a short-lived signed session token held in SPA memory (or stored encrypted locally if the user opts into persistent timer sync; NEEDS TESTING across GitHub Pages -> workers.dev cross-origin OAuth redirects). When storageMode === 'offline', Notion sync stays completely dormant (notionSyncState: 'disabled').

### Notion 2026-03-11 Data Source Model and Rate Limits

Beginning with API version 2025-09-03 and continuing in 2026-03-11 (supported in @notionhq/client >= v5.12.088), Notion databases contain individual **Data Sources** (data\_source\_id) rather than writing directly to database\_id, and 2026-03-11 replaced archived with in\_trash89. Creating timer entries calls POST /v1/pages with parent: { type: "data\_source\_id", data\_source\_id }11, and idempotency checks call POST /v1/data\_sources/{data\_source\_id}/query49.


| **Notion Property** | **Notion Type** | **Mapped Local Field & Constraints** |
| --- | --- | --- |
| Session Title | title | Human-readable summary (e.g., "Pomodoro \#1 — ch-03-functions", <= 2,000 chars)92 |
| Session ID | rich\_text | sessionId UUIDv4 (queried prior to POST /v1/pages for deduplication)32 |
| Mode | select | "lesson", "session", "pomodoro\_work", "pomodoro\_break" |
| Chapter | rich\_text | chapterId |
| Question ID | rich\_text | itemId (nullable) |
| Duration (sec) | number | activeDurationSeconds |
| Started At | date | startedAtIso (ISO 8601) |
| Ended At | date | endedAtIso (ISO 8601) |
| Cycle Index | number | pomodoroCycleIndex |
| HLC | rich\_text | updatedHlc |

Notion enforces a per-connection rate limit of **180 requests per minute** (average 3 req/s) on Free/Plus workspaces and **600 requests per minute** (average 10 req/s) on Business/Enterprise workspaces, with Retry-After capped at <= 60 seconds for connection-level 60-second windows, alongside a separate \~3 req/s query budget and a shared workspace-wide limit (Retry-After may exceed 1 minute)52. Request payloads must stay within 1,000 block elements and 500 KB92. Because a dropped POST /v1/pages response may have succeeded on Notion's servers, retries never re-POST blindly32: on HTTP 429 or 529, the Worker waits Retry-After seconds32, queries /v1/data\_sources/{data\_source\_id}/query filtering by Session ID, and creates the Notion page only if no matching record exists.

## 11. Prioritized Implementation Roadmap, Risks, and Acceptance Criteria

### Implementation Roadmap


| **Phase** | **Priority Deliverable Scope** | **Key Verification Gates** |
| --- | --- | --- |
| **Phase 1: Typing & MathLive Emergency Fixes (P0)** | Upgrade mathlive >= 0.111.4 (CVE-2026-547056); build Segmented Bilingual Step Card (Vazirmatn, dir="auto" Persian prose + isolated LTR <math-field>), .ML\_\_keyboard-sink pointerdown focus recovery (\#2588, \#26444), mathModeSpace: "\\;", Shift+Enter newlines, "//" All Math Tools modal, prefillStep1, + Insert Step, and ± branch splitting | Verify 1-click Persian IME on Chromium, Firefox, Safari (NEEDS TESTING); migrate Compute Engine reads off removed mf.expression64 |
| **Phase 2: Schemas, Dexie Core & Unified Flow (P1)** | Implement Draft 2020-12 schemas, migrateDocument(), fractional orderKey, HLC + pure 3-way merge, MathScratchpadDB Dexie layer, Vitest + fake-indexeddb + fast-check fuzz tests, Unified Lesson/Practice Workspace, Styled Exercise Picker, Resume Dropdown, Collapsible References, and Custom Exercise JSON Importer | All 10 question types validate; fuzz suite proves commutative/idempotent merge and zero attempt loss |
| **Phase 3: Pure Offline Mode & Durability Guard (P1)** | Wire Mode Gate zero-network enforcement, single-file chapter JSON Import (with HLC merge on re-import) and Drive-identical Export, persisted()/estimate() monitoring, user-clicked persist() prompt, and Eviction Warning banner | Playwright E2E-01 verifies 0 non-origin HTTP calls; E2E-02 verifies re-import merge |
| **Phase 4: GIS Auth, Drive Sync & Safe Migration (P2)** | Implement GIS initTokenClient, Google Picker bank/ onboarding, ReachabilityProber, Web Locks + BroadcastChannel leader bus, multipart + resumable uploaders, Preflight/Postflight revision recovery, 401 Re-sign-in banner, Mode Switch / "Move local data to Drive" wizard, and 5-step LegacyDriveMigrator | Full Playwright fault-injection matrix (E2E-03–E2E-12); validate If-Match & Picker descendant behavior in live Drive sandbox (NEEDS TESTING) |
| **Phase 5: Timers, Pomodoro & Notion Worker (P3)** | Build Lesson + Session + 25/5 Pomodoro timer state machine, deploy Cloudflare Worker (Notion-Version: 2026-03-11, data\_source\_id dedup + Retry-After handling), connect timer Drive + Notion outboxes | Worker tests against Notion 429/529 simulator; verify cross-site OAuth redirect flow (NEEDS TESTING) |

### Key Risks and Mitigations


| **Risk** | **Severity** | **Likelihood** | **Mitigation Strategy** |
| --- | --- | --- | --- |
| Drive API v3 ignores If-Match on concurrent uploads (NEEDS TESTING)8 | High | High | Preflight headRevisionId check + field-level HLC merge + postflight revisions.list recovery; per-device immutable history/ chunks |
| MathLive .ML\_\_keyboard-sink focus or RTL regressions break Persian typing1 | High | High | Keep Persian prose in native dir="auto" segments outside <math-field>; apply pointerdown sink blur/refocus fallback |
| Safari 7-day ITP deletes local Offline data16 | High | Medium | Detect unpersisted / Safari environments, recommend Home Screen installation + periodic JSON export via persistent banner |
| drive.file Picker folder grant misses newly authored bank/ files (NEEDS TESTING)44 | Medium | Medium | Cache picked fileIds locally and expose 1-click "Select / Refresh Bank Files via Picker" action |
| Requesting drive/drive.readonly triggers CASA audit & 100-user cap41 | High | Low | Enforce automated CI check asserting OAuth scope string equals strictly https://www.googleapis.com/auth/drive.file |
| GIS silent token renewal fails under third-party cookie blocking (NEEDS TESTING) | Medium | High | Treat token expiry as graceful offline queueing (401 pauses outbox) with 1-click Re-sign-in banner |

### Acceptance Criteria Checklist

- \[ \] **Persian & Bilingual Typing**: Clicking any step enters Persian text on the first click without garbled/disconnected characters; Space inserts natural word spacing in Persian prose and \; inside math islands; Shift+Enter creates a newline; Shift+Alt+T toggles inline math/text mode reliably on non-US keyboards.
- \[ \] **Practice Workflows & History**: Step 1 prefills from prefillStep1; users can insert steps between existing steps, split ± branches with per-branch final answers, and open All Math Tools by pressing "/" twice; all 10 question types validate and submit; edits after Final submit preserve every prior step snapshot and attempt permanently.
- \[ \] **Unified Lesson + Practice UI**: Lessons (درسنامه) and exercises share one completion rule (solved); Styled Exercise Picker reflects not\_started, in\_progress, and solved states; per-lesson Resume Dropdown jumps to recent items; source/page references collapse beneath prompts; custom JSON exercises import cleanly.
- \[ \] **Offline Mode Isolation & Durability**: Offline mode performs zero outbound network requests (0 Google/Notion/CDN calls); re-importing a chapter JSON merges with newest-HLC-wins; Export outputs JSON strictly matching Drive schemas; unpersisted browser storage triggers an Export backup warning.
- \[ \] **Online Mode & Safe Migration**: GIS initTokenClient authenticates with drive.file + Picker with zero backend refresh tokens; network drops queue changes locally and flush upon verified /about reachability; expired tokens show a non-blocking Re-sign-in banner while practice continues; preflight/postflight revision checks + HLC merges prevent silent data loss; legacy messy Drive files back up into exports/ before organizing into Math Scratchpad/{bank,progress,history,exports}/.
- \[ \] **Timers & Notion Sync**: Per-lesson, session, and 25/5 Pomodoro timers persist locally/on Drive and sync idempotently through the Cloudflare Worker to Notion 2026-03-11 (data\_source\_id), honoring Retry-After and preventing duplicate pages across retries.

#### Works cited

- \[Bug\] Incorrect Caret Positioning in RTL · Issue \#2544 · arnog/mathlive, [https://github.com/arnog/mathlive/issues/2544](https://github.com/arnog/mathlive/issues/2544)
- Mathfield API Reference - MathLive, [https://mathlive.io/mathfield/api/](https://mathlive.io/mathfield/api/)
- Add support for Persian & Arabic alphabet in text and eastern-arabic, [https://github.com/KaTeX/KaTeX/issues/729](https://github.com/KaTeX/KaTeX/issues/729)
- Bug Report: MathLive Plugin - Textarea Remains Disabled \#2644, [https://github.com/arnog/mathlive/issues/2644](https://github.com/arnog/mathlive/issues/2644)
- Virtual keyboard issue \#2588 - arnog/mathlive - GitHub, [https://github.com/arnog/mathlive/issues/2588](https://github.com/arnog/mathlive/issues/2588)
- CVE-2026-54705 Detail - NVD, [https://nvd.nist.gov/vuln/detail/CVE-2026-54705](https://nvd.nist.gov/vuln/detail/CVE-2026-54705)
- Vergleichsreferenz für Drive API Version 2 und Version 3, [https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=de](https://developers.google.com/workspace/drive/api/guides/v2-to-v3-reference?hl=de)
- Is raceless optimistic concurrency possible in google drive v3, [https://stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface](https://stackoverflow.com/questions/79865579/is-raceless-optimistic-concurrency-possible-in-google-drive-v3-interface)
- Drive API v3: supported If-Match contract for media-only file, [https://discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/410305](https://discuss.google.dev/t/drive-api-v3-supported-if-match-contract-for-media-only-file-replacement/410305)
- REST Resource: files | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/files](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- Create a page in a data source - Notion Docs, [https://developers.notion.com/guides/data-apis/create-pages-in-a-data-source](https://developers.notion.com/guides/data-apis/create-pages-in-a-data-source)
- File System Access API Limits: OPFS and Browser Quotas - Fastio, [https://fast.io/resources/file-system-access-api/](https://fast.io/resources/file-system-access-api/)
- Upload file data | Google Drive, [https://developers.google.com/workspace/drive/api/guides/manage-uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads)
- Google Drive - Dateidaten hochladen, [https://developers.google.com/workspace/drive/api/guides/manage-uploads?hl=de](https://developers.google.com/workspace/drive/api/guides/manage-uploads?hl=de)
- Storage quotas and eviction criteria - Web APIs - MDN Web Docs, [https://developer.mozilla.org/en-US/docs/Web/API/Storage\_API/Storage\_quotas\_and\_eviction\_criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- Safari's 7-day cap on script-writable storage - OpenPWA, [https://openpwa.net/reference/storage/safari-seven-day-cap/](https://openpwa.net/reference/storage/safari-seven-day-cap/)
- Storage Quotas, Eviction and Persistent ... - Progressive Web Apps, [https://progressivewebapps.com/caching/storage-quotas/](https://progressivewebapps.com/caching/storage-quotas/)
- Offline data - web.dev, [https://web.dev/learn/pwa/offline-data](https://web.dev/learn/pwa/offline-data)
- StorageManager: persist() method - Web APIs | MDN, [https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)
- StorageManager - Web APIs | MDN, [https://developer.mozilla.org/en-US/docs/Web/API/StorageManager](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager)
- Last I looked into it, it's not permanent in any browser. If you're low, [https://news.ycombinator.com/item?id=39222528](https://news.ycombinator.com/item?id=39222528)
- tinybase-supabase v0.4.1 Bundlephobia, [https://bundlephobia.com/package/tinybase-supabase@0.4.1](https://bundlephobia.com/package/tinybase-supabase@0.4.1)
- GitHub - gdorsi/opfs-lsm: A simple, fast and flexible k/v storage for, [https://github.com/gdorsi/opfs-lsm](https://github.com/gdorsi/opfs-lsm)
- Which IndexedDB Library Should I Use: Dexie vs idb vs RxDB?, [https://docs.bswen.com/blog/2026-04-07-indexeddb-libraries-dexie-idb-rxdb/](https://docs.bswen.com/blog/2026-04-07-indexeddb-libraries-dexie-idb-rxdb/)
- Schema Validation - RxDB, [https://rxdb.info/schema-validation.html](https://rxdb.info/schema-validation.html)
- How RxDB embraces JSON Schema to build its NoSQL Database, [https://json-schema.org/blog/posts/rxdb-case-study](https://json-schema.org/blog/posts/rxdb-case-study)
- PouchDB without a CouchDB server - selfstore, [https://selfstore.dev/compare/pouchdb](https://selfstore.dev/compare/pouchdb)
- Third Party Licenses - Granola, [https://www.granola.ai/third-party-licenses](https://www.granola.ai/third-party-licenses)
- Dexie.js/package.json at master · dexie/Dexie.js · GitHub, [https://github.com/dfahlander/Dexie.js/blob/master/package.json](https://github.com/dfahlander/Dexie.js/blob/master/package.json)
- An offline-first PWA on AWS Amplify, part 1: Dexie, an outbox, and a, [https://philipdamra.dev/articles/offline-first-pwa-part-1/](https://philipdamra.dev/articles/offline-first-pwa-part-1/)
- cristofima/AI-Tech-Interview-Preparation: An AI-powered ... - GitHub, [https://github.com/cristofima/AI-Tech-Interview](https://github.com/cristofima/AI-Tech-Interview)
- Notion API Rate Limits: Three Requests a Second and How to Live, [https://www.runxbuild.com/blog/notion-api-rate-limits/](https://www.runxbuild.com/blog/notion-api-rate-limits/)
- Usage limits | Google Drive, [https://developers.google.com/workspace/drive/api/guides/limits](https://developers.google.com/workspace/drive/api/guides/limits)
- Resolve errors | Google Drive, [https://developers.google.com/workspace/drive/api/guides/handle-errors](https://developers.google.com/workspace/drive/api/guides/handle-errors)
- Add custom file properties | Google Drive, [https://developers.google.com/workspace/drive/api/guides/properties](https://developers.google.com/workspace/drive/api/guides/properties)
- Use Code Model | Web guides - Google for Developers, [https://developers.google.com/identity/oauth2/web/guides/use-code-model](https://developers.google.com/identity/oauth2/web/guides/use-code-model)
- Use the token model | Web guides - Google for Developers, [https://developers.google.com/identity/oauth2/web/guides/use-token-model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- Migrate to Google Identity Services | Web guides, [https://developers.google.com/identity/oauth2/web/guides/migration-to-gis](https://developers.google.com/identity/oauth2/web/guides/migration-to-gis)
- Google Account Authorization JavaScript API reference | Web guides, [https://developers.google.com/identity/oauth2/web/reference/js-reference](https://developers.google.com/identity/oauth2/web/reference/js-reference)
- Choose Google Drive API scopes, [https://developers.google.com/workspace/drive/api/guides/api-specific-auth](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Google Drive picker should request only the drive.file scope to avoid, [https://github.com/open-webui/open-webui/issues/29537](https://github.com/open-webui/open-webui/issues/29537)
- Google OAuth Verification and CASA for AI Apps - Agentic Fabriq, [https://www.agenticfabriq.com/blog/google-oauth-verification-casa](https://www.agenticfabriq.com/blog/google-oauth-verification-casa)
- Files and folders overview | Google Drive, [https://developers.google.com/workspace/drive/api/guides/about-files](https://developers.google.com/workspace/drive/api/guides/about-files)
- Personal-use drive.readonly app on Netlify: verification/CASA, [https://discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/406329](https://discuss.google.dev/t/personal-use-drive-readonly-app-on-netlify-verification-casa-exemption-and-permitted-scope/406329)
- Method: files.create | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/create)
- Method: files.update | Google Drive, [https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/update)
- StorageManager: estimate() method - Web APIs | MDN, [https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate)
- StorageManager: persisted() method - Web APIs | MDN, [https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persisted](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persisted)
- Notion API (2025-09-03) | Get Started - Postman, [https://developers.notion.com/guides/resources/notion-s-api-workspace](https://developers.notion.com/guides/resources/notion-s-api-workspace)
- Query a data source - Notion Docs, [https://developers.notion.com/reference/query-a-data-source](https://developers.notion.com/reference/query-a-data-source)
- Create a page - Notion Docs, [https://developers.notion.com/reference/post-page](https://developers.notion.com/reference/post-page)
- Request limits - Notion Docs, [https://developers.notion.com/reference/request-limits](https://developers.notion.com/reference/request-limits)
- Find Dead Code in a React Project | Rush, [https://getrush.ai/run/find-dead-code/react/](https://getrush.ai/run/find-dead-code/react/)
- CLAUDE.md — Unaware Sessions Browser Extension - GitHub, [https://github.com/msaidbilgehan/unaware-sessions-browser-extension/blob/master/CLAUDE.md](https://github.com/msaidbilgehan/unaware-sessions-browser-extension/blob/master/CLAUDE.md)
- Offline agent workflows for last-mile ops - Kubai Kevin, [https://blog.kubailabs.com/offline-agent-workflows-for-last-mile-ops/](https://blog.kubailabs.com/offline-agent-workflows-for-last-mile-ops/)
- Tchona — Birewa Audrey Amona, [https://birewa.com/en/work/tchona](https://birewa.com/en/work/tchona)
- Route | Playwright, [https://playwright.dev/docs/api/class-route](https://playwright.dev/docs/api/class-route)
- Network - Playwright, [https://playwright.dev/docs/network](https://playwright.dev/docs/network)
- Mock APIs - Playwright, [https://playwright.dev/docs/mock](https://playwright.dev/docs/mock)
- BrowserContext - Playwright, [https://playwright.dev/docs/api/class-browsercontext](https://playwright.dev/docs/api/class-browsercontext)
- Clock | Playwright, [https://playwright.dev/docs/clock](https://playwright.dev/docs/clock)
- Clock - Playwright, [https://playwright.dev/docs/api/class-clock](https://playwright.dev/docs/api/class-clock)
- Clock | Playwright Java, [https://playwright.dev/java/docs/clock](https://playwright.dev/java/docs/clock)
- Mathfield Changelog - MathLive, [https://mathlive.io/mathfield/changelog/](https://mathlive.io/mathfield/changelog/)
- \[FEATURE\] multiline input · Issue \#224 · arnog/mathlive - GitHub, [https://github.com/arnog/mathlive/issues/224](https://github.com/arnog/mathlive/issues/224)
- Customizing a Mathfield - MathLive, [https://mathlive.io/mathfield/guides/customizing/](https://mathlive.io/mathfield/guides/customizing/)
- Physical keyboard does not write anything to the math field (in some, [https://github.com/arnog/mathlive/issues/2300](https://github.com/arnog/mathlive/issues/2300)
- click events inside of mathlive input not propagating out · Issue \#1439, [https://github.com/arnog/mathlive/issues/1439](https://github.com/arnog/mathlive/issues/1439)
- Keybindings and Inline Shortcuts - MathLive, [https://mathlive.io/mathfield/guides/shortcuts/](https://mathlive.io/mathfield/guides/shortcuts/)
- Option to Disable Automatic `\mathbf` Extension to Subsequent, [https://github.com/arnog/mathlive/issues/2208](https://github.com/arnog/mathlive/issues/2208)
- Inconsistent Behavior of Enter Key vs Ctrl+Enter for Line Breaks in, [https://github.com/arnog/mathlive/issues/2650](https://github.com/arnog/mathlive/issues/2650)
- Multiline Invalid Latex · Issue \#2551 · arnog/mathlive - GitHub, [https://github.com/arnog/mathlive/issues/2551](https://github.com/arnog/mathlive/issues/2551)
- Can't shift between text and math mode using keyboard shortcut with, [https://github.com/arnog/mathlive/issues/1830](https://github.com/arnog/mathlive/issues/1830)
- Keyboard Shortcuts - MathLive, [https://mathlive.io/mathfield/reference/keybindings/](https://mathlive.io/mathfield/reference/keybindings/)
- Text runs are serialized without \text{} when defaultMode is ... - GitHub, [https://github.com/arnog/mathlive/issues/3078](https://github.com/arnog/mathlive/issues/3078)
- Placeholders in a multi-line environment not focusable with pointer, [https://github.com/arnog/mathlive/issues/2619](https://github.com/arnog/mathlive/issues/2619)
- Mathfield Changelog - MathLive, [https://cortexjs.io/mathlive/changelog/](https://cortexjs.io/mathlive/changelog/)
- Expressions - MathLive, [https://mathlive.io/compute-engine/guides/expressions/](https://mathlive.io/compute-engine/guides/expressions/)
- Persian Right — RTL & Font for AI Chatbots - Firefox Addons, [https://addons.mozilla.org/en-US/firefox/addon/persian-rtl-font-for-chatbots/](https://addons.mozilla.org/en-US/firefox/addon/persian-rtl-font-for-chatbots/)
- Theme Studio - Joplin Plugins, [https://joplinapp.org/plugins/plugin/org.joplin.plugin.theme-studio/](https://joplinapp.org/plugins/plugin/org.joplin.plugin.theme-studio/)
- Agents Md Persian by MiladJoodi — AI Skill for Any LLM | TypingMind, [https://www.typingmind.com/skills/miladjoodi-agents-md-persian](https://www.typingmind.com/skills/miladjoodi-agents-md-persian)
- mmnaderi/chatgpt-rtl: A smart RTL (Right-to-Left) and UI patcher with, [https://github.com/mmnaderi/codex-rtl](https://github.com/mmnaderi/codex-rtl)
- Claude Vazirmatn Font - Visual Studio Marketplace, [https://marketplace.visualstudio.com/items?itemName=Mytermeh.claude-vazirmatn-font](https://marketplace.visualstudio.com/items?itemName=Mytermeh.claude-vazirmatn-font)
- Better Persian/Arabic typography on Windows & Chrome - Gemini, [https://support.google.com/gemini/thread/473640680/feature-request-better-persian-arabic-typography-on-windows-chrome?hl=en](https://support.google.com/gemini/thread/473640680/feature-request-better-persian-arabic-typography-on-windows-chrome?hl=en)
- RightyMath - Obsidian Plugin, [https://community.obsidian.md/plugins/rightymath](https://community.obsidian.md/plugins/rightymath)
- A one-command RTL fix for Codex Desktop: Persian, Arabic, Hebrew, [https://www.reddit.com/r/CodexHacks/comments/1uozyki/a\_onecommand\_rtl\_fix\_for\_codex\_desktop\_persian/](https://www.reddit.com/r/CodexHacks/comments/1uozyki/a_onecommand_rtl_fix_for_codex_desktop_persian/)
- mathlive/CHANGELOG.md at master - GitHub, [https://github.com/arnog/mathlive/blob/master/CHANGELOG.md](https://github.com/arnog/mathlive/blob/master/CHANGELOG.md)
- Versioning - Notion Docs - Notion API, [https://developers.notion.com/reference/versioning](https://developers.notion.com/reference/versioning)
- Data source - Notion Docs, [https://developers.notion.com/reference/data-source](https://developers.notion.com/reference/data-source)
- Changes by version - Notion Docs, [https://developers.notion.com/reference/changes-by-version](https://developers.notion.com/reference/changes-by-version)
- Upgrade guide - Notion Docs, [https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03)
- notion-api-gotchas.md - connectors - GitHub, [https://github.com/zapier/connectors/blob/main/apps/notion/references/notion-api-gotchas.md](https://github.com/zapier/connectors/blob/main/apps/notion/references/notion-api-gotchas.md)

