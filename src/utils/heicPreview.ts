import fs from 'fs';
import path from 'path';
import convert from 'heic-convert';
import { HEIC_CACHE_DIR, cachePrefix } from './previewCache';

export function isHeic(name: string, mimeType?: string | null): boolean {
  return /\.(heic|heif)$/i.test(name) || mimeType === 'image/heic' || mimeType === 'image/heif';
}

// Browsers cannot decode HEIC, so each photo is converted once to JPEG and kept
// on disk. Re-encoding only happens when the source file changes.
export async function heicPreviewPath(filePath: string, key: string): Promise<string> {
  const source = await fs.promises.stat(filePath);
  const prefix = cachePrefix(key);
  const target = path.join(HEIC_CACHE_DIR, `${prefix}-${Math.floor(source.mtimeMs)}.jpg`);

  try {
    const cached = await fs.promises.stat(target);
    if (cached.mtimeMs >= source.mtimeMs) return target;
  } catch {
    // No usable cache entry yet, convert below.
  }

  const input = await fs.promises.readFile(filePath);
  const jpeg = await convert({ buffer: input, format: 'JPEG', quality: 0.9 });
  await fs.promises.mkdir(HEIC_CACHE_DIR, { recursive: true });

  // Drop older renders of the same item so the cache stays bounded.
  try {
    for (const entry of await fs.promises.readdir(HEIC_CACHE_DIR)) {
      if (entry.startsWith(`${prefix}-`) && entry !== path.basename(target)) {
        await fs.promises.rm(path.join(HEIC_CACHE_DIR, entry), { force: true });
      }
    }
  } catch {
    // A stale file is harmless.
  }

  await fs.promises.writeFile(target, Buffer.from(jpeg));
  return target;
}
