# Tutor export schema (`math-scratchpad.session/1.0`)

Menu → **Export for tutor (JSON)**. Copied to the clipboard and downloaded as `math-session-<session_id>.json`.
Timestamps are ISO-8601 with an explicit UTC offset (e.g. `2026-10-27T16:20:05.123+03:30`).

Top level: `schema_version`, `app` (`math-scratchpad`), `app_version`, `exported_at`, `session_id`,
`anxiety` (1–5|null), `energy` (1–5|null), `started_at`, `ended_at` (null until *End session*),
`totals` {`items`, `answered`, `skipped`, `unanswered`, `missing_final_answer`}, `items[]`.

Each item: `item_id`, `index` (1-based), `question_id` (bank number|null), `assessment` (e.g. `fractions-round-1`|null),
`prompt`, `problem`, `problem_format` (`math-or-latex`|`persian-text`), `status` (`answered`|`skipped`|`unanswered`),
`student_answer` and `final_answer` (LaTeX of the marked final step|null), `final_step_id`, `final_step_number`,
`steps[]` {`step_id`, `number`, `latex`, `is_final`} verbatim in order, `started_at` (first edit), `submitted_at`
(final marked / confidence confirmed), `solve_time_sec` (visible-time timer), `confidence` (5 high · 3 medium · 1 low; default 5),
`confidence_label`, `hint_used`, `hint_note`, `independent` (= not `hint_used`).

`final_answer: null` on an `answered` item means the student did not mark a final step; the tutor must ask for it, not guess.
