import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config';

export const IMAGE_CACHE_DIR = path.join(DATA_DIR, 'cache', 'images');
export const HEIC_CACHE_DIR = path.join(DATA_DIR, 'cache', 'heic');

const PREVIEW_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Cache names are built from workspace and item ids, so one prefix identifies
// every render of an item and `${workspaceId}-` identifies a whole workspace.
export function cachePrefix(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
  return safe || 'image';
}

// Removes the image renders, previews, and HEIC conversions belonging to one
// item, or to every item when given a workspace id.
export async function clearPreviewCache(scope: string): Promise<void> {
  const match = `${cachePrefix(scope)}-`;
  for (const dir of [IMAGE_CACHE_DIR, HEIC_CACHE_DIR]) {
    try {
      for (const entry of await fs.promises.readdir(dir)) {
        if (!entry.startsWith(match)) continue;
        await fs.promises.rm(path.join(dir, entry), { force: true }).catch(() => undefined);
      }
    } catch {
      // The cache directory may not exist yet.
    }
  }
}

// Called at startup. Deleted files and workspaces are purged immediately, so
// this only catches renders left behind by an interrupted request.
export async function prunePreviewCaches(maxAgeMs = PREVIEW_CACHE_MAX_AGE_MS): Promise<void> {
  const cutoff = Date.now() - maxAgeMs;
  for (const dir of [IMAGE_CACHE_DIR, HEIC_CACHE_DIR]) {
    try {
      for (const entry of await fs.promises.readdir(dir)) {
        const target = path.join(dir, entry);
        const stats = await fs.promises.stat(target).catch(() => null);
        if (stats?.isFile() && stats.mtimeMs < cutoff) {
          await fs.promises.rm(target, { force: true }).catch(() => undefined);
        }
      }
    } catch {
      // The cache directory may not exist yet.
    }
  }
}
