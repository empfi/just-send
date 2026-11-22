import path from 'path';
import fs from 'fs';

const PORT = parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '', 10) || 3456;
const HOST = process.env.HOST || '0.0.0.0';

function normalizePublicUrl(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function deriveHostedPublicUrl(): string | null {
  const serverIp = process.env.SERVER_IP?.trim();
  const serverPort = process.env.SERVER_PORT?.trim();
  if (!serverIp || !serverPort) return null;
  if (['0.0.0.0', '127.0.0.1', '::1', 'localhost'].includes(serverIp)) return null;
  return `http://${serverIp.includes(':') ? `[${serverIp}]` : serverIp}:${serverPort}`;
}

const PUBLIC_URL = normalizePublicUrl(process.env.PUBLIC_URL) ?? deriveHostedPublicUrl();

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

export { PORT, HOST, PUBLIC_URL, ROOT_DIR, DATA_DIR, UPLOAD_DIR, METADATA_DIR, CLIENT_DIR, MAX_FILE_SIZE };
