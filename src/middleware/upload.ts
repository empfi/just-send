import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import workspaceService from '../services/workspaceService';
import { MAX_FILE_SIZE } from '../config';
import { sanitizeFilename } from '../utils/formatters';

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const workspaceId =
      firstHeaderValue(req.headers['x-workspace-id']) ??
      (typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined) ??
      (typeof req.body?.workspaceId === 'string' ? req.body.workspaceId : undefined);

    if (!workspaceId) {
      return cb(new Error('Missing x-workspace-id header'), '');
    }
    cb(null, workspaceService.getWorkspaceUploadsDir(workspaceId));
  },
  filename: (_req, file, cb) => {
    const rawName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    const safeName = sanitizeFilename(rawName);
    const ext = path.extname(safeName);
    const base = path.basename(safeName, ext);
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
});

export default upload;
