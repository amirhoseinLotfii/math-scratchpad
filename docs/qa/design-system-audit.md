# Design System Audit - Math Scratchpad

## Executive Summary

This document audits the current Design System of Math Scratchpad project, identifying what works well, what needs improvement, and what should be added.

## Current State

### Design System Files

1. **`src/styles/design-tokens.css`** (New - Added in commit 4fcda8d)
   - Comprehensive token system (316 lines)
   - Includes: Colors, Semantic Colors, Spacing, Radius, Typography, Elevation, Transitions, Z-Index, Sizes
   - **Status**: ✅ Well-structured, follows modern design token patterns
   - **Usage**: Imported in `src/main.tsx`

2. **`src/styles/tokens.css`** (Existing)
   - Basic token system (14 lines)
   - Includes: Basic colors, spacing, radius, font
   - **Status**: ⚠️ Superseded by design-tokens.css but may still be in use
   - **Usage**: Needs verification

3. **`src/styles.css`** (Existing)
   - Global styles, custom properties
   - Contains some hardcoded values
   - **Status**: ⚠️ Needs audit for consistency with design-tokens.css

### Design System Strengths

1. **Comprehensive Color System**
   - Forest/Dark theme colors
   - Primary, Success, Warning, Error palettes
   - Semantic color tokens (background, surface, text, etc.)
   - Math editor specific colors
   - **Rating**: ✅ Excellent

2. **Spacing System**
   - Complete scale (space-1 to space-20)
   - Consistent with modern design systems
   - **Rating**: ✅ Good

3. **Typography System**
   - Font families defined (sans, mono, math)
   - Complete font size scale
   - Font weights and line heights
   - **Rating**: ✅ Good

4. **Border Radius System**
   - Complete scale (sm to full)
   - **Rating**: ✅ Good

5. **Elevation (Shadows)**
   - Complete shadow system
   - Includes glow effects for focus states
   - **Rating**: ✅ Good

6. **Transitions & Animations**
   - Timing functions defined
   - Common transitions pre-defined
   - **Rating**: ✅ Excellent

7. **Z-Index Scale**
   - Complete z-index system
   - **Rating**: ✅ Good

## Problems Identified

### 1. Duplicate/Consistent Token Files

**Issue**: Two token files exist:
- `design-tokens.css` (new, comprehensive)
- `tokens.css` (old, basic)

**Impact**: Potential for confusion and inconsistency

**Recommendation**: 
- Verify which file is actually being used
- If `tokens.css` is still in use, migrate its content to `design-tokens.css`
- Update all imports to use `design-tokens.css`
- Consider removing `tokens.css`

**Action**: Search codebase for `tokens.css` usage

### 2. Hardcoded Styles

**Issue**: Many files contain hardcoded color values, spacing, etc.

**Examples found** (to be verified):
- Direct color values like `#151719`, `#e7ebe8`
- Direct spacing values like `margin: 8px`
- Direct border radius values

**Impact**: 
- Makes maintenance difficult
- Inconsistent appearance
- Difficult to theme

**Recommendation**: 
- Audit entire codebase for hardcoded values
- Replace with design token references
- Create a migration guide

**Action**: Run grep searches for hardcoded values

### 3. Usage of Old Color Tokens

**Issue**: The old `tokens.css` uses different color variable names:
- `--background: #151719`
- `--foreground: #e7ebe8`
- `--primary: #86b99b`

While new `design-tokens.css` uses:
- `--color-background: var(--color-neutral-1000)`
- `--color-text-primary: var(--color-neutral-50)`
- `--color-primary: var(--color-primary-400)`

**Impact**: Inconsistent naming, potential for using wrong tokens

**Recommendation**:
- Standardize on new token names
- Create migration mapping
- Update all references

### 4. Missing Token Categories

**Missing**: 
- ❌ Touch target sizes
- ❌ Safe area insets (for mobile)
- ❌ Breakpoints (though these may be in Tailwind config)
- ❌ Aspect ratios
- ❌ Container widths

**Recommendation**: Add these categories to `design-tokens.css`

### 5. RTL/LTR Support

**Issue**: Persian content requires proper RTL support

**Current State**: Unknown - needs investigation

**Recommendation**:
- Add RTL-specific tokens if needed
- Ensure all tokens work in RTL context
- Test directionality

## Code Usage Analysis

### Files Using Design Tokens

Need to search for:
```css
var(--color-*)
var(--space-*)
var(--radius-*)
var(--text-*)
var(--transition-*)
```

### Files Using Old Tokens

Need to search for:
```css
var(--background)
var(--foreground)
var(--primary)
var(--card)
```

### Files With Hardcoded Values

Need to search for:
```css
#151719
#e7ebe8
#86b99b
#202326
margin: 8px
padding: 12px
border-radius: 8px
```

## Migration Strategy

### Phase 1: Discovery
1. Search entire codebase for CSS custom properties usage
2. Identify all hardcoded values
3. Map current usage to new tokens

### Phase 2: Cleanup
1. Remove duplicate tokens
2. Standardize token naming
3. Update documentation

### Phase 3: Adoption
1. Replace hardcoded values with tokens
2. Update old token references to new tokens
3. Add linting rules to prevent hardcoded values

### Phase 4: Enhancement
1. Add missing token categories
2. Add RTL support
3. Add responsive variants if needed

## Next Steps

1. ✅ Create this audit document
2. ⏳ Search codebase for token usage patterns
3. ⏳ Identify all hardcoded values
4. ⏳ Create migration plan
5. ⏳ Implement Design System improvements

## Success Metrics

- [ ] All colors use design tokens
- [ ] All spacing uses design tokens
- [ ] All border radius uses design tokens
- [ ] All typography uses design tokens
- [ ] No duplicate token definitions
- [ ] Consistent token naming
- [ ] Documentation complete

## Tools to Use

- `grep -r "#" src/ --include="*.tsx" --include="*.ts" --include="*.css"` (find hardcoded colors)
- `grep -r "px" src/ --include="*.tsx" --include="*.ts" --include="*.css"` (find hardcoded sizes)
- `grep -r "var(--" src/ --include="*.tsx" --include="*.ts" --include="*.css"` (find token usage)
