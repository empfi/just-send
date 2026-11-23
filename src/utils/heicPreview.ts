import fs from 'fs';
import path from 'path';
import convert from 'heic-convert';
import { DATA_DIR } from '../config';

const CACHE_DIR = path.join(DATA_DIR, 'cache', 'heic');

export function isHeic(name: string, mimeType?: string | null): boolean {
  return /\.(heic|heif)$/i.test(name) || mimeType === 'image/heic' || mimeType === 'image/heif';
}

function cachePrefix(value: string): string {
  const safe = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return safe || 'image';
}

// Browsers cannot decode HEIC, so each photo is converted once to JPEG and kept
// on disk. Re-encoding only happens when the source file changes.
export async function heicPreviewPath(filePath: string, key: string): Promise<string> {
  const source = await fs.promises.stat(filePath);
  const prefix = cachePrefix(key);
  const target = path.join(CACHE_DIR, `${prefix}-${Math.floor(source.mtimeMs)}.jpg`);

  try {
    const cached = await fs.promises.stat(target);
    if (cached.mtimeMs >= source.mtimeMs) return target;
  } catch {
    // No usable cache entry yet, convert below.
  }

  const input = await fs.promises.readFile(filePath);
  const jpeg = await convert({ buffer: input, format: 'JPEG', quality: 0.9 });
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });

  // Drop older renders of the same item so the cache stays bounded.
  try {
    for (const entry of await fs.promises.readdir(CACHE_DIR)) {
      if (entry.startsWith(`${prefix}-`) && entry !== path.basename(target)) {
        await fs.promises.rm(path.join(CACHE_DIR, entry), { force: true });
      }
    }
  } catch {
    // A stale file is harmless.
  }

  await fs.promises.writeFile(target, Buffer.from(jpeg));
  return target;
}
