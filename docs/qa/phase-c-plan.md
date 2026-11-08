# Phase C - Execution Plan: Structural Fixes

## Overview

This document outlines the execution plan for Phase C of the Math Scratchpad project, focusing on implementing structural fixes identified in Phase B audits.

**Phase C Goal**: Execute structural fixes in order of dependency, importance, and risk.

---

## Priority Framework

### Priority Levels
- **P0 - Critical**: Data loss, sync failure, blocks main functionality
- **P1 - High**: Breaks important user flows, serious responsive issues, accessibility violations
- **P2 - Medium**: Visual inconsistencies, usability issues, technical debt
- **P3 - Low**: Polish, minor improvements

### Execution Order
1. Fix root causes first (affecting multiple components)
2. Address P0/P1 issues before P2/P3
3. High impact, low risk first
4. Each fix must have regression tests

---

## Identified Issues from Phase B

### 1. Design System Inconsistencies (P1 - High)
**Root Cause**: Mix of old tokens (`--background`, `--foreground`) and new tokens (`--color-background`, `--color-text-primary`)

**Impact**: 
- Inconsistent styling across components
- Difficult to maintain and theme
- Confusion for developers

**Files Affected**:
- `src/styles.css` (95+ hardcoded colors)
- `src/styles/globals.css` (uses old tokens)
- Multiple component files

**Solution**: 
- Map old tokens to new Design System tokens
- Replace hardcoded colors with semantic tokens
- Create migration guide

**Risk**: Medium (visual changes, need thorough testing)

---

### 2. Hardcoded Values in styles.css (P1 - High)
**Root Cause**: 95+ hardcoded color values in main stylesheet

**Impact**:
- Inconsistent appearance
- Difficult to theme
- Maintenance burden

**Files Affected**:
- `src/styles.css` (primary)
- `src/App.tsx` (fixed in previous commit)

**Solution**:
- Replace all hardcoded colors with Design System tokens
- Standardize on new token naming convention
- Verify visual consistency

**Risk**: Medium-High (extensive changes, need visual regression testing)

---

### 3. Legacy MS Token System (P2 - Medium)
**Root Cause**: Old Math Scratchpad token system (`--ms-*`) still in use

**Impact**:
- Duplicate token definitions
- Confusion between old and new systems
- Maintenance overhead

**Files Affected**:
- `src/styles.css` (MS token definitions)
- Various components using MS tokens

**Solution**:
- Map MS tokens to Design System tokens
- Remove duplicate definitions
- Update all references

**Risk**: Low (backward compatible mapping)

---

### 4. Mixed Token Systems (P2 - Medium)
**Root Cause**: Both `tokens.css` and `design-tokens.css` are imported

**Impact**:
- Potential for token conflicts
- Confusion about which tokens to use
- Inconsistent naming conventions

**Files Affected**:
- `src/main.tsx` (imports both)
- All components (can use either)

**Solution**:
- Standardize on `design-tokens.css`
- Deprecate `tokens.css` or merge into design-tokens
- Update documentation

**Risk**: Low (backward compatible)

---

## Phase C Execution Plan

### Phase C-1: Foundation Fixes (Week 1)

#### Task 1.1: Map Old Tokens to New Design System
**Priority**: P1 (High)
**Effort**: 2-4 hours
**Risk**: Low

**Actions**:
1. Create token mapping document
2. Update `globals.css` to use new token names
3. Update `styles.css` MS token definitions to use new tokens
4. Verify no breaking changes

**Mapping Table**:
```css
/* Old tokens (tokens.css) -> New tokens (design-tokens.css) */
--background -> --color-background
--foreground -> --color-text-primary
--card -> --color-surface
--primary -> --color-primary
--secondary -> --color-surface-elevated
--border -> --color-border
--radius -> --radius-lg (or appropriate value)
--muted-foreground -> --color-text-muted
--primary-foreground -> --color-primary-foreground
```

**Files to Update**:
- `src/styles/globals.css`
- `src/styles.css` (MS token definitions)

---

#### Task 1.2: Remove Duplicate Token Definitions
**Priority**: P2 (Medium)
**Effort**: 1-2 hours
**Risk**: Low

**Actions**:
1. Identify all duplicate token definitions
2. Remove duplicates in favor of Design System tokens
3. Ensure backward compatibility

**Files to Update**:
- `src/styles.css`

---

### Phase C-2: Hardcoded Color Migration (Week 2-3)

#### Task 2.1: Migrate styles.css Colors
**Priority**: P1 (High)
**Effort**: 4-8 hours
**Risk**: Medium-High

**Actions**:
1. Replace all hardcoded colors in `styles.css` with Design System tokens
2. Use RGB variables for rgba() colors
3. Test visual appearance at each step
4. Commit changes incrementally

**Strategy**:
- Work in chunks (50-100 lines at a time)
- Test after each chunk
- Use search/replace for common patterns

**Example Migrations**:
```css
/* Before */
background: #1b3329; /* -> */ background: var(--color-background);
color: #f2f6f3; /* -> */ color: var(--color-text-primary);
border: 1px solid #707a75; /* -> */ border: 1px solid var(--color-border);

/* Hardcoded rgba */
background: rgba(12, 15, 13, 0.86); /* -> */ background: rgba(var(--color-background-rgb), 0.86);
```

**Files to Update**:
- `src/styles.css` (primary target)

---

#### Task 2.2: Create Color Migration Guide
**Priority**: P2 (Medium)
**Effort**: 1-2 hours
**Risk**: Low

**Actions**:
1. Document all hardcoded colors and their token equivalents
2. Create lookup table for developers
3. Add to project documentation

**Deliverables**:
- `docs/development/color-migration-guide.md`

---

### Phase C-3: Component-Level Fixes (Week 3-4)

#### Task 3.1: Audit Component Styles
**Priority**: P2 (Medium)
**Effort**: 2-4 hours
**Risk**: Low

**Actions**:
1. Identify components with hardcoded or inconsistent styles
2. Categorize by severity
3. Create prioritized fix list

**Files to Audit**:
- All `.tsx` files in `src/components`
- All `.tsx` files in `src/features`

---

#### Task 3.2: Fix High-Priority Components
**Priority**: P1-P2 (High-Medium)
**Effort**: 4-8 hours
**Risk**: Medium

**Actions**:
1. Fix components with most critical style issues
2. Ensure consistency with Design System
3. Add/fix tests as needed

**Target Components**:
- High-visibility components (buttons, inputs, modals)
- Frequently used components
- Components with identified issues

---

### Phase C-4: Verification and Testing (Ongoing)

#### Task 4.1: Visual Regression Testing
**Priority**: P1 (High)
**Effort**: 2-4 hours
**Risk**: Low

**Actions**:
1. Run visual regression tests (Playwright)
2. Compare before/after screenshots
3. Identify and fix visual regressions

**Note**: Requires browser environment (KERNEL)

---

#### Task 4.2: Manual Verification
**Priority**: P1 (High)
**Effort**: 2-4 hours
**Risk**: Low

**Actions**:
1. Manual testing on multiple devices
2. Verify color consistency
3. Check responsive behavior
4. Test accessibility (contrast, focus)

---

#### Task 4.3: Unit Test Updates
**Priority**: P2 (Medium)
**Effort**: 1-2 hours
**Risk**: Low

**Actions**:
1. Update any tests affected by style changes
2. Add tests for new token usage
3. Ensure test coverage maintained

---

## Success Criteria

### Phase C-1 (Foundation)
- [ ] All old tokens mapped to new Design System
- [ ] Duplicate token definitions removed
- [ ] No breaking changes introduced
- [ ] All unit tests still pass

### Phase C-2 (Migration)
- [ ] All hardcoded colors in `styles.css` replaced with tokens
- [ ] All rgba() colors use RGB variables
- [ ] Visual appearance maintained
- [ ] All unit tests still pass

### Phase C-3 (Components)
- [ ] High-priority components migrated to Design System
- [ ] Style consistency improved
- [ ] Test coverage maintained

### Phase C-4 (Verification)
- [ ] Visual regression tests pass
- [ ] Manual verification complete
- [ ] All tests pass (unit + visual)

---

## Risk Mitigation

### High-Risk Changes
1. **styles.css Migration**: 
   - Work in small chunks
   - Test after each chunk
   - Use feature flags if needed

2. **Token System Changes**:
   - Maintain backward compatibility
   - Update old tokens gradually
   - Document breaking changes

### Rollback Strategy
1. All changes committed incrementally
2. Each commit has clear description
3. Easy to revert individual commits if needed
4. Full rollback possible via git

---

## Dependencies

### Required for Full Testing
- Browser environment for Playwright tests
- Visual regression test setup
- Manual testing devices

### Current Status
- ✅ Unit tests: All passing
- ⚠️ E2E tests: Created but cannot execute (no browser)
- ⏳ Manual testing: Pending

---

## Timeline Estimate

| Phase | Tasks | Effort | Timeline |
|-------|-------|--------|----------|
| C-1 | Foundation Fixes | 3-6 hours | Week 1 |
| C-2 | Hardcoded Migration | 6-10 hours | Week 2-3 |
| C-3 | Component Fixes | 4-8 hours | Week 3-4 |
| C-4 | Verification | 4-8 hours | Ongoing |
| **Total** | | **17-32 hours** | **2-4 weeks** |

---

## Next Steps

### Immediate (This Session)
1. ✅ Push all Phase A and B commits to GitHub
2. ⏳ Start Phase C-1: Map old tokens to new Design System
3. ⏳ Update `globals.css` to use new token names

### Short Term (Next Few Sessions)
1. Complete Phase C-1 (Foundation)
2. Begin Phase C-2 (Migration)
3. Execute in parallel with remaining Phase A tasks

### Medium Term
1. Complete Phase C
2. Begin Phase D (Continue Where You Left Off feature)

---

## Related Documents

- `docs/qa/design-system-audit.md` - Design System analysis
- `docs/qa/hardcoded-values-report.md` - Hardcoded color inventory
- `docs/qa/product-inventory.md` - Complete product inventory
- `docs/qa/phase-a-status.md` - Phase A completion status

---

## Generated
This plan was created as part of Phase C (Execution Plan) of the Math Scratchpad project.
Based on findings from Phase B audits and current project state.
