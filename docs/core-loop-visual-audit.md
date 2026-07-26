# P0.5 Phase A — Core Loop, Visual Identity, and Font Audit

Date: 2026-07-24
Baseline: `0e6f7d3382fb213f92f0b3395811772a059904c0`
Local branch: `codex/ollie-core-loop-production`
Prototype route: `/core-loop-v2.html?experience=core-loop-v2`

## Scope and safety boundary

This Phase A artifact is an isolated, `noindex` local prototype. It does not replace `index.html`, `app.html`, `script.js`, `styles.css`, or any Worker route. It uses a deterministic browser fixture and does not call OpenAI, OAuth, billing, Staging, Preview, or Production. Existing SQLite Durable Object, claim, strict Structured Outputs, token budget, revision CAS, input hash, capability cookie, absolute TTL, stable task ID, completion, undo, and storage recovery code remains intact.

## Product contract

The proposed primary loop is:

> 길 만들기 → 오늘 한 걸음 → 올리와 실행 → 짧게 기록 → 함께 성장 → 놓쳐도 다시 시작 → 다음 한 걸음

Optional context can be empty. The first result is a Roadmap, not a dated schedule. Quick actions and typing collect pending changes without AI. A single explicit apply action represents one revision call. Locking the Roadmap and later schedule edits are deterministic and represent zero AI calls.

> **Superseded 2026-07-26.** This section previously read "Only two decisions
> are required before the first result: a natural-language goal and a period."
> The onboarding entry is now a three-step wizard, so that sentence no longer
> describes the product. See "Onboarding entry flow" below.

## Onboarding entry flow

The goal entry is a three-step wizard:

| Step | Screen | What it does |
| --- | --- | --- |
| 1/3 | 목표 이야기하기 | One natural-language textarea (0/1000) plus category examples. |
| 2/3 | 올리가 정리했어요 | Renders `/api/ai/goal-analyze` output — the goal, current situation and available time Ollie understood — plus confirmation questions (target date, weekend availability). |
| 3/3 | 1차 계획 보기 | Roadmap and the first seven days, then "이 계획으로 시작하기". |

Login is still requested only when the user presses "이 계획으로 시작하기",
and a guest's goal and plan survive authentication.

### Step 3 surface (rebuilt 2026-07-26)

Step 3 is the mockup layout and nothing else: the goal card, the numbered
roadmap stepper, the first three days with a "전체 7일 보기" expander, one
feasibility sentence, and a single primary CTA. Everything that merely
*explains* the plan sits behind the collapsed "내 계획 자세히 보기" disclosure.

`#roadmapRevisionSummary` and `#aiPreviewStatus` stay in the main flow because
they are *results*, not controls, and must survive a reload.

Removed at the owner's request: the step-2 quick-context chips (평일 20분 /
수요일 제외 / 첫 달 가볍게). The same edit is still available by typing into
`#currentContext`, which is what those chips wrote to.

### Where a plan gets adjusted

**Onboarding does not offer plan adjustment.** The back button in the step-3
header (`#draftAdjustButton`) returns to step 2 so the user can restate their
conditions in their own words; that is the only edit path before login.
Detailed scheduling changes belong to the app's natural-language adjustment
after login.

The button-based start preference (이대로 시작 / 요일 바꾸기 / 시간 줄이기) was
removed from onboarding on 2026-07-26. Moving weekdays mechanically and
truncating sessions to 15 minutes could not express a real constraint like
"화요일은 야근이라 안 돼". `scheduleStartPreference` remains in the
`/api/ai/goal-draft/claim` contract and `buildActivatedExecutionPlan`; onboarding
now always sends the default `as-is`, so the `change-days` and `shorter`
branches are currently unreachable from this flow.

The one exception is a plan the AI itself judges unworkable
(`feasibility.status` of `constrained` or `infeasible_as_requested`). There the
adjustment options render inline inside the ⭐ card, because choosing one is a
precondition for proceeding — `requiresAdjustmentBeforeClaim` locks the CTA
until then. When the plan is feasible, `#draftFeasibilityOptions` renders empty
and no adjustment UI exists on the screen at all.

### Conditions come from step 2, not from hidden defaults

The wizard has two `data-advanced` sections (materials, weekdays, session
length, frequency, notification time) that it never shows. Their **default
values were still being collected and sent to the AI**: 월·수·금, 25분, 주 3회,
90일. A user who wrote "30일 동안 매일 자기 전 20분 독서하기" got a 월/수/금
plan across 90 days, and the AI correctly reported it as `constrained` —
the plan was not sloppy, our input was wrong.

`/api/ai/goal-analyze` now returns a structured `conditions` object alongside
the prose summary: `{ availableDays, sessionMinutes, weeklyFrequency,
periodDays }`. The model is instructed to leave anything the user did not say
as 0 / empty — "not stated" is part of the contract, not a guess.
`normalizeConditions()` (ai-goal-analysis.mjs) treats the model output as
untrusted: only real weekday labels survive, numbers are clamped to the form's
own limits (5–180분, 주 1–7회, 1–730일), and a missing `conditions` (older
cached responses) degrades to all-empty instead of failing.

`applyAnalysisToConditions()` (script.js) writes these into the hidden inputs
before the preview request. Server conditions win; the regex derivation over
`analysis.goal`/`availableTime` (매일 / 평일 / 주말 / 주 N회 / named weekdays /
N분 / N일) remains only as a per-field fallback. Anything neither source can
fill stays at the form default rather than being guessed.

Two guards in `tests/e2e/onboarding.spec.js` assert the outgoing preview
request body: "2단계에서 정리한 조건이 숨은 기본값 대신 AI 요청에 실린다"
(regex fallback path) and "goal-analyze의 구조화된 conditions가 정규식 도출보다
우선한다" (a goal with no derivable pattern at all, carried purely by the
server's `conditions`). Both were checked by reverting their fix and confirming
they fail.

### Why this is worth recording

This flow has been added, removed and added again. Do not revert it a third
time without checking with the product owner first.

- `04b6138` built the three-step wizard.
- `cc05990` reverted it, on the grounds that the middle confirmation step
  "화면을 복잡하게 만들고 승인된 로그인 흐름에도 없어" — it complicated the
  screen and was absent from the approved login flow. That revert deliberately
  left the `/api/ai/goal-analyze` route on the server.
- 2026-07-26: restored at the product owner's explicit request, working from a
  supplied mockup. The conflict with the older two-step contract was raised
  before the work started and the owner chose to update the contract, which is
  what this section does.

Ollie remains the existing cloud mascot (`assets/ollie-*.png`). The supplied
mockup used a different purple character; the owner chose to keep the shipped
brand asset and take only the layout from the mockup.

## Font investigation

- No font binary exists in any earlier Git object.
- Commit `b814cb8e6d3815eea522784a7a083cccda07aaf0` added a runtime CDN `@font-face` named `Jalnan` and applied it to the entire `body`.
- Commit `1d5f907181319dfeb4d3324b4ce9da54c651ad24` removed that `@font-face` while leaving many `"Jalnan"` family declarations in place.
- The current baseline therefore silently falls through to Pretendard, Apple SD Gothic Neo, Malgun Gothic, or the browser sans-serif. This is asset removal, not a later specificity override.
- The official GC Company font page and license guide identify Jalnan as a freely usable title font. The prototype vendors the official WOFF2 used by that page without modifying the binary.
- Local asset: `assets/fonts/yeogieottae-jalnan2.woff2`
- SHA-256: `e8dd022ed1c566d75b0ddf64e32bb36e93d9744b49a296c0f75242553bd3bfae`
- Metadata cross-check: the official TTF package reports family `여기어때 잘난체 2 TTF`.
- Runtime family alias: `여기어때 잘난체`
- Display weight: the provided real weight only (`400`); no synthetic bold is requested.
- Runtime failure is not quiet: `document.fonts.load` and `document.fonts.check` set `data-font-state=failed` and emit a warning.

Typography tokens:

```css
--font-brand-display: "여기어때 잘난체";
--font-body: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
--font-numeric: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
```

The brand face is limited to representative headings, milestone headings, primary CTAs, short Ollie phrases, completion copy, growth stages, and weekly reflection headings. Long copy, inputs, help, schedule details, Record text, and numeric data use the body or numeric token.

## Seventeen visual regression causes

| # | Regression | File / selector or markup | Introduction or change | Earlier pattern | Phase A restoration |
|---:|---|---|---|---|---|
| 1 | Jalnan disappeared | `styles.css` top-level `@font-face` | Removed by `1d5f907`; family references remained | `b814cb8` loaded a CDN font | Official local WOFF2, preload, explicit token, loading assertion |
| 2 | Font family changed silently | `body`, `.builder-header h3`, many `"Jalnan"` selectors | `b814cb8` made all body text Jalnan; after `1d5f907` the name became an unresolved fallback | Earlier body stacks used Korean sans; title asset was explicitly loaded | Body and display roles are separated; unresolved fallback is a test failure |
| 3 | Possible specificity confusion | Repeated late `styles.css` title rules | Layered rules kept spelling `Jalnan`, masking the missing face | A single loaded family made selector order less visible | Prototype owns one display token; computed-style tests cover title, milestone, CTA, body |
| 4 | Font asset/load failure | No repository font binary; removed external `src` | `1d5f907` deleted the only source | Runtime CDN from `b814cb8` | Local asset, `font/woff2`, preload, 200/CORS/loading checks |
| 5 | Native fieldset rectangle | `index.html` `.builder-choice-section` | Added by `c075493`; the material and planning fieldsets had no complete reset | Earlier first step was a compact input/suggestion view | Semantic period fieldset uses `border:0; padding:0; margin:0; min-inline-size:0` |
| 6 | Legend looks like a bordered section title | `<legend>` inside the same fieldsets | `c075493` expanded form semantics without a shared fieldset/legend primitive | Earlier short labels lived inside soft cards | Quiet legend text; no rectangle or nested card border |
| 7 | Large native radio circles | `input[name=materialMode]` | Added by `c075493`; no matching custom radio rule for `.builder-choice-row` | Category suggestions were button chips | Accessible one-pixel radio remains in DOM; custom period chips render selection |
| 8 | Native checkboxes | `.preference-choice-list input` | Added by `c075493`; labels were styled but checkbox appearance was not removed | Earlier optional choices used buttons/cards | Prototype has no checkbox at this stage; pending changes use buttons and removable text rows |
| 9 | Raw `년-월-일` date UI | `#targetDate`, `#birthDate` | `c075493` added target date; `d45d99e` already carried optional birth date | Goal setup did not require calendar-form completion | First screen asks period chips only; no date input |
| 10 | Select/input mismatch | `#weeklyFrequency`, `#goalPeriod`, `#planIntensity`, `#routineTime` | Expanded by `c075493`; browser select chrome differs despite shared box CSS | Earlier first action relied on one text input and suggestions | No select in the core entry; consistent textarea and custom chips |
| 11 | Bordered cards inside bordered cards | `.draft-understanding-card`, `.draft-feasibility-card`, fieldsets inside `.ollie-goal-card` | `c075493` added many bordered subcontainers to the `bed3d249` shell | Earlier Ollie art and copy sat in open pastel space | One soft surface per decision cluster; Roadmap cards have a single thin boundary |
| 12 | Heavy 01/02/03 rail | `.diagnosis-stepper` | `bed3d249` added a 72px vertical gradient rail and 92px steps | Earlier flow used content-led sections rather than a permanent numbered rail | No wizard rail; the journey line belongs to the Roadmap itself |
| 13 | 2/3 and 3/3 pressure | `#diagnosisStepCount`, `.builder-progress`, `3/3 · 계획 초안` | Count/progress added in `a1dc4106`; third-step copy expanded by `c075493` | Earlier entry let the user start with one intent | Two explicit required decisions and no progress meter |
| 14 | Uppercase process copy | `3 Steps · About 30 Seconds`, `FIRST 7 DAYS`, builder kickers | First line is from `d45d99e`; result label remained in current markup | Earlier Korean brand copy and Ollie speech carried the tone | Short Korean kickers; internal item types are localized in user-facing UI |
| 15 | Ollie disappears from core decisions | `.goal-builder-shell` concentrates later steps in the form; the mascot becomes a compact helper | Shell began in `bed3d249`; `c075493` greatly lengthened the form | Earlier hero and On My Way surfaces used prominent emotion-specific Ollie assets | Ollie appears in goal, Roadmap, adjustment, lock, Today, focus, reflection, growth, recovery, Plan, and Record |
| 16 | White/gray rectangles dominate | `.goal-builder-shell`, `.ollie-goal-card`, input grids, draft cards | `bed3d249` established the SaaS shell; `c075493` multiplied fields and cards | Earlier palette used open sky/lilac/pink gradients and floating art | Restored pastel gradient, translucent soft cards, organic radii, light borders, and soft shadows |
| 17 | Mobile form becomes very long | Step 2 contains material, seven weekdays, frequency, period, date, intensity, buffers, exclusions, notifications; step 3 adds preferences and personality | Primarily `c075493` | Earlier onboarding progressively disclosed less information | Goal screen contains goal, four period chips, one optional context, one CTA; detail moves into natural-language Roadmap revision |

## Clickable state map

1. Goal and period
2. AI Roadmap fixture
3. Pending natural-language changes
4. Before/after revision result
5. Roadmap lock and default schedule suggestion
6. First seven days
7. Today first ACTION
8. Ollie focus execution
9. Optional mood and one-line reflection
10. Automatic Diary record
11. Ollie growth
12. Missed-day recovery

The Plan and Record tabs, `TaskEditSheet`, and `PlanAdjustSheet` are also interactive. User-controlled strings are inserted with `textContent`; no AI text is injected as HTML.

## AI call map represented by the fixture

| Action | Generation delta | Revision delta |
|---|---:|---:|
| Submit goal + period | 1 | 0 |
| Type context or pending change | 0 | 0 |
| Click a quick action | 0 | 0 |
| Add/remove a pending change | 0 | 0 |
| Apply pending changes | 0 | 1 |
| Failed apply | 0 | 1; active Roadmap preserved |
| Lock Roadmap | 0 | 0 |
| Change days or reduce duration | 0 | 0 |
| Claim, OAuth, provider calls | Not implemented or invoked in Phase A |

## Persistence and typed-item behavior

- Stable first task ID: `prototype-action-001`.
- Typed fixture contains ACTION, REVIEW, TIP, and SYSTEM_RULE.
- SYSTEM_RULE is excluded from the user schedule list.
- Only ACTION exposes the start/completion path.
- Task edits update Today, Focus, and Plan using the same stable ID.
- Completing the ACTION writes a Diary entry before mood or note input.
- Completion and growth count are idempotent and survive refresh through the prototype-specific localStorage key.
- Recovery records a positive restart or rest choice without streak failure, punishment, or forced reset.

## Visual and accessibility verification

- The only native radio inputs are visually hidden but remain keyboard-focusable through their associated chip labels.
- There are no checkboxes, date inputs, or selects in the prototype route.
- Fieldset border is computed as `0px`.
- Dialogs are native modal dialogs with labels; closing or saving returns focus to the opener.
- Every pre-lock core state has exactly one visible primary CTA.
- Reduced-motion preferences disable decorative animation.
- Desktop Chromium, mobile Chromium, and iPhone WebKit pass font, focus, persistence, AI-call-map, and overflow tests.
- Browser console warning/error count for representative 320, 390, 430, and 1440 widths is zero.

## Phase B boundary

Phase B would map the approved route to existing strict blueprint fields, guest draft/revision endpoints, claim recovery, authenticated persistence, and real Today/Plan state. It would also replace the current default onboarding presentation and selectively apply the font tokens across production pages. No backend removal, binding, migration, OAuth, billing, route, or Production change is implied by this prototype. No migration is required for Phase A.

## Phase A.1 typography and visual polish

- `--font-brand-display` and `--font-brand-ui` both resolve to the same local `여기어때 잘난체` face, while body and numeric roles remain on the neutral Pretendard/system stack.
- Display use covers H1/H2, Roadmap milestones, completion, growth, and recovery. Short UI use covers primary/secondary/text actions, bottom navigation, period and quick-action chips, mood/recovery choices, short form labels, status badges, Ollie speech, and compact summary titles.
- Paragraphs, user input, schedule details, Diary body copy, dates, times, and focus duration numbers remain body or numeric text. Brand roles use the actual 400 face with `font-synthesis: none`; no synthetic 800/900 weight is requested.
- Mobile goal entry was compacted without removing a field so the goal, period, optional context, and primary CTA fit in the 390×844 first viewport. Roadmap and Today H1s render in at most two lines at 320, 390, and 430px.
- The Roadmap understanding summary is one open grouped surface rather than three nested cards. The journey line has stronger visual continuity and varied milestone shapes. On mobile the single Roadmap primary action is kept reachable in the first viewport without adding a second CTA.
- Desktop 1440 screenshots: goal, Roadmap, changes, Today, reflection, growth, recovery. Mobile 390 screenshots: goal, Roadmap, Today, reflection, growth. Mobile 430 screenshots: Roadmap, Plan, Record. iPhone WebKit screenshots: goal, Roadmap, Today. All 18 files are stored outside the repository in the Phase A.1 visualization folder.
- Computed-style tests prove brand use for goal/Roadmap titles, milestone title, primary and secondary actions, bottom navigation, quick chips, and Ollie speech. They separately prove neutral font use for Record body, Record date, and focus duration.
- Final regression results: unit 211/211, JavaScript syntax 54/54, desktop Chromium 19/19, mobile Chromium 19/19, and iPhone WebKit 19/19. WebKit was split into bounded groups after concurrent WebKit workers exhausted local runner resources; no test timeout, retry, skip, or ignore setting was changed.
- Default product routes, API integration, OpenAI, OAuth, claim, payment, Worker, binding, migration, and deployment remain untouched.
