# Blockers flash

Verdict: Conditional. Do not start learning on the phone while the reset-pending banner remains; desktop and cross-device safety are unverified.

| ID | Blocker | Safe phone guidance |
|---|---|---|
| AUD-001 | Reset-pending state can leave the editor inert until authenticated cloud confirmation. | Preserve browser data; no verified manual recovery. |
| AUD-009 | Distinct reset releases reuse an epoch; an old event was accepted after two local Worker resets. | Avoid another reset or sync until a verified fix. |
| AUD-014 | Main runtime sent a synthetic queued event while reset was pending. | Do not manually authenticate/sync from the pending state. |
| AUD-003 | Main has no exit/hidden-page flush. | Keep the app open while work is unsynced; no safe close-tab workaround is verified. |
| AUD-017 | JSON and backup-file imports replace current work without separate confirmation. | Do not import into work that must be preserved; save a separate copy first. |

No production data was sent or changed during these tests. Full evidence and staged fix plan are in the audit report.
