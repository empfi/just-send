import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { heicPreviewPath, isHeic } from './heicPreview';
import { IMAGE_CACHE_DIR, cachePrefix } from './previewCache';

export const THUMB_MAX_EDGE = 480;
// The preview is capped at 1400 CSS px, so 2000 keeps ample detail without
// making every first open wait on a 12 MP decode and a multi-megabyte transfer.
export const PREVIEW_MAX_EDGE = 2000;

// Animated GIFs and SVGs lose too much from a static re-encode, so they keep
// streaming as-is. Everything else becomes a WebP sized for its job.
const SKIP_MIME = new Set(['image/gif', 'image/svg+xml']);

// A folder page can ask for many thumbnails at once. Rendering is serialized so
// a large photo folder does not start dozens of full-size decodes together.
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

async function acquireRenderSlot(priority: boolean): Promise<void> {
  if (activeRenders < MAX_CONCURRENT_RENDERS) {
    activeRenders += 1;
    return;
  }
  // release() hands the slot over directly, so this must not count it twice.
  // Previews jump ahead of queued thumbnails, so opening a photo never waits
  // behind a whole folder of card renders.
  await new Promise<void>((resolve) => {
    if (priority) renderWaiters.unshift(resolve);
    else renderWaiters.push(resolve);
  });
}

function releaseRenderSlot(): void {
  const next = renderWaiters.shift();
  if (next) {
    // Keep the count unchanged: the slot passes straight to the waiter.
    next();
    return;
  }
  activeRenders = Math.max(0, activeRenders - 1);
}

async function withRenderSlot<T>(task: () => Promise<T>, priority = false): Promise<T> {
  await acquireRenderSlot(priority);
  try {
    return await task();
  } finally {
    releaseRenderSlot();
  }
}

export function isResizableImage(name: string, mimeType?: string | null): boolean {
  const mime = (mimeType ?? '').toLowerCase();
  if (SKIP_MIME.has(mime)) return false;
  if (/\.(gif|svg)$/i.test(name)) return false;
  return mime.startsWith('image/') || /\.(jpe?g|png|webp|avif|tiff?|bmp)$/i.test(name);
}

// Browsers get a small cached WebP instead of a multi-megabyte original. The
// cache file name carries the source mtime, so replacing a file re-renders it.
export async function resizedImagePath(
  filePath: string,
  key: string,
  maxEdge: number
): Promise<string | null> {
  try {
    const source = await fs.promises.stat(filePath);
    const prefix = `${cachePrefix(key)}-${maxEdge}`;
    const target = path.join(IMAGE_CACHE_DIR, `${prefix}-${Math.floor(source.mtimeMs)}.webp`);

    try {
      const cached = await fs.promises.stat(target);
      if (cached.mtimeMs >= source.mtimeMs && cached.size > 0) return target;
    } catch {
      // No usable cache entry yet, render below.
    }

    await fs.promises.mkdir(IMAGE_CACHE_DIR, { recursive: true });
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await sharp(filePath, { failOn: 'none', pages: 1 })
        .rotate()
        .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: maxEdge <= THUMB_MAX_EDGE ? 74 : 80 })
        .toFile(temp);
      await fs.promises.rename(temp, target);
    } catch (err) {
      // A concurrent request may have written the same target first.
      await fs.promises.rm(temp, { force: true }).catch(() => undefined);
      const cached = await fs.promises.stat(target).catch(() => null);
      if (!cached || cached.size === 0) throw err;
    }

    // Drop older renders of this item so one photo cannot keep two sizes forever.
    try {
      for (const entry of await fs.promises.readdir(IMAGE_CACHE_DIR)) {
        if (entry.startsWith(`${prefix}-`) && entry !== path.basename(target)) {
          await fs.promises.rm(path.join(IMAGE_CACHE_DIR, entry), { force: true });
        }
      }
    } catch {
      // A stale entry is harmless.
    }

    return target;
  } catch (err) {
    console.error(`Image resize failed for ${path.basename(filePath)}:`, (err as Error).message);
    return null;
  }
}

export interface ImageVariant {
  filePath: string;
  contentType: string;
  name: string;
}

// Shared by session previews and public share previews, so HEIC conversion and
// the resize cache are applied the same way everywhere.
export async function imageVariant(
  item: {
    id: string;
    workspaceId: string;
    originalName: string;
    mimeType?: string | null;
    fullPath?: string;
  },
  maxEdge: number
): Promise<ImageVariant | null> {
  if (!item.fullPath) return null;
  const sourcePath = item.fullPath;

  const mime = item.mimeType ?? '';
  const heic = isHeic(item.originalName, mime);
  const sourceType = heic ? 'image/jpeg' : mime || 'application/octet-stream';
  if (!isResizableImage(item.originalName, sourceType)) return null;

  // HEIC conversion is the most expensive step, so it waits for a render slot
  // with the resize instead of running for every card at once.
  return withRenderSlot(async () => {
    let input = sourcePath;
    let name = item.originalName;

    if (heic) {
      try {
        input = await heicPreviewPath(sourcePath, `${item.workspaceId}-${item.id}`);
        name = item.originalName.replace(/\.(heic|heif)$/i, '.jpg');
      } catch (err) {
        console.error('HEIC preview conversion failed:', err);
        return null;
      }
    }

    const resized = await resizedImagePath(input, `${item.workspaceId}-${item.id}`, maxEdge);
    if (!resized) return null;

    // The item may be deleted while its render is in flight. Do not leave a
    // fresh private image in the cache after the purge for that delete ran.
    if (!fs.existsSync(sourcePath)) {
      await fs.promises.rm(resized, { force: true }).catch(() => undefined);
      if (input !== sourcePath) await fs.promises.rm(input, { force: true }).catch(() => undefined);
      return null;
    }

    return {
      filePath: resized,
      contentType: 'image/webp',
      name: `${name.replace(/\.[^.]+$/, '')}.webp`,
    };
  }, maxEdge > THUMB_MAX_EDGE);
}
