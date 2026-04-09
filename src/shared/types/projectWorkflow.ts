/** Primary workflow steps inside /project/:id (URL ?tab= / ?view=). */
export type WorkspaceTab = 'overview' | 'setup' | 'scope-review' | 'estimate' | 'proposal' | 'handoff';

export const WORKSPACE_TABS: WorkspaceTab[] = ['overview', 'setup', 'scope-review', 'estimate', 'proposal', 'handoff'];

/** Estimate tab: quantities (legacy takeoff) vs pricing (per-room dollars). */
export type EstimateWorkspaceView = 'quantities' | 'pricing';
