# Project plan: workflow UI polish + crew recommendation engine

## Workstream A — Workflow UI (spacing, weight, estimate layout)

See prior agreement: persistent **three-column Estimate** on `xl+` (rooms | workspace | line detail), extract line editor from overlay, `RoomManager` search + solid selected state, shared table/stat typography in [`src/index.css`](../../src/index.css), Overview stat strip, etc.

---

## Workstream B — Crew recommendation engine (this iteration)

### Problem (confirmed in code)

[`calculateEstimateSummary`](../../src/server/services/estimateEngineV1.ts) computes:

- `productiveCrewHoursPerDay = 8 × max(1, jobConditions.installerCount)`
- `durationDays = ceil(totalLaborHours / productiveCrewHoursPerDay)`

So **default 1 installer** yields the longest plausible calendar unless the user raises crew. Labor **dollars** are driven by hours × rate × condition multipliers, not by headcount — but **duration** is naively tied to the single `installerCount` field. That matches the failure mode you described (e.g. ~1 month on site for a large distributed job).

### Design principles (non-negotiable)

1. **Pricing vs schedule**: Keep **labor $ math unchanged** unless product explicitly decides otherwise. Crew recommendation primarily affects **explained schedule** (days at min / recommended crew), warnings, and copy — not loaded labor totals.
2. **Three outputs** (plus explanations):
   - **Minimum crew** — floor from item/site rules (e.g. two-person-required items).
   - **Recommended crew** — hours + scope + duration sanity + conditions.
   - **Schedule variants** — e.g. days at min crew, at recommended crew, optionally at capped crew.
3. **User control**: `jobConditions.installerCount` remains the **manual crew** used today for `productiveCrewHoursPerDay` / `durationDays` **until** we deliberately change behavior; UI should show **override vs recommendation** and warnings when override implies unrealistic duration.

### Phase 1 — Engine + API shape (no catalog schema yet)

**New pure function** (e.g. [`src/shared/utils/crewRecommendation.ts`](../../src/shared/utils/crewRecommendation.ts)):

**Inputs**

- `totalLaborHours` (post condition labor-hours multiplier — same basis as summary)
- `roomsCount`, `linesCount`, `totalQty` (sum of line qty or equivalent)
- `jobConditions` (occupied, restricted, phased, floors, remote travel, schedule compression, night work, etc.)
- `hoursPerInstallerDay` (default 8; optional later: settings)

**Heuristics (v1, tunable constants)**

- **Hours bands** (starting point; merge with your table): e.g. &lt;40h → suggest 1; 40–120 → 1–2; 120–240 → 2; 240–400 → 2–3; 400+ → 3+ as *starting* recommended before other layers.
- **Distributed scope**: e.g. `rooms >= 10 && hours >= 60` → `recommended >= 2`; `rooms >= 20 && hours >= 120` → `recommended >= 3` (adjust after testing).
- **Complexity score** (lightweight): points for room count, line count, qty, floors &gt;1, phased, etc.; map score to **target max field days** bands (small / medium / large).
- **Duration sanity**: If `daysAtRecommendedCrew` exceeds target max for project tier **and** scope is parallelizable, bump recommended crew up to a **cap** (e.g. 4–6) until within band or cap hit.
- **Condition caps / notes**: e.g. occupied + phased → optional **max efficient crew** cap + narrative that extra crew may not scale linearly.

**Outputs** (serializable, for API + UI)

- `minimumCrew`, `recommendedCrew`, `maxEfficientCrew` (cap)
- `confidence`: `'low' | 'medium' | 'high'` (v1 rule-based)
- `reasoning: string[]` (bullet strings for UI)
- `daysAtMinCrew`, `daysAtRecommendedCrew` (ceil, same formula as today: `hours / (crew * 8)`)
- `durationWarning`: optional when user’s `installerCount` implies days above threshold vs recommended path

**Integration**

- Extend [`EstimateSummary`](../../src/shared/types/estimator.ts) with optional `crewRecommendation?: CrewRecommendationResult` **or** compute on client from summary + lines + rooms — **prefer server** in `calculateEstimateSummary` so install review / PDF / API stay consistent.
- **Backward compatibility**: Existing `durationDays` + `productiveCrewHoursPerDay` keep using **`installerCount`** until product flips a flag (e.g. “Use recommended crew for schedule display”). Phase 1 can **only add** fields + UI card; default displayed days unchanged.

**Tests**

- New unit tests next to engine: e.g. 22 rooms, ~101h → recommended ≥2, min may stay 1, days at 2 &lt;&lt; days at 1.

### Phase 2 — Catalog metadata

- Extend [`CatalogItem`](../../src/types.ts) (and DB/sync if applicable) with optional fields, e.g.:
  - `recommendedMinCrew`, `recommendedMaxEfficientCrew`, `crewClass`, `twoPersonHandleRequired`, `parallelInstallGroup`, `crewNotes`
- Join lines to catalog by `catalogItemId` in the recommendation pass; `minimumCrew = max(catalog minimums, heuristic floor)`.
- Fallback: category / keyword heuristics for unmatched lines (partitions, lockers, etc.) until catalog is populated.

### Phase 3 — Conditions + UI

- Refine caps from `jobConditions` (remote travel favors larger crew narrative; restricted access warns on imperfect scaling).
- **UI card** (Estimate pricing strip, Overview, Handoff): Minimum, Recommended, days at recommended, confidence, reasoning bullets; if `installerCount` differs from recommended, show **Manual override** + duration comparison / warning.
- [`installReviewEmailService`](../../src/server/services/installReviewEmailService.ts): optionally include recommended crew + rationale lines alongside today’s `installerCount`.

### Files likely touched

| Area | Files |
|------|--------|
| Core math | [`estimateEngineV1.ts`](../../src/server/services/estimateEngineV1.ts), new `crewRecommendation.ts` |
| Types | [`estimator.ts`](../../src/shared/types/estimator.ts), [`types.ts`](../../src/types.ts) (catalog) |
| UI | [`ProjectWorkspace.tsx`](../../src/pages/ProjectWorkspace.tsx), [`OverviewPage.tsx`](../../src/pages/project/OverviewPage.tsx), [`HandoffPage.tsx`](../../src/pages/project/HandoffPage.tsx) |
| Email | [`installReviewEmailService.ts`](../../src/server/services/installReviewEmailService.ts) |

### Explicit follow-up decision (defer to implementation PR)

- Whether **displayed** `durationDays` should switch to **recommended** crew automatically, or stay on **manual** `installerCount` with the card nudging the user — recommend **manual drives displayed days until user opts in** or accepts “Apply recommendation to schedule.”

---

## Execution status

**Implemented (2026-04-09):** Crew recommendation on `EstimateSummary`, 3-column estimate (`xl`), `LineEditorPanel`, `RoomManager` search/selection, UI tokens, Overview/Handoff crew card, install-review email lines.

---

## Todo checklist

### A — UI

- [ ] `useMatchMedia` + `LineEditorPanel` extract + 3-col estimate
- [ ] `RoomManager` search, spacing, selected state
- [ ] `index.css` table / page tokens; `StatCard`; Overview / ExceptionList polish
- [ ] Optional workflow tab pills

### B — Crew

- [ ] `crewRecommendation.ts` + unit tests (Phase 1 rules)
- [ ] Attach result to `EstimateSummary` (or shared compute path)
- [ ] UI card + override warning (Phase 1)
- [ ] Catalog fields + line aggregation (Phase 2)
- [ ] Condition caps + handoff/email copy (Phase 3)
