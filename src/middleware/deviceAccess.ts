import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuthedRequest } from './auth';
import { deviceAccess } from '../utils/deviceAccess';

// Read-only devices can still browse, preview, download and take share links.
// Upload-only devices additionally write new files and folders. Everything
// destructive or access-changing needs full access, which only a master or an
// unrestricted connector has.
export const deviceAccessGuard: RequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const auth = (req as AuthedRequest).auth;
  if (!auth) {
    next();
    return;
  }

  const access = deviceAccess(auth.device);
  if (access === 'full') {
    next();
    return;
  }

  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  const path = req.path;
  // Archiving a selection is still a read, so every access level may do it.
  if (method === 'POST' && path === '/files/batch-download') {
    next();
    return;
  }
  if (access === 'upload' && method === 'POST' && (path === '/files/upload' || path === '/folders')) {
    next();
    return;
  }

  // Leaving a workspace only gives up this device's own access, so it stays open.
  if (method === 'POST' && /^\/workspaces\/[^/]+\/leave$/.test(path)) {
    next();
    return;
  }

  res.status(403).json({
    success: false,
    error: 'This device has limited access. Ask a master device for full access.',
  });
};
