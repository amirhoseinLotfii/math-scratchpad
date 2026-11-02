# Learning event model

Version 1 events are validated with Zod in `src/sync/events.ts`, frozen before publication, and sent to registered in-process sinks. `emitLearnEvent` fills event ID, timestamp, device ID, and unknown-safe context. Event corrections are new events; an emitted event is never changed.

P0-1 is the event-model card only. Events are currently volatile in this branch. They are **not yet durable**; P0-3 will add the IndexedDB outbox. Do not show a synced or saved-to-cloud status for these events before the server acknowledges them.

## Common fields

Every event has `id` (UUID v4), `schema` (1), `ts` (ISO 8601), `deviceId`, `bankVersion`, `session`, `chapter`, `lesson`, `section`, `concept`, and `type`. Duration scopes may also have `endTs`, `durationMs`, `activeMs`, `distractedMs`, and `pausedMs`. Optional item detail includes `skill`, page references, `itemId`, `itemType`, `questionText`, raw `userAnswer`, `steps`, `verdict`, `verdictSource`, `attemptNo`, `hintLevel`, and `note`. Scope 16 adds `confidence`, `errorTag`, `masteryLevel`, and `mood`.

`correct` and `incorrect` verdicts require `verdictSource: "checker"`. This UI currently records submitted work as `verdict: "submitted"` and `verdictSource: "none"`; it does not infer correctness from a learner's text or steps.

## Event types

| Event type | Meaning / producing action |
| --- | --- |
| `lesson_open`, `lesson_close` | Open/leave an interactive lesson; duration is attached to the close event. |
| `chunk_open`, `chunk_read` | Open a page-based concept chunk; `chunk_read` closes it with active duration and source page note. |
| `section_open`, `section_close`, `section_complete` | Enter/leave a section and finish its required checks. |
| `question_open`, `question_close` | Focus/work interval for a practice item or lesson check; duration is on close. |
| `check_answer`, `answer_edited`, `check_skipped` | Submit/start a quick check, revise/clear it, or confirm skipping it. |
| `example_attempt`, `example_revealed` | Write in an example work editor, then request the book solution comparison. |
| `content_revealed` | Reveal a progressive content block or figure description in a lesson. |
| `tryit_attempt`, `exercise_attempt` | Attempt a Try It or section exercise. The main practice editor emits `exercise_attempt`; a future bank field will distinguish Try Its. |
| `step_open`, `step_close`, `step_added`, `step_edited` | Focus a math-work step and record added/changed step snapshots. The editor itself is not modified. |
| `confidence_set` | Select a confidence value for a check or practice item. |
| `hint_used` | Open the existing practice guidance. |
| `more_practice` | Reserved for the extra-practice action added by P1-5. |
| `explain_own_words`, `explain_why` | Reserved for the corresponding typed explanation actions. |
| `mixed_review_attempt` | Reserved for cumulative-review attempts; the active-flow PR currently remains unmerged pending P0. |
| `concept_complete`, `lesson_complete` | Finish the checks for a concept or the final lesson section. |
| `session_start`, `session_end`, `session_reset` | Begin, finish, or explicitly reset a practice session. |
| `mistake_logged`, `review_due_done`, `reverse_attempt`, `timed_round`, `error_tagged`, `mastery_changed`, `mood_logged`, `gate_attempt`, `gate_passed`, `gate_failed`, `goal_status`, `backup_created`, `backup_restored`, `report_generated` | Versioned event types for their respective feature cards. They are validated now; events are emitted when those UI actions are implemented. |
| `tab_hidden`, `tab_visible`, `window_blur`, `window_focus`, `idle_start`, `idle_end` | Browser interruption and resume events while at least one learning scope is active. Idle is 120 seconds without keyboard, pointer, touch, wheel, or input activity. |
| `practice_started`, `lesson_skip`, `scope_paused`, `scope_resumed` | App extensions used for practice entry, explicitly skipping lesson checks, and timer pause/resume. |

## Active time

`ActivityTracker` accounts nested session, question, step, lesson, section, and focused work scopes from a single browser lifecycle monitor. Hidden, blurred, and idle time increments `distractedMs`; an explicit timer pause increments `pausedMs`; only foreground, focused, non-idle time increments `activeMs`. The sums may be lower than `durationMs` when time is intentionally paused. The 2-minute idle threshold is shared across all open scopes.

The event sink is append-only and failures from a sink are isolated from the learner's action. P0-3 will persist queued events; P0-2 will define server acknowledgements and sync status.

## UI action audit

| UI action | Event(s) |
| --- | --- |
| Open/close lesson or section | `lesson_open`/`lesson_close`, `section_open`/`section_close`, `chunk_open`/`chunk_read` |
| Open/close the read-only lesson reference | Timed `lesson_open`/`lesson_close` plus `chunk_read` |
| Focus an item, change focused step | `question_open`/`question_close`, `step_open`/`step_close` |
| Type in a quick check | `check_answer`, then debounced `answer_edited` changes; no correctness claim |
| Choose check confidence or confirm skip | `confidence_set`, `check_skipped` |
| Write/revise lesson work | First nonblank response creates `example_attempt` or `exercise_attempt`; later edits create `step_edited`; additional editor rows create `step_added` |
| Reveal a worked-example solution | `example_revealed` (the learner's preceding work was already recorded as `example_attempt`) |
| Advance after required checks | `concept_complete`, `section_complete`, and `lesson_complete` when applicable |
| Choose end-of-lesson practice before finishing checks | `lesson_skip`, then `practice_started` |
| Start lesson practice | `practice_started` |
| Change main practice answer/steps | `answer_edited`, `step_added`, `step_edited`; submit/advance records `check_answer` or `exercise_attempt` with submitted-only verdict |
| Open built-in guidance | `hint_used` |
| Reveal a progressive lesson block or figure description | `content_revealed`; worked example solution reveals use `example_revealed` |
| Finish a checked diagnostic round | `exercise_attempt` with checker-backed correctness when supported, and `mistake_logged` for incorrect results |
| Export/import/reset | `report_generated`, `backup_created`, `backup_restored`, `session_reset` |
| Pause/resume or leave browser focus | `scope_paused`/`scope_resumed`, visibility, focus, and idle events |

Not yet represented by a current UI action are explicitly marked reserved above; their owning feature cards must add action wiring and tests before they are called complete.
