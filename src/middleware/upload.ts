import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import workspaceService from '../services/workspaceService';
import { MAX_FILE_SIZE } from '../config';
import { sanitizeFilename } from '../utils/formatters';
import { authed } from './auth';

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      cb(null, workspaceService.getWorkspaceUploadsDir(authed(req).workspace.id));
    } catch (err) {
      cb(err as Error, '');
    }
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
