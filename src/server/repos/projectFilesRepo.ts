import { randomUUID } from 'crypto';
import { estimatorDb } from '../db/connection.ts';
import { ProjectFileRecord } from '../../shared/types/estimator.ts';
import {
  buildProjectFileObjectName,
  deleteProjectFileFromGcs,
  downloadProjectFileFromGcs,
  getGcsProjectFilesBucketName,
  isGcsProjectFilesEnabled,
  uploadProjectFileToGcs,
} from '../services/gcsProjectFilesStorage.ts';

export type ProjectFileStoredRow = ProjectFileRecord & {
  dataBase64: string;
  gcsBucket: string | null;
  gcsObjectName: string | null;
};

function mapProjectFileRow(row: any): ProjectFileRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  };
}

export function listProjectFiles(projectId: string): ProjectFileRecord[] {
  const rows = estimatorDb
    .prepare('SELECT id, project_id, file_name, mime_type, size_bytes, created_at FROM project_files_v1 WHERE project_id = ? ORDER BY created_at DESC')
    .all(projectId);
  return rows.map(mapProjectFileRow);
}

export async function createProjectFile(input: {
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  dataBase64: string;
}): Promise<ProjectFileRecord> {
  const record: ProjectFileRecord = {
    id: randomUUID(),
    projectId: input.projectId,
    fileName: input.fileName,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    createdAt: new Date().toISOString(),
  };

  const buffer = Buffer.from(input.dataBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Empty file payload.');
  }

  const bucketName = getGcsProjectFilesBucketName();
  if (bucketName) {
    if (!isGcsProjectFilesEnabled()) {
      throw new Error(
        'GCS_PROJECT_FILES_BUCKET is set but Google service account credentials are missing. Configure GOOGLE_SERVICE_ACCOUNT_FILE (or equivalent).'
      );
    }
    const objectName = buildProjectFileObjectName(input.projectId, record.id, input.fileName);
    await uploadProjectFileToGcs({
      bucket: bucketName,
      objectName,
      buffer,
      contentType: input.mimeType,
    });

    estimatorDb
      .prepare(
        `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, created_at, gcs_bucket, gcs_object_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.fileName,
        record.mimeType,
        record.sizeBytes,
        '',
        record.createdAt,
        bucketName,
        objectName
      );
  } else {
    estimatorDb
      .prepare(
        `INSERT INTO project_files_v1 (id, project_id, file_name, mime_type, size_bytes, data_base64, created_at, gcs_bucket, gcs_object_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.projectId,
        record.fileName,
        record.mimeType,
        record.sizeBytes,
        input.dataBase64,
        record.createdAt,
        null,
        null
      );
  }

  return record;
}

export function getProjectFile(projectId: string, fileId: string): ProjectFileStoredRow | null {
  const row = estimatorDb
    .prepare(
      `SELECT id, project_id, file_name, mime_type, size_bytes, data_base64, created_at, gcs_bucket, gcs_object_name
       FROM project_files_v1
       WHERE project_id = ? AND id = ?`
    )
    .get(projectId, fileId) as any;

  if (!row) return null;

  return {
    ...mapProjectFileRow(row),
    dataBase64: row.data_base64 ?? '',
    gcsBucket: row.gcs_bucket ?? null,
    gcsObjectName: row.gcs_object_name ?? null,
  };
}

export async function readProjectFileBuffer(projectId: string, fileId: string): Promise<Buffer | null> {
  const row = getProjectFile(projectId, fileId);
  if (!row) return null;

  if (row.gcsBucket && row.gcsObjectName) {
    return downloadProjectFileFromGcs(row.gcsBucket, row.gcsObjectName);
  }

  if (!row.dataBase64) {
    return null;
  }

  return Buffer.from(row.dataBase64, 'base64');
}

export async function deleteProjectFile(projectId: string, fileId: string): Promise<boolean> {
  const row = getProjectFile(projectId, fileId);
  if (!row) return false;

  if (row.gcsBucket && row.gcsObjectName) {
    await deleteProjectFileFromGcs(row.gcsBucket, row.gcsObjectName);
  }

  const result = estimatorDb.prepare('DELETE FROM project_files_v1 WHERE project_id = ? AND id = ?').run(projectId, fileId);
  return result.changes > 0;
}

/** Remove GCS objects for all files attached to a project (call before deleting the project row). */
export async function purgeProjectFilesFromGcs(projectId: string): Promise<void> {
  const rows = estimatorDb
    .prepare('SELECT gcs_bucket, gcs_object_name FROM project_files_v1 WHERE project_id = ?')
    .all(projectId) as Array<{ gcs_bucket: string | null; gcs_object_name: string | null }>;

  await Promise.all(
    rows
      .filter((r) => r.gcs_bucket && r.gcs_object_name)
      .map((r) => deleteProjectFileFromGcs(r.gcs_bucket as string, r.gcs_object_name as string))
  );
}
