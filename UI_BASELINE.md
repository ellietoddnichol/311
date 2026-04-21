# UI Baseline Audit

This baseline captures the main UX pain points and success metrics for the UI overhaul rollout.

## Navigation and Orientation

- Project routes (`/project/:id`) do not clearly map back to an active global nav state.
- Workspace sections are discoverable but lack persistent breadcrumb context.
- Dashboard and Projects overlap in purpose, which creates "where should I start?" friction.

## Project Creation and Intake

- The intake flow has high cognitive load, especially in pricing/scope setup.
- Validation feedback is split across alerts, inline notes, and checklists.
- Review step is card-heavy and difficult to scan when import volume grows.

## Import Review

- Warning surfaces are fragmented, making it hard to prioritize remediation.
- Match-review interactions are repetitive and optimize for single-item edits over bulk operations.

## Estimate Workspace

- Action styles and density are inconsistent across workspace panels.
- Table/grid interaction patterns are not fully aligned with import review patterns.

## Target Metrics (track per release phase)

- Time to first project creation completion (blank + import flows).
- Time to resolve all unresolved import lines.
- Average clicks for matching/review per imported line.
- Time from project open to first estimate edit.
- Workspace tab deep-link usage success rate.
- Validation interruption rate (alerts shown per project setup completion).

## Acceptance Goals

- Faster orientation: users always know where they are and what step is next.
- Higher trust: assumptions and validation feedback are explicit and actionable.
- Better scanability: high-volume review/edit tasks support filtering and bulk workflows.
- Professional consistency: shared visual language for buttons, spacing, typography, and state styles.
