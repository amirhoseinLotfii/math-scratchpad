# Color Migration Map: Hardcoded Colors to Design System Tokens

## Overview

This document provides a mapping from hardcoded color values in `src/styles.css` to the new Design System tokens from `src/styles/design-tokens.css`.

**Total Hardcoded Colors Found**: 94 occurrences
**Unique Colors**: 60+

---

## Migration Strategy

### Phase 1: Direct Token Replacement
Replace hardcoded colors with the most appropriate Design System semantic tokens.

### Phase 2: RGB Variable Replacement
Replace rgba() hardcoded colors with RGB variables for consistency.

### Phase 3: Gradient Color Analysis
Analyze and potentially standardize gradient colors.

---

## Color Frequency Analysis

Based on grep analysis of `src/styles.css`:

| Color | Count | Category | Recommended Token |
|-------|-------|----------|-------------------|
| `#343c37` | 11 | Background | `--color-surface` |
| `#97c8a9` | 6 | Primary | `--color-primary` (adjusted) |
| `#75a98a` | 4 | Primary | `--color-primary` (adjusted) |
| `#527861` | 3 | Success | `--color-success` (adjusted) |
| `#2563eb` | 3 | Accent | `--color-primary` (different hue) |
| `#0008` | 3 | Shadow | Use CSS rgba() |
| `#ffffff` | 2 | Text | `--color-text-primary` (on dark) |
| `#707a75` | 2 | Border | `--color-border` |
| `#0005` | 2 | Shadow | Use CSS rgba() |
| `#0009` | 2 | Shadow | Use CSS rgba() |

---

## Detailed Color Mapping

### Background Colors

| Current Hardcoded | MS Token | Design System Token | Notes |
|-------------------|----------|----------------------|-------|
| `#121a18` | `--ms-bg` | `--color-background` | MS background |
| `#151719` | `--background` | `--color-background` | Legacy background |
| `#1b2420` | - | `--color-surface-sunken` | Problem bg |
| `#1b2721` | - | `--color-surface-sunken` | Template preview bg |
| `#1b3329` | - | `--color-background` | Scratchpad radial bg |
| `#19271e` | - | `--color-surface-sunken` | Alternate bg |
| `#192b20` | - | `--color-surface-sunken` | Alternate bg |
| `#202326` | `--ms-surface` / `--card` | `--color-surface` | MS surface |
| `#202624` | `--ms-surface` | `--color-surface` | MS surface |
| `#213c2e` | - | `--color-highlight` | Structure selection bg |
| `#222925` | - | `--color-surface-sunken` | Step bg start |
| `#223f31` | - | `--color-highlight` | Alternate bg |
| `#252721` | - | `--color-surface-sunken` | Template preview bg |
| `#252b28` | - | `--color-surface-sunken` | Textarea/select bg |
| `#252d29` | - | `--color-surface-sunken` | Symbol item bg |
| `#254b37` | - | `--color-highlight` | Alternate bg |
| `#254c3d` | `--ms-highlight` | `--color-highlight` | MS highlight |
| `#263b2d` | - | `--color-highlight` | Template preview bg |
| `#284f3b` | `--ms-highlight` | `--color-highlight` | Highlight color |
| `#2b302f` | `--ms-key` | `--color-surface-elevated` | MS key color |
| `#2e4035` | - | `--color-highlight` | Alternate bg |
| `#292d30` | `--raised` / `--secondary` | `--color-surface-elevated` | Raised/surface |
| `#303634` | - | `--color-surface-elevated` | Button gradient start |
| `#332727` | - | `--color-surface` | Alternate bg |
| `#333a36` | - | `--color-surface` | Math token active bg |
| `#342c1d` | - | `--color-surface` | Alternate bg |
| `#343c37` | - | `--color-surface` | **Most frequent (11x)** |
| `#352f24` | - | `--color-surface` | Alternate bg |
| `#3b2929` | - | `--color-surface` | Alternate bg |

### Text Colors

| Current | MS Token | Design System Token | Notes |
|---------|----------|----------------------|-------|
| `#0005` | - | Use rgba() | Shadow color |
| `#0008` | - | Use rgba() | Shadow color |
| `#0009` | - | Use rgba() | Shadow color |
| `#b2b9b5` | `--muted-foreground` | `--color-text-muted` | MS muted fg |
| `#b4cce0` | - | `--color-text-secondary` | Alternate text |
| `#b8c5bf` | `--ms-muted` | `--color-text-muted` | MS muted |
| `#c0ecd0` | - | `--color-text-secondary` | Alternate text |
| `#d0f5e2` | `--ms-primary` | `--color-primary` | MS primary (light) |
| `#e0a43a` | - | `--color-warning` | Warning accent |
| `#e4b66b` | `--warning` | `--color-warning` | Warning color |
| `#e7ebe8` | `--foreground` | `--color-text-primary` | Legacy foreground |
| `#e8f4eb` | - | `--color-text-secondary` | Alternate text |
| `#e8fff1` | - | `--color-text-primary` | Math token active text |
| `#f0b8b8` | - | `--color-error` (light) | Error light |
| `#f0ca81` | - | `--color-warning` (light) | Warning light |
| `#f2f6f3` | `--ms-fg` | `--color-text-primary` | MS foreground |
| `#f4c16f` | `--ms-warning` | `--color-warning` | MS warning |
| `#f4cd70` | - | `--color-warning` | Symbol pressed color |
| `#ffffff` | `--ms-on-danger` | `--color-text-primary` | White text |

### Primary/Accent Colors

| Current | MS Token | Design System Token | Notes |
|---------|----------|----------------------|-------|
| `#0005` | - | Use rgba() | Shadow |
| `#101a14` | `--primary-foreground` | `--color-primary-foreground` | Primary fg |
| `#163d2e` | `--ms-on-primary` | `--color-primary-foreground` | MS on-primary |
| `#203c2f` | - | `--color-highlight` | Step state bg |
| `#2563eb` | - | `--color-primary` (blue variant) | Blue accent |
| `#3d6652` | - | `--color-highlight` | Operator key border |
| `#402e17` | - | `--color-highlight-foreground` | Step state warning bg |
| `#426b4e` | - | `--color-highlight` | Alternate green |
| `#4c7656` | - | `--color-highlight` | Alternate green |
| `#52745f` | - | `--color-highlight` | Selection bg |
| `#527861` | - | `--color-success` | Border color |
| `#54748d` | - | `--color-primary` (blue variant) | Alternate primary |
| `#567b65` | - | `--color-success` | Border color |
| `#679479` | - | `--color-success` | Alternate green |
| `#6f5b34` | - | `--color-warning` | Alternate warning |
| `#707a75` | `--border` | `--color-border` | Border color |
| `#719b85` | - | `--color-primary` (medium) | Current step border |
| `#739f85` | - | `--color-success` | Structure selection border |
| `#75a98a` | - | `--color-primary` | Alternate primary |
| `#7fab96` | - | `--color-primary` (medium) | Button pressed border |
| `#86b99b` | `--primary` | `--color-primary` | Legacy primary |
| `#8c6936` | - | `--color-warning` | Step state warning border |
| `#8cbfff` | `--ring` | `--color-ring` | Ring color |
| `#8eb79d` | - | `--color-primary` | Alternate primary |
| `#8fa89a` | `--success` | `--color-success` | Legacy success |
| `#922018` | - | `--color-error` | Error color |
| `#97c8a9` | - | `--color-primary` | **Frequent (6x)** |
| `#a1c5ae` | - | `--color-primary` (light) | Alternate primary |
| `#a82924` | `--ms-danger` | `--color-error` | MS danger |
| `#a9e6bc` | - | `--color-primary` (light) | Alternate primary |
| `#b42318` | `--ms-danger` | `--color-error` | MS danger |

---

## RGB Variables for rgba() Colors

Many colors use rgba() with hardcoded RGB values. Replace with RGB variables:

```css
/* Before */
background: rgba(12, 15, 13, 0.86);
box-shadow: 0 8px 24px #0005;

/* After */
background: rgba(var(--color-background-rgb), 0.86);
box-shadow: 0 8px 24px rgba(var(--color-neutral-1000-rgb), 0.2); /* #0005 ≈ rgba(0,0,0,0.02) */
```

### Common rgba() Patterns in styles.css:
- `#0005` → `rgba(0, 0, 0, 0.02)` → Use `rgba(var(--color-neutral-1000-rgb), 0.02)`
- `#0008` → `rgba(0, 0, 0, 0.03)` → Use `rgba(var(--color-neutral-1000-rgb), 0.03)`
- `#0009` → `rgba(0, 0, 0, 0.04)` → Use `rgba(var(--color-neutral-1000-rgb), 0.04)`
- `#52745f66` → `rgba(82, 116, 95, 0.4)` → Need to find closest token

---

## Implementation Plan

### Step 1: Background Colors (High Priority)
Replace all background colors with semantic surface tokens:
- `--color-background` (main background)
- `--color-surface` (cards, containers)
- `--color-surface-elevated` (raised elements)
- `--color-surface-sunken` (inset elements)
- `--color-highlight` (highlighted areas)

### Step 2: Text Colors (High Priority)
Replace all text colors with semantic text tokens:
- `--color-text-primary` (main text)
- `--color-text-secondary` (secondary text)
- `--color-text-muted` (muted/disabled text)

### Step 3: Border Colors (High Priority)
Replace all border colors with:
- `--color-border` (default borders)
- `--color-border-strong` (stronger borders)
- `--color-border-subtle` (subtle borders)

### Step 4: Primary Colors (High Priority)
Replace all primary/accent colors with:
- `--color-primary` (main primary)
- `--color-primary-hover` (hover state)
- `--color-primary-active` (active state)
- `--color-primary-foreground` (text on primary)

### Step 5: Status Colors (Medium Priority)
Replace success/warning/error colors with:
- `--color-success`, `--color-success-hover`, `--color-success-foreground`
- `--color-warning`, `--color-warning-hover`, `--color-warning-foreground`
- `--color-error`, `--color-error-hover`, `--color-error-foreground`

### Step 6: Gradients (Low Priority)
Analyze gradient colors and standardize where possible.

---

## Migration Examples

### Example 1: Simple Color Replacement
```css
/* Before */
background: #343c37;

/* After */
background: var(--color-surface);
```

### Example 2: Text Color Replacement
```css
/* Before */
color: #e7ebe8;

/* After */
color: var(--color-text-primary);
```

### Example 3: Border Color Replacement
```css
/* Before */
border: 1px solid #707a75;

/* After */
border: 1px solid var(--color-border);
```

### Example 4: rgba() Color Replacement
```css
/* Before */
background: rgba(82, 116, 95, 0.4);

/* After */
background: rgba(var(--color-success-500-rgb), 0.4);
```

### Example 5: Gradient with Hardcoded Colors
```css
/* Before */
background: linear-gradient(135deg, #222925, #1d2220);

/* After */
background: linear-gradient(135deg, var(--color-surface-sunken), var(--color-surface-sunken));
/* Or use a single color if gradient is subtle */
background: var(--color-surface-sunken);
```

---

## Notes

### Color Temperature Considerations
The current hardcoded colors use a **green/gray** forest theme, while the Design System uses a **greener/brighter** forest theme. This means:
- Some colors may not have exact matches
- Visual appearance may change slightly
- Consider whether to preserve exact colors or use Design System tokens

### Recommendation
Use Design System tokens for consistency, even if colors don't match exactly. The Design System was carefully crafted for accessibility and visual harmony.

### Fallback Strategy
If a color doesn't have a good match in the Design System, consider:
1. Adding a new token to the Design System
2. Using the closest semantic token
3. Creating a custom token for that specific use case

---

## Related Files

- `src/styles.css` - Main file to migrate (94 hardcoded colors)
- `src/styles/design-tokens.css` - Design System tokens (target)
- `src/styles/tokens.css` - Legacy tokens (already mapped to Design System)

---

## Generated
This mapping was created to facilitate Phase C-2: Hardcoded Color Migration.
Based on analysis of `src/styles.css` and the Design System in `src/styles/design-tokens.css`.
