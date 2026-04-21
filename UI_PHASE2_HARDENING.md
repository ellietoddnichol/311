# UI Phase 2 Hardening Backlog

Prioritized by impact first, then implementation effort.

## P0 - Immediate (High Impact / Medium Effort)

1. Standardize page shells and action hierarchy on `Dashboard`, `Projects`, and `Catalog`.
2. Replace validation list friction with clickable anchors that focus invalid fields in `ProjectIntake`.
3. Collapse parser diagnostics into one `Import Health` panel with severity and grouped issues.

## P1 - Next Sprint

4. Add keyboard shortcuts for review queue (`next`, `include`, `ignore`, `match`).
5. Add compact/comfortable density modes to review queue and estimate grid.
6. Add consistent loading/saving feedback patterns for parse/sync/save actions.

## P2 - Quality + Scale

7. Extract shared page primitives and intake sections into smaller composable components.
8. Add visual regression checks for key pages/workflows.
9. Add virtualization for very large review queues.

## Success Metrics

- Time to complete project setup.
- Unresolved lines per import.
- Clicks per 100 reviewed lines.
- Tab/deep-link resume success.
- Validation interruption rate.
