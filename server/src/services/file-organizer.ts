/**
 * File Organizer Service - Batch rename, directory restructuring, conflict detection
 *
 * Provides file operations with rollback support via JSON manifests.
 * Rollback strategy: before any file operation, create a JSON manifest of original paths.
 * On failure or explicit rollback, iterate manifest and rename back.
 * Store manifests in server/.rollback/{operationId}.json with 24h auto-cleanup.
 */

import fs from 'fs/promises';
import path from 'path';
import { query } from '../db';
import { generateOperationId } from './progress-tracker';

// ======================== Types ========================

export interface RenameItem {
  mediaId: number;
  oldPath: string;
  newPath: string;
}

export interface OrganizeRequest {
  mediaIds?: number[];
  targetRoot?: string;
  pattern?: string;
}

export interface RenamePreview {
  operationId: string;
  items: RenameItem[];
  conflicts: { path: string; existingFile: boolean }[];
}

export interface OrganizeResult {
  operationId: string;
  success: boolean;
  renamed: number;
  failed: number;
  errors: string[];
  message: string;
}

interface RollbackManifest {
  operationId: string;
  createdAt: string;
  files: { from: string; to: string }[];
}

const ROLLBACK_DIR = path.join(process.cwd(), '.rollback');
const ROLLBACK_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// ======================== Helpers ========================

function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNewName(title: string, year: number | null, pattern: string): string {
  const sanitized = sanitizeFilename(title);
  switch (pattern) {
    case 'year-title':
      return year ? `${year} - ${sanitized}` : sanitized;
    case 'tmdb-title':
      return sanitized;
    default: // 'title-year'
      return year ? `${sanitized} (${year})` : sanitized;
  }
}

// ======================== Rollback ========================

async function ensureRollbackDir(): Promise<void> {
  await fs.mkdir(ROLLBACK_DIR, { recursive: true });
}

async function saveManifest(manifest: RollbackManifest): Promise<void> {
  await ensureRollbackDir();
  const filePath = path.join(ROLLBACK_DIR, `${manifest.operationId}.json`);
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), 'utf-8');
}

async function loadManifest(operationId: string): Promise<RollbackManifest | null> {
  try {
    const filePath = path.join(ROLLBACK_DIR, `${operationId}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function deleteManifest(operationId: string): Promise<void> {
  try {
    const filePath = path.join(ROLLBACK_DIR, `${operationId}.json`);
    await fs.unlink(filePath);
  } catch { /* ignore */ }
}

// ======================== Cleanup ========================

export async function cleanupOldManifests(): Promise<number> {
  await ensureRollbackDir();
  let cleaned = 0;
  try {
    const files = await fs.readdir(ROLLBACK_DIR);
    const now = Date.now();
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const stat = await fs.stat(path.join(ROLLBACK_DIR, file));
        if (now - stat.mtimeMs > ROLLBACK_MAX_AGE_MS) {
          await fs.unlink(path.join(ROLLBACK_DIR, file));
          cleaned++;
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return cleaned;
}

// ======================== Public API ========================

export async function previewRename(req: OrganizeRequest): Promise<RenamePreview> {
  const operationId = generateOperationId('organize');
  const pattern = req.pattern || 'title-year';

  let mediaIds = req.mediaIds;
  if (!mediaIds || mediaIds.length === 0) {
    const rows: any[] = await query('SELECT id FROM local_media');
    mediaIds = rows.map((r: any) => r.id);
  }

  const placeholders = mediaIds.map(() => '?').join(',');
  const rows: any[] = await query(
    `SELECT id, title, year, local_path, media_type FROM local_media WHERE id IN (${placeholders})`,
    mediaIds
  );

  const items: RenameItem[] = [];
  const conflicts: { path: string; existingFile: boolean }[] = [];

  for (const row of rows) {
    if (!row.local_path) continue;

    const dir = path.dirname(row.local_path);
    const ext = path.extname(row.local_path);
    const newName = buildNewName(row.title, row.year, pattern);
    const newPath = path.join(dir, `${newName}${ext}`);

    items.push({
      mediaId: row.id,
      oldPath: row.local_path,
      newPath,
    });

    if (newPath !== row.local_path) {
      try {
        await fs.access(newPath);
        conflicts.push({ path: newPath, existingFile: true });
      } catch {
        // No conflict
      }
    }
  }

  return { operationId, items, conflicts };
}

export async function executeRename(req: OrganizeRequest): Promise<OrganizeResult> {
  const operationId = generateOperationId('organize');
  const pattern = req.pattern || 'title-year';
  const errors: string[] = [];
  let renamed = 0;
  let failed = 0;

  let mediaIds = req.mediaIds;
  if (!mediaIds || mediaIds.length === 0) {
    const rows: any[] = await query('SELECT id FROM local_media');
    mediaIds = rows.map((r: any) => r.id);
  }

  const placeholders = mediaIds.map(() => '?').join(',');
  const rows: any[] = await query(
    `SELECT id, title, year, local_path, media_type FROM local_media WHERE id IN (${placeholders})`,
    mediaIds
  );

  const manifest: RollbackManifest = {
    operationId,
    createdAt: new Date().toISOString(),
    files: [],
  };

  for (const row of rows) {
    if (!row.local_path) continue;

    const dir = path.dirname(row.local_path);
    const ext = path.extname(row.local_path);
    const newName = buildNewName(row.title, row.year, pattern);
    const newPath = path.join(dir, `${newName}${ext}`);

    if (newPath === row.local_path) continue;

    try {
      try {
        await fs.access(newPath);
        errors.push(`Conflict: ${newPath} already exists`);
        failed++;
        continue;
      } catch { /* Good */ }

      await fs.rename(row.local_path, newPath);
      await query('UPDATE local_media SET local_path = ? WHERE id = ?', [newPath, row.id]);
      manifest.files.push({ from: newPath, to: row.local_path });
      renamed++;
    } catch (err: any) {
      errors.push(`Failed to rename ${row.local_path}: ${err.message}`);
      failed++;
    }
  }

  if (manifest.files.length > 0) {
    await saveManifest(manifest);
  }

  return {
    operationId,
    success: failed === 0,
    renamed,
    failed,
    errors,
    message: `Rename complete: ${renamed} success, ${failed} failed`,
  };
}

export async function rollbackOperation(operationId: string): Promise<{ success: boolean; message: string }> {
  const manifest = await loadManifest(operationId);
  if (!manifest) {
    return { success: false, message: 'Operation not found or expired' };
  }

  const errors: string[] = [];
  for (const file of manifest.files) {
    try {
      await fs.access(file.from);
      await fs.rename(file.from, file.to);
      await query('UPDATE local_media SET local_path = ? WHERE local_path = ?', [file.to, file.from]);
    } catch (err: any) {
      errors.push(`Failed to rollback ${file.from}: ${err.message}`);
    }
  }

  await deleteManifest(operationId);

  if (errors.length > 0) {
    return { success: false, message: `Rollback completed with errors: ${errors.join('; ')}` };
  }
  return { success: true, message: `Rolled back ${manifest.files.length} files` };
}

export async function restructureDirectories(req: OrganizeRequest): Promise<OrganizeResult> {
  const operationId = generateOperationId('organize');
  const errors: string[] = [];
  let renamed = 0;
  let failed = 0;

  let targetRoot = req.targetRoot;
  if (!targetRoot) {
    const rows: any[] = await query('SELECT `value` FROM config WHERE `key` = ?', ['media_root']);
    targetRoot = rows[0]?.value;
  }
  if (!targetRoot) {
    return {
      operationId,
      success: false,
      renamed: 0,
      failed: 0,
      errors: ['Target directory not configured'],
      message: 'Target directory not configured. Set media_root in Settings or provide targetRoot.',
    };
  }

  const manifest: RollbackManifest = {
    operationId,
    createdAt: new Date().toISOString(),
    files: [],
  };

  let mediaIds = req.mediaIds;
  if (!mediaIds || mediaIds.length === 0) {
    const rows: any[] = await query('SELECT id FROM local_media');
    mediaIds = rows.map((r: any) => r.id);
  }

  const placeholders = mediaIds.map(() => '?').join(',');
  const rows: any[] = await query(
    `SELECT id, title, year, local_path, media_type FROM local_media WHERE id IN (${placeholders})`,
    mediaIds
  );

  for (const row of rows) {
    if (!row.local_path) continue;

    const typeDir = row.media_type === 'tv' ? 'TV' : 'Movies';
    const dirName = buildNewName(row.title, row.year, 'title-year');
    const targetDir = path.join(targetRoot, typeDir, dirName);
    const fileName = path.basename(row.local_path);
    const newPath = path.join(targetDir, fileName);

    if (newPath === row.local_path) continue;

    try {
      await fs.mkdir(targetDir, { recursive: true });
      await fs.rename(row.local_path, newPath);
      await query('UPDATE local_media SET local_path = ? WHERE id = ?', [newPath, row.id]);
      manifest.files.push({ from: newPath, to: row.local_path });
      renamed++;
    } catch (err: any) {
      errors.push(`Failed to move ${row.local_path}: ${err.message}`);
      failed++;
    }
  }

  if (manifest.files.length > 0) {
    await saveManifest(manifest);
  }

  return {
    operationId,
    success: failed === 0,
    renamed,
    failed,
    errors,
    message: `Restructure complete: ${renamed} success, ${failed} failed`,
  };
}
