import { Router } from 'express';
import { archiveProject, createProject, deleteProject, getProject, listProjects, updateProject } from '../../repos/projectsRepo.ts';
import { listTakeoffLines } from '../../repos/takeoffRepo.ts';
import { computeVendorSubtotalVarianceReport } from '../../services/vendorVarianceService.ts';
import {
  createProjectFile,
  deleteProjectFile,
  getProjectFile,
  listProjectFiles,
  purgeProjectFilesFromGcs,
  readProjectFileBuffer,
} from '../../repos/projectFilesRepo.ts';

export const projectsRouter = Router();

projectsRouter.get('/', (_req, res) => {
  res.json({ data: listProjects() });
});

projectsRouter.get('/:projectId', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: project });
});

projectsRouter.get('/:projectId/vendor-variance', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const lines = listTakeoffLines(project.id);
  const report = computeVendorSubtotalVarianceReport(lines);
  return res.json({ data: report });
});

projectsRouter.post('/', (req, res) => {
  const project = createProject(req.body ?? {});
  return res.status(201).json({ data: project });
});

projectsRouter.put('/:projectId', (req, res) => {
  const project = updateProject(req.params.projectId, req.body ?? {});
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: project });
});

projectsRouter.delete('/:projectId', async (req, res) => {
  if (String(req.query.permanent || '') === 'true') {
    try {
      await purgeProjectFilesFromGcs(req.params.projectId);
    } catch (err) {
      console.error('GCS purge before project delete failed:', err);
    }
    const deleted = deleteProject(req.params.projectId);
    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    return res.json({ data: { deleted: true } });
  }

  const archived = archiveProject(req.params.projectId);
  if (!archived) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: { archived: true } });
});

projectsRouter.get('/:projectId/files', (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  return res.json({ data: listProjectFiles(req.params.projectId) });
});

projectsRouter.post('/:projectId/files', async (req, res) => {
  const project = getProject(req.params.projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const fileName = String(req.body?.fileName || '').trim();
  const mimeType = String(req.body?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const dataBase64 = String(req.body?.dataBase64 || '').trim();
  const sizeBytes = Number(req.body?.sizeBytes || 0);

  if (!fileName || !dataBase64 || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return res.status(400).json({ error: 'Missing file payload.' });
  }

  if (sizeBytes > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'File too large. Maximum size is 10 MB.' });
  }

  try {
    const created = await createProjectFile({
      projectId: req.params.projectId,
      fileName,
      mimeType,
      sizeBytes,
      dataBase64,
    });
    return res.status(201).json({ data: created });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    console.error('Project file upload failed:', err);
    return res.status(500).json({ error: message });
  }
});

projectsRouter.get('/:projectId/files/:fileId/download', async (req, res) => {
  const file = getProjectFile(req.params.projectId, req.params.fileId);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    const data = await readProjectFileBuffer(req.params.projectId, req.params.fileId);
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`);
    return res.send(data);
  } catch (err) {
    console.error('Project file download failed:', err);
    return res.status(500).json({ error: 'Download failed.' });
  }
});

projectsRouter.delete('/:projectId/files/:fileId', async (req, res) => {
  const deleted = await deleteProjectFile(req.params.projectId, req.params.fileId);
  if (!deleted) {
    return res.status(404).json({ error: 'File not found' });
  }

  return res.json({ data: { deleted: true } });
});
