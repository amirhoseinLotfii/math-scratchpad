# Product Inventory - Math Scratchpad

## Overview

This document provides a comprehensive inventory of all pages, sections, features, and components in the Math Scratchpad application as required by Phase B of the MASTER PROMPT.

---

## 1. Navigation Structure

### Main Application Routes
| Route | Component | Description | Status |
|-------|-----------|-------------|--------|
| `/` | `App.tsx` | Main application container | ✅ Active |
| `/lessons/:id` | `LessonScreen` | Lesson display and interaction | ✅ Active |
| (various) | `LessonPicker` | Lesson selection interface | ✅ Active |

### Navigation Components
- **Sidebar/Navigation**: Lesson navigation, chapter selection
- **Top Navigation**: Settings, sync status, user actions
- **Bottom Navigation**: Mobile navigation bar
- **Breadcrumbs**: Chapter/lesson hierarchy indicators

---

## 2. Page Inventory

### 2.1 Home/Dashboard
- **File**: (To be determined - may be integrated in App.tsx)
- **Purpose**: Entry point, overview of available content
- **Components**: Lesson cards, progress indicators
- **Status**: ⚠️ Needs investigation

### 2.2 Chapter Navigation
- **File**: Part of `App.tsx` and lesson selection components
- **Purpose**: Browse and select chapters
- **Components**: Chapter list, progress indicators
- **Status**: ✅ Active

### 2.3 Lesson Navigation
- **File**: `features/lessons/lesson-picker.tsx`
- **Purpose**: Select specific lessons within chapters
- **Components**: Lesson list, search, filters
- **Status**: ✅ Active

### 2.4 Lesson Content
- **File**: `features/lessons/lesson-screen.tsx`
- **Purpose**: Display lesson content with interactive elements
- **Components**: Lesson text, math fields, examples, exercises
- **Features**: 
  - Rich text display with RTL support
  - Math formula rendering (MathLive)
  - Interactive math input
  - Progress tracking
- **Status**: ✅ Active

### 2.5 Inline Exercises
- **File**: `features/lessons/lesson-math-check.tsx`
- **Purpose**: Interactive math exercises within lessons
- **Components**: Math input fields, validation, feedback
- **Features**:
  - Multi-step math problems
  - Virtual math keyboard
  - Auto-grading
  - Solution checking
- **Status**: ✅ Active (PR #71 improved keyboard placement)

### 2.6 Worked Examples
- **File**: (To be determined)
- **Purpose**: Display step-by-step worked examples
- **Components**: Example display, step navigation
- **Status**: ⚠️ Needs investigation

### 2.7 Practice Workspace
- **File**: (To be determined)
- **Purpose**: Dedicated practice area for math problems
- **Components**: Math editor, scratch space
- **Status**: ⚠️ Needs investigation

---

## 3. Feature Inventory

### 3.1 Math Editor
- **Component**: `MathLiveStepInput`
- **File**: `features/math-editor/components/mathlive-step-input.tsx`
- **Purpose**: Rich math input and editing
- **Features**:
  - LaTeX input support
  - Visual equation editing
  - Symbol insertion
  - Keyboard navigation
- **Status**: ✅ Active
- **Dependencies**: MathLive library

### 3.2 Virtual Math Keyboard
- **Component**: `Keyboard`
- **File**: `src/Keyboard.tsx`
- **Purpose**: Virtual keyboard for math symbol input
- **Features**:
  - Multiple keyboard layouts
  - Symbol categories (numbers, operators, functions, etc.)
  - Context-aware suggestions
  - Mobile-optimized layout
- **Status**: ✅ Active
- **Note**: PR #71 improved keyboard placement relative to active field

### 3.3 Math Insert Dialog
- **Component**: `MathInsertDialog`
- **File**: `features/math-editor/components/math-insert-dialog.tsx`
- **Purpose**: Dialog for inserting math symbols and templates
- **Features**:
  - Symbol categorization
  - Template selection
  - Search functionality
- **Status**: ✅ Active

### 3.4 Progress Tracking
- **Store**: `features/session/persistence/persistent-store.ts`
- **Purpose**: Track user progress through lessons and exercises
- **Features**:
  - Session persistence
  - Exercise completion tracking
  - Progress visualization
- **Status**: ✅ Active

### 3.5 Google Drive Sync
- **Component**: `DriveBankPanel`
- **File**: `features/drive-bank/drive-bank-panel.tsx`
- **Purpose**: Cloud synchronization with Google Drive
- **Features**:
  - Authentication with Google
  - File selection for backup
  - Sync status indication
  - Conflict resolution
- **Status**: ✅ Active

### 3.6 Notion Sync (Planned)
- **Status**: ⚠️ Needs investigation
- **Note**: Mentioned in code but may not be fully implemented

### 3.7 Session Management
- **Components**: Various session-related components
- **Files**: `features/session/*`
- **Features**:
  - Session creation and management
  - Exercise state persistence
  - Confidence levels
  - Completion tracking
- **Status**: ✅ Active

### 3.8 Diagnostic Tests
- **File**: `features/diagnostic.ts`
- **Purpose**: Diagnostic assessment tests
- **Features**:
  - Skill level assessment
  - Adaptive questions
  - Performance grading
- **Status**: ✅ Active

### 3.9 Keyboard Shortcuts
- **Component**: `ShortcutHelp`
- **File**: `features/workspace/components/shortcut-help.tsx`
- **Purpose**: Display available keyboard shortcuts
- **Features**:
  - Shortcut documentation
  - Contextual help
- **Status**: ✅ Active

### 3.10 Reading Position & Continue Where You Left Off
- **Feature**: Added in Phase D (already implemented)
- **Files**: `features/progress/*`
- **Purpose**: Track and restore user's reading position
- **Features**:
  - Position tracking
  - Cross-device sync
  - Semantic scroll restoration
- **Status**: ✅ Active (already implemented)

---

## 4. Component Inventory

### 4.1 UI Components

#### Buttons
- **Button**: `shared/ui/button.tsx`
- **Status**: ✅ Active
- **Variants**: Primary, secondary, danger, ghost, etc.

#### Dialogs/Modals
- **Dialog**: `shared/ui/dialog.tsx`
- **Status**: ✅ Active
- **Features**: Accessible, focus management, backdrop

#### Dropdowns
- **DropdownMenu**: `shared/ui/dropdown-menu.tsx`
- **Status**: ✅ Active
- **Features**: Accessible, keyboard navigation

#### Form Components
- **Input**: (To be determined)
- **Select**: (To be determined)
- **Status**: ⚠️ Needs investigation

### 4.2 Layout Components

#### Workspace Layout
- **Component**: `shared/hooks/use-workspace-layout.ts`
- **Purpose**: Responsive workspace layout management
- **Features**:
  - Layout detection (phone, tablet, desktop)
  - Responsive behavior
- **Status**: ✅ Active

#### Question Navigator
- **Component**: `QuestionNavigator`
- **File**: `features/workspace/components/question-navigator.tsx`
- **Purpose**: Navigate between questions/exercises
- **Status**: ✅ Active

#### Math Tools
- **Component**: `MathTools`
- **File**: `features/workspace/components/math-tools.tsx`
- **Purpose**: Math tool palette and controls
- **Status**: ✅ Active

### 4.3 Sync Components

#### Drive Bank Panel
- **Component**: `DriveBankPanel`
- **File**: `features/drive-bank/drive-bank-panel.tsx`
- **Status**: ✅ Active

#### Session Panel
- **Component**: `SessionScales`
- **File**: `features/session/components/session-panel.tsx`
- **Status**: ✅ Active

#### Activity Tracker
- **Component**: `ActivityTracker`
- **File**: `sync/activity-tracker.ts`
- **Status**: ✅ Active

---

## 5. Sync System Inventory

### 5.1 Event System
- **File**: `sync/events.ts`
- **Purpose**: Event tracking and emission
- **Features**:
  - Learn event creation
  - Context tracking
  - Event persistence
- **Status**: ✅ Active

### 5.2 Runtime
- **File**: `sync/runtime.ts`
- **Purpose**: Sync runtime management
- **Features**:
  - Browser sync runtime
  - Online/offline detection
  - Sync queue management
- **Status**: ✅ Active

### 5.3 Browser DB
- **File**: `sync/browser-db.ts`
- **Purpose**: IndexedDB storage for sync data
- **Features**:
  - Learning data storage
  - Migration management
  - Legacy data handling
- **Status**: ✅ Active

### 5.4 Legacy Migration
- **File**: `sync/legacy-migration.ts`
- **Purpose**: Migration of legacy data to new format
- **Features**:
  - Data chunking
  - SHA-256 verification
  - Drive backup
  - Conflict resolution
- **Status**: ✅ Active (fixed crypto issues)

---

## 6. Math Editor System

### 6.1 MathLive Adapter
- **File**: `features/math-editor/mathlive-adapter.ts`
- **Purpose**: Adapter for MathLive library
- **Features**:
  - Math field management
  - Symbol insertion
  - Command execution
  - Focus management
- **Status**: ✅ Active

### 6.2 Math Insert Dialog
- **File**: `features/math-editor/components/math-insert-dialog.tsx`
- **Status**: ✅ Active

---

## 7. Lesson System

### 7.1 Lesson Content
- **File**: `features/lessons/lesson-content.tsx`
- **Features**:
  - Content rendering
  - RTL/LTR support
  - Language detection
- **Status**: ✅ Active

### 7.2 Lesson Parser
- **File**: `features/lessons/lessons-parser.ts`
- **Purpose**: Parse lesson content from markdown/files
- **Status**: ✅ Active

### 7.3 Lesson Sections
- **File**: `features/lessons/lesson-sections.ts`
- **Purpose**: Build lesson structure and sections
- **Status**: ✅ Active

### 7.4 Lesson Progress
- **File**: `features/lessons/lesson-progress-store.ts`
- **Purpose**: Track progress through lessons
- **Status**: ✅ Active

---

## 8. UI/UX Components

### 8.1 Keyboard
- **File**: `src/Keyboard.tsx`
- **Status**: ✅ Active

### 8.2 Tooltips
- **Status**: ⚠️ Needs investigation

### 8.3 Toasts
- **Status**: ⚠️ Needs investigation

### 8.4 Loading Indicators
- **Status**: ⚠️ Needs investigation

### 8.5 Error States
- **Status**: ⚠️ Needs investigation

---

## 9. Accessibility Features

### 9.1 Focus Management
- **Status**: ✅ Partially implemented
- **Note**: Some focus restoration issues may exist

### 9.2 Keyboard Navigation
- **Status**: ✅ Partially implemented
- **Note**: Needs comprehensive audit

### 9.3 Screen Reader Support
- **Status**: ⚠️ Needs investigation
- **Note**: ARIA labels present but may need review

### 9.4 RTL Support
- **Status**: ✅ Implemented
- **Note**: Persian content support

### 9.5 Color Contrast
- **Status**: ⚠️ Needs investigation
- **Note**: Dark theme colors need WCAG 2.2 AA verification

---

## 10. Responsive Behavior

### 10.1 Breakpoints
- **Small Mobile**: 320px, 360px
- **Mobile**: 390px, 430px
- **Tablet**: 768px, 820px
- **Laptop**: 1024px, 1440px
- **Desktop**: 1920px, 2560px

### 10.2 Layout Modes
- **Phone**: Single column, stacked
- **Tablet**: Adaptive, split views
- **Desktop**: Multi-pane, independent scroll

### 10.3 Configuration
- **File**: `playwright.config.ts`
- **Status**: ✅ Configured

---

## 11. Testing Infrastructure

### 11.1 Unit Tests
- **Framework**: Vitest
- **Coverage**: All major modules
- **Status**: ✅ 286 tests passing

### 11.2 E2E Tests
- **Framework**: Playwright
- **Configuration**: Multi-device testing
- **Status**: ✅ Configured, some tests exist

### 11.3 Test Files
- **Unit**: `tests/unit/*.test.ts`
- **E2E**: `e2e/*.spec.ts`
- **Support**: `tests/support/*.ts`

---

## 12. Current Issues and Todo Items

### 12.1 High Priority
- [ ] **Migrate `styles.css` hardcoded colors** (95+ occurrences)
- [ ] Verify all components use Design System tokens
- [ ] Complete Product Inventory for all pages
- [ ] Comprehensive UX audit

### 12.2 Medium Priority
- [ ] Add missing token categories (touch targets, safe areas, etc.)
- [ ] Create component usage guidelines
- [ ] Document responsive behavior patterns
- [ ] Accessibility audit

### 12.3 Low Priority
- [ ] Performance optimization
- [ ] Bundle size analysis
- [ ] Code splitting

---

## 13. Next Steps

### 13.1 Phase B Completion
1. ✅ Design System Audit (Complete)
2. ✅ Hardcoded Values Identification (Complete)
3. ⏳ Migrate `styles.css` to Design System tokens (In Progress)
4. ⏳ Complete Product Inventory
5. ⏳ UX Audit

### 13.2 Phase C Preparation
1. Plan structural fixes based on audit findings
2. Prioritize fixes by impact
3. Create implementation roadmap

---

## Notes

- This inventory is based on code analysis and may not be exhaustive
- Some components/features may need manual verification
- Priority items marked with ⚠️ require further investigation
- Items marked with ✅ are confirmed to exist and be active

---

## Generated
This document was created as part of Phase B (Full Product UX/UI Overhaul) of the Math Scratchpad project.
Last updated: During active development session.
