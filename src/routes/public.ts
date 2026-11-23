import express from 'express';
import mime from 'mime-types';
import shareService, { type ShareRecord } from '../services/shareService';
import fileService from '../services/fileService';
import { authLimiter, shareDownloadLimiter, shareReadLimiter } from '../middleware/rateLimiter';
import { streamStoredFile } from '../utils/fileStream';
import { imageVariant, PREVIEW_MAX_EDGE, THUMB_MAX_EDGE } from '../utils/imagePreview';
import { formatBytes } from '../utils/formatters';

const router = express.Router();
const COOKIE_PREFIX = 'js_share_';

function readCookie(req: express.Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function isUnlocked(req: express.Request, share: ShareRecord): boolean {
  if (!share.passwordHash) return true;
  const value = readCookie(req, `${COOKIE_PREFIX}${share.id}`);
  return typeof value === 'string' && value === shareService.unlockToken(share);
}

function publicPayload(share: ShareRecord) {
  const files = share.files
    .map((entry) => {
      const item = fileService.getItemById(share.workspaceId, entry.itemId);
      if (!item || item.isFolder) return null;
      return {
        id: item.id,
        name: entry.displayPath || item.originalName,
        size: item.size,
        formattedSize: formatBytes(item.size),
        mimeType: item.mimeType,
        category: item.category,
      };
    })
    .filter((file): file is NonNullable<typeof file> => file !== null);

  return {
    id: share.id,
    createdAt: share.createdAt,
    expiresAt: share.expiresAt,
    allowDownload: share.allowDownload,
    downloadCount: share.downloadCount,
    maxDownloads: share.maxDownloads,
    passwordProtected: Boolean(share.passwordHash),
    files,
  };
}

// Returns the share only when it exists, has not expired, and the caller may read it.
function loadShare(req: express.Request, res: express.Response): ShareRecord | null {
  const share = shareService.get(req.params.token);
  if (!share) {
    res.status(410).json({ success: false, error: 'This link has expired or was revoked.' });
    return null;
  }
  if (!isUnlocked(req, share)) {
    res.status(401).json({
      success: false,
      requiresPassword: true,
      error: 'This link is password protected.',
    });
    return null;
  }
  return share;
}

router.get('/shares/:token', shareReadLimiter, (req, res) => {
  const share = loadShare(req, res);
  if (!share) return;
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: publicPayload(share) });
});

router.post('/shares/:token/unlock', authLimiter, (req, res) => {
  const share = shareService.get(req.params.token);
  if (!share) {
    res.status(410).json({ success: false, error: 'This link has expired or was revoked.' });
    return;
  }
  if (!share.passwordHash) {
    res.json({ success: true, data: publicPayload(share) });
    return;
  }

  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!password || !shareService.verifyPassword(share, password)) {
    res.status(403).json({ success: false, error: 'Incorrect password.' });
    return;
  }

  res.cookie(`${COOKIE_PREFIX}${share.id}`, shareService.unlockToken(share), {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure,
    path: `/api/public/shares/${share.id}`,
    expires: new Date(share.expiresAt),
  });
  res.json({ success: true, data: publicPayload(share) });
});

router.get('/shares/:token/files/:itemId/preview', shareReadLimiter, async (req, res) => {
  const share = loadShare(req, res);
  if (!share) return;

  const entry = share.files.find((file) => file.itemId === req.params.itemId);
  const item = entry ? fileService.getItemById(share.workspaceId, entry.itemId) : null;
  if (!item || item.isFolder || !item.fullPath) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const contentType = item.mimeType || mime.lookup(item.originalName) || 'application/octet-stream';
  const variant = await imageVariant(item, PREVIEW_MAX_EDGE);
  if (variant) {
    await streamStoredFile(req, res, {
      filePath: variant.filePath,
      contentType: variant.contentType,
      name: variant.name,
      disposition: 'inline',
      allowFraming: true,
      cacheControl: 'private, max-age=604800',
    });
    return;
  }
  await streamStoredFile(req, res, {
    filePath: item.fullPath,
    contentType,
    name: item.originalName,
    disposition: 'inline',
    allowFraming: true,
  });
});

router.get('/shares/:token/files/:itemId/thumb', shareReadLimiter, async (req, res) => {
  const share = loadShare(req, res);
  if (!share) return;

  const entry = share.files.find((file) => file.itemId === req.params.itemId);
  const item = entry ? fileService.getItemById(share.workspaceId, entry.itemId) : null;
  if (!item || item.isFolder || !item.fullPath) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  const variant = await imageVariant(item, THUMB_MAX_EDGE);
  if (variant) {
    await streamStoredFile(req, res, {
      filePath: variant.filePath,
      contentType: variant.contentType,
      name: variant.name,
      disposition: 'inline',
      allowFraming: true,
      cacheControl: 'private, max-age=604800',
    });
    return;
  }

  if (item.category !== 'image') {
    res.status(404).json({ success: false, error: 'No thumbnail for this file' });
    return;
  }
  await streamStoredFile(req, res, {
    filePath: item.fullPath,
    contentType: item.mimeType || mime.lookup(item.originalName) || 'application/octet-stream',
    name: item.originalName,
    disposition: 'inline',
    allowFraming: true,
  });
});

router.get('/shares/:token/files/:itemId/download', shareDownloadLimiter, async (req, res) => {
  const share = loadShare(req, res);
  if (!share) return;
  if (!share.allowDownload) {
    res.status(403).json({ success: false, error: 'Downloads are disabled for this link.' });
    return;
  }

  const entry = share.files.find((file) => file.itemId === req.params.itemId);
  const item = entry ? fileService.getItemById(share.workspaceId, entry.itemId) : null;
  if (!item || item.isFolder || !item.fullPath) {
    res.status(404).json({ success: false, error: 'File not found' });
    return;
  }

  if (!shareService.registerDownload(share)) {
    res.status(403).json({ success: false, error: 'This link reached its download limit.' });
    return;
  }

  const contentType = item.mimeType || mime.lookup(item.originalName) || 'application/octet-stream';
  await streamStoredFile(req, res, {
    filePath: item.fullPath,
    contentType,
    name: item.originalName,
    disposition: 'attachment',
  });
});

router.get('/shares/:token/download', shareDownloadLimiter, (req, res) => {
  const share = loadShare(req, res);
  if (!share) return;
  if (!share.allowDownload) {
    res.status(403).json({ success: false, error: 'Downloads are disabled for this link.' });
    return;
  }
  if (!shareService.registerDownload(share)) {
    res.status(403).json({ success: false, error: 'This link reached its download limit.' });
    return;
  }

  fileService.streamZip(
    share.workspaceId,
    share.files.map((file) => file.itemId),
    res,
    'shared-files.zip'
  );
});

export default router;
