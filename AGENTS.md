# Math Scratchpad — agent instructions

These instructions apply to Chat Mode, GitHub-connected assistants, and coding agents. Reading a repository instruction file is **not** the same as registering a native ChatGPT Skill. In a new Chat Mode conversation, explicitly fetch this file and the UI/UX Skill as needed.

## Project source of truth

1. Read `README.md`, `package.json`, `docs/design-system.md`, and the affected components/styles before changing code.
2. For approved mobile UI behavior, read `docs/MOBILE_TEST_PLAN.md`, `docs/MOBILE_TEST_RESULTS.md`; for wide layouts read `docs/WIDE_TEST_PLAN.md`, `docs/WIDE_TEST_RESULTS.md`.
3. Existing approved UX/design decisions win over optional style recommendations. Do not replace the current dark forest/charcoal and mint theme, type choices, spacing or interaction model merely because a catalog recommends another style. Obtain approval for redesigns.
4. Do not rewrite unrelated subsystems (math engine, persistence, authentication, sync) during UI-only tasks. Preserve learner state and recovery behavior.

## UI/UX Pro Max workflow (UI-related tasks only)

1. Read `.agents/skills/ui-ux-pro-max/SKILL.md`.
2. Use the targeted guidance in `.agents/skills/ui-ux-pro-max/references/quick-reference.md` and `references/pro-rules.md`.
3. If terminal execution and Python 3 are available, use the locally vendored script, not a remote CLI or `CLAUDE_PLUGIN_ROOT`:
   `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "keyboard focus dialog" --domain ux`
   `python3 .agents/skills/ui-ux-pro-max/scripts/search.py "responsive forms" --stack react`
4. In **Chat Mode without a shell**, inspect the corresponding Markdown and CSV files through the GitHub connector, such as `data/ux-guidelines.csv`, `data/stacks/react.csv`, `data/stacks/shadcn.csv`, and `data/ui-reasoning.csv`. Never claim that Python/CLI ran unless it actually ran; cite the inspected rule or label generic fallback.
5. For a **new approved** page/design direction, consult design-system generation; for an existing UI bug use one specific UX domain and React stack guidance. Do not overwrite an existing design system or persist generated designs without authorization.
6. Keep design reasoning/changes small, testable, and within request scope. Explain why a recommendation fits the existing user workflow.

## Math Scratchpad invariants

- Touch-first, mobile-first and two-thumb math editing. Preserve numeric keypad order and active-step caret/keyboard behavior.
- Persian question prose is RTL/auto; all math expressions and math entry are explicitly LTR. Preserve existing direction isolation.
- Maintain an accessible focus indicator, semantic control labels, actionable feedback and reduced-motion support.
- Mobile target widths: 320, 390, 430px; avoid viewport overflow and obscured active expression. Keep >=44px width and >=48px height for the approved keypad touch targets.
- Opening dialogs, menus and sync panels must not unexpectedly displace the primary editing surface; review anchoring, overlay strategy, keyboard visibility and scroll containment using the actual component implementation.
- Preserve responsive tablet/laptop/desktop behavior; do not assume all UI is on mobile.
- Avoid adding font downloads, paid UI services, external telemetry, or new runtime libraries for a documentation-only task.

## Validation / delivery

- First verify the vendored Skill using `node scripts/verify-vendored-ui-skill.mjs` (no extra dependencies). Source pin and checksums: `docs/ui-ux-pro-max-source-manifest.json`.
- For UI changes, select appropriate existing tests: `npm run test:ux`, `npm run test:a11y`, `npm run test:integration`, `npm run test:visual`, `npm run test:wide`, `npm run test:e2e`; run `npm run build` when applicable.
- Check 320/390/430 mobile widths, keyboard focus/navigation, touch targets, Persian/mathematics direction, accessible labels, Android host occlusion and layout stability. Manual host-device checks remain required.
- Do not claim passing tests without execution evidence; report unrun tests as NOT RUN, not PASS. Use synthetic fixtures, never real student data.
- Work on a separate branch and PR. Preserve `main` and avoid force-pushing or merging without explicit approval.

## Chat Mode onboarding

Use `docs/CHAT_MODE_UI_UX_PRO_MAX.md` for an exact prompt and operating instructions. This repository-local integration needs no Work/Codex quota; it also does not grant Chat Mode shell execution or guarantee automatic Skill discovery.
