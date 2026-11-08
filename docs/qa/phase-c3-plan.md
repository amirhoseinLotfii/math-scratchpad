# Phase C-3 - Component-Level Style Fixes

## Overview

**Phase C-3 Goal**: Fix component-level style inconsistencies and ensure all components use Design System tokens consistently.

**Status**: Not Started
**Priority**: P2 (Medium)
**Estimated Effort**: 4-8 hours

---

## Scope

This phase focuses on identifying and fixing style inconsistencies in individual components that:
1. Still use hardcoded colors
2. Use inconsistent styling patterns
3. Don't follow Design System guidelines
4. Have accessibility issues
5. Have responsive design issues

---

## Component Inventory

Based on `docs/qa/product-inventory.md`, the following components need review:

### Core Components
- [ ] `MathLiveStepInput` - Math editor component
- [ ] `Keyboard` - Virtual math keyboard
- [ ] `LessonScreen` - Main lesson display
- [ ] `LessonPicker` - Lesson selection interface

### UI Components
- [ ] Buttons (various states)
- [ ] Input fields
- [ ] Modal dialogs
- [ ] Dropdown menus
- [ ] Tooltips
- [ ] Cards
- [ ] Tabs
- [ ] Navigation

### Feature Components
- [ ] Progress tracking
- [ ] Google Drive connection
- [ ] Settings panel
- [ ] Sync status indicators
- [ ] Notifications/Toasts

---

## Review Checklist

For each component, check:

### Style Consistency
- [ ] Uses Design System tokens (not hardcoded colors)
- [ ] Uses semantic class names
- [ ] Follows spacing scale (--space-1 to --space-20)
- [ ] Uses correct border radius (--radius-sm to --radius-full)
- [ ] Uses correct typography (--text-xs to --text-4xl)

### Color Usage
- [ ] Background colors use --color-background, --color-surface, etc.
- [ ] Text colors use --color-text-primary, --color-text-muted, etc.
- [ ] Border colors use --color-border, --color-border-strong, etc.
- [ ] Status colors use --color-primary, --color-success, --color-warning, --color-error

### Interactive States
- [ ] Hover states defined
- [ ] Focus states defined and visible
- [ ] Active/Pressed states defined
- [ ] Disabled states defined
- [ ] Loading states defined (if applicable)

### Accessibility
- [ ] Sufficient color contrast (WCAG 2.2 AA)
- [ ] Focus indicators visible
- [ ] Keyboard navigation support
- [ ] Screen reader friendly
- [ ] Touch target sizes adequate (min 44x44px)

### Responsive Design
- [ ] Mobile layout correct
- [ ] Tablet layout correct
- [ ] Desktop layout correct
- [ ] Wide viewport handling
- [ ] Orientation changes handled

---

## Implementation Strategy

### Step 1: Automated Scanning (1 hour)
1. Scan all .tsx files for hardcoded colors
2. Identify components using inline styles
3. Find components not using Design System tokens
4. Create list of components needing fixes

### Step 2: High-Priority Components (2-3 hours)
Fix components with most critical issues first:
1. Buttons (high visibility, frequent use)
2. Input fields (user interaction)
3. Modal dialogs (important UX)
4. Navigation (always visible)
5. Math editor (core functionality)

### Step 3: Medium-Priority Components (2-3 hours)
Fix remaining components:
1. Cards and containers
2. Dropdowns and menus
3. Tooltips
4. Progress indicators
5. Settings panels

### Step 4: Verification (1-2 hours)
1. Run unit tests
2. Manual visual testing
3. Verify accessibility
4. Test responsive behavior

---

## Success Criteria

### Phase C-3 Completion
- [ ] All core components use Design System tokens
- [ ] No hardcoded colors in component files
- [ ] All interactive states properly defined
- [ ] All accessibility requirements met
- [ ] All responsive design issues fixed
- [ ] All unit tests still pass
- [ ] No visual regressions

---

## Tools & Resources

### Available Tools
- Design System: `src/styles/design-tokens.css`
- Legacy tokens: `src/styles/tokens.css` (mapped to Design System)
- Global styles: `src/styles/globals.css`
- Main styles: `src/styles.css`

### Testing
- Unit tests: `npm run test:unit`
- E2E tests: Playwright (limited availability)
- Manual testing: Browser dev tools

---

## Common Issues & Fixes

### Issue 1: Inline Styles
**Problem**: `style={{ color: '#ff0000' }}`
**Fix**: `className={styles.error-text}` or use CSS variables

### Issue 2: Hardcoded Colors in Components
**Problem**: `background: '#121a18'`
**Fix**: `background: var(--color-background)`

### Issue 3: Inconsistent Spacing
**Problem**: `margin: '10px'`
**Fix**: `margin: var(--space-3)` (0.75rem = 12px)

### Issue 4: Missing Interactive States
**Problem**: Button without hover/focus states
**Fix**: Define all states in CSS

### Issue 5: Poor Contrast
**Problem**: Gray text on light gray background
**Fix**: Use Design System color tokens with verified contrast

---

## Next Steps

### Immediate (This Session)
1. Start with automated scanning of components
2. Identify high-priority components
3. Begin fixing button components

### Short Term
1. Complete high-priority component fixes
2. Begin medium-priority component fixes
3. Run tests after each fix

### Medium Term
1. Complete all component fixes
2. Run comprehensive testing
3. Update documentation

---

## Related Files

- `docs/qa/design-system-audit.md` - Design System analysis
- `docs/qa/hardcoded-values-report.md` - Hardcoded color inventory
- `docs/qa/product-inventory.md` - Complete component inventory
- `src/styles/design-tokens.css` - Design System tokens

---

## Generated
This plan was created for Phase C-3 (Component-Level Fixes) of the Math Scratchpad project.
Based on requirements from the MASTER PROMPT and findings from previous phases.
