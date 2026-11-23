import express from 'express';
import shareService, { MAX_SHARE_HOURS } from '../services/shareService';
import fileService from '../services/fileService';
import auditService from '../services/auditService';
import { requireSession, authed } from '../middleware/auth';
import { shareCreateLimiter } from '../middleware/rateLimiter';

const router = express.Router();

function parseHours(value: unknown): number | null {
  const hours = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(hours) || hours < 1) return null;
  return Math.min(MAX_SHARE_HOURS, Math.round(hours));
}

router.post('/', requireSession, shareCreateLimiter, (req, res) => {
  try {
    const auth = authed(req);
    const body = req.body as {
      itemIds?: unknown;
      hours?: unknown;
      password?: unknown;
      maxDownloads?: unknown;
      allowDownload?: unknown;
    };

    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((id): id is string => typeof id === 'string' && id.length > 0).slice(0, 200)
      : [];
    if (itemIds.length === 0) {
      res.status(400).json({ success: false, error: 'Select at least one item to share' });
      return;
    }

    const hours = parseHours(body.hours);
    if (!hours) {
      res.status(400).json({ success: false, error: 'Choose a duration between 1 hour and 7 days' });
      return;
    }

    const password = typeof body.password === 'string' ? body.password.trim() : '';
    if (password && (password.length < 4 || password.length > 128)) {
      res.status(400).json({ success: false, error: 'Password must be 4 to 128 characters' });
      return;
    }

    const maxDownloads =
      typeof body.maxDownloads === 'number' && body.maxDownloads > 0
        ? Math.round(body.maxDownloads)
        : null;

    const files = fileService.collectShareFiles(auth.workspace.id, itemIds);
    if (files.length === 0) {
      res.status(400).json({ success: false, error: 'Those items are no longer available' });
      return;
    }

    const share = shareService.create({
      workspaceId: auth.workspace.id,
      createdBy: auth.device.id,
      files,
      hours,
      password: password || null,
      maxDownloads,
      allowDownload: body.allowDownload !== false,
    });

    auditService.log('share_created', {
      workspaceId: auth.workspace.id,
      deviceId: auth.device.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: `${share.id} (${share.files.length} files)`,
    });

    res.status(201).json({ success: true, data: shareService.toSummary(share) });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.get('/', requireSession, (req, res) => {
  try {
    const auth = authed(req);
    const shares = shareService.listForWorkspace(auth.workspace.id).map((share) => shareService.toSummary(share));
    res.json({ success: true, data: shares });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

router.delete('/:id', requireSession, (req, res) => {
  try {
    const auth = authed(req);
    if (!shareService.revoke(auth.workspace.id, req.params.id)) {
      res.status(404).json({ success: false, error: 'Link not found' });
      return;
    }
    auditService.log('share_revoked', {
      workspaceId: auth.workspace.id,
      deviceId: auth.device.id,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      detail: req.params.id,
    });
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

export default router;
