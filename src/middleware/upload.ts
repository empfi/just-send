import fs from 'fs';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import workspaceService from '../services/workspaceService';
import { MAX_FILE_SIZE } from '../config';
import { sanitizeFilename } from '../utils/formatters';
import { trackActiveUpload, untrackActiveUpload } from '../utils/activeUploads';
import { authed } from './auth';

interface PendingUpload {
  path: string;
  stream: fs.WriteStream;
}

type TrackedRequest = Request & {
  pendingUploads?: PendingUpload[];
  uploadsCommitted?: boolean;
  uploadCleanupStarted?: boolean;
};

function pendingUploads(req: Request): PendingUpload[] {
  const tracked = req as TrackedRequest;
  if (!tracked.pendingUploads) tracked.pendingUploads = [];
  return tracked.pendingUploads;
}

// The stock disk storage only reports a file after it has finished, so an
// aborted request can leave a partial file behind with no path to clean up.
// This storage records the path as soon as the write stream exists.
const storage: multer.StorageEngine = {
  _handleFile(req, file, cb) {
    let destination: string;
    try {
      destination = workspaceService.getWorkspaceUploadsDir(authed(req).workspace.id);
    } catch (err) {
      cb(err as Error);
      return;
    }

    const rawName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safeName = sanitizeFilename(rawName);
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const filename = `${base}-${uniqueSuffix}${ext}`;
    const finalPath = path.join(destination, filename);

    const stream = fs.createWriteStream(finalPath);
    trackActiveUpload(finalPath);
    pendingUploads(req).push({ path: finalPath, stream });
    file.stream.pipe(stream);
    stream.on('error', (err) => cb(err));
    stream.on('finish', () => {
      cb(null, { destination, filename, path: finalPath, size: stream.bytesWritten });
    });
  },
  _removeFile(_req, file, cb) {
    fs.unlink(file.path, cb);
  },
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

function removeWithRetry(target: string, attempt = 0): void {
  fs.rm(target, { force: true }, (err) => {
    if (!err) {
      untrackActiveUpload(target);
      return;
    }
    // Windows can still hold the handle for a moment after an abort. If it
    // never releases, keep it tracked so disk sync will not surface it.
    if (attempt >= 6) return;
    setTimeout(() => removeWithRetry(target, attempt + 1), 250);
  });
}

// Anything multer wrote but the route did not commit is a partial upload.
export function uploadCleanup(req: Request, res: Response, next: NextFunction): void {
  res.on('close', () => {
    const tracked = req as TrackedRequest;
    if (tracked.uploadsCommitted || tracked.uploadCleanupStarted) return;
    tracked.uploadCleanupStarted = true;

    const pending = tracked.pendingUploads ?? [];
    if (pending.length === 0) return;
    for (const file of pending) file.stream.destroy();
    setTimeout(() => {
      for (const file of pending) removeWithRetry(file.path);
    }, 150);
  });
  next();
}

export function markUploadCommitted(req: Request): void {
  const tracked = req as TrackedRequest;
  tracked.uploadsCommitted = true;
  for (const file of tracked.pendingUploads ?? []) untrackActiveUpload(file.path);
}

export default upload;
