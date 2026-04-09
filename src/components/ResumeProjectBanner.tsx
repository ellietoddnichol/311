import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, X } from 'lucide-react';
import { clearWorkspaceResumeProject, getWorkspaceResumeProject } from '../utils/workspaceResume';

export function ResumeProjectBanner() {
  const [dismissed, setDismissed] = useState(false);
  const resume = getWorkspaceResumeProject();

  if (dismissed || !resume) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50/90 px-3 py-2 text-xs text-slate-800">
      <div className="flex items-center gap-2 min-w-0">
        <FolderOpen className="h-4 w-4 shrink-0 text-blue-700" />
        <span className="min-w-0">
          You have a project open:{' '}
          <span className="font-semibold text-slate-900 truncate inline-block max-w-[220px] align-bottom">{resume.projectName}</span>
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          to={`/project/${encodeURIComponent(resume.projectId)}`}
          className="inline-flex h-8 items-center rounded-md bg-blue-700 px-3 font-semibold text-white hover:bg-blue-800"
        >
          Continue
        </Link>
        <button
          type="button"
          onClick={() => {
            clearWorkspaceResumeProject();
            setDismissed(true);
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-white"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
