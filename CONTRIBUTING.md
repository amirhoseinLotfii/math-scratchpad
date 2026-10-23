# Contributing

Thank you for helping make mobile math easier to write.

## Set up

Use Node.js 24, run `npm ci`, then `npm run dev`. Before submitting a change, run `npm test` and `npm run build`. Keep generated package-lock changes in the same commit as dependency updates.

## Useful contributions

- Exact LTR/RTL and touch-selection bugs, with a minimal expression.
- Android viewport and TalkBack testing.
- Parser coverage that fails explicitly for unsupported notation.
- Structural navigation, mathematical notation and accessibility improvements.

For a bug report, include device, host, viewport width, expression, actions and expected versus actual result. Remove private exercise content, names and identifiers from screenshots or session JSON.

## Implementation rules

1. Edit the AST through Redux commands; keep rendering declarative.
2. Preserve IDs for existing nodes and create unique IDs for copies.
3. Keep math ASCII digits and LTR, even with a Persian source problem.
4. Never replace the editable expression with a display clone.
5. Do not add automatic grading, network calls, analytics or message sending as incidental changes.
6. Add a behavioral regression test when fixing a substantive editing defect. Report physical device checks separately from DOM tests.

Keep pull requests focused, describe the trigger and resulting behavior, and state what was tested. Discuss larger solver or host integrations in an issue before implementing them.

Be respectful and specific. Suggestions, questions, documentation and reproducible bug reports are welcome; fabricated engagement and unsolicited mass promotion are not part of this project.
