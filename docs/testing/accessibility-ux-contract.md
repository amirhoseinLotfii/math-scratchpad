# Accessibility and UX acceptance contract

Target: WCAG 2.2 A/AA for the approved phone workflows, plus explicit stronger product touch/focus rules. This contract now has an implemented automated baseline; it is not a conformance certificate. AAA focus-appearance guidance is an additional design goal, not mislabelled as an AA requirement.

## Requirement mapping

| ID | Area / WCAG | Required observable checks | Layer / files |
|---|---|---|---|
| A11Y-SEM | 1.3.1, 4.1.2 | Named main/heading, unique IDs, named controls, no nested actions, no positive tabindex | semantics; browser axe states |
| A11Y-LANG | 3.1.1, 3.1.2 | English UI, Persian question RTL, math LTR, contextual math-token names | semantics, existing mobile-controls |
| A11Y-ICON | 1.1.1, 2.5.3, 4.1.2 | Named reset/delete/menu, decorative hidden SVG, label-in-name, native disabled first deletion | semantics, browser axe, icon hit areas |
| A11Y-PROG | 1.3.1, 4.1.2 | Named progressbar with min/max/current values | semantics |
| A11Y-DLG | 2.1.1, 2.1.2, 2.4.3, 4.1.2 | Named modal, entry focus, Tab/reverse Tab, radio arrows, explicit Cancel, Escape, return focus, inert background | dialogs, keyboard-and-adaptations |
| A11Y-MENU | 2.1.1, 2.4.3, 4.1.2 | Trigger popup/expanded state, menuitem semantics, ArrowDown/Home/End/Escape, no activation from navigation | forms-and-menus |
| A11Y-FORM | 3.3.1, 3.3.2, 3.3.3 | Error wording, aria-invalid, linked description, invalid-field focus, no data loss, remove stale errors | forms-and-menus, browser invalid state |
| A11Y-FOCUS | 2.4.7, 2.4.11 | Visible focus, not covered by popup/footer, scroll active control into view, no focus on disabled action | keyboard-and-adaptations, existing browser tests |
| A11Y-CONTRAST | 1.4.3, 1.4.11 | Browser-rendered text/control contrast across edit/menu/dialog/error/completion; manual focus/disabled review | axe-states, manual record |
| A11Y-REFLOW | 1.4.4, 1.4.10, 1.4.12 | 320/390/430 widths, enlarged text, text spacing, long-formula local scrolling, landscape without clipping | browser adaptations, design-tokens, existing browser tests |
| A11Y-TARGET | 2.5.8 + product goal | Key targets ≥44 wide/48 high and icon hit areas ≥44; no vertical letter wrapping | existing browser geometry, design-tokens, visual/manual |
| A11Y-MOTION | 2.3.1 plus reduced-motion preference | No flashing, reduced transitions, no persistent nonessential animation | browser adaptations, manual record |
| A11Y-STAT | 4.1.3 | Copy outcome announced, status not focus-stealing, timer not assertively repeated every second | semantics, browser status tests |
| UX-RECOVERY | Data safety | Invalid JSON/read denial/quota failure, preserve raw backup and in-memory work, manual export | local-storage-recovery, browser persistence |
| UX-SYNC | Local same-origin tabs | Legacy migration, reload, clean-tab update, no echo, dirty conflict, bad data quarantine, write-failure recovery | local-storage-sync |
| UX-MODEL | Edit invariants | Generated digit histories, Undo identity, cursor bounds, valid export/import after mixed commands | properties/editing-invariants |
| UX-VISUAL | Approved design | Single/batch/confidence screenshots at each phone width, stable timer mask only | visual/mobile-layout; reviewed baselines required |
| DS-TOKENS | Style system | Semantic surface/text/focus/error tokens, enlarged touch controls | design-tokens |

## Automated evidence rules

1. DOM axe explicitly disables only `color-contrast` and `label-content-name-mismatch`, because JSDOM has no layout/canvas text measurement. Those rules remain enabled in real-browser axe scans. They are not waived for the product.
2. Browser axe scans nine states with WCAG 2/2.1/2.2 A/AA tags. Full reports include violations and incomplete/manual-review items. No exclusion list, impact-only filter or accepted-violation snapshot is used.
3. user-event drives keyboard interaction. DOM focus/role tests are not screen-reader speech assertions. Playwright checks geometry and hit-testing; neither proves TalkBack usability.
4. fast-check uses fixed seed 20261026, 75 runs per invariant and shrinking. It is three properties, not 225 separately claimed test cases. Record the seed/path if a counterexample fails.
5. Nine actual full-page Chromium screenshots are captured and engineering-reviewed; user/device visual acceptance remains pending. Never accept generated mockups as browser snapshots or auto-update baselines to hide differences. The 0.5% image diff allowance covers rendering noise, not omitted controls.
6. Increased-font CSS checks are not equivalent to every browser's actual zoom or Android text setting. Device/browser zoom and TalkBack remain manual gates.
7. The new accessibility radio-group error contract deliberately requires invalid-submit feedback. Continue is not silently disabled without an explanation.

## Approval and release gates

`npm run test:gate` runs type checking, all unit/DOM/integration tests and all browser projects, records every exit code, and exits non-zero if any fails. Missing browser binaries or snapshots fail the gate. No automatic retries are used to disguise flakiness. Tests intentionally red for unimplemented behavior must become green through implementation; they must not be skipped/deleted.

`npm run test:release` additionally requires a completed evidence-bearing manual record in `docs/testing/manual-acceptance.json`. Its default is pending. A failure, missing evidence or missing review time blocks approval. Machine-pass and manual-pass are both necessary; neither automatically publishes the app.

Production now uses Zustand/shadcn-style source-owned components/RHF/Zod. See `docs/architecture/mobile-stack.md` for the implemented stack and compatibility adapter boundary.

## Target architecture acceptance

`tests/architecture/target-stack.test.ts` passes against the real migrated application. It verifies the expressly requested runtime stack, absence of duplicate Redux/Zustand ownership after migration, source-owned shadcn configuration, semantic theme aliases, pure mathematical-model imports, shared-UI dependency isolation and kebab-case feature files. It does not test third-party implementation internals or pretend a missing directory passes an import-boundary rule.

`tests/unit/session-validation-contract.test.ts` tests the implemented Zod-composed import boundary through the existing validator API: known invalid confidence/time fields must reject, absent optional confidence stays absent, limits remain bounded and unknown executable/answer-key fields are stripped. The bounded graph validator is composed with Zod metadata validation.
