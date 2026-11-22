import path from 'path';
import fs from 'fs';

const PORT = parseInt(process.env.PORT ?? '', 10) || 3456;
const HOST = process.env.HOST || '0.0.0.0';

const ROOT_DIR = path.resolve(process.cwd());
const DATA_DIR = path.join(ROOT_DIR, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(DATA_DIR, 'uploads');
const METADATA_DIR = process.env.METADATA_DIR
  ? path.resolve(process.env.METADATA_DIR)
  : path.join(DATA_DIR, 'metadata');

const CLIENT_DIR = path.join(ROOT_DIR, 'dist', 'client');

const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES ?? '', 10) || 50 * 1024 * 1024 * 1024;

[DATA_DIR, UPLOAD_DIR, METADATA_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

export { PORT, HOST, ROOT_DIR, DATA_DIR, UPLOAD_DIR, METADATA_DIR, CLIENT_DIR, MAX_FILE_SIZE };
