# Hardcoded Values Report - Math Scratchpad

## Summary

This report identifies hardcoded CSS values in the Math Scratchpad codebase that should be replaced with Design System tokens.

## Statistics

- **Total hardcoded color values**: 98
- **Files with hardcoded values**: Multiple (see below)
- **Priority**: High (affects maintainability and theming)

## Files with Hardcoded Values

### 1. `src/App.tsx`
**Hardcoded values found:**
- `color: '#F0F3F1'` (line with chapterTransitioning)
- `background: 'rgba(12, 15, 13, .86)'`

**Recommendation:**
- Replace with semantic tokens from `design-tokens.css`
- `#F0F3F1` ≈ `--color-neutral-50` (but lighter, may need new token)
- `rgba(12, 15, 13, .86)` ≈ `rgba(var(--color-background-rgb), 0.86)` or new overlay token

**Mapping:**
```css
#F0F3F1 → var(--color-neutral-50) /* Close match, may need adjustment */
rgba(12, 15, 13, .86) → rgba(var(--color-background-rgb), 0.86)
```

---

### 2. `src/styles.css`
**This file contains the majority of hardcoded values (95+ occurrences)**

#### Legacy MS (Math Scratchpad) Tokens
These appear to be old Math Scratchpad brand colors:
```css
--ms-bg: #121a18;
--ms-surface: #202624;
--ms-key: #2b302f;
--ms-fg: #f2f6f3;
--ms-muted: #b8c5bf;
--ms-border: #707a75;
--ms-primary: #d0f5e2;
--ms-on-primary: #163d2e;
--ms-danger: #a82924;
--ms-on-danger: #ffffff;
--ms-highlight: #254c3d;
--ms-warning: #f4c16f;
--ms-radius: 24px;
```

**Note:** These are defined twice in the file (lines with duplicate definitions).

**Issue:** The file tries to map these to new tokens:
```css
#math-scratchpad-redux {
  --ms-bg: var(--background);
  --ms-surface: var(--card);
  --ms-key: var(--secondary);
  --ms-fg: var(--foreground);
  --ms-muted: var(--muted-foreground);
  --ms-border: var(--border);
  --ms-primary: var(--primary);
  --ms-on-primary: var(--primary-foreground);
  --ms-highlight: #284f3b; /* Still hardcoded! */
  /* ... */
}
```

**Problem:** `--ms-highlight` is still hardcoded to `#284f3b` instead of using new tokens.

#### Additional Hardcoded Colors in `src/styles.css`

**Background colors:**
- `#1b3329` (radial gradient)
- `#19271e`
- `#1b2420`
- `#222925`
- `#1d2220`
- `#252b28`
- `#213c2e`
- `#263b2d`
- `#1b2721`
- `#192b20`
- `#000b` (multiple times - semi-transparent black)
- `#0008` (semi-transparent black)

**Border colors:**
- `#7fab96`
- `#8c6936`
- `#567b65`
- `#739f85`
- `#4c7656`
- `#679479`
- `#8eb79d`
- `#a1c5ae`
- `#527861`
- `#7e1b16`
- `#922018`
- `#3d6652`

**Text colors:**
- `#e8fff1`
- `#e8f4eb`
- `#f4cd70`

**Accent colors:**
- `#a9e6bc` (diagnostic track)
- `#c0ecd0`
- `#426b4e`

---

## Complete List of Hardcoded Colors

### Background Colors
| Color | Hex | File | Line | Suggested Token |
|-------|-----|------|------|-----------------|
| MS Background | #121a18 | styles.css | Multiple | var(--color-background) |
| MS Surface | #202624 | styles.css | Multiple | var(--color-surface) |
| MS Key | #2b302f | styles.css | Multiple | var(--color-surface-elevated) |
| | #1b3329 | styles.css | | Needs mapping |
| | #19271e | styles.css | | Needs mapping |
| | #1b2420 | styles.css | | Needs mapping |
| | #222925 | styles.css | | Needs mapping |
| | #1d2220 | styles.css | | Needs mapping |
| | #252b28 | styles.css | | Needs mapping |
| | #213c2e | styles.css | | var(--color-math-surface) |
| | #263b2d | styles.css | | Needs mapping |
| | #1b2721 | styles.css | | Needs mapping |
| | #192b20 | styles.css | | Needs mapping |
| | #000b | styles.css | Multiple | rgba(var(--color-background-rgb), 0.044) |
| | #0008 | styles.css | | rgba(var(--color-background-rgb), 0.031) |

### Border Colors
| Color | Hex | File | Suggested Token |
|-------|-----|------|-----------------|
| MS Border | #707a75 | styles.css | var(--color-border) |
| | #7fab96 | styles.css | var(--color-primary) light variant |
| | #8c6936 | styles.css | var(--color-warning) dark variant |
| | #567b65 | styles.css | var(--color-success) dark variant |
| | #739f85 | styles.css | var(--color-success) medium variant |
| | #4c7656 | styles.css | var(--color-success) |
| | #679479 | styles.css | var(--color-success) |
| | #8eb79d | styles.css | var(--color-success) light variant |
| | #a1c5ae | styles.css | var(--color-success) lighter variant |
| | #527861 | styles.css | var(--color-success) |
| | #3d6652 | styles.css | var(--color-success) dark |
| | #7e1b16 | styles.css | var(--color-error) dark |
| | #922018 | styles.css | var(--color-error) |

### Text Colors
| Color | Hex | File | Suggested Token |
|-------|-----|------|-----------------|
| MS Foreground | #f2f6f3 | styles.css | var(--color-text-primary) |
| | #e8fff1 | styles.css | var(--color-text-primary) |
| | #e8f4eb | styles.css | var(--color-text-primary) |
| MS Muted | #b8c5bf | styles.css | var(--color-text-muted) |

### Accent Colors
| Color | Hex | File | Suggested Token |
|-------|-----|------|-----------------|
| MS Primary | #d0f5e2 | styles.css | var(--color-primary) light |
| MS Warning | #f4c16f | styles.css | var(--color-warning) |
| | #a9e6bc | styles.css | var(--color-success) light |
| | #c0ecd0 | styles.css | var(--color-success) light |
| | #426b4e | styles.css | var(--color-success) dark |
| | #f4cd70 | styles.css | var(--color-warning) light |

### App.tsx Inline Styles
| Color | Hex | File | Line | Suggested Token |
|-------|-----|------|------|-----------------|
| Background | rgba(12, 15, 13, .86) | App.tsx | chapterTransitioning | rgba(var(--color-background-rgb), 0.86) |
| Text | #F0F3F1 | App.tsx | chapterTransitioning | var(--color-neutral-50) or new token |

---

## Recommendations

### Immediate Actions (High Priority)

1. **Create RGB variables for color tokens**
   Add to `design-tokens.css`:
   ```css
   --color-background-rgb: 10, 10, 10;
   --color-surface-rgb: 38, 38, 38;
   /* etc. */
   ```

2. **Replace hardcoded values in App.tsx**
   - Easy win, single file
   - High visibility (loading overlay)

3. **Standardize MS tokens**
   - Map all `--ms-*` tokens to new Design System tokens
   - Remove duplicate definitions

4. **Create mapping document**
   - Map each hardcoded color to its Design System equivalent
   - Include fallbacks where exact match not available

### Medium Priority

1. **Migrate `src/styles.css`**
   - Replace hardcoded colors with Design System tokens
   - This is the biggest task (95+ occurrences)
   - Can be done incrementally

2. **Add missing tokens**
   - Some hardcoded colors don't have exact matches
   - Add them to `design-tokens.css` with semantic names

3. **Add new token categories**
   - Touch target sizes
   - Safe area insets
   - Breakpoints
   - Aspect ratios

### Low Priority

1. **Add linting rules**
   - Prevent new hardcoded values
   - Stylelint or custom ESLint rules

2. **Create migration script**
   - Automated replacement of common patterns
   - Manual review still required

---

## Migration Strategy

### Phase 1: Preparation
1. Create RGB variables for all color tokens
2. Define mapping for MS legacy tokens
3. Add any missing tokens to Design System

### Phase 2: Quick Wins
1. Fix App.tsx inline styles
2. Standardize MS token mappings
3. Remove duplicate token definitions

### Phase 3: Comprehensive Migration
1. Migrate `src/styles.css` (can be done in chunks)
2. Migrate component files
3. Verify all colors in light/dark themes

### Phase 4: Validation
1. Visual regression testing
2. Manual review of all screens
3. Accessibility checks (contrast ratios)

---

## Estimated Effort

| Task | Effort | Complexity |
|------|--------|------------|
| Create RGB variables | 30 min | Low |
| Fix App.tsx | 15 min | Low |
| Map MS tokens | 1 hour | Medium |
| Migrate styles.css | 4-8 hours | High |
| Migrate components | 2-4 hours | Medium |
| Add missing tokens | 1 hour | Low |
| Add linting rules | 1 hour | Medium |
| **Total** | **10-16 hours** | |

---

## Files to Update

- [ ] `src/App.tsx` - Inline styles
- [ ] `src/styles.css` - Main stylesheet
- [ ] `src/styles/design-tokens.css` - Add RGB variables and missing tokens
- [ ] All component files (to be identified)

---

## Next Steps

1. ✅ Create this report
2. ⏳ Add RGB variables to Design System
3. ⏳ Fix App.tsx
4. ⏳ Create detailed mapping document
5. ⏳ Begin migration of styles.css

---

## Generated
This report was generated on request during Phase B (Design System Audit) of the Math Scratchpad project.
