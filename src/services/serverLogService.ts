import fs from 'fs';
import path from 'path';
import { DATA_DIR } from '../config';

const LOG_DIR = path.join(DATA_DIR, 'metadata');
const LOG_FILE = path.join(LOG_DIR, 'server.log');
const MAX_LOG_BYTES = 2 * 1024 * 1024;

export type ServerLogLevel = 'info' | 'success' | 'warn' | 'error';

export interface ServerLogEntry {
  at: string;
  level: ServerLogLevel;
  message: string;
  detail?: string;
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
  } catch {
    /* file does not exist yet */
  }
}

class ServerLogService {
  record(level: ServerLogLevel, message: string, detail?: string): void {
    try {
      if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
      rotateIfNeeded();

      const entry: ServerLogEntry = {
        at: new Date().toISOString(),
        level,
        message: message.slice(0, 500),
      };
      if (detail) entry.detail = detail.slice(0, 1500);

      fs.appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch {
      /* logging must never interrupt the server */
    }
  }

  readRecent(limit = 200): ServerLogEntry[] {
    try {
      if (!fs.existsSync(LOG_FILE)) return [];
      const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n');
      const entries: ServerLogEntry[] = [];

      for (let index = lines.length - 1; index >= 0 && entries.length < limit; index -= 1) {
        try {
          const entry = JSON.parse(lines[index]) as Partial<ServerLogEntry>;
          if (
            typeof entry.at === 'string' &&
            typeof entry.message === 'string' &&
            (entry.level === 'info' ||
              entry.level === 'success' ||
              entry.level === 'warn' ||
              entry.level === 'error')
          ) {
            entries.push({
              at: entry.at,
              level: entry.level,
              message: entry.message,
              ...(typeof entry.detail === 'string' ? { detail: entry.detail } : {}),
            });
          }
        } catch {
          /* skip corrupt lines */
        }
      }

      return entries;
    } catch {
      return [];
    }
  }
}

export default new ServerLogService();
