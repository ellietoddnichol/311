const RESUME_KEY = 'estimator_workspace_resume_v1';
const LAST_PROJECT_PATH_KEY = 'estimator_last_project_path';

export type WorkspaceResume = { projectId: string; projectName: string; updatedAt: number };

export function setWorkspaceResumeProject(projectId: string, projectName: string): void {
  try {
    const payload: WorkspaceResume = {
      projectId,
      projectName,
      updatedAt: Date.now(),
    };
    localStorage.setItem(RESUME_KEY, JSON.stringify(payload));
    localStorage.setItem(LAST_PROJECT_PATH_KEY, `/project/${projectId}`);
  } catch {
    /* ignore quota / private mode */
  }
}

export function getWorkspaceResumeProject(): WorkspaceResume | null {
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkspaceResume;
    if (!parsed?.projectId || !parsed?.projectName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearWorkspaceResumeProject(): void {
  try {
    localStorage.removeItem(RESUME_KEY);
    localStorage.removeItem(LAST_PROJECT_PATH_KEY);
  } catch {
    /* ignore */
  }
}
