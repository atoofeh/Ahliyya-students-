# Study-focused UI — Design

**Date:** 2026-08-27
**Status:** Approved (design), pending spec review
**Builds on:** `security-sweep-v1`. Register: product UI (design serves the task).
**Scope:** Sub-project 6 of the hardening mission (Phases 29–40, 56, 64–67). Evolve the existing navy/gold identity — keep tokens, fonts and `ui.jsx` — and change hierarchy, resilience, accessibility and performance.

Out of scope: new type/colour system; the teacher tabs' internal editors (QuizzesTab, QuestionBankTab, CurriculumTab, VideosTab, StudentsTab, AssignmentsTab) get the shared header/skeleton/empty/error treatment but are not redesigned; the student catalog keeps its card grid; Android is stage 7.

---

## 1. Findings (read from the current client)

| # | Finding | Where |
|---|---|---|
| U1 | Every home leads with a stat-tile row (5 student, 6 teacher) — the hero-metric template. The student home answers "how am I doing" before "what next". | StudentDashboard, TeacherDashboard |
| U2 | Gradient `PageHeader` band on every page (dashboard chrome, not a study surface). | ui.jsx `PageHeader`, all pages |
| U3 | Player puts Quizzes/Assignments/Announcements/Q&A tabs **above** the lesson; curriculum is a right card that falls below content on phones with no jump; lesson states are only done/not-done. | CoursePlayer |
| U4 | Loading is a centred spinner everywhere; no skeletons. | every page |
| U5 | Errors are toasts of raw server text; no offline handling. | axios + pages |
| U6 | `Modal` has no focus trap, no Escape, no focus restore; quiz options are `<button>`s without radio/checkbox semantics; icon-only buttons unlabeled. | ui.jsx, QuizRunner |
| U7 | No route code-splitting: one bundle for all three role trees + the quiz runner + recharts. | App.jsx |
| U8 | 12 pre-existing client lint errors (react-hooks v7). | ThemeContext, ToastContext, AuthContext (export shape), VideoPlayer, useAntiCheat |
| U9 | Teacher Q&A notifications deep-link `/teacher/courses/:id/qa` → no such tab (empty panel). | notifications → CourseManager |

## 2. Decisions

| # | Decision | Chosen | Rejected |
|---|---|---|---|
| 1 | Visual scope | Evolve the existing identity; change hierarchy and habits, keep tokens/fonts/kit | Full re-skin (contradicts "keep institution identity"); bugs-only (misses Phases 30–36) |
| 2 | Where the gradient band survives | Only where it is the thesis: the student home "Continue learning" hero. Every other page gets a quiet typographic `PageIntro`. | Keep the band on every page |
| 3 | Player layout | Content-first: sticky lesson bar, content column, right-rail curriculum on ≥1024px → bottom sheet on phones, fixed bottom action bar on mobile. Course sections (quizzes/assignments/announcements/Q&A) move **below** the lesson. | Keep tabs above the lesson |
| 4 | Lint fixes | Move hooks out of provider files into `hooks/*.js`; fix effects properly | `eslint-disable` the rule |
| 5 | Offline model | Detect connectivity; global banner; quiz keeps unsent answers in `sessionStorage` per attempt and retries autosave on reconnect; server deadline stays authoritative | Full offline course access (out of scope) |

## 3. Design-system additions (`ui.jsx` + new files)

- **`PageIntro`** — plain header: `h1` (font-display, `text-surface-900 dark:text-white`), optional subtitle, right-aligned actions slot. No gradient. Replaces `PageHeader` on every page **except** the student-home hero. `PageHeader` stays in the kit for that one use.
- **Skeletons** — `SkeletonCard`, `SkeletonRows`, `SkeletonStat` built on the existing `Skeleton`. Each list/table/dashboard shows a shaped skeleton while loading, never a centred spinner. `Spinner` stays for buttons and inline.
- **`ErrorState`** — `{ code, message, onRetry }` → icon + plain-language title + one action. Copy map (mission Phase 64): `SESSION_TERMINATED`/`SESSION_INACTIVE` → "Your session has ended" + Sign in; `DEVICE_NOT_AUTHORIZED` → the device sentence; `NOT_ENROLLED` → "You are not enrolled in this course"; `QUIZ_LOCKED`/`QUIZ_CLOSED`/`QUIZ_NOT_OPEN` → quiz availability copy; `ATTEMPTS_EXHAUSTED` → "No attempts left"; `RATE_LIMITED` → "Too many requests — try again shortly"; `SCANNER_UNAVAILABLE` → "Upload scanning is temporarily unavailable"; `NETWORK` → "You appear to be offline" + Retry; default → the server message or "Something went wrong" + Retry.
- **`Modal` upgrade** — `role="dialog"`, `aria-modal`, `aria-label` from title; focus trap (Tab cycles within), Escape closes, focus restored to the opener on close; backdrop click still closes. Uses the native `<dialog>`? No — keep the portal-free fixed overlay but add the a11y behaviour with a `useFocusTrap` hook.
- **`useNetworkStatus()`** (`hooks/useNetworkStatus.js`) — `online` boolean from `navigator.onLine` + `online`/`offline` events. A global `<OfflineBanner>` in `MainLayout` (and the quiz runner) shows a slim bar when offline.
- **`RadioGroup` / `CheckboxGroup`** (in QuizRunner or a small `components/Choice.jsx`) — real `role="radiogroup"`/`role="group"` with roving `tabIndex`, arrow-key navigation, `aria-checked`, keeping the existing option styling.
- **Motion**: add `@media (prefers-reduced-motion: reduce)` in `index.css` that reduces the kit animations (`fade-in`, `slide-up`, `scale-in`, `shimmer`, `float-slow`, `pulse-slow`) to `none`/instant. The gold-gradient text stays (brand identity, hook-approved).

## 4. Screens

### 4.1 Student home (`StudentDashboard`) — task-first
Order: (1) a one-line greeting as plain text; (2) the **Continue learning** hero (keeps the gradient `CourseCover`, the single most characteristic moment) — if nothing in progress, an onboarding card ("Redeem a code / Browse the catalog"); (3) **Up next** — quizzes and assignments due, sorted by date, each a row with due date and a jump action (from `/analytics/student` recentAttempts + course data already loaded, plus assignments due; if the endpoint lacks due items, derive from enrollments' courses — keep to what the API returns and label honestly); (4) **My courses** — the existing course cards with `RingProgress`; (5) **Recent results** — compact list. Stat tiles are removed from this page (the numbers live in Grades/Certificates, which the nav already exposes). A single slim "streak/summary" line under the greeting is allowed (enrolled · completed · avg) as text, not tiles.

### 4.2 Teacher home (`TeacherDashboard`) — what needs me
Order: (1) `PageIntro`; (2) a **Needs attention** strip — three compact stat chips only where the count > 0: To grade (`pendingGrading`), Cheat events 7d, and (new) Unanswered questions — each links to the relevant place; if all zero, a calm "You're all caught up" line; (3) **Course performance** — the existing course cards (kept; they are genuinely 2D data). The six-tile row is replaced by the attention strip.

### 4.3 Learning player (`CoursePlayer`) — content-first
- **Sticky lesson bar** (top of content): breadcrumb `Course › Section › Lesson`, a thin progress bar, Prev/Next lesson buttons (desktop). 
- **Content column**: the lesson body (video/pdf/text/quiz/assignment) exactly as today, minus the surrounding tab strip.
- **Course sections below the lesson**: Quizzes, Assignments, Announcements, Q&A become stacked sections (or a secondary tab group placed *below* the lesson), not a strip above it.
- **Curriculum**: right rail on ≥1024px (as today) with lesson **state icons** — complete (check, emerald), current (filled dot, brand), available (hollow circle), locked (lock; a lesson is "locked" only if `isPublished === false` for staff-preview — students never receive unpublished lessons, so for students all delivered lessons are available/complete/current), overdue (amber clock when a lesson's assignment/quiz `dueAt`/`availableUntil` has passed and it isn't complete). On < 1024px the curriculum is a **bottom sheet** opened from the lesson bar ("Course content ▸"), and a **fixed bottom action bar** shows Prev · Bookmark · Ask · Next.
- Keep all existing data loads and handlers; this is a layout/hierarchy change, not a data change.

### 4.4 Quiz runner (`QuizRunner`) — resilience + a11y
- Options become `RadioGroup`/`CheckboxGroup` (§3). Short-answer/essay/blanks inputs get proper `<label>`s (visually the same).
- **Autosave status** in the top bar: "Saved · Ns ago" / "Saving…" / "Offline — answers kept on this device". Answers are mirrored to `sessionStorage` under `lms_attempt_<id>` on every change; on mount, if a saved blob exists for this attempt id, it seeds `answers` (covers a refresh). On reconnect, autosave fires immediately. `clientSavedAt` (stage 2) already protects against stale overwrites.
- The submit confirm modal is the upgraded accessible `Modal`.

### 4.5 CourseManager — Q&A tab (fix U9)
Add a `qa` tab to `CourseManager` that renders the existing InsightsTab Q&A sub-view (extract it to `tabs/QaTab.jsx` reused by both), so `/teacher/courses/:id/qa` resolves. Notification link already points there.

## 5. Resilience, a11y, performance

- **Offline** (§3): banner + quiz `sessionStorage` mirror + reconnect retry.
- **Errors**: pages that currently `.catch(() => {})` into a blank spinner instead set an error state and render `<ErrorState>` with retry; `apiError` codes flow through the copy map.
- **a11y**: `Modal` trap/Escape/restore; quiz choice semantics; every icon-only `<button>` gets `aria-label` (sidebar toggle, theme, notifications, favourite, close, bookmark, revoke, etc.); `prefers-reduced-motion` block; visible focus is already in the kit (`focus-visible:ring`), verified retained.
- **Performance**: `App.jsx` wraps the student/teacher/admin page trees and the quiz runner in `React.lazy` + `<Suspense fallback={<AppSkeleton/>}>`; recharts-heavy admin/insights pages land in their own chunks. Target: initial student bundle no longer ships recharts or the admin tree. Verify with the Vite build chunk output.

## 6. Lint (U8) — fix, don't disable
- `context/AuthContext.jsx`, `ThemeContext.jsx`, `ToastContext.jsx`: move the exported hook (`useAuth`/`useTheme`/`useToast`) into `hooks/useAuth.js` etc., re-export from there; the context files export only the provider component (satisfies `react-refresh/only-export-components`). Update the 31 importers to `../hooks/useAuth` (codemod with sed).
- `components/VideoPlayer.jsx`: the `setSrc(null); setError(null)` at the top of the token effect → move into the async body after the `cancelled` guard, or use a lazy initial state; keep behaviour identical.
- `hooks/useAntiCheat.js`: `useRef(Date.now())` → `useRef(0)` seeded in the effect; resolve the `flush` before-declaration by declaring `flush` before `report` (reorder the `useCallback`s) instead of the disable comment.

## 7. Tests / verification
The suite is server-side; the client has no test runner (out of scope to add one this stage). Verification is: `cd client && npm run lint` reports **0 problems** (down from 13), `npm run build` succeeds and the chunk output shows the split, and a manual pass at 360 / 390 / 412 / 768 / desktop widths in both themes for: student home, course player (incl. bottom sheet + action bar), quiz runner, teacher home, one admin page. Server `npm test` stays green (no server changes except none). Screenshots via the run/browser tooling where available; otherwise a written walkthrough.

Definition of done: client lint 0 problems, build succeeds with route-level chunks, player is content-first and usable at 360px, quiz options are keyboard-operable radio/checkbox groups, Modal traps focus and closes on Escape, offline banner + quiz sessionStorage mirror work, Q&A tab resolves, docs note the new `PageIntro`/`ErrorState`/`useNetworkStatus` primitives and the hooks relocation.
