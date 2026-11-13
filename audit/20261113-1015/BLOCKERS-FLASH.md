# Blockers flash

Verdict: undetermined for ordinary learning. AUD-009 confirmed old event replay after two local Worker resets with Drive disabled. AUD-014 confirmed main runtime posts a synthetic queued event while local reset flag is pending. See AUD-001 and AUD-003. No safe phone workaround verified. Avoid additional resets.

AUD-017: importing a valid session JSON immediately replaces current work without a separate confirmation. Back up first; do not import into a session containing work you need until verified.
